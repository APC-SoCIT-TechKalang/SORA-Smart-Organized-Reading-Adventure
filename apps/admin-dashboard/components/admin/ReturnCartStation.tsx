"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Clock3, LoaderCircle, MapPin, PackageOpen, RotateCw, ScanLine, X } from "lucide-react";
import { database } from "../../lib/supabase";
import type { Copy } from "./dashboard-data";
import { findReturnCopyByBarcode, isRecentlyReturned, returnedAgo, returnTime, selectReturnCopies, type ReturnTab } from "./return-cart";

type Props = {
  titles: ReadonlyMap<number, string>;
  isbns: ReadonlyMap<number, string>;
  copies: Copy[];
  onShelve: (copyId: number) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  close: () => void;
  loading?: boolean;
  loadError?: string;
};

export function ReturnCartStation({ titles, isbns, copies, onShelve, refresh, close, loading = false, loadError = "" }: Props) {
  const [tab, setTab] = useState<ReturnTab>("all");
  const [shelf, setShelf] = useState("");
  const [barcode, setBarcode] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [shelvingId, setShelvingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current?.click(); };
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    setRemovedIds(current => {
      const next = new Set([...current].filter(id => copies.some(copy => copy.copy_id === id && copy.status === "RETURN_CART")));
      return next.size === current.size ? current : next;
    });
  }, [copies]);

  const pending = useMemo(() => copies.filter(copy => copy.status === "RETURN_CART" && !removedIds.has(copy.copy_id)), [copies, removedIds]);
  const recentCount = useMemo(() => pending.filter(copy => isRecentlyReturned(copy, now)).length, [pending, now]);
  const shelves = useMemo(() => [...new Set([...pending.map(copy => copy.shelf_location?.trim() || "Unassigned"), ...(shelf ? [shelf] : [])])]
    .sort((a, b) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b, undefined, { numeric: true })), [pending, shelf]);
  const visible = useMemo(() => selectReturnCopies(pending, tab, shelf, now), [pending, tab, shelf, now]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Copy[]>();
    for (const copy of visible) {
      const name = copy.shelf_location?.trim() || "Unassigned";
      grouped.set(name, [...(grouped.get(name) ?? []), copy]);
    }
    return [...grouped].sort(([a], [b]) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b, undefined, { numeric: true }));
  }, [visible]);
  const selected = pending.find(copy => copy.copy_id === selectedId);
  const selectedOutsideFilter = selected && !visible.some(copy => copy.copy_id === selected.copy_id);

  const findCopy = async () => {
    if (busyRef.current) return;
    const scanned = barcode.trim();
    setBarcode(""); setSelectedId(null); setMessage(""); setError("");
    if (!scanned) return;
    const copy = findReturnCopyByBarcode(pending, scanned);
    if (copy) {
      setSelectedId(copy.copy_id);
      window.setTimeout(() => document.getElementById(`return-copy-${copy.copy_id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
      inputRef.current?.focus();
      return;
    }
    busyRef.current = true; setBusy(true);
    try {
      const { data, error: queryError } = await database().schema("sora_v2").from("book_copies")
        .select("copy_id,copy_status").eq("barcode", scanned).maybeSingle();
      if (queryError) throw queryError;
      if (data?.copy_status === "In Return Cart") {
        if (await refresh()) setSelectedId(data.copy_id);
      } else {
        setError(data ? "This copy is not in the return cart. Scan a returned copy's label." : "Copy barcode not found. Scan the library copy label, not the title ISBN.");
      }
    } catch {
      setError("Could not verify the barcode. Try again.");
    } finally {
      busyRef.current = false; setBusy(false); inputRef.current?.focus();
    }
  };

  const markShelved = async (copy: Copy) => {
    if (copy.status !== "RETURN_CART" || busyRef.current) return;
    if (!copy.shelf_location) { setError("Assign a shelf in copy inventory before shelving this copy."); return; }
    busyRef.current = true; setBusy(true); setShelvingId(copy.copy_id); setError(""); setMessage("");
    try {
      if (await onShelve(copy.copy_id)) {
        setRemovedIds(current => new Set(current).add(copy.copy_id));
        setSelectedId(current => current === copy.copy_id ? null : current);
        setMessage(`${titles.get(copy.book_id) ?? "Copy"} marked in shelf at ${copy.shelf_location}.`);
        inputRef.current?.focus();
      } else {
        setError("Could not shelve this copy. Refresh the return cart and check its current status.");
      }
    } catch {
      setError("Could not shelve this copy. Refresh the return cart and try again.");
    } finally { busyRef.current = false; setBusy(false); setShelvingId(null); }
  };

  const copyRow = (copy: Copy, highlight = false) => {
    const timestamp = copy.returned_to_cart_at;
    return <li id={`return-copy-${copy.copy_id}`} key={copy.copy_id} className={`flex items-center gap-3 border-t border-[#eee5dc] px-3 py-3 sm:px-4 ${highlight ? "bg-[#fff2dd]" : "bg-[#fffdf9]"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold" title={titles.get(copy.book_id) ?? "Unknown title"}>{titles.get(copy.book_id) ?? "Unknown title"} <span className="font-normal text-[#8d735e]">· Copy #{copy.copy_number}</span></p>
        <p className="mt-0.5 truncate text-[10px] text-[#806b59]">ISBN {isbns.get(copy.book_id) || "unavailable"} · {copy.shelf_location || "Unassigned shelf"}</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-[#9a806b]" title={returnTime(timestamp, now) !== null ? new Date(timestamp!).toLocaleString() : undefined}><Clock3 size={11} />{returnedAgo(timestamp, now)}</p>
      </div>
      <button type="button" disabled={busy || !copy.shelf_location} onClick={() => void markShelved(copy)} aria-label={`Put ${titles.get(copy.book_id) ?? "copy"}, copy ${copy.copy_number}, in ${copy.shelf_location ?? "its shelf"}`} title={!copy.shelf_location ? "Assign a shelf first" : undefined} className="min-h-9 shrink-0 rounded-lg border border-[#a83d12] bg-[#fff7e8] px-3 text-[10px] font-bold text-[#8f3c12] hover:bg-[#ffead2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c] disabled:cursor-not-allowed disabled:opacity-40">{shelvingId === copy.copy_id ? "Saving…" : "Put in shelf"}</button>
    </li>;
  };

  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-[#2d190c]/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="return-cart-title" className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] shadow-[0_30px_100px_rgba(50,27,13,.35)] sm:max-h-[calc(100dvh-2rem)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eadfd3] bg-[#fcf7ef] p-4 sm:p-5"><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a83d12]">Book management</p><h2 id="return-cart-title" className="mt-1 flex items-center gap-2 font-serif text-xl font-semibold"><PackageOpen size={20} />Return cart <span className="rounded-full bg-[#f8dfb7] px-2 py-0.5 font-sans text-xs text-[#804916]">{pending.length}</span></h2><p className="mt-1 text-xs text-[#806b59]">Organize returned books and place each copy on its assigned shelf.</p></div><button ref={closeRef} type="button" disabled={busy} onClick={close} aria-label="Close return cart" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#d8c3ad] bg-white disabled:opacity-50"><X size={17} /></button></header>
      <div className="shrink-0 space-y-2 border-b border-[#eadfd3] bg-[#fffdf9] px-4 py-3 sm:px-5">
        <form onSubmit={event => { event.preventDefault(); void findCopy(); }} className="flex gap-2"><label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d8c3ad] bg-white px-3 text-xs"><ScanLine size={16} className="shrink-0 text-[#a83d12]" /><span className="sr-only">Scan copy barcode</span><input ref={inputRef} value={barcode} onChange={event => setBarcode(event.target.value)} disabled={busy} maxLength={100} autoComplete="off" placeholder="Scan the copy barcode…" className="min-w-0 flex-1 bg-transparent py-2 outline-none" /></label><button type="submit" disabled={busy || !barcode.trim()} className="rounded-lg bg-[#543822] px-3 text-xs font-bold text-white disabled:opacity-40">Find copy</button></form>
        <div role="tablist" aria-label="Return period" className="grid grid-cols-2 gap-1 rounded-lg bg-[#f2e8da] p-1"><button id="return-tab-all" aria-controls="return-cart-list" type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} className={`min-h-9 rounded-md px-2 text-xs font-bold ${tab === "all" ? "bg-[#a84b1f] text-white" : "text-[#765a44] hover:bg-white/70"}`}>All returns <span className="ml-1 opacity-80">{pending.length}</span></button><button id="return-tab-recent" aria-controls="return-cart-list" type="button" role="tab" aria-selected={tab === "recent"} onClick={() => setTab("recent")} className={`min-h-9 rounded-md px-2 text-xs font-bold ${tab === "recent" ? "bg-[#a84b1f] text-white" : "text-[#765a44] hover:bg-white/70"}`}>Recently returned <span className="ml-1 opacity-80">{recentCount}</span></button></div>
        <div className="flex items-center gap-2"><label htmlFor="return-shelf-filter" className="sr-only">Filter by shelf</label><select id="return-shelf-filter" value={shelf} onChange={event => setShelf(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-[#d8c3ad] bg-white px-3 text-xs"><option value="">All shelves</option>{shelves.map(name => <option key={name} value={name}>{name === "Unassigned" ? "Unassigned shelf" : name}</option>)}</select><button type="button" disabled={busy || loading} onClick={() => void refresh()} aria-label="Refresh return cart" title="Refresh return cart" className="grid h-9 w-9 place-items-center rounded-lg border border-[#d8c3ad] bg-white disabled:opacity-40"><RotateCw size={14} className={loading ? "animate-spin" : ""} /></button></div>
        {(error || loadError) && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error || loadError}</p>}
        {message && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800"><CheckCircle2 size={14} />{message}</p>}
      </div>
      <div id="return-cart-list" role="tabpanel" aria-labelledby={tab === "all" ? "return-tab-all" : "return-tab-recent"} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between text-[10px] text-[#806b59]"><span>Sort by shelf</span><span>{loading && <LoaderCircle size={12} className="mr-1 inline animate-spin" />}{visible.length} {visible.length === 1 ? "copy" : "copies"}</span></div>
        {selectedOutsideFilter && <section className="mb-3 overflow-hidden rounded-xl border border-[#c4800c]"><div className="bg-[#f8e7ca] px-3 py-2 text-[10px] font-bold text-[#8a4a1e]">Scanned copy · outside current filter</div><ul>{copyRow(selected, true)}</ul></section>}
        {groups.map(([name, items]) => <section key={name} className="mb-3 overflow-hidden rounded-xl border border-[#eadfd3]"><h3 className="flex items-center justify-between bg-[#faf3e9] px-3 py-2.5 text-xs font-bold sm:px-4"><span className="flex items-center gap-2"><MapPin size={14} className="text-[#a83d12]" />{name === "Unassigned" ? "Unassigned shelf" : name}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px]">{items.length}</span></h3><ul>{items.map(copy => copyRow(copy, copy.copy_id === selectedId))}</ul></section>)}
        {!visible.length && !selectedOutsideFilter && <p className="rounded-xl border border-[#eadfd3] bg-[#faf6ef] p-6 text-center text-sm text-[#806b59]">{pending.length ? "No pending copies match these filters." : "Return cart is clear. No copies need shelving."}</p>}
      </div>
    </section>
  </div>, document.body);
}
