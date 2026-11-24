"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Boxes, ChevronRight, Edit3, MapPin, PackageOpen, Plus, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { printBookLabels } from "./BookBarcodeLabels";
import type { Book, Copy, DashboardData } from "./dashboard-data";

type Props = {
  rows: Book[];
  data: Pick<DashboardData, "books" | "copies" | "logs">;
  query: string;
  setQuery: (value: string) => void;
  setDrawer: (value: boolean) => void;
  setBulkDrawer: (value: boolean) => void;
  setEditingLocation: (book: Book) => void;
  setEditingCover: (book: Book) => void;
};

const statusLabel = (status: string) => ({ IN_SHELF: "In Shelf", WITH_READER: "With Reader", RETURN_CART: "Return Cart", "In-Shelf": "In Shelf", "In Return Cart": "Return Cart" })[status] ?? status;
const statusStyle = (status: string) => ({
  "In Shelf": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "With Reader": "border-amber-200 bg-amber-50 text-amber-800",
  "Return Cart": "border-orange-200 bg-orange-50 text-orange-800",
  Damaged: "border-rose-200 bg-rose-50 text-rose-700",
  "On Hold": "border-violet-200 bg-violet-50 text-violet-700",
})[status] ?? "border-stone-200 bg-stone-50 text-stone-700";

const labelsFor = (book: Book, copies: Copy[]) => copies.map(copy => ({ book_id: book.book_id, copy_id: copy.copy_id, copy_number: copy.copy_number, barcode: copy.identifier_value, title: book.title }));
const genresFor = (book: Book) => book.book_genres.flatMap(item => item.genre.split(",")).map(genre => genre.trim()).filter(Boolean).filter((genre, index, genres) => genres.indexOf(genre) === index);

