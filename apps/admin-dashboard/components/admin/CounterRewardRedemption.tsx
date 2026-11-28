"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { database, errorMessage } from "../../lib/supabase";
import type { DashboardData } from "./dashboard-data";

export function CounterRewardRedemption({ data, onComplete, onClose }: { data: DashboardData; onComplete: () => Promise<void>; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [readerId, setReaderId] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ reference: string; reward_name: string; points_used: number } | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const reader = data.readers.find(item => item.user_id === readerId);
  const reward = data.rewards.find(item => item.reward_id === Number(rewardId));
  const readers = useMemo(() => data.readers.filter(item => item.is_active && item.roles?.name === "reader" && `${item.first_name} ${item.last_name}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30), [data.readers, search]);
  useEffect(() => {
    if (!readerId) { setBalance(null); return; }
    let active = true;
    setBalance(null);
    database().schema("sora_v2").rpc("admin_reader_reward_balance", { p_reader_id: readerId }).then(({ data: value, error: failure }) => {
      if (!active) return;
      if (failure) setError(errorMessage(failure));
      else { setError(""); setBalance(Number(value)); }
    });
    return () => { active = false; };
  }, [readerId]);
  const confirm = async () => {
    if (!reader || !reward || balance === null || balance < reward.points_cost || busy) return;
    setBusy(true); setError("");
    try {
      const result = await database().schema("sora_v2").rpc("admin_redeem_reward_for_reader", { p_reader_id: readerId, p_reward_id: reward.reward_id, p_request_key: requestKey.current });
      if (result.error) throw result.error;
      setReceipt(result.data as { reference: string; reward_name: string; points_used: number });
      await onComplete();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#321b0f]/70 p-3" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="counter-reward-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#fffaf3] p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#953410]">Librarian counter</p><h2 id="counter-reward-title" className="mt-1 font-serif text-2xl font-semibold">Redeem for a reader</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-[#dfcdbb] p-2"><X size={18}/></button></div>
      {receipt ? <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><Check className="text-emerald-700"/><strong className="mt-2 block">Redemption fulfilled</strong><p className="mt-2 text-sm">{receipt.reward_name} · {receipt.points_used.toLocaleString()} points</p><p className="mt-1 break-all font-mono text-xs">Reference: {receipt.reference}</p><button type="button" onClick={onClose} className="mt-5 rounded-lg bg-[#953410] px-4 py-2 text-sm font-bold text-white">Done</button></div> : <div className="mt-6 space-y-4">
        <div><label htmlFor="counter-reader-search" className="block text-sm font-bold">Find reader</label><input id="counter-reader-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" className="mt-2 w-full rounded-lg border border-[#dfcdbb] bg-white p-3 text-sm"/><div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[#dfcdbb] bg-white">{readers.map(item => <button type="button" key={item.user_id} onClick={() => setReaderId(item.user_id)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#fff0d9] ${readerId === item.user_id ? "bg-[#fff0d9] font-bold" : ""}`}>{item.first_name} {item.last_name}</button>)}{!readers.length && <p className="p-3 text-sm text-[#806b59]">No active readers match.</p>}</div></div>
        {reader && <p className="rounded-lg bg-[#f7ead8] p-3 text-sm">{reader.first_name} {reader.last_name} · Available points: <strong>{balance === null ? "Loading…" : balance.toLocaleString()}</strong></p>}
        <label className="block text-sm font-bold">Reward<select value={rewardId} onChange={event => { setRewardId(event.target.value); requestKey.current = crypto.randomUUID(); }} className="mt-2 w-full rounded-lg border border-[#dfcdbb] bg-white p-3 text-sm"><option value="">Choose a stocked product</option>{data.rewards.filter(item => item.is_available && item.stock_quantity > 0).map(item => <option key={item.reward_id} value={item.reward_id}>{item.reward_name} · {item.points_cost.toLocaleString()} pts · {item.stock_quantity} in stock</option>)}</select></label>
        {reward && balance !== null && <p className="text-sm">After redemption: <strong>{Math.max(0, balance - reward.points_cost).toLocaleString()} points</strong>{balance < reward.points_cost && <span className="ml-2 text-rose-700">Insufficient points</span>}</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <p className="text-xs text-[#806b59]">Confirm the reader’s identity and hand over the product when submitting. This immediately deducts points and stock.</p>
        <button type="button" disabled={!reader || !reward || balance === null || balance < reward.points_cost || busy} onClick={() => void confirm()} className="w-full rounded-lg bg-[#953410] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? "Processing…" : "Confirm handoff and redeem"}</button>
      </div>}
    </section>
  </div>;
}
