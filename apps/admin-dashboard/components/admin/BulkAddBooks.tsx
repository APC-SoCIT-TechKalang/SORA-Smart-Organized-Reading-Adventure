"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { database } from "../../lib/supabase";
import { printBookLabels, type BookLabel } from "./BookBarcodeLabels";
import { bulkRowError, emptyBulkRow, fillRepeatedBooks, parseBookBatch, type BulkBookRow } from "./book-batch";

type ExistingBook = {
  book_id: number; isbn: string; title: string; book_genre: string | null;
  book_type: string; age_rating: number;
  authors: { author_firstname: string; author_lastname: string } | null;
};

export function BulkAddBooks({ close, run }: {
  close: () => void;
  run: (action: () => PromiseLike<{ error: unknown }>, success: string) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<BulkBookRow[]>([emptyBulkRow()]);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [labels, setLabels] = useState<BookLabel[]>([]);
  const input = "w-full min-w-0 rounded-lg border border-[#dfcfbe] bg-white p-2 text-xs";

  const checkCatalog = async (next: BulkBookRow[]) => {
    const isbns = [...new Set(next.map(row => row.isbn.toUpperCase().replace(/[\s-]/g, "")).filter(Boolean))];
    if (!isbns.length) { setRows(next); return; }
    const result = await database().schema("sora_v2").from("books")
      .select("book_id,isbn,title,book_genre,book_type,age_rating,authors(author_firstname,author_lastname)")
      .in("isbn", isbns);
    if (result.error) throw result.error;
    const known = new Map((result.data as unknown as ExistingBook[]).map(book => [book.isbn, book]));
    setRows(fillRepeatedBooks(next.map(row => {
      const book = known.get(row.isbn.toUpperCase().replace(/[\s-]/g, ""));
      return book ? {
        ...row, existingBookId: book.book_id, title: book.title,
        author: book.authors ? `${book.authors.author_firstname} ${book.authors.author_lastname}` : row.author,
        genre: book.book_genre ?? row.genre, book_type: book.book_type,
        age_rating: String(book.age_rating),
      } : { ...row, existingBookId: undefined };
    })));
  };

  const loadText = async (text: string) => {
    setError(""); setBusy(true);
    try { await checkCatalog(parseBookBatch(text)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the batch."); }
    finally { setBusy(false); }
  };

  const edit = (index: number, key: keyof BulkBookRow, value: string) => {
    setRows(current => current.map((row, position) => position === index
      ? { ...row, [key]: value, ...(key === "isbn" ? { existingBookId: undefined } : {}) } : row));
  };

  const submit = async () => {
    setError("");
    setShowErrors(true);
    if (!rows.length || rows.length > 100) { setError("Enter between 1 and 100 physical copies."); return; }
    const invalid = rows.findIndex(row => bulkRowError(row));
    if (invalid !== -1) { setError(`Row ${invalid + 1}: ${bulkRowError(rows[invalid])}`); return; }
    setBusy(true);
    try {
      let saved: BookLabel[] = [];
      const ok = await run(async () => {
        const result = await database().schema("sora_v2").rpc("admin_register_books", {
          p_entries: rows.map(row => ({
            isbn: row.isbn, title: row.title, author: row.author,
            genre: row.genre, book_type: row.book_type,
            age_rating: row.age_rating, shelf_location: row.shelf_location,
            metadata: { themes: row.tags.trim() || null },
          })),
        });
        if (!result.error) saved = result.data as BookLabel[];
        else setError(result.error.message);
        return result;
      }, `${rows.length} physical ${rows.length === 1 ? "copy" : "copies"} added`);
      if (ok) setLabels(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save books."); }
    finally { setBusy(false); }
  };

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#2d190c]/40 p-2 backdrop-blur-sm sm:p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="bulk-add-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-6xl min-w-0 overflow-y-auto rounded-2xl border border-[#B59A6A] bg-[#fffdf9] p-3 text-[#4A321F] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="bulk-add-title" className="font-serif text-2xl">Bulk Add Books</h2><p className="mt-1 text-sm">Each row registers one physical copy. Repeated ISBNs get consecutive copy numbers.</p></div><button type="button" onClick={close} disabled={busy} className="rounded-lg border border-[#B59A6A] px-4 py-2 text-sm">Close</button></div>
      {labels.length ? <div className="space-y-4"><p role="status">Saved {labels.length} copies In Shelf. Print and attach the generated barcodes.</p><div className="max-h-60 overflow-y-auto text-sm">{labels.map(label => <p key={label.copy_id}>{label.title} · Copy {label.copy_number} · {label.barcode}</p>)}</div><button type="button" onClick={() => { try { printBookLabels(labels); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not print labels."); } }} className="rounded-lg bg-[#a83d12] px-4 py-3 text-sm font-bold text-white">Print all barcode labels</button></div> : <>
        <div className="mb-4 grid gap-3 md:grid-cols-2"><label className="block text-xs font-bold">Paste CSV or TSV<textarea value={paste} onChange={event => setPaste(event.target.value)} rows={4} className={`${input} mt-2`} placeholder="isbn,title,author,genre,tags,book_type,age_rating,shelf" /></label><div className="space-y-3 text-xs"><p>Use columns: <b>isbn, title, author, genre, tags, book_type, age_rating, shelf</b>. Use one row per copy. Existing ISBNs fill their catalog details automatically.</p><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (file) await loadText(await file.text()); }} /><button type="button" disabled={busy || !paste.trim()} onClick={() => void loadText(paste)} className="rounded-lg border border-[#B59A6A] px-3 py-2 font-bold">Load pasted rows</button></div></div>
        <div className="min-w-0"><table className="bulk-book-table w-full min-w-0 table-fixed text-left text-xs"><thead><tr>{["#","ISBN","Title","Author","Genre","Tags","Type","Age","Shelf",""].map(name => <th key={name} className="p-2">{name}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={index} className={`border-t align-top ${showErrors && bulkRowError(row) ? "bg-red-50" : ""}`}><td className="p-2">{index + 1}{row.existingBookId && <span className="block text-emerald-700">Existing</span>}</td>{(["isbn","title","author","genre","tags"] as const).map(key => <td key={key} className="p-1"><input aria-label={`Row ${index + 1} ${key}`} value={row[key]} onChange={event => edit(index,key,event.target.value)} onBlur={key === "isbn" ? () => void checkCatalog(rows).catch(cause => setError(cause instanceof Error ? cause.message : "Catalog check failed.")) : undefined} disabled={busy || (row.existingBookId !== undefined && key !== "isbn" && key !== "tags")} className={input} /></td>)}<td className="p-1"><select aria-label={`Row ${index + 1} book type`} value={row.book_type} onChange={event => edit(index,"book_type",event.target.value)} disabled={busy || row.existingBookId !== undefined} className={input}>{["Manga","Light Novel","Adult Manga"].map(value => <option key={value}>{value}</option>)}</select></td><td className="p-1"><input aria-label={`Row ${index + 1} age rating`} type="number" min="0" value={row.age_rating} onChange={event => edit(index,"age_rating",event.target.value)} disabled={busy || row.existingBookId !== undefined} className={input} /></td><td className="p-1"><select aria-label={`Row ${index + 1} shelf`} value={row.shelf_location} onChange={event => edit(index,"shelf_location",event.target.value)} disabled={busy} className={input}><option value="">Select shelf</option>{[1,2,3,4,5].map(number => <option key={number} value={`Shelf A${number}`}>Shelf A{number}</option>)}</select></td><td className="p-1"><button type="button" disabled={busy} onClick={() => setRows(current => current.filter((_,position) => position !== index))} className="text-red-700">Remove</button></td></tr>)}</tbody></table></div>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy || rows.length >= 100} onClick={() => setRows(current => [...current,emptyBulkRow()])} className="rounded-lg border border-[#B59A6A] px-3 py-2 text-xs font-bold">Add row</button><button type="button" disabled={busy} onClick={() => void checkCatalog(rows).catch(cause => setError(cause instanceof Error ? cause.message : "Catalog check failed."))} className="rounded-lg border border-[#B59A6A] px-3 py-2 text-xs font-bold">Check existing ISBNs</button><button type="button" disabled={busy || !rows.length} onClick={() => void submit()} className="rounded-lg bg-[#a83d12] px-4 py-2 text-xs font-bold text-white">{busy ? "Saving…" : `Confirm and save ${rows.length} ${rows.length === 1 ? "copy" : "copies"}`}</button></div>
      </>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  </div>, document.body);
}
