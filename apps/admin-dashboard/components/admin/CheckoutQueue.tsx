"use client";

import { useCallback, useEffect, useState } from "react";
import { database, errorMessage } from "../../lib/supabase";

type Pending = {
  session_id: number; reader: string; food_charge: number; other_charge: number;
  total_charge: number; payment_status: string; disputed: boolean; reason: string | null;
};

export function CheckoutQueue({ run }: {
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
}) {
  const [items, setItems] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await database().schema("sora_v2").rpc("admin_checkout_queue");
    if (result.error) throw result.error;
    setItems(result.data as Pending[]);
    setError("");
  }, []);
  useEffect(() => {
    void load().catch(cause => setError(errorMessage(cause)));
    const timer = window.setInterval(() => void load().catch(cause => setError(errorMessage(cause))), 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  const save = async (action: () => PromiseLike<{ error: unknown }>, success: string) => {
    if (await run(action, success)) await load().catch(cause => setError(errorMessage(cause)));
  };
  const input = "w-full rounded-lg border border-[#dfcfbe] bg-white px-3 py-2 text-sm";
  return <section className="mt-8 rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm sm:p-6" aria-labelledby="checkout-queue-title">
    <div className="flex items-center justify-between gap-3"><div><h2 id="checkout-queue-title" className="font-serif text-xl font-semibold">Checkout counter</h2><p className="mt-1 text-xs text-[#8d735e]">Review disputed charges and record counter payments.</p></div><button type="button" onClick={() => void load().catch(cause => setError(errorMessage(cause)))} className="rounded-lg border border-[#B59A6A] px-3 py-2 text-xs font-bold">Refresh</button></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {!items.length && !error && <p className="mt-4 text-sm text-[#8d735e]">No checkouts are waiting at the counter.</p>}
    <div className="mt-4 grid gap-4">{items.map(item => <article key={item.session_id} className={`rounded-xl border p-4 ${item.disputed ? "border-rose-300 bg-rose-50" : "border-[#eadfd3]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{item.reader}</strong><p className="text-xs text-[#8d735e]">Session #{item.session_id} · {item.disputed ? "Charge disputed — review needed" : item.payment_status === "PAID" ? "Paid" : "Awaiting payment"}</p></div><b>₱{Number(item.total_charge).toFixed(2)}</b></div>
      {item.disputed && <><p className="mt-3 rounded-lg bg-white/70 p-3 text-sm">Reader's concern: {item.reason}</p><form key={`${item.session_id}-${item.total_charge}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void save(() => database().schema("sora_v2").rpc("admin_adjust_checkout_charge", { p_session_id: item.session_id, p_food_charge: Number(data.get("food")), p_other_charge: Number(data.get("other")) }), "Checkout charge adjusted"); }}><label className="text-xs font-bold">Food charge<input name="food" type="number" min="0" step="0.01" required defaultValue={item.food_charge} className={input} /></label><label className="text-xs font-bold">Other / damages<input name="other" type="number" min="0" step="0.01" required defaultValue={item.other_charge} className={input} /></label><button className="rounded-lg bg-[#953410] px-4 py-2.5 text-xs font-bold text-white">Resolve and update</button></form></>}
      {!item.disputed && item.total_charge > 0 && item.payment_status !== "PAID" && <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void save(() => database().schema("sora_v2").rpc("admin_mark_checkout_paid", { p_session_id: item.session_id, p_method: String(data.get("method")), p_reference: String(data.get("reference") || "") }), "Checkout payment recorded"); }}><label className="text-xs font-bold">Payment method<select name="method" className={input}><option>Cash</option><option>Gcash</option><option>Card</option></select></label><label className="text-xs font-bold">Reference (optional)<input name="reference" className={input} /></label><button className="rounded-lg bg-[#953410] px-4 py-2.5 text-xs font-bold text-white">Mark paid</button></form>}
    </article>)}</div>
  </section>;
}
