"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IScannerControls } from "@zxing/browser";
import { CheckCircle2, Clock3, LoaderCircle, Nfc, QrCode, ShieldCheck, WalletCards, X } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";
import { isDigitalCardPayload, normalizePhysicalCardUid, parseDigitalCardPayload, sanitizeCardPayload, subscribeToCardScanner } from "../../lib/card-scanner";
import { subscribeToCardDirectory } from "../../lib/card-directory-sync";
import type { DashboardData } from "./dashboard-data";
import { MAX_TOP_UP_PESOS, quoteTimeTopUp } from "./top-up-pricing";

type TopUpReader = {
  userId: string;
  name: string;
  cardUid: string;
  balance: number;
  membership: string;
};

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  user_role: string;
  membership_type: string | null;
  membership_status: string;
  membership_expires_at: string | null;
  remaining_minutes: number | null;
};

const api = () => database().schema("sora_v2");
const PESO_PRESETS = [50, 100, 200, 500];
type RateTier = "Adult" | "Minor";

// Library pricing policy. Change these values when the hourly rates change.
export const TOP_UP_RATES_PHP_PER_HOUR: Record<RateTier, number> = {
  Adult: 50,
  Minor: 30,
};

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) return "0 minutes";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (!minutes) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours}h ${minutes}m`;
}

function liveReadingSeconds(balance: number, visit: DashboardData["visits"][number] | undefined, now: number) {
  if (!visit || visit.session_status !== "READING") return Math.max(0, balance * 60);
  const startedAt = new Date(visit.checked_in_at).getTime();
  if (!Number.isFinite(startedAt)) return Math.max(0, balance * 60);
  return Math.max(0, balance * 60 - Math.max(0, (now - startedAt) / 1000));
}

function formatReadingClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function TopUpTerminal({ data, name, run }: {
  data: DashboardData;
  name: (id: string | null) => string;
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
}) {
  const [reader, setReader] = useState<TopUpReader | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [rateTier, setRateTier] = useState<RateTier>("Adult");
  const [entryMode, setEntryMode] = useState<"pesos" | "time">("pesos");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedBalance, setCompletedBalance] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const verificationLock = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resetTimer = useRef<number | null>(null);

  const hourlyRate = TOP_UP_RATES_PHP_PER_HOUR[rateTier];
  const timeQuote = quoteTimeTopUp(hours, minutes, hourlyRate);
  const amountValue = entryMode === "time" ? timeQuote?.amount ?? 0 : Number(amount) || 0;
  const calculatedMinutes = entryMode === "time" ? timeQuote?.minutes ?? 0 : amountValue > 0 ? Math.max(1, Math.round((amountValue / hourlyRate) * 60)) : 0;
  const validTopUp = Number.isFinite(amountValue) && amountValue > 0 && amountValue <= MAX_TOP_UP_PESOS
    && Number.isSafeInteger(calculatedMinutes) && calculatedMinutes > 0;
  const validReference = reference.trim().length > 0;
  const formattedAmount = amountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const newBalance = (reader?.balance ?? 0) + calculatedMinutes;

  const reset = useCallback(() => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    setReader(null);
    setRateTier("Adult");
    setEntryMode("pesos");
    setAmount("");
    setHours("");
    setMinutes("");
    setMethod("Cash");
    setReference("");
    setMessage("");
    setCompletedBalance(null);
    setSubmitting(false);
  }, []);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const verifyPayload = useCallback(async (rawPayload: string) => {
    if (verificationLock.current) return;
    verificationLock.current = true;
    setVerifying(true);
    setMessage("");
    try {
      const payload = sanitizeCardPayload(rawPayload);
      const digitalUserId = parseDigitalCardPayload(payload);
      if (!digitalUserId && isDigitalCardPayload(payload)) throw new Error("This digital card is invalid. Ask the reader to reopen their current Digital ID.");

      let userId = digitalUserId;
      let cardUid = "";
      if (!userId) {
        const physicalUid = normalizePhysicalCardUid(payload);
        if (physicalUid.length < 4) throw new Error("The card reader returned an invalid UID.");
        const cardResult = await api().from("librarycard").select("user_id,librarycard_rfid")
          .eq("librarycard_rfid", physicalUid).eq("is_active", true).is("deactivated_at", null).maybeSingle();
        if (cardResult.error) throw cardResult.error;
        if (!cardResult.data) throw new Error("Card not recognized. Confirm that it is assigned and active.");
        userId = cardResult.data.user_id as string;
        cardUid = String(cardResult.data.librarycard_rfid ?? physicalUid);
      }

      const userResult = await api().from("users")
        .select("id,first_name,last_name,is_active,user_role,membership_type,membership_status,membership_expires_at,remaining_minutes")
        .eq("id", userId).maybeSingle();
      if (userResult.error) throw userResult.error;
      const user = userResult.data as UserRow | null;
      if (!user || !user.is_active || user.user_role !== "Reader") throw new Error("This reader account is inactive or unavailable.");
      if (user.membership_status !== "ACTIVE" || !user.membership_expires_at || new Date(user.membership_expires_at).getTime() <= Date.now()) throw new Error("This reader does not have an active, unexpired membership.");
      if (user.membership_type === "Guild Adventurer") throw new Error("This membership already includes unlimited reading time and does not need a top-up.");

      if (!cardUid) {
        const cardResult = await api().from("librarycard").select("librarycard_rfid")
          .eq("user_id", user.id).eq("is_active", true).is("deactivated_at", null).limit(1).maybeSingle();
        if (cardResult.error) throw cardResult.error;
        cardUid = String(cardResult.data?.librarycard_rfid ?? "Digital card verified");
      }

      setCameraOpen(false);
      setReader({
        userId: user.id,
        name: `${user.first_name} ${user.last_name}`.trim(),
        cardUid,
        balance: user.remaining_minutes ?? 0,
        membership: user.membership_type ?? "Active membership",
      });
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      verificationLock.current = false;
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    if (reader) return;
    return subscribeToCardScanner(payload => void verifyPayload(payload));
  }, [reader, verifyPayload]);

  useEffect(() => subscribeToCardDirectory(() => {
    if (!verificationLock.current && !reader) setMessage("");
  }), [reader]);

  useEffect(() => {
    if (!reader) return;
    const overflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) reset(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [reader, reset, submitting]);

  useEffect(() => {
    if (!cameraOpen) return;
    let disposed = false;
    let controls: IScannerControls | null = null;
    const stop = () => {
      disposed = true;
      controls?.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning is unavailable. Open this secure page in Safari or Chrome and allow camera access.");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 200,
          delayBetweenScanSuccess: 750,
        });
        const video = videoRef.current;
        if (!video) throw new Error("The QR camera could not be opened.");
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          result => {
            if (disposed || !result) return;
            const payload = sanitizeCardPayload(result.getText());
            if (!parseDigitalCardPayload(payload)) {
              setMessage("That QR code is not a valid Tankobonbon Digital ID.");
              return;
            }
            controls?.stop();
            setCameraOpen(false);
            void verifyPayload(payload);
          },
        );
        if (disposed) controls.stop();
      } catch (cause) {
        stop();
        setCameraOpen(false);
        setMessage(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Camera access was denied. Allow camera access and try again." : errorMessage(cause));
      }
    };
    void start();
    return stop;
  }, [cameraOpen, verifyPayload]);

  const hourly = data.memberAccounts.filter(item => item.status === "ACTIVE" && item.remaining_minutes !== null && !item.membership_label.startsWith("Guild Adventurer"));

  return <>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="overflow-hidden rounded-2xl border border-[#dfc9ad] bg-[#fffdf9] shadow-[0_18px_50px_rgba(84,56,34,.1)]">
        <div className="relative overflow-hidden bg-[#543822] px-5 py-5 text-white sm:px-7 sm:py-6">
          <div aria-hidden="true" className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-[#f3d793]/15" />
          <p className="relative text-[10px] font-bold uppercase tracking-[.22em] text-[#f3d793]">Secure top-up terminal</p>
          <h2 className="relative mt-2 font-serif text-2xl font-semibold sm:text-3xl">Present your library card</h2>
          <p className="relative mt-3 max-w-2xl text-sm leading-6 text-white/70">Tap a physical card or scan the QR code on a Digital ID. The terminal listens for either method at any time.</p>
        </div>
        <div className="p-4 sm:p-5">
          {message && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{message}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" disabled={verifying} onClick={() => { setMessage("USB card reader is ready. Tap the physical card now."); }} className="group relative min-h-44 overflow-hidden rounded-2xl border border-[#a83d12] bg-[#a83d12] p-5 text-left text-white shadow-[0_16px_36px_rgba(168,61,18,.22)] transition hover:-translate-y-1 disabled:translate-y-0 disabled:opacity-60">
              <span className="rfid-pulse grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-white/10"><Nfc size={30} /></span>
              <strong className="mt-4 block font-serif text-xl">Tap physical card</strong><span className="mt-1.5 block text-xs leading-5 text-white/70">Use the RFID reader connected to this terminal.</span>
              <span className="absolute right-4 top-4 rounded-full bg-[#f9d219] px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-wider text-[#543822]">Recommended</span>
            </button>
            <button type="button" disabled={verifying} onClick={() => { setMessage(""); setCameraOpen(true); }} className="group min-h-44 rounded-2xl border border-[#d8c3ad] bg-[#fffaf1] p-5 text-left text-[#543822] transition hover:-translate-y-1 hover:border-[#c4800c] hover:shadow-lg disabled:translate-y-0 disabled:opacity-60">
              <span className="grid h-16 w-16 place-items-center rounded-full border border-[#d8c3ad] bg-white text-[#a83d12]"><QrCode size={28} /></span>
              <strong className="mt-4 block font-serif text-xl">Scan digital card</strong><span className="mt-1.5 block text-xs leading-5 text-[#806b59]">Opens the camera. The USB 2D scanner also stays ready.</span>
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-4">
            <div className="flex items-center gap-3 text-sm text-[#704d34]">{verifying ? <LoaderCircle className="animate-spin text-[#a83d12]" size={20} /> : <ShieldCheck className="text-emerald-700" size={20} />}<span>{verifying ? "Verifying card and membership…" : "Global RFID and QR scanner listening"}</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold">Active time balances</h2><p className="mt-1 text-xs text-[#8d735e]">Updates automatically and after each top-up. New memberships start at 0 minutes.</p></div><WalletCards className="text-[#a83d12]" /></div>
        <div className="mt-4 max-h-[26rem] overflow-y-auto pr-1">
          {hourly.map(item => { const card = data.libraryCards.find(entry => entry.user_id === item.user_id && entry.is_active && !entry.deactivated_at); const visit = data.visits.find(entry => entry.user_id === item.user_id && entry.status === "ACTIVE"); const live = liveReadingSeconds(item.remaining_minutes ?? 0, visit, now); const needsTopUp = (item.remaining_minutes ?? 0) <= 0; return <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#eee5dc] py-4 text-xs" key={item.user_id}><div className="min-w-0"><b className="block truncate">{name(item.user_id)}</b><small className="mt-1 block truncate text-[#8d735e]">{item.membership_label}{card?.librarycard_rfid ? ` · Card ${card.librarycard_rfid}` : ""}</small></div><span className={`shrink-0 rounded-full px-2.5 py-1 font-bold ${needsTopUp ? "bg-rose-50 text-rose-700" : "bg-[#fff0c9] text-[#804916]"}`} title={visit?.session_status === "READING" ? "Live reading balance" : needsTopUp ? "No reading time has been loaded or time has been used up" : "Stored balance"}>{visit?.session_status === "READING" ? `${formatReadingClock(live)} left` : needsTopUp ? "0 min · Top-up needed" : `${item.remaining_minutes} min`}</span></div>; })}
          {!hourly.length && <p className="py-10 text-center text-sm text-[#806b59]">No hourly memberships are active.</p>}
        </div>
      </section>
    </div>

    {cameraOpen && createPortal(
      <div className="terminal-modal-backdrop fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-[#2d190c]/75 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) { setCameraOpen(false); setMessage(""); } }}>
        <section role="dialog" aria-modal="true" aria-labelledby="camera-scan-title" className="terminal-modal-panel flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] shadow-2xl">
          <header className="flex items-center justify-between border-b border-[#eadfd3] p-4 sm:p-5">
            <div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a83d12]">Digital card</p><h2 id="camera-scan-title" className="mt-1 font-serif text-2xl">Scan QR code</h2></div>
            <button type="button" onClick={() => { setCameraOpen(false); setMessage(""); }} aria-label="Close camera" className="grid h-10 w-10 place-items-center rounded-full border border-[#d8c3ad]"><X size={18} /></button>
          </header>
          <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#21130c]"><video ref={videoRef} muted playsInline aria-label="Digital card QR camera preview" className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-white shadow-[0_0_0_999px_rgba(45,25,12,.45)]" /><div className="pointer-events-none absolute left-[18%] right-[18%] top-1/2 h-0.5 bg-[#f9d219] shadow-[0_0_14px_#f9d219]" /></div>
            <p className="mt-4 text-center text-sm text-[#806b59]">Hold the Digital ID QR code inside the frame.</p>
            {message && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-800">{message}</p>}
          </div>
        </section>
      </div>, document.body)}

    {reader && createPortal(<div className="terminal-modal-backdrop fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-[#2d190c]/55 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) reset(); }}><form role="dialog" aria-modal="true" aria-labelledby="top-up-menu-title" className="terminal-modal-panel flex max-h-[90dvh] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] text-[#543822] shadow-[0_30px_100px_rgba(50,27,13,.38)]" onSubmit={async event => {
      event.preventDefault();
      if (submitting || !validTopUp || !validReference) return;
      setSubmitting(true);
      const updatedBalance = reader.balance + calculatedMinutes;
      const ok = await run(() => api().rpc("admin_top_up", {
        p_user_id: reader.userId,
        p_minutes: calculatedMinutes,
        p_amount: amountValue,
        p_method: method,
        p_reference: reference.trim(),
      }), `Top-up completed for ${reader.name}`);
      if (ok) {
        setCompletedBalance(updatedBalance);
        resetTimer.current = window.setTimeout(reset, 2200);
      } else setSubmitting(false);
    }}>
      <header className="relative shrink-0 overflow-hidden bg-[#543822] px-5 py-4 text-white sm:px-6"><div aria-hidden="true" className="absolute -right-10 -top-16 h-44 w-44 rounded-full border border-[#f3d793]/15" /><div className="relative flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#f3d793]">Verified top-up session</p><h2 id="top-up-menu-title" className="mt-1 truncate font-serif text-2xl font-semibold">{reader.name}</h2><p className="mt-1.5 truncate text-xs text-white/65">Card {reader.cardUid} · {reader.membership}</p></div><button type="button" disabled={submitting} onClick={reset} aria-label="Close top-up menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10"><X size={18} /></button></div></header>

      {completedBalance !== null ? <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-6 text-center sm:p-8"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={34} /></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Top-up successful</p><h3 className="mt-2 font-serif text-3xl font-semibold">{completedBalance.toLocaleString()} minutes</h3><p className="mt-2 text-sm text-[#806b59]">New balance · {formatDuration(completedBalance)}</p><p className="mt-5 text-xs text-[#9a806b]">Resetting the terminal for the next reader…</p></div></div> : <>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <fieldset><legend className="text-[10px] font-bold uppercase tracking-[.15em] text-[#795a42]">Reader rate</legend><div className="mt-2 grid grid-cols-2 rounded-xl border border-[#d8c3ad] bg-[#f7efe4] p-1">{(["Adult", "Minor"] as RateTier[]).map(tier => <button key={tier} type="button" aria-pressed={rateTier === tier} onClick={() => setRateTier(tier)} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${rateTier === tier ? "bg-[#a83d12] text-white shadow-sm" : "text-[#704d34] hover:bg-white"}`}>{tier}<span className="ml-1.5 text-[10px] font-medium opacity-75">₱{TOP_UP_RATES_PHP_PER_HOUR[tier]}/hr</span></button>)}</div></fieldset>

          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#543822] p-4 text-white"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#f3d793]">Current balance</p><p className="mt-2 font-serif text-2xl font-semibold">{reader.balance.toLocaleString()}</p><p className="text-[11px] text-white/65">minutes</p></div><div className="rounded-xl border border-[#e7bd66] bg-[#fff4cf] p-4"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#8b5510]">New balance</p><p className="mt-2 font-serif text-2xl font-semibold text-[#a83d12]">{newBalance.toLocaleString()}</p><p className="text-[11px] text-[#8b6b3e]">minutes</p></div></div>

          <fieldset className="mt-4"><legend className="text-[10px] font-bold uppercase tracking-[.15em] text-[#795a42]">Enter top-up by</legend><div className="mt-2 grid grid-cols-2 rounded-xl border border-[#d8c3ad] bg-[#f7efe4] p-1">{(["pesos", "time"] as const).map(mode => <button key={mode} type="button" aria-pressed={entryMode === mode} onClick={() => setEntryMode(mode)} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition ${entryMode === mode ? "bg-[#a83d12] text-white shadow-sm" : "text-[#704d34] hover:bg-white"}`}>{mode === "pesos" ? "Pesos" : "Hours & minutes"}</button>)}</div></fieldset>

          {entryMode === "pesos" ? <>
            <fieldset className="mt-4"><legend className="text-[10px] font-bold uppercase tracking-[.15em] text-[#795a42]">Choose amount</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{PESO_PRESETS.map(value => <button key={value} type="button" onClick={() => setAmount(String(value))} className={`min-h-12 rounded-xl border text-sm font-bold transition ${amountValue === value ? "border-[#a83d12] bg-[#a83d12] text-white" : "border-[#d8c3ad] bg-white text-[#704d34] hover:bg-[#fff5e8]"}`}>₱{value}</button>)}</div></fieldset>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-xs font-bold">Custom peso amount<div className="relative mt-2"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-[#806b59]">₱</span><input required inputMode="decimal" type="number" min="1" max={MAX_TOP_UP_PESOS} step="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Enter amount" className="min-h-12 w-full rounded-xl border border-[#d8c3ad] bg-white pl-8 pr-3 text-sm font-normal" /></div></label><div className="flex min-w-40 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"><Clock3 size={20} className="shrink-0" /><div><p className="text-[9px] font-bold uppercase tracking-wider">Time added</p><p className="text-sm font-bold">{formatDuration(calculatedMinutes)}</p><p className="text-[10px]">{calculatedMinutes.toLocaleString()} min</p></div></div></div>
          </> : <>
            <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-bold">Hours<input inputMode="numeric" type="number" min="0" step="1" value={hours} onChange={event => setHours(event.target.value)} placeholder="0" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8c3ad] bg-white px-3 text-sm font-normal" /></label><label className="text-xs font-bold">Minutes<input inputMode="numeric" type="number" min="0" max="59" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} placeholder="0" className="mt-2 min-h-12 w-full rounded-xl border border-[#d8c3ad] bg-white px-3 text-sm font-normal" /></label></div>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"><Clock3 size={20} className="shrink-0" /><div><p className="text-[9px] font-bold uppercase tracking-wider">Time added</p><p className="text-sm font-bold">{formatDuration(calculatedMinutes)} · {calculatedMinutes.toLocaleString()} min</p></div></div>
            <div className="mt-3 rounded-xl border border-[#e7bd66] bg-[#fff4cf] px-4 py-3"><p className="text-[9px] font-bold uppercase tracking-wider text-[#8b5510]">Amount to collect</p><p className="mt-1 font-serif text-2xl font-semibold text-[#a83d12]">₱{formattedAmount}</p><p className="text-[11px] text-[#8b6b3e]">At ₱{hourlyRate} per hour · rounded to the nearest centavo</p></div>
            {(hours || minutes) && !timeQuote && <p role="alert" className="mt-2 text-xs text-rose-700">Enter a positive duration (0–59 minutes) with a charge up to ₱{MAX_TOP_UP_PESOS.toLocaleString()}.</p>}
          </>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Payment method<select value={method} onChange={event => setMethod(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#d8c3ad] bg-white px-3 text-sm font-normal"><option>Cash</option><option>Gcash</option><option>Card</option></select></label><label className="text-xs font-bold">Receipt / reference number<input required maxLength={100} value={reference} onChange={event => setReference(event.target.value)} aria-invalid={reference.length > 0 && !validReference} className="mt-2 min-h-11 w-full rounded-xl border border-[#d8c3ad] bg-white px-3 text-sm font-normal" placeholder="Enter receipt or payment reference" /></label></div>
          {reference.length > 0 && !validReference && <p role="alert" className="mt-2 text-xs text-rose-700">Enter a receipt or payment reference number.</p>}
        </div>
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#eadfd3] bg-[#fcf8f2] p-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" disabled={submitting} onClick={reset} className="min-h-12 rounded-xl border border-[#d8c3ad] bg-white px-5 text-xs font-bold">Cancel</button><button type="submit" disabled={submitting || !validTopUp || !validReference} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-6 text-xs font-bold text-white disabled:opacity-45 sm:flex-none">{submitting ? <><LoaderCircle size={16} className="animate-spin" />Processing…</> : <><WalletCards size={16} />Confirm ₱{formattedAmount} top-up</>}</button></footer>
      </>}
    </form></div>, document.body)}
  </>;
}
