import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, HistoryIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { replacementApi, usesReplacementSchema } from '../lib/replacement-library';
import { errorMessage } from '../lib/supabase';

interface HistorySession {
  session_id: number;
  borrow_date: string | null;
  return_date: string | null;
  session_status: string;
}

const PAGE_SIZE = 20;
const dateLabel = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const durationLabel = (start: string | null, end: string | null) => {
  if (!start || !end) return '—';
  const elapsed = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Not recorded';
  const minutes = Math.floor(elapsed / 60000);
  return minutes < 1 ? 'Under 1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export function SessionHistoryDialog({ onClose }: { onClose: () => void }) {
  const { profile, logs, volumeById, loading: libraryLoading, error: libraryError, refresh } = useGame();
  const [rows, setRows] = useState<HistorySession[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!usesReplacementSchema) { setLoading(false); return; }
    if (!profile?.user_id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: queryError } = await replacementApi().from('sessions')
          .select('session_id,borrow_date,return_date,session_status')
          .eq('user_id', profile.user_id)
          .order('session_id', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        if (queryError) throw queryError;
        if (cancelled) return;
        const next = (data ?? []) as HistorySession[];
        setRows(previous => page === 0 ? next.slice(0, PAGE_SIZE) : [
          ...previous.filter(row => !next.slice(0, PAGE_SIZE).some(item => item.session_id === row.session_id)),
          ...next.slice(0, PAGE_SIZE),
        ]);
        setHasMore(next.length > PAGE_SIZE);
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.user_id, page, retry]);

  const sessions = usesReplacementSchema ? rows : [...logs]
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
    .map(log => ({ session_id: log.reading_log_id, borrow_date: log.started_at, return_date: log.returned_at, session_status: log.returned_at ? 'CLOSED' : 'READING' }));
  const pending = loading || libraryLoading;
  const failure = error || libraryError;

  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/75 p-2 backdrop-blur-md sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="session-history-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gold/40 bg-cream text-umber shadow-2xl outline-none">
      <header className="flex shrink-0 items-center gap-3 border-b border-gold/30 p-4 sm:p-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-umber text-sun"><HistoryIcon aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 id="session-history-title" className="font-display text-xl font-800 sm:text-2xl">Session history</h2><p className="mt-1 text-xs text-umber/65">Your reading visits, most recent first.</p></div>
        <button type="button" aria-label="Close session history" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-parch/40"><XIcon aria-hidden="true" /></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-4 sm:p-6" tabIndex={0} aria-label="Reading sessions">
        {failure && <div role="alert" className="rounded-xl border border-rust/30 p-4 text-sm"><p>Session history could not be updated. {failure}</p><button type="button" disabled={pending && !failure} className="tb-button-secondary mt-3 min-h-11 px-4" onClick={() => { if (libraryError) void refresh(); setRetry(value => value + 1); }}>Try again</button></div>}
        {!pending && !failure && sessions.length === 0 && <div className="py-10 text-center"><BookOpenIcon aria-hidden="true" className="mx-auto h-9 w-9 text-gold" /><h3 className="mt-4 font-display text-lg font-800">Your first chapter awaits</h3><p className="mt-2 text-sm text-umber/65">Your reading sessions will appear here once you start reading at the library.</p></div>}
        {sessions.map(item => {
          const books = logs.filter(log => usesReplacementSchema ? log.session_id === item.session_id : log.reading_log_id === item.session_id);
          const titles = [...new Set(books.map(log => volumeById(String(log.book_id))?.title ?? `Book #${log.book_id}`))];
          const status = item.session_status === 'CLOSED' ? 'Completed' : item.session_status === 'CHECKOUT PENDING' ? 'Checkout pending' : 'Reading';
          return <article key={item.session_id} className="rounded-xl border border-gold/30 bg-white/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-sm font-800">Session #{item.session_id}</h3><span className={`rounded-full px-3 py-1 text-xs font-700 ${item.session_status === 'CLOSED' ? 'bg-parch/50 text-umber' : 'bg-gold/15 text-rust'}`}>{status}</span></div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-umber/60">Started</dt><dd className="mt-1 font-700">{dateLabel(item.borrow_date)}</dd></div>
              <div><dt className="text-xs text-umber/60">Ended</dt><dd className="mt-1 font-700">{item.return_date ? dateLabel(item.return_date) : item.session_status === 'CLOSED' ? 'Not recorded' : 'In progress'}</dd></div>
              <div><dt className="text-xs text-umber/60">Reading duration</dt><dd className="mt-1 font-700">{durationLabel(item.borrow_date, item.return_date)}</dd></div>
            </dl>
            {titles.length > 0 && <div className="mt-4 border-t border-gold/20 pt-3"><p className="text-xs font-700 text-umber/60">Books read</p><ul className="mt-2 space-y-1 text-sm">{titles.map(title => <li key={title} className="flex items-start gap-2"><BookOpenIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><span>{title}</span></li>)}</ul></div>}
          </article>;
        })}
        {pending && !failure && <p role="status" className="py-4 text-center text-sm text-umber/65">Loading sessions…</p>}
        {hasMore && !failure && <button type="button" disabled={pending} onClick={() => setPage(value => value + 1)} className="tb-button-secondary mx-auto min-h-11 px-5 disabled:opacity-50">Load older sessions</button>}
      </div>
    </section>
  </div>, document.body);
}
