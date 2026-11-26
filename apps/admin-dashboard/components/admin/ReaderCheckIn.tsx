"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";
import { Camera, LoaderCircle, Nfc, ScanLine, ShieldCheck, X } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";
import { isDigitalCardPayload, normalizePhysicalCardUid, parseDigitalCardPayload, sanitizeCardPayload, subscribeToCardScanner } from "../../lib/card-scanner";

type Reader = { first_name: string; last_name: string; is_active: boolean; user_role: string; membership_status: string; membership_expires_at: string | null };
type Card = { librarycard_rfid: string; users: Reader };
const api = () => database().schema("sora_v2");

export function ReaderCheckIn() {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeCameraRef = useRef<HTMLButtonElement>(null);
  const scanning = useRef(false);

  const processScan = useCallback(async (rawPayload: string) => {
    if (scanning.current || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([data-reader-checkin-camera])')) return;
    scanning.current = true;
    setBusy(true); setError(""); setMessage("");
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
      const reader = card.users;
      if (!reader.is_active || reader.user_role !== "Reader" || reader.membership_status !== "ACTIVE"
        || !reader.membership_expires_at || new Date(reader.membership_expires_at).getTime() <= Date.now()) {
        throw new Error("This reader needs an active, unexpired membership before check-in.");
      }
      const result = await api().rpc("approve_kiosk_checkin", { p_rfid: normalizePhysicalCardUid(card.librarycard_rfid) });
      if (result.error) throw result.error;
      setCameraOpen(false);
      setMessage(`Check-in approved for ${reader.first_name} ${reader.last_name}. They can now choose a seat and scan a book.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => subscribeToCardScanner(payload => void processScan(payload)), [processScan]);

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

  return <section aria-label="Reader check-in" className="mb-6 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
    <div><h2 className="font-serif text-2xl font-semibold">Reader check-in</h2>
      <p className="mt-2 text-sm text-[#795a42]">Tap the reader&apos;s RFID card or scan their card barcode or Digital ID. Check-in starts as soon as the card is verified.</p></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#dfc9ad] bg-[#fff8ed] p-4"><Nfc size={25} className="text-[#a83d12]" aria-hidden="true" /><h3 className="mt-2 font-serif text-lg font-semibold">Tap RFID card</h3><p className="mt-1 text-xs text-[#806b59]">The connected USB card reader is listening.</p></div>
      <button type="button" disabled={busy} onClick={() => { setError(""); setCameraOpen(value => !value); }} className="rounded-xl border border-[#dfc9ad] bg-white p-4 text-left transition hover:border-[#a83d12] hover:bg-[#fff8ed] disabled:opacity-50"><ScanLine size={25} className="text-[#a83d12]" aria-hidden="true" /><h3 className="mt-2 font-serif text-lg font-semibold">Scan barcode or Digital ID</h3><p className="mt-1 text-xs text-[#806b59]">Use a USB scanner at any time, or tap here for the camera.</p></button>
    </div>
    <p className="mt-4 flex items-center gap-2 text-xs text-[#806b59]" aria-live="polite">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-emerald-700" />}{busy ? "Verifying card and approving check-in…" : "Ready for the next card"}</p>
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
