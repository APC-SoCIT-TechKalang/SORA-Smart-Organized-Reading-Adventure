"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, MapPin, PackageOpen, RotateCw, ScanLine, X } from "lucide-react";
import type { Copy } from "./dashboard-data";
import { database } from "../../lib/supabase";

type Props = {
  titles: ReadonlyMap<number, string>;
  copies: Copy[];
  onShelve: (copyId: number) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  close: () => void;
};

const onReturnCart = (copy: Copy) => copy.status === "RETURN_CART" || copy.status === "In Return Cart";

export function ReturnCartStation({ titles, copies, onShelve, refresh, close }: Props) {
  const [barcode, setBarcode] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [shelvingId, setShelvingId] = useState<number | null>(null);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnCopies = useMemo(() => copies.filter(onReturnCart), [copies]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Copy[]>();
    for (const copy of returnCopies) {
      const shelf = copy.shelf_location || "Unassigned";
      const items = grouped.get(shelf);
      if (items) items.push(copy);
      else grouped.set(shelf, [copy]);
    }
    return [...grouped].sort(([a], [b]) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b, undefined, { numeric: true }));
  }, [returnCopies]);
  const selected = returnCopies.find(copy => copy.copy_id === selectedId);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current?.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const findCopy = async () => {
    if (busyRef.current) return;
    const scanned = barcode.trim();
    setBarcode(""); setSelectedId(null); setMessage(""); setError("");
    if (!scanned) return;
    const copy = returnCopies.find(item => item.identifier_value.trim() === scanned);
    if (!copy) {
      busyRef.current = true;
      setBusy(true);
      try {
        const { data, error } = await database().schema("sora_v2").from("book_copies")
          .select("copy_id,copy_status").eq("barcode", scanned).maybeSingle();
        if (error) throw error;
        if (data?.copy_status === "In Return Cart") {
          if (await refresh()) setSelectedId(data.copy_id);
        } else {
          setError(data ? "This copy is not in the return cart. Scan a returned copy's label." : "Copy barcode not found. Scan the library copy label, not the title ISBN.");
        }
      } catch {
        setError("Could not verify the barcode. Try again.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      inputRef.current?.focus();
      return;
    }
    setSelectedId(copy.copy_id);
    inputRef.current?.focus();
  };

  const markShelved = async (copy: Copy) => {
    if (!onReturnCart(copy) || !copy.shelf_location || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    setShelvingId(copy.copy_id);
    try {
      const ok = await onShelve(copy.copy_id);
      if (ok) {
        setSelectedId(current => current === copy.copy_id ? null : current);
        setMessage(`${titles.get(copy.book_id) ?? "Copy"} marked in shelf at ${copy.shelf_location}.`);
        inputRef.current?.focus();
      } else {
        setError("Could not shelve this copy. Refresh the return cart and check its current status.");
      }
    } finally { busyRef.current = false; setBusy(false); setShelvingId(null); }
  };

  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-[#2d190c]/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="return-cart-title" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] shadow-[0_30px_100px_rgba(50,27,13,.35)] sm:max-h-[calc(100dvh-2rem)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eadfd3] bg-[#fcf7ef] p-4 sm:p-5"><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a83d12]">Book management</p><h2 id="return-cart-title" className="mt-1 flex items-center gap-2 font-serif text-xl font-semibold"><PackageOpen size={20} />Return cart <span className="rounded-full bg-[#f8dfb7] px-2 py-0.5 font-sans text-xs text-[#804916]">{returnCopies.length}</span></h2><p className="mt-1 text-xs text-[#806b59]">Sort by shelf, then tap Put in shelf after placing each copy. You can also scan its copy label.</p></div><button ref={closeRef} type="button" disabled={busy} onClick={close} aria-label="Close return cart" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#d8c3ad] bg-white disabled:opacity-50"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <form onSubmit={event => { event.preventDefault(); findCopy(); }} className="flex flex-col gap-2 sm:flex-row"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d8c3ad] bg-white px-3 text-xs"><ScanLine size={17} className="shrink-0 text-[#a83d12]" /><span className="sr-only">Scan copy barcode</span><input ref={inputRef} value={barcode} onChange={event => setBarcode(event.target.value)} disabled={busy} maxLength={100} autoComplete="off" placeholder="Scan the copy barcode, then press Enter" className="min-w-0 flex-1 bg-transparent py-2 outline-none" /></label><button type="submit" disabled={busy || !barcode.trim()} className="min-h-11 rounded-lg bg-[#543822] px-4 text-xs font-bold text-white disabled:opacity-40">Find copy</button></form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}</p>}
        {message && <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 size={16} />{message}</p>}
        {selected && <div className="mt-4 rounded-xl border border-[#c4800c] bg-[#fff7e8] p-4"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#a83d12]">Scanned copy</p><div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-serif text-lg font-semibold">{titles.get(selected.book_id) ?? "Unknown title"}</h3><p className="mt-1 break-all font-mono text-xs">{selected.identifier_value} · Copy #{selected.copy_number}</p><p className="mt-2 flex items-center gap-1 text-sm font-bold text-[#704d34]"><MapPin size={15} />{selected.shelf_location ?? "Shelf not assigned"}</p></div><button type="button" disabled={busy || !selected.shelf_location} onClick={() => void markShelved(selected)} className="min-h-11 rounded-lg bg-[#a83d12] px-4 text-xs font-bold text-white disabled:opacity-40">{shelvingId === selected.copy_id ? "Saving…" : "Put in shelf"}</button></div>{!selected.shelf_location && <p className="mt-2 text-xs text-red-800">Assign a shelf in the copy inventory before shelving this copy.</p>}</div>}
        <div className="mt-5 flex items-center justify-between gap-3"><h3 className="font-serif text-lg font-semibold">Sort by shelf</h3><button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8c3ad] bg-white px-3 text-xs font-semibold disabled:opacity-50"><RotateCw size={13} />Refresh</button></div>
        {groups.length ? <div className="mt-3 space-y-3">{groups.map(([shelf, items]) => <section key={shelf} className="overflow-hidden rounded-xl border border-[#eadfd3]"><h4 className="flex items-center justify-between bg-[#faf3e9] px-4 py-2.5 text-sm font-bold"><span className="flex items-center gap-2"><MapPin size={15} className="text-[#a83d12]" />{shelf}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs">{items.length}</span></h4><ul className="divide-y divide-[#eee5dc]">{items.map(copy => <li key={copy.copy_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs"><span className="min-w-0 flex-1 font-semibold">{titles.get(copy.book_id) ?? "Unknown title"} <span className="font-normal text-[#8d735e]">· Copy #{copy.copy_number}</span></span><span className="order-3 w-full break-all font-mono text-[10px] text-[#806b59] sm:order-none sm:w-auto">{copy.identifier_value}</span><button type="button" disabled={busy || !copy.shelf_location} onClick={() => void markShelved(copy)} aria-label={`Put ${titles.get(copy.book_id) ?? "copy"}, copy ${copy.copy_number}, in ${shelf}`} title={!copy.shelf_location ? "Assign a shelf first" : undefined} className="min-h-9 shrink-0 rounded-lg border border-[#a83d12] bg-[#fff7e8] px-3 text-[10px] font-bold text-[#8f3c12] hover:bg-[#ffead2] disabled:cursor-not-allowed disabled:opacity-40">{shelvingId === copy.copy_id ? "Saving…" : "Put in shelf"}</button></li>)}</ul></section>)}</div> : <p className="mt-4 rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-6 text-center text-sm text-[#806b59]">Return cart is clear. No copies need shelving.</p>}
      </div>
    </section>
  </div>, document.body);
}
