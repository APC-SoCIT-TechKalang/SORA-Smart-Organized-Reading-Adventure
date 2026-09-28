"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, RefreshCw } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";

type Request = { request_id: string; pairing_code: string; device_label: string; requested_at: string; expires_at: string };
type Reader = { user_id: string; first_name: string; last_name: string; memberships: { status: string; expires_at: string | null }[] };

export function KioskRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [readers, setReaders] = useState<Reader[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [pending, readerRows] = await Promise.all([
      database().rpc("admin_list_kiosk_requests"),
      database().from("profiles").select("user_id,first_name,last_name,memberships(status,expires_at)").eq("is_active", true).order("first_name"),
    ]);
    if (pending.error) throw pending.error;
    if (readerRows.error) throw readerRows.error;
    setRequests((pending.data ?? []) as Request[]);
    setReaders((readerRows.data ?? []) as unknown as Reader[]);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => { try { await refresh(); if (active) setError(""); } catch (cause) { if (active) setError(errorMessage(cause)); } };
    void run();
    const timer = window.setInterval(() => void run(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const activeReaders = readers.filter(reader => reader.memberships.some(membership => membership.status === "ACTIVE" && (!membership.expires_at || new Date(membership.expires_at) > new Date())));
  const approve = async (request: Request) => {
    const userId = selection[request.request_id];
    if (!userId) return;
    setBusy(request.request_id);
    setError("");
    try {
      const { error: approvalError } = await database().rpc("admin_approve_kiosk_login", { p_request_id: request.request_id, p_user_id: userId });
      if (approvalError) throw approvalError;
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(""); }
  };

  return <section className="mb-6 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-[#543822]"><MonitorSmartphone size={19}/>Kiosk login requests</h2><p className="mt-1 text-xs text-[#8d735e]">Temporary staff approval until the RFID reader is connected.</p></div><button type="button" onClick={() => void refresh()} aria-label="Refresh kiosk requests" className="rounded-lg p-2 text-[#953410] hover:bg-[#fff0c9]"><RefreshCw size={16}/></button></div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
    {!requests.length ? <p className="mt-5 rounded-xl bg-[#fcf8f2] p-4 text-sm text-[#8d735e]">No kiosk is waiting for approval.</p> : <div className="mt-5 space-y-3">{requests.map(request => <div key={request.request_id} className="grid gap-3 rounded-xl border border-[#eee2d6] p-4 lg:grid-cols-[130px_minmax(0,1fr)_auto] lg:items-center"><div><p className="font-serif text-2xl font-bold tracking-[.1em] text-[#953410]">{request.pairing_code}</p><small className="text-[#8d735e]">{request.device_label}</small></div><select value={selection[request.request_id] ?? ""} onChange={event => setSelection(current => ({ ...current, [request.request_id]: event.target.value }))} className="w-full rounded-xl border border-[#e2d5c8] bg-white px-3 py-3 text-sm"><option value="">Select customer</option>{activeReaders.map(reader => <option key={reader.user_id} value={reader.user_id}>{reader.first_name} {reader.last_name}</option>)}</select><button type="button" disabled={!selection[request.request_id] || busy === request.request_id} onClick={() => void approve(request)} className="rounded-xl bg-[#953410] px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{busy === request.request_id ? "Connecting…" : "Connect account"}</button></div>)}</div>}
  </section>;
}
