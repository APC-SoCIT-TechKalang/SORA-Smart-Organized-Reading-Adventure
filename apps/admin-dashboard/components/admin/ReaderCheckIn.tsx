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
type StationScanResult = VisitInspection & { occurred_at: string; checkin_only: boolean; scan_method: "Digital QR" | "Physical RFID" };
const api = () => database().schema("sora_v2");
const transactionTime = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila",
}).format(new Date(value));

export function ReaderCheckIn() {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [scanResult, setScanResult] = useState<StationScanResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeCameraRef = useRef<HTMLButtonElement>(null);
  const closeResultRef = useRef<HTMLButtonElement>(null);
  const scanning = useRef(false);
  const closeResult = useCallback(() => { setScanResult(null); setError(""); setStatus("Ready for the next card"); }, []);

  const processScan = useCallback(async (rawPayload: string) => {
    if (scanning.current || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]:not([data-reader-checkin-camera]):not([data-reader-station-result])')) return;
    scanning.current = true;
    setScanResult(null);
    setBusy(true); setError(""); setStatus("Verifying reader...");
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
      setStatus("Recording attendance...");
      const result = await api().rpc("admin_reader_station_scan", { p_rfid: cardUid });
      if (result.error) throw result.error;
      const completed = { ...(result.data as Omit<StationScanResult, "scan_method">), scan_method: userId ? "Digital QR" : "Physical RFID" } as StationScanResult;
      setCameraOpen(false);
      setStatus(completed.action === "CHECKIN" ? "Check-in complete." : "Check-out complete.");
      setScanResult(completed);
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus("Unable to verify card.");
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => subscribeToCardScanner(payload => void processScan(payload)), [processScan]);

  useEffect(() => {
    if (!scanResult) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeResultRef.current?.focus();
    const resetTimer = window.setTimeout(closeResult, 6_000);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeResult();
      if (event.key !== "Tab") return;
      const dialog = closeResultRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [scanResult, closeResult]);

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
      <p className={`mt-4 flex items-center gap-3 rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#eadfd3] bg-[#faf6ef] text-[#704d34]"}`} aria-live="polite">
        {busy ? <LoaderCircle size={20} className="shrink-0 text-[#a83d12] motion-safe:animate-spin" aria-hidden="true" /> : error ? <AlertCircle size={20} className="shrink-0" aria-hidden="true" /> : <ShieldCheck size={20} className="shrink-0 text-emerald-700" aria-hidden="true" />}
        <span>{status || "Ready for the next card"}</span>
      </p>
    </div>
    {scanResult && createPortal(<div className="terminal-modal-backdrop fixed inset-0 z-[105] grid place-items-center overflow-y-auto bg-[#2d190c]/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) closeResult(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="reader-station-result-title" data-reader-station-result className="terminal-modal-panel flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#d8b784] bg-[#fffaf1] text-[#543822] shadow-[0_25px_75px_rgba(35,19,9,.4)]">
        <header className="flex items-start justify-between gap-3 bg-[#543822] px-5 py-4 text-white sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#f3d793]">Reader attendance</p><h3 id="reader-station-result-title" className="mt-1 font-serif text-xl font-semibold">{scanResult.action === "CHECKIN" ? "Check-in complete" : "Check-out complete"}</h3></div><button ref={closeResultRef} type="button" onClick={closeResult} aria-label="Close attendance confirmation" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 hover:bg-white/10"><X size={18} /></button></header>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="shrink-0" size={24} aria-hidden="true" /><div><p className="font-bold">{scanResult.action === "CHECKIN" ? "Check-in successful" : "Check-out successful"}</p><p className="mt-1 text-xs">{scanResult.action === "CHECKIN" ? "Reader entry has been recorded." : "Reader exit has been recorded."}</p></div></div>
          <p className="mt-5 font-serif text-xl font-semibold">{scanResult.name}</p>
          <p className="mt-1 break-all text-xs text-[#806b59]">Card {scanResult.card_uid}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Transaction</dt><dd className="mt-1 font-semibold">{scanResult.action === "CHECKIN" ? "Checked in" : "Checked out"}</dd></div>
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3"><dt className="text-xs text-[#806b59]">Date and time</dt><dd className="mt-1 font-semibold">{transactionTime(scanResult.occurred_at)}</dd></div>
            <div className="rounded-xl border border-[#e4d2b9] bg-white p-3 sm:col-span-2"><dt className="text-xs text-[#806b59]">Scan method</dt><dd className="mt-1 font-semibold">{scanResult.scan_method}</dd></div>
          </dl>
          <div className="mt-4 rounded-xl border border-[#e4d2b9] bg-white p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#806b59]">{scanResult.action === "CHECKIN" ? "Next step" : "Status"}</p><p className="mt-2 text-sm leading-6">{scanResult.action === "CHECKIN" ? "The reader can now choose a seat and scan a book." : "The visit is closed and the station is ready for the next reader."}</p></div>
          <p className="mt-3 text-center text-xs text-[#806b59]">This confirmation closes automatically in a few seconds.</p>
        </div>
        <footer className="flex justify-end border-t border-[#e4d2b9] bg-[#fcf5e9] p-4 sm:px-6"><button type="button" onClick={closeResult} className="min-h-11 rounded-xl bg-[#a83d12] px-6 text-sm font-bold text-white transition hover:bg-[#96360f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d219]">Done</button></footer>
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
