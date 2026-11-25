"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";

type ReaderCard = { users: { first_name: string; last_name: string; username: string; birthdate: string; is_active: boolean; user_role: string; membership_status: string; membership_expires_at: string | null } };
type Alert = { log_id: number; details: string; created_at: string };
const api = () => database().schema("sora_v2");
const ALERTS_PER_PAGE = 8;

export function ReaderCheckIn() {
  const [rfid, setRfid] = useState("");
  const [card, setCard] = useState<ReaderCard | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [alertSearch, setAlertSearch] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertError, setAlertError] = useState("");
  const mutation = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAlertsLoading(true);
      const from = (alertPage - 1) * ALERTS_PER_PAGE;
      let query = api().from("session_activity_logs")
        .select("log_id,details,created_at", { count: "exact" })
        .eq("action", "INVENTORY_DISCREPANCY");
      if (alertSearch.trim()) query = query.ilike("details", `%${alertSearch.trim()}%`);
      const result = await query.order("log_id", { ascending: false }).range(from, from + ALERTS_PER_PAGE - 1);
      if (!active) return;
      if (result.error) setAlertError(errorMessage(result.error));
      else { setAlerts(result.data as Alert[]); setAlertCount(result.count ?? 0); setAlertError(""); }
      setAlertsLoading(false);
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [alertPage, alertSearch]);

  const alertPages = Math.max(1, Math.ceil(alertCount / ALERTS_PER_PAGE));
  useEffect(() => { setAlertPage(1); }, [alertSearch]);
  useEffect(() => { setAlertPage(page => Math.min(page, alertPages)); }, [alertPages]);

  const run = async (action: () => Promise<void>) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setError(errorMessage(cause)); }
    finally { mutation.current = false; setBusy(false); }
  };
  const reader = card?.users;
  const eligible = reader?.is_active && reader.user_role === "Reader" && reader.membership_status === "ACTIVE"
    && !!reader.membership_expires_at && new Date(reader.membership_expires_at).getTime() > Date.now();
  const button = "rounded-xl bg-[#a83d12] px-4 py-3 text-sm font-bold text-white disabled:opacity-50";

  return <section aria-label="Reader check-in" className="mb-6 space-y-4 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
    <div><h2 className="font-serif text-2xl font-semibold">Reader check-in</h2>
      <p className="mt-2 text-sm text-[#795a42]">Scan the reader's library card, verify their identity, then approve entry. Their kiosk screen will update automatically.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void run(async () => {
      setCard(null); setVerified(false);
      const result = await api().from("librarycard")
        .select("users(first_name,last_name,username,birthdate,is_active,user_role,membership_status,membership_expires_at)")
        .eq("librarycard_rfid", rfid.trim()).eq("is_active", true).is("deactivated_at", null).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("No active library card found. Register or activate the card first.");
      setCard(result.data as unknown as ReaderCard);
    }); }}>
      <label className="min-w-60 flex-1 text-sm font-semibold">Library card RFID
        <input className="mt-2 block w-full rounded-xl border border-[#e2d5c8] bg-[#fffbf5] px-3 py-3 font-normal" required maxLength={100} autoComplete="off"
          value={rfid} disabled={busy} onChange={event => { setRfid(event.target.value); setCard(null); setVerified(false); setMessage(""); }} placeholder="Scan or enter the reader's card RFID" />
      </label>
      <button className={button} disabled={busy || !rfid.trim()}>Look up reader</button>
    </form>
    {reader && <div className="space-y-3 rounded-xl border border-[#e2d5c8] p-4">
      <p className="font-semibold">{reader.first_name} {reader.last_name} (@{reader.username})</p>
      <p className="text-sm">Birthdate: {reader.birthdate} · Membership: {reader.membership_status}</p>
      {!eligible && <p role="alert" className="text-sm text-red-800">Activate the reader account and an unexpired membership before check-in.</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verified} disabled={busy || !eligible} onChange={event => setVerified(event.target.checked)} />I verified this reader's identity</label>
      <button className={button} disabled={busy || !verified || !eligible} onClick={() => void run(async () => {
        const result = await api().rpc("approve_kiosk_checkin", { p_rfid: rfid.trim() });
        if (result.error) throw result.error;
        setMessage(`Check-in approved for ${reader.first_name} ${reader.last_name}. They can now choose a seat and scan a book at the kiosk.`);
        setCard(null); setVerified(false); setRfid("");
      })}>{busy ? "Saving..." : "Approve check-in"}</button>
    </div>}
    <div className="border-t border-[#e8dfd3] pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="font-serif text-xl font-semibold">Recent inventory alerts</h3><p className="mt-1 text-xs text-[#806b59]">{alertCount.toLocaleString()} {alertCount === 1 ? "alert" : "alerts"} recorded</p></div>
        <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-[#e2d5c8] bg-white px-3 sm:max-w-xs"><Search size={15} className="shrink-0 text-[#a83d12]" aria-hidden="true" /><span className="sr-only">Search inventory alerts</span><input value={alertSearch} onChange={event => setAlertSearch(event.target.value)} placeholder="Search card, ISBN, or message" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      </div>
      {alertError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{alertError}</p>
        : <div className="mt-4 overflow-hidden rounded-xl border border-[#eadfd3] bg-[#faf6ef]">
          <div className="max-h-[26rem] min-h-32 overflow-y-auto p-2 sm:p-3" aria-busy={alertsLoading} aria-live="polite">
            {alertsLoading && !alerts.length ? <div className="grid min-h-28 place-items-center text-sm text-[#806b59]">Loading inventory alerts…</div>
              : alerts.length ? <div className="space-y-2">{alerts.map(alert => <article key={alert.log_id} className="grid min-w-0 gap-2 rounded-lg border border-[#eadfd3] border-l-4 border-l-[#a83d12] bg-white p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start"><time dateTime={alert.created_at} className="text-[10px] font-bold uppercase tracking-[.08em] text-[#9a806b]">{new Date(alert.created_at).toLocaleString()}</time><p className="min-w-0 break-words text-sm leading-5 text-[#543822]">{alert.details}</p></article>)}</div>
                : <div className="grid min-h-28 place-items-center px-4 text-center text-sm text-[#795a42]">{alertSearch ? "No inventory alerts match your search." : "No inventory discrepancies reported."}</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eadfd3] bg-white px-3 py-3"><p className="text-[10px] font-semibold text-[#806b59]">Page {alertPage.toLocaleString()} of {alertPages.toLocaleString()}</p><div className="flex gap-2"><button type="button" disabled={alertPage === 1 || alertsLoading} onClick={() => setAlertPage(page => Math.max(1, page - 1))} className="min-h-9 rounded-lg border border-[#d8c3ad] px-3 text-[10px] font-bold text-[#704d34] disabled:opacity-40">Previous</button><button type="button" disabled={alertPage >= alertPages || alertsLoading} onClick={() => setAlertPage(page => Math.min(alertPages, page + 1))} className="min-h-9 rounded-lg border border-[#d8c3ad] px-3 text-[10px] font-bold text-[#704d34] disabled:opacity-40">Next</button></div></div>
        </div>}
    </div>
  </section>;
}
