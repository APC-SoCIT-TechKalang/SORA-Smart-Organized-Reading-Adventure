"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronRight, PackageOpen, Plus, Search, X } from "lucide-react";
import { errorMessage } from "../../lib/supabase";
import { printBookLabels } from "./BookBarcodeLabels";
import { EditCopyLocation, EditOneCopy, RegisterCopy } from "./EditCopyLocation";
import { EditBookCover } from "./EditBookCover";
import { InventoryAlerts } from "./InventoryAlerts";
import { ReturnCartStation } from "./ReturnCartStation";
import { projectCopy, type Book, type Copy } from "./dashboard-data";
import {
  catalogueViews, emptyFilters, inventoryStatuses, readCataloguePage, readCatalogueSummary,
  readCatalogueVolumes, readReturnCart, readVolumeCopies, statusLabel, statusStyle,
  type CatalogueFilters, type CatalogueRow, type CatalogueView, type CopyRow, type VolumeDetail,
} from "./catalogue-workspace-data";

type Run = Parameters<typeof EditCopyLocation>[0]["run"];
type Props = {
  revision: number;
  run: Run;
  setDrawer: (value: boolean) => void;
  setBulkDrawer: (value: boolean) => void;
  shelveCopy: (copyId: number) => Promise<boolean>;
};
type Selection = { group: string; title: string; bookId?: number };
type Action = { kind: "edit" | "register" | "bulk"; book: Book } | { kind: "copy"; row: CopyRow };

function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const request = useRef<AbortController | null>(null);
  const retry = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ data: previous.data, loading: true }));
    try {
      const data = await load(controller.signal);
      if (controller.signal.aborted) return false;
      setState({ data, loading: false });
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setState(previous => ({ data: previous.data, error: errorMessage(cause), loading: false }));
      return false;
    }
  }, [load]);
  useEffect(() => {
    void retry();
    return () => request.current?.abort();
  }, [retry]);
  return { ...state, retry };
}

