"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";

type Alert = { log_id: number; details: string; created_at: string };
const ALERTS_PER_PAGE = 8;
const api = () => database().schema("sora_v2");

export function InventoryAlerts() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const query = api().from("session_activity_logs")
        .select("log_id,details,created_at", { count: "exact" })
        .eq("action", "INVENTORY_DISCREPANCY");
      const from = (page - 1) * ALERTS_PER_PAGE;
      const result = await query.order("log_id", { ascending: false }).range(from, from + ALERTS_PER_PAGE - 1);
      if (!active) return;
      if (result.error) setError(errorMessage(result.error));
      else { setAlerts(result.data as Alert[]); setCount(result.count ?? 0); setError(""); }
      setLoading(false);
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page]);

  const pages = Math.max(1, Math.ceil(count / ALERTS_PER_PAGE));
  useEffect(() => { setPage(current => Math.min(current, pages)); }, [pages]);

  return <section aria-label="Inventory alerts" className="mb-4 overflow-hidden rounded-xl border border-[#e8dfd3] bg-[#fffdf9] shadow-sm">
    <button type="button" aria-expanded={open} aria-controls="inventory-alert-list" onClick={() => setOpen(value => !value)} className="flex min-h-12 w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-[#fff8ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c4800c]">
      <AlertTriangle size={16} className="shrink-0 text-[#a83d12]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">Recent inventory alerts</span>
      <span className="shrink-0 rounded-full bg-[#fff0c9] px-2 py-0.5 text-xs font-bold text-[#804916]">{count.toLocaleString()}</span>
      <ChevronDown size={16} className={`shrink-0 text-[#806b59] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div id="inventory-alert-list" className="border-t border-[#eadfd3] p-3 sm:p-4">
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
        : <div className="overflow-hidden rounded-lg border border-[#eadfd3]">
          <div className="max-h-72 overflow-y-auto bg-[#faf6ef] p-2" aria-busy={loading} aria-live="polite">
            {loading && !alerts.length ? <p className="py-6 text-center text-sm text-[#806b59]">Loading inventory alerts…</p>
              : alerts.length ? <div className="space-y-1.5">{alerts.map(alert => <article key={alert.log_id} className="grid min-w-0 gap-1 rounded-md border border-[#eadfd3] border-l-2 border-l-[#a83d12] bg-white px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start"><time dateTime={alert.created_at} className="text-[10px] font-bold uppercase tracking-[.08em] text-[#9a806b]">{new Date(alert.created_at).toLocaleString()}</time><p className="min-w-0 break-words text-xs leading-5 text-[#543822]">{alert.details}</p></article>)}</div>
                : <p className="py-6 text-center text-sm text-[#795a42]">No inventory discrepancies reported.</p>}
          </div>
          {pages > 1 && <div className="flex items-center justify-between gap-2 border-t border-[#eadfd3] bg-white px-3 py-2"><p className="text-[10px] font-semibold text-[#806b59]">Page {page} of {pages}</p><div className="flex gap-2"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))} className="min-h-8 rounded-md border border-[#d8c3ad] px-2 text-[10px] font-bold disabled:opacity-40">Previous</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage(current => Math.min(pages, current + 1))} className="min-h-8 rounded-md border border-[#d8c3ad] px-2 text-[10px] font-bold disabled:opacity-40">Next</button></div></div>}
        </div>}
    </div>}
  </section>;
}