export function CatalogueEditor({ rows, data, query, setQuery, setDrawer, setBulkDrawer, setEditingCover, setEditingLocation }: Props) {
  const [copyBook, setCopyBook] = useState<Book | null>(null);
  const copiesByBook = useMemo(() => {
    const grouped = new Map<number, Copy[]>();
    data.copies.forEach(copy => grouped.set(copy.book_id, [...(grouped.get(copy.book_id) ?? []), copy]));
    return grouped;
  }, [data.copies]);
  const readsByBook = useMemo(() => {
    const grouped = new Map<number, number>();
    data.logs.forEach(log => grouped.set(log.book_id, (grouped.get(log.book_id) ?? 0) + 1));
    return grouped;
  }, [data.logs]);
  const stats = [
    ["Total titles", data.books.length],
    ["In shelf", data.copies.filter(copy => statusLabel(copy.status) === "In Shelf").length],
    ["Needs action", data.copies.filter(copy => statusLabel(copy.status) === "Return Cart").length],
  ] as const;

  return <>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{stats.map(([label, value]) => <div key={label} className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806b]">{label}</p><b className="mt-2 block font-serif text-3xl">{value}</b></div>)}</div>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
      <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-[#e2d5c8] bg-white px-3 shadow-sm focus-within:border-[#c4800c] focus-within:ring-2 focus-within:ring-[#f3d793]/50"><Search size={16} aria-hidden="true" className="text-[#9a806b]" /><span className="sr-only">Search catalogue</span><input value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Search title, author, or genre" /></label>
      <button onClick={() => setBulkDrawer(true)} className="min-h-12 rounded-xl border border-[#a83d12] px-4 py-2.5 text-xs font-bold text-[#a83d12] transition hover:bg-[#fff6e8]">Bulk Add</button>
      <button onClick={() => setDrawer(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#a83d12] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#8f320d]"><Plus size={15} aria-hidden="true" />Add Book</button>
    </div>
    <section className="overflow-hidden rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#eee5dc] px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-xl font-semibold">Every volume on record</h2><p className="mt-1 text-xs text-[#8d735e]">{rows.length} matching record{rows.length === 1 ? "" : "s"} · One row per volume</p></div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a98b70]">Select copies to view labels &amp; locations</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1040px] table-fixed text-left text-xs">
        <thead className="bg-[#fcf8f2] text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806b]"><tr><th className="w-[22%] px-5 py-3">Volume</th><th className="w-[8%] px-3 py-3">Cover</th><th className="w-[24%] px-4 py-3">Genre</th><th className="w-[27%] px-4 py-3">Copies / status</th><th className="w-[7%] px-4 py-3 text-center">Reads</th><th className="w-[12%] px-5 py-3 text-right">Action</th></tr></thead>
        <tbody>{rows.map(book => {
          const copies = copiesByBook.get(book.book_id) ?? [];
          const genres = genresFor(book);
          const breakdown = Array.from(copies.reduce((counts, copy) => { const label = statusLabel(copy.status); counts.set(label, (counts.get(label) ?? 0) + 1); return counts; }, new Map<string, number>()));
          return <tr key={book.book_id} className="h-[92px] border-t border-[#f0e9e1] align-middle transition hover:bg-[#fffbf5]">
            <td className="px-5 py-4"><b className="line-clamp-2 text-[13px] leading-5 text-[#543822]">{book.title}</b><small className="mt-1 block truncate text-[#9a806b]">{book.author ?? "Unknown author"}</small></td>
            <td className="px-3 py-3">{book.cover_image_url ? <img src={book.cover_image_url} alt="" className="h-14 w-10 rounded border border-[#e6d8c8] bg-[#f6efe6] object-cover shadow-sm" /> : <span className="grid h-14 w-10 place-items-center rounded border border-dashed border-[#d7c5b3] bg-[#faf5ee] text-[#b3977c]" title="Cover not set"><BookOpen size={16} aria-hidden="true" /></span>}</td>
            <td className="px-4 py-4"><div className="flex max-h-14 flex-wrap gap-1.5 overflow-hidden" title={genres.join(", ")}>{genres.length ? <>{genres.slice(0, 2).map(genre => <span key={genre} className="max-w-[150px] truncate rounded-full border border-[#ead8c5] bg-[#fff8ee] px-2 py-1 text-[10px] font-semibold text-[#77563e]">{genre}</span>)}{genres.length > 2 && <span className="rounded-full border border-[#ead8c5] bg-[#f3eadf] px-2 py-1 text-[10px] font-bold text-[#8d6c52]">+{genres.length - 2}</span>}</> : <span className="text-[#a98b70]">No genres</span>}</div></td>
            <td className="px-4 py-4">{copies.length ? <button type="button" onClick={() => setCopyBook(book)} aria-label={`View ${copies.length} physical copies of ${book.title}`} className="group w-full rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-[#e5d2bc] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c]"><span className="flex items-center gap-2"><Boxes size={16} aria-hidden="true" className="text-[#a83d12]" /><strong className="text-[#543822]">{copies.length} physical {copies.length === 1 ? "copy" : "copies"}</strong><ChevronRight size={15} aria-hidden="true" className="ml-auto text-[#b3977c] transition group-hover:translate-x-0.5" /></span><span className="mt-2 flex flex-wrap gap-1.5">{breakdown.slice(0, 3).map(([label, count]) => <span key={label} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusStyle(label)}`}>{count} {label}</span>)}</span></button> : <button type="button" onClick={() => setEditingLocation(book)} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[#dbcbbd] bg-[#fcf8f3] px-3 py-2.5 text-left text-[#927760] transition hover:border-[#b99776] hover:bg-white"><PackageOpen size={16} aria-hidden="true" /><span><strong className="block text-[11px] text-[#71523b]">No physical copies</strong><small className="text-[9px]">Register the first copy</small></span></button>}</td>
            <td className="px-4 py-4 text-center"><strong className="inline-grid h-8 min-w-8 place-items-center rounded-full bg-[#f5ede3] px-2 text-[#68472f]">{readsByBook.get(book.book_id) ?? 0}</strong></td>
            <td className="px-5 py-4"><div className="flex justify-end gap-1.5"><button type="button" onClick={() => setEditingLocation(book)} aria-label={`Manage shelf and status for ${book.title}`} title="Shelf / status" className="grid h-10 w-10 place-items-center rounded-lg border border-[#cdb18c] text-[#65462f] transition hover:border-[#a83d12] hover:bg-[#fff5e7] hover:text-[#a83d12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c]"><SlidersHorizontal size={15} aria-hidden="true" /></button><button type="button" onClick={() => setEditingCover(book)} aria-label={`Edit cover for ${book.title}`} title="Edit cover" className="grid h-10 w-10 place-items-center rounded-lg border border-[#e1c9af] text-[#a83d12] transition hover:bg-[#fff1df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4800c]"><Edit3 size={15} aria-hidden="true" /></button></div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!rows.length && <div className="grid min-h-56 place-items-center px-5 py-10 text-center"><div><Search className="mx-auto text-[#c8ad92]" aria-hidden="true" /><h3 className="mt-3 font-serif text-lg font-semibold">No matching volumes</h3><p className="mt-1 text-xs text-[#927760]">Try another title, author, or genre.</p></div></div>}
    </section>
    {copyBook && <CopyDrawer book={copyBook} copies={copiesByBook.get(copyBook.book_id) ?? []} close={() => setCopyBook(null)} manage={() => { setCopyBook(null); setEditingLocation(copyBook); }} />}
  </>;
}

function CopyDrawer({ book, copies, close, manage }: { book: Book; copies: Copy[]; close: () => void; manage: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [close]);

  return <div className="fixed inset-0 z-[65] bg-[#2d190c]/35 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="copy-drawer-title" className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-[#d9c5aa] bg-[#fffdf9] text-[#543822] shadow-[-24px_0_70px_rgba(50,27,13,.22)]">
      <header className="border-b border-[#eadfd3] bg-[#fcf7ef] px-5 py-5 sm:px-7"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a83d12]">Physical inventory</p><h2 id="copy-drawer-title" className="mt-2 line-clamp-2 font-serif text-2xl font-semibold">{book.title}</h2><p className="mt-1 text-xs text-[#8d735e]">{copies.length} registered {copies.length === 1 ? "copy" : "copies"}</p></div><button type="button" onClick={close} aria-label="Close copy details" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e1d3c5] bg-white text-[#74533b] transition hover:bg-[#f7eee4]"><X size={18} aria-hidden="true" /></button></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => printBookLabels(labelsFor(book, copies))} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#543822] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#3f291b]"><Printer size={14} aria-hidden="true" />Print all labels</button><button type="button" onClick={manage} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#b99a76] px-4 py-2 text-xs font-bold transition hover:bg-white"><SlidersHorizontal size={14} aria-hidden="true" />Manage shelf / status</button></div></header>
      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="space-y-3">{copies.map((copy, index) => { const label = statusLabel(copy.status); return <article key={copy.copy_id} className="rounded-xl border border-[#eadfd3] bg-white p-4 shadow-[0_4px_14px_rgba(84,56,34,.05)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#a68a72]">Copy {copy.copy_number || index + 1}</p><p className="mt-1 break-all font-mono text-xs font-bold text-[#543822]">{copy.identifier_value}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold ${statusStyle(label)}`}>{label}</span></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f0e7de] pt-3"><span className="flex min-w-0 items-center gap-2 text-xs text-[#765943]"><MapPin size={14} aria-hidden="true" className="shrink-0 text-[#c4800c]" /><span className="truncate">{copy.shelf_location || "Shelf not assigned"}</span></span><button type="button" onClick={() => printBookLabels(labelsFor(book, [copy]))} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold text-[#a83d12] transition hover:bg-[#fff1df]"><Printer size={13} aria-hidden="true" />Print label</button></div>{copy.condition_notes && <p className="mt-3 rounded-lg bg-[#faf6ef] px-3 py-2 text-[10px] leading-4 text-[#80654f]">{copy.condition_notes}</p>}</article>; })}</div></div>
      <footer className="border-t border-[#eadfd3] bg-[#fcf8f2] px-5 py-4 text-[10px] leading-4 text-[#8b705b] sm:px-7">Barcodes remain unique to each physical copy. Shelf and status changes use the existing inventory workflow.</footer>
    </aside>
  </div>;
}