function RequestFeedback({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm text-rose-800">
    <span>{error}</span><button type="button" className="catalogue-control" onClick={retry}>Retry</button>
  </div>;
  return loading ? <p role="status" className="px-4 py-3 text-sm text-[#745842]">Loading records…</p> : null;
}

function Pagination({ page, size, count, setPage, setSize, busy }: {
  page: number; size: number; count: number; setPage: (value: number) => void;
  setSize?: (value: number) => void; busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e8dbce] px-4 py-3 text-xs">
    <span aria-live="polite">{count ? `${Math.min((page - 1) * size + 1, count).toLocaleString()}–${Math.min(page * size, count).toLocaleString()} of ${count.toLocaleString()}` : "0 results"}</span>
    <div className="flex flex-wrap items-center gap-2">
      {setSize && <label className="flex items-center gap-2">Rows per page
        <select className="catalogue-control" value={size} onChange={event => setSize(Number(event.target.value))}>
          {[25, 50, 100].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>}
      <button type="button" className="catalogue-control" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <button type="button" className="catalogue-control" disabled={busy || page >= pages} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </div>;
}

export function CatalogueEditor({ revision, run, setDrawer, setBulkDrawer, shelveCopy }: Props) {
  const [view, setView] = useState<CatalogueView>("catalog");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CatalogueFilters>(emptyFilters);
  const [sort, setSort] = useState("title");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [covers, setCovers] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadSummary = useCallback((signal: AbortSignal) => {
    void revision;
    return readCatalogueSummary(signal);
  }, [revision]);
  const loadPage = useCallback((signal: AbortSignal) => {
    void revision;
    return readCataloguePage({ view, query: search, filters, sort, page, size, signal });
  }, [view, search, filters, sort, page, size, revision]);
  const summary = useResource(loadSummary);
  const result = useResource(loadPage);
  const pending = result.loading || search !== query.trim();
  const rows = result.data?.rows ?? [];
  const count = result.data?.count ?? 0;

  useEffect(() => {
    if (!pending && result.data) setPage(current => Math.min(current, Math.max(1, Math.ceil(count / size))));
  }, [pending, result.data, count, size]);

  function changeView(next: CatalogueView) {
    if (next === view) return;
    setView(next);
    setPage(1);
    if (next === "inventory") setFilters(current => ({ ...current, registered: "" }));
    setSelection(null);
  }

  function openDetails(row: CatalogueRow, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    if (row.kind === "copy") setAction({ kind: "copy", row });
    else setSelection(row.kind === "group" ? { group: row.id, title: row.title }
      : { group: row.group_id, title: row.title, bookId: row.book_id });
  }

  function closeDetails() {
    setSelection(null);
    const trigger = triggerRef.current;
    requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  }

  const stats = summary.data;
  const filterCount = Object.values(filters).filter(Boolean).length;
  return <div className="space-y-4">
    <InventoryAlerts />
    {cartOpen && <ReturnCart revision={revision} close={() => setCartOpen(false)} onShelve={shelveCopy} onBulkComplete={() => { void summary.retry(); void result.retry(); }} />}
    <section aria-label="Book management workspace" className="catalogue-workspace rounded-2xl border bg-[#fffdf9]">
      <div className="catalogue-summary">
        {stats && <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {([["Unique titles", stats.titles], ["Registered volumes", stats.volumes], ["Physical copies", stats.copies]] as const).map(([label, value]) =>
            <div key={label} className="flex items-baseline gap-1.5"><dt>{label}</dt><dd className="text-sm font-bold tabular-nums">{value.toLocaleString()}</dd></div>)}
        </dl>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="catalogue-control" onClick={() => { summary.retry(); result.retry(); }}>Refresh</button>
          <button type="button" className="catalogue-control" onClick={() => setCartOpen(true)}>
            <PackageOpen size={15} aria-hidden="true" /> Return Cart{stats ? ` (${stats.returns.toLocaleString()})` : ""}
          </button>
          <button type="button" className="catalogue-control" onClick={() => setBulkDrawer(true)}>Bulk Add</button>
          <button type="button" className="catalogue-control catalogue-primary" onClick={() => setDrawer(true)}><Plus size={15} aria-hidden="true" /> Add Book</button>
        </div>
      </div>
      <RequestFeedback loading={summary.loading && !stats} error={summary.error} retry={summary.retry} />
      <nav aria-label="Book Management views" className="flex flex-wrap gap-1 border-b border-[#e8dbce] px-3 pt-1">
        {(Object.keys(catalogueViews) as CatalogueView[]).map(key =>
          <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)} className="catalogue-tab">
            {catalogueViews[key]}
            {key === "attention" && stats && <span className="catalogue-attention-count">{(stats.unregistered + stats.damaged + stats.returns).toLocaleString()}</span>}
          </button>)}
      </nav>
      {view === "attention" && stats && <p className="border-b border-[#e8dbce] px-4 py-2 text-xs text-[#795339]">
        {stats.unregistered.toLocaleString()} volumes without copies · {stats.damaged.toLocaleString()} marked damaged · {stats.returns.toLocaleString()} in Return Cart
      </p>}
      <div className="catalogue-toolbar">
        <label className="catalogue-search">
          <Search size={16} aria-hidden="true" /><span className="sr-only">Search books and copies</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, series, author, ISBN, or barcode" />
        </label>
        <FilterSelect label="Genre" value={filters.genre} items={(stats?.genres ?? []).map(value => [value, value])} onChange={value => updateFilter("genre", value)} />
        <FilterSelect label="Status" value={filters.status} items={inventoryStatuses.map(value => [value, statusLabel(value)])} onChange={value => updateFilter("status", value)} />
        <FilterSelect label="Condition" value={filters.condition} items={[["noted", "Has condition notes"], ["blank", "No condition notes"]]} onChange={value => updateFilter("condition", value)} />
        <FilterSelect label="Location" value={filters.shelf} items={[["unassigned", "Unassigned"], ...(stats?.shelves ?? []).map(value => [value, value] as const)]} onChange={value => updateFilter("shelf", value)} />
        {view !== "inventory" && <FilterSelect label="Registration" value={filters.registered} items={[["yes", "Has physical copies"], ["no", "No physical copies"]]} onChange={value => updateFilter("registered", value)} />}
        <label className="flex items-center gap-1.5 text-xs">Sort by
          <select className="catalogue-control" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="title">Title</option><option value="author">Author</option></select>
        </label>
        {view === "catalog" && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={covers} onChange={event => setCovers(event.target.checked)} /> Show covers</label>}
        {(Boolean(query) || filterCount > 0) && <button type="button" className="catalogue-control" onClick={() => {
          setQuery(""); setSearch(""); setFilters(emptyFilters); setPage(1);
        }}>Clear all{filterCount ? ` (${filterCount})` : ""}</button>}
      </div>
      <RequestFeedback loading={pending} error={result.error} retry={result.retry} />
      <div className="catalogue-table-wrap" aria-busy={pending} tabIndex={0} role="region" aria-label={`${catalogueViews[view]} results`}>
        <table className="catalogue-table">
          <thead><tr>
            <th scope="col">Title / author</th>
            {view === "catalog" ? <><th scope="col">Volumes</th><th scope="col">Copies</th><th scope="col">Inventory summary</th></>
              : <><th scope="col">Copy barcode</th><th scope="col">Status</th><th scope="col">Condition notes</th><th scope="col">Location</th></>}
            <th scope="col"><span className="sr-only">Details</span></th>
          </tr></thead>
          <tbody>
            {rows.filter(row => view === "catalog" ? row.kind === "group" : row.kind !== "group").map(row =>
              <RecordRow key={`${row.kind}-${row.id}`} row={row} covers={covers} selected={row.kind === "group" ? row.id === selection?.group : row.kind === "unregistered" && row.book_id === selection?.bookId} pending={pending} onOpen={openDetails} />)}
          </tbody>
        </table>
      </div>
      {!pending && !result.error && !rows.length && <p className="px-4 py-8 text-center text-sm text-[#745842]">No records match this view and its filters.</p>}
      <Pagination page={page} size={size} count={count} setPage={setPage} busy={pending} setSize={value => { setSize(value); setPage(1); }} />
    </section>
    {selection && !action && <DetailsDrawer key={selection.bookId ?? selection.group} selection={selection} revision={revision} close={closeDetails} onAction={setAction} />}
    {action?.kind === "edit" && <EditBookCover book={action.book} close={closeAction} run={run} />}
    {action?.kind === "register" && <RegisterCopy book={action.book} close={closeAction} run={run} />}
    {action?.kind === "bulk" && <BulkCopies book={action.book} close={closeAction} run={run} />}
    {action?.kind === "copy" && <EditOneCopy key={action.row.copy_id} copy={projectCopy(action.row)} title={action.row.title} close={closeAction} run={run} />}
  </div>;

  function updateFilter(key: keyof CatalogueFilters, value: string) {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  }

  function closeAction() {
    setAction(null);
    if (!selection) triggerRef.current?.focus({ preventScroll: true });
  }
}

function FilterSelect({ label, value, items, onChange }: {
  label: string; value: string; items: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void;
}) {
  return <select className="catalogue-control" aria-label={label} data-active={Boolean(value)} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">{label}: All</option>
    {value && !items.some(([key]) => key === value) && <option value={value}>{label}: {value}</option>}
    {items.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select>;
}

function RecordRow({ row, covers, selected, pending, onOpen }: {
  row: CatalogueRow; covers: boolean; selected: boolean; pending: boolean;
  onOpen: (row: CatalogueRow, trigger: HTMLButtonElement) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  return <tr data-selected={selected} className="cursor-pointer" onClick={event => {
    if (!pending && event.target instanceof Element && !event.target.closest("button")) button.current?.click();
  }}>
    <th scope="row">
      <button ref={button} type="button" className="catalogue-title-button" disabled={pending} aria-haspopup="dialog"
        aria-expanded={row.kind === "copy" ? undefined : selected}
        onClick={event => onOpen(row, event.currentTarget)}>
        {row.kind === "group" && covers && (row.cover ? <img src={row.cover} alt="" loading="lazy" className="catalogue-thumb" /> : <span className="catalogue-thumb"><BookOpen size={14} aria-hidden="true" /></span>)}
        <span className="min-w-0"><strong className="block truncate" title={row.title}>{row.title}</strong>
          <small className="block truncate text-[#735843]">{row.author || "Unknown author"}{row.kind === "copy" && row.volume !== null ? ` · Vol. ${row.volume}` : ""}</small></span>
      </button>
    </th>
    {row.kind === "group" ? <>
      <td className="tabular-nums">{row.volumes.toLocaleString()}</td><td className="tabular-nums">{row.copies.toLocaleString()}</td>
      <td>{row.copies ? <span className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(row.statuses).map(([status, total]) =>
        <span key={status} className={status === "Damaged" || status === "In Return Cart" ? "font-semibold text-[#943916]" : ""}>{total.toLocaleString()} {statusLabel(status)}</span>)}</span> : "No copies"}</td>
    </> : row.kind === "copy" ? <>
      <td className="font-mono">{row.barcode}</td>
      <td><CopyStatus status={row.copy_status} /></td>
      <td><span className="block max-w-48 truncate" title={row.condition_notes ?? undefined}>{row.condition_notes || "—"}</span></td>
      <td>{row.shelf_location || "Unassigned"}</td>
    </> : <><td>—</td><td className="font-semibold text-[#943916]">No physical copies</td><td>—</td><td>—</td></>}
    <td><ChevronRight size={17} className="text-[#a65b32]" aria-hidden="true" /></td>
  </tr>;
}

function CopyStatus({ status }: { status: string }) {
  const label = statusLabel(status);
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold ${statusStyle(label)}`}>{label}</span>;
}

function DetailsDrawer({ selection, revision, close, onAction }: {
  selection: Selection; revision: number; close: () => void; onAction: (action: Action) => void;
}) {
  const [page, setPage] = useState(1);
  const [currentVolume, setCurrentVolume] = useState<number | null>(null);
  const load = useCallback((signal: AbortSignal) => {
    void revision;
    return readCatalogueVolumes(selection.group, page, signal, selection.bookId);
  }, [selection.group, selection.bookId, page, revision]);
  const result = useResource(load);
  const rows = result.data?.rows ?? [];
  return <CatalogueDialog title={selection.title} close={close}>
    <RequestFeedback {...result} />
    {!result.loading && !result.error && !rows.length && <p className="p-4 text-sm">This title is no longer in the catalog.</p>}
    {rows.map(volume => <VolumeRow key={volume.book.book_id} volume={volume}
      open={currentVolume === volume.book.book_id || result.data?.count === 1}
      onToggle={() => setCurrentVolume(current => current === volume.book.book_id ? null : volume.book.book_id)}
      single={result.data?.count === 1} onAction={onAction} revision={revision} />)}
    {(result.data?.count ?? 0) > 25 && <Pagination page={page} size={25} count={result.data!.count} setPage={setPage} busy={result.loading} />}
  </CatalogueDialog>;
}

function CatalogueDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  function dismiss() {
    ref.current?.close();
    close();
  }
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const compact = window.matchMedia("(max-width: 767px)");
    const position = () => {
      const previousFocus = document.activeElement;
      if (dialog.open) dialog.close();
      if (compact.matches) dialog.showModal();
      else dialog.show();
      if (previousFocus instanceof HTMLElement && dialog.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      else dialog.querySelector("button")?.focus({ preventScroll: true });
    };
    position();
    compact.addEventListener("change", position);
    return () => { compact.removeEventListener("change", position); dialog.close(); };
  }, []);
  return createPortal(<dialog ref={ref} className="catalogue-detail" aria-labelledby="catalogue-detail-title"
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); dismiss(); } }}>
    <header className="flex items-start justify-between gap-3 border-b border-[#e8dbce] bg-[#fcf6ed] px-4 py-3">
      <h2 id="catalogue-detail-title" className="min-w-0 break-words font-serif text-xl font-semibold">{title}</h2>
      <button type="button" aria-label="Close title details" onClick={dismiss} className="catalogue-control"><X size={17} /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
  </dialog>, document.body);
}

function VolumeRow({ volume, open, onToggle, single, onAction, revision }: {
  volume: VolumeDetail; open: boolean; onToggle: () => void;
  single: boolean; onAction: (action: Action) => void; revision: number;
}) {
  const { book, copies, reads, number } = volume;
  const detailsId = `catalogue-volume-${book.book_id}`;
  const fields = [
    ["ISBN", book.isbn], ["Series", book.series_name], ["Original title", book.original_title], ["Romanized title", book.romanized_title],
    ["Genre", book.book_genres.map(item => item.genre).join(", ")], ["Publisher", book.publisher],
    ["Publication date", book.publication_date], ["Imprint", book.imprint], ["Type", book.book_type],
    ["Age rating", book.age_rating], ["Demographic", book.demographic], ["Themes", book.themes],
    ["Contributors", volume.contributors], ["Format", volume.format],
  ] as const;
  return <article className="border-b border-[#e8dbce] p-4">
    {single ? <h3 className="text-sm font-semibold">{book.title}</h3> :
      <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle} className="flex w-full items-start justify-between gap-2 text-left text-sm font-semibold">
        <span>{number !== null ? `Vol. ${number} · ` : ""}{book.title}</span><ChevronRight size={16} className={`shrink-0 ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>}
    <p className="mt-1 text-xs text-[#735843]">{book.author || "Unknown author"} · {copies.toLocaleString()} copies · {reads.toLocaleString()} reads</p>
    <div id={detailsId} hidden={!open}>
      {open && <>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 break-words text-xs">
          {fields.filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {book.description && <p className="mt-3 break-words text-xs leading-5">{book.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="catalogue-control" onClick={() => onAction({ kind: "edit", book })}>Edit volume</button>
          <button type="button" className="catalogue-control catalogue-primary" onClick={() => onAction({ kind: "register", book })}>Register copy</button>
          {copies > 0 && <button type="button" className="catalogue-control" onClick={() => onAction({ kind: "bulk", book })}>Manage copies</button>}
        </div>
        {copies > 0 && <CopyDetails book={book} onAction={onAction} revision={revision} />}
      </>}
    </div>
  </article>;
}

function CopyDetails({ book, onAction, revision }: { book: Book; onAction: (action: Action) => void; revision: number }) {
  const [open, setOpen] = useState(false);
  return <div className="mt-3">
    <button type="button" className="catalogue-control" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide physical copies" : "View physical copies"}</button>
    {open && <VolumeCopies book={book} onAction={onAction} revision={revision} />}
  </div>;
}

function VolumeCopies({ book, onAction, revision }: { book: Book; onAction: (action: Action) => void; revision: number }) {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => {
    void revision;
    return readCataloguePage({ view: "inventory", page, size: 25, bookId: book.book_id, signal });
  }, [book.book_id, page, revision]);
  const result = useResource(load);
  return <div className="mt-2 border-y border-[#e8dbce]">
    <RequestFeedback {...result} />
    {result.data?.rows.map(row => row.kind === "copy" && <div key={row.copy_id} className="border-b border-[#f0e6da] py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5"><strong className="break-all font-mono">{row.barcode}</strong><CopyStatus status={row.copy_status} /></div>
      <p className="mt-1 break-words">{row.shelf_location ?? "Unassigned"} · {row.condition_notes || "No condition notes"}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button type="button" className="catalogue-control" onClick={() => onAction({ kind: "copy", row })}>Edit copy</button>
        <button type="button" className="catalogue-control" onClick={() => printBookLabels([copyLabel(book, projectCopy(row))])}>Print label</button>
      </div>
    </div>)}
    <Pagination page={page} size={25} count={result.data?.count ?? 0} setPage={setPage} busy={result.loading} />
  </div>;
}

const copyLabel = (book: Book, copy: Copy) => ({
  book_id: book.book_id, copy_id: copy.copy_id, copy_number: copy.copy_number, barcode: copy.identifier_value, title: book.title,
});

function BulkCopies({ book, close, run }: { book: Book; close: () => void; run: Run }) {
  const load = useCallback((signal: AbortSignal) => readVolumeCopies(book.book_id, signal), [book.book_id]);
  const result = useResource(load);
  const copies = result.data;
  if (copies) return <EditCopyLocation book={book} copies={copies} close={close} run={run}
    onPrint={() => printBookLabels(copies.map(copy => copyLabel(book, copy)))} />;
  return <CatalogueDialog title="Manage copies" close={close}><RequestFeedback {...result} /></CatalogueDialog>;
}

function ReturnCart({ revision, close, onShelve, onBulkComplete }: { revision: number; close: () => void; onShelve: Props["shelveCopy"]; onBulkComplete: () => void }) {
  const load = useCallback((signal: AbortSignal) => {
    void revision;
    return readReturnCart(signal);
  }, [revision]);
  const result = useResource(load);
  if (result.data) return <ReturnCartStation {...result.data} close={close} onShelve={onShelve} refresh={result.retry} onBulkComplete={onBulkComplete} loading={result.loading} loadError={result.error} />;
  return <section aria-labelledby="return-cart-loading-title" className="mb-4 overflow-hidden rounded-2xl border border-[#d9c5aa] bg-[#fffdf9] shadow-sm"><header className="flex items-center justify-between border-b border-[#eadfd3] bg-[#fcf7ef] p-4"><h2 id="return-cart-loading-title" className="font-serif text-xl font-semibold">Return Cart</h2><button type="button" onClick={close} className="min-h-9 rounded-lg border border-[#d8c3ad] bg-white px-3 text-xs font-bold">Close</button></header><RequestFeedback {...result} /></section>;
}
