"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, LoaderCircle, Nfc, Printer, X } from "lucide-react";
import { isDigitalCardPayload, normalizePhysicalCardUid, subscribeToCardScanner } from "../../lib/card-scanner";
import { database, errorMessage } from "../../lib/supabase";
import { printReaderCard } from "../../lib/print-reader-card";
import type { DashboardData } from "./dashboard-data";

type CardAction = "print" | "link";
type Props = {
  data: DashboardData;
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
};
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#8d310e] disabled:opacity-45";

export function ReaderCardManagement({ data, run }: Props) {
  const [action, setAction] = useState<CardAction | null>(null);
  const hasReaders = data.readers.some(reader => reader.roles?.name === "reader" && reader.is_active);
  return <>
    <section aria-labelledby="reader-card-management-title" className="mb-6 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a83d12]">Reader cards</p>
          <h2 id="reader-card-management-title" className="mt-1 font-serif text-xl font-semibold text-[#543822]">Print and link RFID cards</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[#8d735e]">Print a personalized reader card or tap a physical card to link its UID to a reader account.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:shrink-0">
          <button type="button" disabled={!hasReaders} onClick={() => setAction("print")} className={primaryButton}><Printer size={16} aria-hidden="true" />Print RFID card</button>
          <button type="button" disabled={!hasReaders} onClick={() => setAction("link")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d8c3ad] bg-white px-5 py-3 text-xs font-bold text-[#704d34] transition hover:bg-[#fff5e8] disabled:opacity-45"><Nfc size={16} aria-hidden="true" />Link RFID UID</button>
        </div>
      </div>
      {!hasReaders && <p className="mt-3 text-xs text-[#8d735e]">Create or reactivate a reader account to issue a card.</p>}
    </section>
    {action && <ReaderCardActionDialog key={action} action={action} data={data} run={run} close={() => setAction(null)} />}
  </>;
}

function ReaderCardActionDialog({ action, data, run, close }: Props & { action: CardAction; close: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scannerTarget = useRef<HTMLDivElement>(null);
  const savingLock = useRef(false);
  const [readerId, setReaderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [linkedUid, setLinkedUid] = useState("");
  const [printOpened, setPrintOpened] = useState(false);
  const printing = action === "print";
  const readers = data.readers.filter(reader => reader.roles?.name === "reader" && reader.is_active)
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  const linkedReaderIds = new Set(data.libraryCards
    .filter(card => card.is_active && !card.deactivated_at && normalizePhysicalCardUid(card.librarycard_rfid ?? ""))
    .map(card => card.user_id));
  const readerOptions = printing ? readers : readers.filter(reader => !linkedReaderIds.has(reader.user_id));
  const reader = readerOptions.find(item => item.user_id === readerId);
  // Keep the confirmation name after a saved reader disappears from the options.
  const selectedReader = readers.find(item => item.user_id === readerId);
  const fullName = selectedReader ? `${selectedReader.first_name} ${selectedReader.last_name}`.trim() : "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (printing || linkedUid) return;
    return subscribeToCardScanner(async payload => {
      if (savingLock.current) return;
      setError("");
      if (!reader) {
        setError("Choose a reader before tapping a card.");
        return;
      }
      if (isDigitalCardPayload(payload)) {
        setError("Tap a physical RFID card. A Digital ID QR code cannot be linked as an RFID UID.");
        return;
      }
      const uid = normalizePhysicalCardUid(payload);
      if (uid.length < 4 || uid.length > 50) {
        setError("The card reader returned an invalid UID. Tap the physical card again.");
        return;
      }
      if (data.libraryCards.some(card => card.user_id !== reader.user_id && normalizePhysicalCardUid(card.librarycard_rfid ?? "") === uid)) {
        setError("This RFID card is already assigned to another reader. Tap a different card.");
        return;
      }
      savingLock.current = true;
      setSaving(true);
      try {
        const ok = await run(async () => {
          try {
            const result = await database().schema("sora_v2").rpc("admin_assign_library_card", { p_user_id: reader.user_id, p_rfid: uid });
            if (result.error) setError(errorMessage(result.error));
            return result;
          } catch (cause) {
            setError(errorMessage(cause));
            return { error: cause };
          }
        }, `RFID card linked to ${fullName}`);
        if (ok) setLinkedUid(uid);
        else setError(current => current || "The card could not be saved. Wait for any current action to finish, then tap again.");
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        savingLock.current = false;
        setSaving(false);
      }
    });
  }, [printing, reader, linkedUid, data.libraryCards, fullName, run]);

  const openPrint = async (id: string) => {
    const selected = readers.find(item => item.user_id === id);
    if (!selected) return;
    setError("");
    setPrintOpened(false);
    const card = data.libraryCards.find(item => item.user_id === id && item.is_active && !item.deactivated_at);
    try {
      await printReaderCard({ readerName: `${selected.first_name} ${selected.last_name}`.trim(), cardUid: card?.librarycard_rfid ?? null });
      setPrintOpened(true);
    } catch (cause) { setError(errorMessage(cause)); }
  };

  return createPortal(<dialog ref={dialogRef} aria-labelledby="reader-card-action-title" aria-describedby="reader-card-action-description"
    onCancel={event => { event.preventDefault(); if (!savingLock.current) close(); }}
    onClick={event => { if (event.target === event.currentTarget && !savingLock.current) close(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] p-0 text-[#543822] shadow-[0_30px_100px_rgba(50,27,13,.32)] backdrop:bg-[#2d190c]/60 backdrop:backdrop-blur-sm">
    <div className="flex items-start justify-between gap-4 border-b border-[#eadfd3] p-5 sm:p-6">
      <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a83d12]">Reader cards</p><h2 id="reader-card-action-title" className="mt-1 font-serif text-2xl font-semibold">{printing ? "Print RFID card" : "Link RFID UID"}</h2></div>
      <button type="button" disabled={saving} onClick={close} aria-label="Close card action" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8c3ad] hover:bg-[#fff5e8] disabled:opacity-45"><X size={18} aria-hidden="true" /></button>
    </div>
    <div className="space-y-4 p-5 sm:p-6">
      <p id="reader-card-action-description" className="text-sm leading-6 text-[#795a42]">{printing ? "Choose a reader to open their personalized card in the print dialog automatically." : "Choose a reader without a linked RFID card, then tap their physical card on the connected USB reader. Its UID will be saved to their account automatically."}</p>
      <label className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#795a42]">Reader name
        <select autoFocus value={reader ? readerId : ""} disabled={saving || !readerOptions.length} onChange={event => {
          const id = event.target.value;
          setReaderId(id); setLinkedUid(""); setError(""); setPrintOpened(false);
          if (printing && id) void openPrint(id);
          else if (id) scannerTarget.current?.focus();
        }} className="mt-2 min-h-12 w-full rounded-xl border border-[#d8c3ad] bg-white px-3 text-sm font-normal normal-case">
          <option value="">Select reader</option>
          {readerOptions.map(item => <option key={item.user_id} value={item.user_id}>{item.first_name} {item.last_name} · {item.user_id.slice(-6)}</option>)}
        </select>
      </label>
      {!printing && !readerOptions.length && <p role="status" className="rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-4 text-sm leading-6 text-[#795a42]">All active readers already have a linked RFID card.</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {printing ? <>
        <div className="rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-4 text-xs leading-5 text-[#795a42]">Card size: 85.6 × 53.98 mm. Choose your card printer, use actual size (100%), and turn off headers and footers in the print dialog.</div>
        {printOpened && <p role="status" className="text-sm text-emerald-800">Print dialog opened for {fullName}.</p>}
        {readerId && <button type="button" onClick={() => void openPrint(readerId)} className={primaryButton}><Printer size={16} aria-hidden="true" />Print again</button>}
      </> : <>
        {(readerOptions.length > 0 || linkedUid || saving) && <div ref={scannerTarget} tabIndex={-1} role="status" aria-live="polite" className={`rounded-xl border p-5 text-center outline-none ${linkedUid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#dfc9ad] bg-[#faf6ef]"}`}>
          {linkedUid ? <CheckCircle2 className="mx-auto" size={30} aria-hidden="true" /> : saving ? <LoaderCircle className="mx-auto animate-spin" size={30} aria-hidden="true" /> : <Nfc className="mx-auto text-[#a83d12]" size={30} aria-hidden="true" />}
          <p className="mt-3 text-sm font-bold">{linkedUid ? `Card linked to ${fullName}` : saving ? "Saving RFID UID…" : reader ? `Waiting for ${fullName}'s card` : "Select a reader to start"}</p>
          {linkedUid ? <p className="mt-2 break-all font-mono text-sm">UID: {linkedUid}</p> : reader && <p className="mt-2 text-xs leading-5 text-[#795a42]">Keep this window focused and tap one card. The scanner must send the UID followed by Enter.</p>}
        </div>}
        {!linkedUid && reader && <button type="button" disabled={saving} onClick={() => { setReaderId(""); setError(""); }} className="min-h-11 rounded-xl border border-[#d8c3ad] bg-white px-4 text-xs font-bold disabled:opacity-45">Cancel waiting</button>}
      </>}
    </div>
    <footer className="flex justify-end border-t border-[#eadfd3] bg-[#fcf8f2] px-5 py-4 sm:px-6"><button type="button" disabled={saving} onClick={close} className="min-h-11 rounded-xl border border-[#d8c3ad] bg-white px-5 text-xs font-bold disabled:opacity-45">{linkedUid ? "Done" : "Close"}</button></footer>
  </dialog>, document.body);
}
