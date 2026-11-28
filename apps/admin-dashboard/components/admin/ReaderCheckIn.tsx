"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";
import { AlertCircle, ArrowLeftRight, Camera, CheckCircle2, LogIn, LogOut, LoaderCircle, Nfc, QrCode, ShieldCheck, X } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";
import { isDigitalCardPayload, normalizePhysicalCardUid, parseDigitalCardPayload, sanitizeCardPayload, subscribeToCardScanner } from "../../lib/card-scanner";

type Reader = { first_name: string; last_name: string; is_active: boolean; user_role: string; membership_status: string; membership_expires_at: string | null };
type Card = { librarycard_rfid: string; users: Reader };
type VisitInspection = { action: "CHECKIN" | "CHECKOUT"; name: string; card_uid: string; session_id: number | null; session_status: string | null; checked_in_at: string | null; seat: { number?: string | number; area?: string; seat_id?: number } | null; books_to_return: number; minutes: number; remaining_minutes: number; total_charge: number; payment_status: string | null; disputed: boolean; can_check_in: boolean };
const api = () => database().schema("sora_v2");

export function ReaderCheckIn() {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [visit, setVisit] = useState<VisitInspection | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeCameraRef = useRef<HTMLButtonElement>(null);
  const closeVisitRef = useRef<HTMLButtonElement>(null);
  const scanning = useRef(false);
  const recentScan = useRef<{ card: string; at: number } | null>(null);
  const [overrideCheckout, setOverrideCheckout] = useState(false);
  const closeVisit = useCallback(() => { setVisit(null); setError(""); setStatus("Ready for the next card"); }, []);

  const processScan = useCallback(async (rawPayload: string) => {
    if (scanning.current || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([data-reader-checkin-camera])')) return;
    scanning.current = true;
    setBusy(true); setError(""); setMessage(""); setStatus("Verifying reader...");
    try {
      const payload = sanitizeCardPayload(rawPayload);
      const userId = parseDigitalCardPayload(payload);
      if (!userId && isDigitalCardPayload(payload)) throw new Error("That Digital ID is invalid. Ask the reader to reopen their current card.");

      let query = api().from("librarycard")
        .select("librarycard_rfid,users(first_name,last_name,is_active,user_role,membership_status,membership_expires_at)")
        .eq("is_active", true).is("deactivated_at", null);
      if (userId) query = query.eq("user_id", userId);
      else {
        const uid = normalizePhysicalCardUid(payload);
        if (uid.length < 4 || uid.length > 50) throw new Error("Scan a valid RFID card or library card barcode.");
        query = query.eq("librarycard_rfid", uid);
      }
      const cardResult = await query.limit(1).maybeSingle();
      if (cardResult.error) throw cardResult.error;
      const card = cardResult.data as unknown as Card | null;
      if (!card?.librarycard_rfid || !card.users) throw new Error("No active library card found. Ask staff to activate or link this card first.");
      const cardUid = normalizePhysicalCardUid(card.librarycard_rfid);
      if (recentScan.current?.card === cardUid && Date.now() - recentScan.current.at < 5_000) {
        setStatus("Duplicate scan ignored.");
        setMessage("This card was just scanned. Wait five seconds before scanning it again.");
        return;
      }
      const reader = card.users;
      const inspected = await api().rpc("admin_reader_station_inspect", { p_rfid: cardUid });
      if (inspected.error) throw inspected.error;
      const nextVisit = inspected.data as VisitInspection;
      setCameraOpen(false);
      if (nextVisit.action === "CHECKOUT") {
        recentScan.current = { card: cardUid, at: Date.now() };
        setOverrideCheckout(false);
        setVisit(nextVisit);
        setStatus("Card verified. Review check-out.");
        return;
      }
      if (!reader.is_active || reader.user_role !== "Reader" || reader.membership_status !== "ACTIVE"
        || !reader.membership_expires_at || new Date(reader.membership_expires_at).getTime() <= Date.now() || !nextVisit.can_check_in) {
        throw new Error("This reader needs an active, unexpired membership before check-in.");
      }
      setStatus("Processing check-in...");
      const result = await api().rpc("approve_kiosk_checkin", { p_rfid: normalizePhysicalCardUid(card.librarycard_rfid) });
      if (result.error) throw result.error;
      recentScan.current = { card: cardUid, at: Date.now() };
      setStatus("Check-in complete.");
      setMessage(`Check-in approved for ${reader.first_name} ${reader.last_name}. They can now choose a seat and scan a book.`);
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus("Unable to verify card.");
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }, []);

  const confirmCheckout = useCallback(async () => {
    if (!visit || scanning.current || busy) return;
    scanning.current = true;
    setBusy(true); setError(""); setStatus("Processing check-out...");
    try {
      const result = await api().rpc(overrideCheckout ? "admin_reader_station_override_checkout" : "admin_reader_station_complete_checkout", { p_rfid: visit.card_uid, p_session_id: visit.session_id });
      if (result.error) throw result.error;
      recentScan.current = { card: normalizePhysicalCardUid(visit.card_uid), at: Date.now() };
      setMessage(`Check-out complete for ${visit.name}. The station is ready for the next reader.`);
      setStatus("Check-out complete.");
      setVisit(null);
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus("Check-out could not be completed.");
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }, [visit, busy, overrideCheckout]);

  useEffect(() => subscribeToCardScanner(payload => void processScan(payload)), [processScan]);

  useEffect(() => {
    if (!visit) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeVisitRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !scanning.current) closeVisit();
      if (event.key !== "Tab") return;
      const dialog = closeVisitRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [visit, closeVisit]);

  useEffect(() => {
    if (!cameraOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeCameraRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCameraOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return;
    let disposed = false;
    let controls: IScannerControls | null = null;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning is unavailable on this device.");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (!video) return;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 750 });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false }, video,
          result => {
            if (disposed || !result || scanning.current) return;
            controls?.stop();
            setCameraOpen(false);
            void processScan(result.getText());
          },
        );
        if (disposed) controls.stop();
      } catch (cause) {
        if (!disposed) { setCameraOpen(false); setError(errorMessage(cause)); }
      }
    };
    void start();
    return () => { disposed = true; controls?.stop(); if (videoRef.current) videoRef.current.srcObject = null; };
  }, [cameraOpen, processScan]);

  return <section aria-labelledby="reader-checkin-label reader-checkin-heading" className="mb-6 overflow-hidden rounded-2xl border border-[#dfc9ad] bg-[#fffdf9] shadow-[0_18px_50px_rgba(84,56,34,.1)]">
    <div className="relative overflow-hidden bg-[#543822] px-5 py-5 text-white sm:px-7 sm:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-[#f3d793]/15" />
      <div className="relative flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <p id="reader-checkin-label" className="text-[10px] font-bold uppercase tracking-[.22em] text-[#f3d793]">Reader check-in &amp; check-out</p>
        <div aria-label="Check-in and check-out supported" className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#f3d793] sm:gap-3">
          <span className="inline-flex items-center gap-1.5"><LogIn size={15} aria-hidden="true" />Check-in</span>
          <ArrowLeftRight size={15} aria-hidden="true" className="text-[#d6a75b]" />
          <span className="inline-flex items-center gap-1.5"><LogOut size={15} aria-hidden="true" />Check-out</span>
        </div>
      </div>
      <h2 id="reader-checkin-heading" className="relative mt-2 font-serif text-2xl font-semibold sm:text-3xl">Present your library card</h2>
      <p className="relative mt-3 max-w-2xl text-sm leading-6 text-white/80">Tap or scan a reader card to automatically identify the appropriate visit action.</p>
    </div>
    <div className="p-4 sm:p-5">
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => { setError(""); setStatus("Present a physical card to the connected reader."); }} className="flex min-w-0 flex-col items-start rounded-2xl border border-[#a83d12] bg-[#a83d12] p-5 text-left text-white shadow-[0_16px_36px_rgba(168,61,18,.22)] transition hover:bg-[#96360f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d219] disabled:opacity-60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="rfid-pulse grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10"><Nfc size={30} aria-hidden="true" /></span>
            <span className="rounded-full bg-[#f9d219] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-[#543822]">Recommended</span>
          </div>
          <strong className="mt-4 font-serif text-xl">Tap physical card</strong>
          <span className="mt-1.5 text-xs leading-5 text-white/85">Use the connected RFID reader.</span>
        </button>
        <button type="button" disabled={busy} onClick={() => { setError(""); setCameraOpen(value => !value); }} className="flex min-w-0 flex-col items-start rounded-2xl border border-[#d8c3ad] bg-[#fffaf1] p-5 text-left text-[#543822] transition hover:border-[#c4800c] hover:shadow-lg disabled:opacity-60 motion-safe:enabled:hover:-translate-y-1">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#d8c3ad] bg-white text-[#a83d12]"><QrCode size={28} aria-hidden="true" /></span>
          <strong className="mt-4 font-serif text-xl">Scan barcode or Digital ID</strong>
          <span className="mt-1.5 text-xs leading-5 text-[#806b59]">Use the camera or USB scanner.</span>
        </button>
      </div>
      <p className={`mt-4 flex items-center gap-3 rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : message ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#eadfd3] bg-[#faf6ef] text-[#704d34]"}`} aria-live="polite">
        {busy ? <LoaderCircle size={20} className="shrink-0 text-[#a83d12] motion-safe:animate-spin" aria-hidden="true" /> : error ? <AlertCircle size={20} className="shrink-0" aria-hidden="true" /> : message ? <CheckCircle2 size={20} className="shrink-0" aria-hidden="true" /> : <ShieldCheck size={20} className="shrink-0 text-emerald-700" aria-hidden="true" />}
        <span>{status || "Ready for the next card"}</span>
      </p>
    </div>
    {visit && createPortal(<div className="terminal-modal-backdrop fixed inset-0 z-[105] grid place-items-center overflow-y-auto bg-[#2d190c]/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !busy) closeVisit(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="reader-station-checkout-title" className="terminal-modal-panel flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#d8b784] bg-[#fffaf1] text-[#543822] shadow-[0_25px_75px_rgba(35,19,9,.4)]">
        <header className="flex shrink-0 items-start justify-between gap-3 bg-[#543822] px-5 py-4 text-white sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#f3d793]">Reader visit</p><h3 id="reader-station-checkout-title" className="mt-1 font-serif text-xl font-semibold">Review check-out</h3></div><button ref={closeVisitRef} type="button" disabled={busy} onClick={closeVisit} aria-label="Close check-out review" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 hover:bg-white/10 disabled:opacity-50"><X size={18} /></button></header>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <p className="font-serif text-xl font-semibold">{visit.name}</p>
          <p className="mt-1 text-xs text-[#806b59]">Card {visit.card_uid}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Visit</dt><dd className="mt-1 font-semibold">{visit.session_id == null ? "Checked in · no books scanned" : `${visit.minutes} min · ${visit.session_status}`}</dd></div>
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Seat</dt><dd className="mt-1 font-semibold">{visit.seat ? `${visit.seat.area ? `${visit.seat.area} · ` : ""}${visit.seat.number ?? visit.seat.seat_id ?? "Reserved"}` : "None assigned"}</dd></div>
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Books to return</dt><dd className="mt-1 font-semibold">{visit.books_to_return}</dd></div>
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Reading balance</dt><dd className="mt-1 font-semibold">{visit.remaining_minutes} min</dd></div>
          </dl>
          {visit.total_charge > 0 && <p className="mt-3 rounded-xl border border-[#e4d2b9] bg-white p-3 text-sm">Charges: ₱{visit.total_charge.toFixed(2)} · {visit.payment_status}</p>}
          {(visit.books_to_return > 0 || visit.disputed || (visit.total_charge > 0 && visit.payment_status !== "PAID")) && <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{visit.books_to_return > 0 ? "Return all books before check-out." : visit.disputed ? "Resolve the disputed charge before check-out." : "Settle the charges before check-out."}</p>}
          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-[#e4d2b9] bg-[#fcf5e9] p-4 sm:justify-end sm:px-6"><label className="flex w-full items-center gap-2 text-xs text-[#704d34]"><input type="checkbox" checked={overrideCheckout} onChange={event => setOverrideCheckout(event.target.checked)} disabled={busy} />Librarian override for a legitimate check-out within 30 seconds</label><button type="button" disabled={busy} onClick={closeVisit} className="min-h-11 flex-1 rounded-xl border border-[#d8c3ad] bg-white px-4 text-sm font-bold sm:flex-none">Cancel</button><button type="button" disabled={busy || visit.books_to_return > 0 || visit.disputed || (visit.total_charge > 0 && visit.payment_status !== "PAID")} onClick={() => void confirmCheckout()} className="min-h-11 flex-1 rounded-xl bg-[#a83d12] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">{busy ? "Processing..." : "Confirm check-out"}</button></footer>
      </section>
    </div>, document.body)}
    {cameraOpen && createPortal(<div className="terminal-modal-backdrop fixed inset-0 z-[110] grid place-items-center bg-[#2d190c]/70 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setCameraOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="reader-checkin-camera-title" data-reader-checkin-camera className="terminal-modal-panel w-full max-w-[460px] rounded-2xl border border-[#c4800c] bg-[#fffaf1] p-3 shadow-[0_25px_75px_rgba(35,19,9,.4)] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 px-1"><h3 id="reader-checkin-camera-title" className="flex items-center gap-2 font-serif text-lg font-semibold"><Camera size={17} className="text-[#a83d12]" />Scan library card</h3><button ref={closeCameraRef} type="button" onClick={() => setCameraOpen(false)} aria-label="Close camera" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#d8c3ad] bg-white hover:bg-[#fff0dc]"><X size={17} /></button></div>
        <div className="relative overflow-hidden rounded-xl border border-[#c4800c] bg-[#211811] p-3 sm:p-4">
          <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-[#ae8463]/40 bg-[#543822]/85 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white"><Camera size={11} className="text-[#f9d219]" />Camera active</span>
          <div className="relative mx-auto mt-3 aspect-[4/3] w-full max-w-[360px] overflow-hidden rounded-xl bg-[#1b1b1b]"><video ref={videoRef} muted playsInline aria-label="Card barcode camera preview" className="absolute inset-0 h-full w-full object-cover" /><div className="pointer-events-none absolute inset-[7%] rounded-xl border-2 border-white/90" /><div className="pointer-events-none absolute left-[12%] right-[12%] top-1/2 h-0.5 bg-[#f9d219] shadow-[0_0_12px_#f9d219]" /></div>
          <p className="mt-3 text-center text-xs text-[#f8eddc]">Hold the card barcode or Digital ID inside the frame.</p>
        </div>
      </section>
    </div>, document.body)}
  </section>;
}
