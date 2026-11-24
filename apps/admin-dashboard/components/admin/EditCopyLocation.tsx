"use client";

import { useState } from "react";
import { database } from "../../lib/supabase";
import type { Book, Copy } from "./dashboard-data";

const statuses = [["In-Shelf", "In Shelf"], ["With Reader", "With Reader"], ["On Hold", "On Hold (Reserved)"], ["In Return Cart", "Return Cart"], ["Damaged", "Damaged"]];
const storedStatus = (status: string) => ({ IN_SHELF: "In-Shelf", WITH_READER: "With Reader", RETURN_CART: "In Return Cart" })[status] ?? status;

export function EditCopyLocation({ book, copies, close, run }: {
  book: Book; copies: Copy[]; close: () => void;
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(copies[0]?.copy_id ?? 0);
  const copy = copies.find(item => item.copy_id === selected);
  const [shelf, setShelf] = useState(copy?.shelf_location ?? "");
  const [status, setStatus] = useState(storedStatus(copy?.status ?? "In-Shelf"));
  const [notes, setNotes] = useState(copy?.condition_notes ?? "");
  const [charge, setCharge] = useState("0");
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = "mt-2 w-full rounded-lg border border-[#B59A6A]/50 bg-[#FAF6EE] p-3 text-sm";
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2d190c]/40 p-4 backdrop-blur-sm">
    <form role="dialog" aria-modal="true" aria-labelledby="copy-location-title" className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-[#B59A6A] bg-[#FAF6EE] p-6 text-[#4A321F] shadow-2xl" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      if (!copies.length && !barcode.trim()) {
        setBarcodeError("Scan or enter a physical-copy barcode.");
        return;
      }
      setBarcodeError(""); setBusy(true);
      try {
        const ok = await run(() => copies.length
          ? database().schema("sora_v2").rpc("admin_update_copy_location", {
              p_copy_id: selected, p_shelf_location: shelf, p_status: status,
              p_condition_notes: notes, p_damage_charge: status === "Damaged" ? Number(charge) : 0,
            })
          : database().schema("sora_v2").rpc("admin_add_located_copy", {
              p_book_id: book.book_id, p_shelf_location: shelf,
              p_barcode: barcode.trim(), p_condition_notes: notes.trim() || null,
            }), copies.length ? "Copy status and shelf location saved" : "Physical copy added to the catalogue");
        if (ok) close();
      } finally { setBusy(false); }
    }}>
      <h2 id="copy-location-title" className="font-serif text-2xl">Shelf location &amp; status</h2>
      <p className="text-sm">{book.title}</p>
      {!copies.length ? <fieldset disabled={busy} className="space-y-4">
        <p className="text-sm">This title has no physical copy on record. Register a copy only after checking that it exists and confirming its barcode and home shelf.</p>
        <label className="block text-xs font-bold">Physical-copy barcode<input required maxLength={50} value={barcode} onChange={event => { setBarcode(event.target.value); setBarcodeError(""); }} className={input} placeholder="Scan or enter the unique barcode" /></label>
        {barcodeError && <p role="alert" className="text-sm text-red-700">{barcodeError}</p>}
        <label className="block text-xs font-bold">Home shelf<select required value={shelf} onChange={event => setShelf(event.target.value)} className={input}>
          <option value="">Select a shelf</option>{[1,2,3,4,5].map(number => <option key={number} value={`Shelf A${number}`}>Main Reading Hall — Shelf A{number}</option>)}
        </select></label>
        <label className="block text-xs font-bold">Condition notes<textarea value={notes} onChange={event => setNotes(event.target.value)} className={input}/></label>
        <button className="rounded-lg bg-[#4A321F] px-4 py-3 text-sm font-bold text-[#FAF6EE]" type="submit">{busy ? "Saving…" : "Register physical copy"}</button>
      </fieldset> : <fieldset disabled={busy} className="space-y-4">
        <label className="block text-xs font-bold">Physical copy<select className={input} value={selected} onChange={event => {
          const next = copies.find(item => item.copy_id === Number(event.target.value))!;
          setSelected(next.copy_id); setShelf(next.shelf_location ?? ""); setStatus(storedStatus(next.status)); setNotes(next.condition_notes ?? ""); setCharge("0");
        }}>{copies.map(item => <option key={item.copy_id} value={item.copy_id}>{item.identifier_value} · Copy {item.copy_id}</option>)}</select></label>
        <label className="block text-xs font-bold">Home shelf<select required value={shelf} onChange={event => setShelf(event.target.value)} className={input}>
          <option value="">Select a shelf</option>{[1,2,3,4,5].map(number => <option key={number} value={`Shelf A${number}`}>Main Reading Hall — Shelf A{number}</option>)}
        </select></label>
        <p className="text-xs opacity-70">A1–A5 run left to right below Center Seating, above Reception. Home shelf is retained while a copy is away.</p>
        <label className="block text-xs font-bold">Status<select required value={status} onChange={event => setStatus(event.target.value)} className={input}>{statuses.map(([value,label]) => <option key={value} value={value} disabled={value === "With Reader" && storedStatus(copy?.status ?? "") !== value}>{label}</option>)}</select></label>
        <label className="block text-xs font-bold">Condition notes<textarea value={notes} onChange={event => setNotes(event.target.value)} className={input}/></label>
        {status === "Damaged" && <label className="block text-xs font-bold">Damage charge (₱)<input type="number" min="0" step="0.01" required value={charge} onChange={event => setCharge(event.target.value)} className={input}/><span className="mt-2 block font-normal">Applied to the associated unsettled reader session. Damaged copies are removed from circulation.</span></label>}
        <button className="rounded-lg bg-[#4A321F] px-4 py-3 text-sm font-bold text-[#FAF6EE]" type="submit">{busy ? "Saving…" : "Save copy"}</button>
      </fieldset>}
      <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-[#B59A6A] px-4 py-2 text-sm">Close</button>
    </form>
  </div>;
}
