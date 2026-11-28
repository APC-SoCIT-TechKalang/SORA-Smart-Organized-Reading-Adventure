import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, CalendarDaysIcon, ChevronDownIcon, Clock3Icon, HistoryIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { replacementApi, usesReplacementSchema } from '../lib/replacement-library';
import { errorMessage } from '../lib/supabase';
import { remainingTimeLabel, sessionCharges, type SessionBalance } from '../lib/session-history';
import './session-history-dialog.css';

interface HistorySession extends SessionBalance {
  session_id: number;
  borrow_date: string | null;
  return_date: string | null;
  session_status: string;
}

const PAGE_SIZE = 20;
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const dateLabel = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const dayLabel = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date not recorded';
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
  const [expanded, setExpanded] = useState<number | null>(null);
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
        const columns = 'session_id,borrow_date,return_date,session_status,food_charge,other_charge,food_other_charges_payment';
        const query = (selection: string) => replacementApi().from('sessions')
          .select(selection)
          .eq('user_id', profile.user_id)
          .order('session_id', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        let result = await query(`${columns},remaining_minutes_after,unlimited_time_after`);
        // Allow the UI to deploy before the additive balance migration.
        if (result.error && ['42703', 'PGRST204'].includes(result.error.code)
          && /remaining_minutes_after|unlimited_time_after/.test(result.error.message)) {
          result = await query(columns);
        }
        const { data, error: queryError } = result;
        if (queryError) throw queryError;
        if (cancelled) return;
        const next = (data ?? []) as unknown as HistorySession[];
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

  const sessions: HistorySession[] = usesReplacementSchema ? rows : [...logs]
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
    .map(log => ({ session_id: log.reading_log_id, borrow_date: log.started_at, return_date: log.returned_at, session_status: log.returned_at ? 'CLOSED' : 'READING' }));
  const pending = loading || libraryLoading;
  const failure = error || libraryError;
  const groupedSessions = sessions.reduce<{ date: string; items: HistorySession[] }[]>((groups, item) => {
    const date = dayLabel(item.borrow_date);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.date === date) lastGroup.items.push(item);
    else groups.push({ date, items: [item] });
    return groups;
  }, []);

  return createPortal(<div className="session-history-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="session-history-title" className="session-history-dialog">
      <header className="session-history-header">
        <div className="session-history-header-main">
          <span className="session-history-emblem"><HistoryIcon aria-hidden="true" /></span>
          <div className="session-history-heading"><p className="session-history-eyebrow">Your library journey</p><h2 id="session-history-title">Session history</h2><p>Every visit, chapter by chapter.</p></div>
          <button type="button" aria-label="Close session history" onClick={onClose} className="session-history-close"><XIcon aria-hidden="true" /></button>
        </div>
        <div className="session-history-header-foot"><span><BookOpenIcon aria-hidden="true" size={16} /> Reading visits</span><strong>{sessions.length} <small>{sessions.length === 1 ? 'visit loaded' : 'visits loaded'}</small></strong></div>
      </header>
      <div className="session-history-scroll" tabIndex={0} aria-label="Reading sessions">
        {failure && <div role="alert" className="session-history-state"><p>Session history could not be updated. {failure}</p><button type="button" disabled={pending && !failure} className="session-history-load" onClick={() => { if (libraryError) void refresh(); setRetry(value => value + 1); }}>Try again</button></div>}
        {!pending && !failure && sessions.length === 0 && <div className="session-history-state"><BookOpenIcon aria-hidden="true" size={36} /><h3>Your first chapter awaits</h3><p>Your reading sessions will appear here once you start reading at the library.</p></div>}
        {groupedSessions.map(group => <section key={group.date} className="session-history-day" aria-label={group.date}>
          <h3 className="session-history-day-heading"><CalendarDaysIcon aria-hidden="true" size={16} /><span>{group.date}</span><small>{group.items.length} {group.items.length === 1 ? 'visit' : 'visits'}</small></h3>
          <div className="session-history-list">{group.items.map(item => {
            const books = logs.filter(log => usesReplacementSchema ? log.session_id === item.session_id : log.reading_log_id === item.session_id);
            const titles = [...new Set(books.map(log => volumeById(String(log.book_id))?.title ?? `Book #${log.book_id}`))];
            const status = item.session_status === 'CLOSED' ? 'Completed' : item.session_status === 'CHECKOUT PENDING' ? 'Checkout pending' : 'Reading';
            const charges = sessionCharges(item);
            const isExpanded = expanded === item.session_id;
            const duration = item.return_date ? durationLabel(item.borrow_date, item.return_date) : item.session_status === 'CLOSED' ? 'Duration not recorded' : 'In progress';
            return <article key={item.session_id} className={'session-history-item' + (isExpanded ? ' is-expanded' : '')}>
              <h4><button type="button" aria-expanded={isExpanded} aria-controls={`session-details-${item.session_id}`} onClick={() => setExpanded(isExpanded ? null : item.session_id)} className="session-history-trigger">
                <span className="session-history-timeline-mark"><BookOpenIcon aria-hidden="true" size={19} /></span>
                <span className="session-history-visit-copy"><span className="session-history-visit-kicker">Visit #{item.session_id} · {dateLabel(item.borrow_date)}</span><strong>{titles[0] ?? 'Library reading visit'}</strong><span className="session-history-visit-meta">{titles.length > 1 ? `${titles.length} books · ` : ''}{duration}</span>{charges.unsettled && <span className="session-history-due">Amount due: {money(charges.total)}</span>}</span>
                <span className={'session-history-status' + (item.session_status === 'CLOSED' ? '' : item.session_status === 'CHECKOUT PENDING' ? ' pending' : ' reading')}>{status}</span>
                <ChevronDownIcon aria-hidden="true" className="session-history-chevron" />
              </button></h4>
              <div id={`session-details-${item.session_id}`} hidden={!isExpanded} className="session-history-details">
                <dl className="session-history-facts">
                  <div><dt>Started</dt><dd>{dateLabel(item.borrow_date)}</dd></div>
                  <div><dt>Ended</dt><dd>{item.return_date ? dateLabel(item.return_date) : item.session_status === 'CLOSED' ? 'Not recorded' : 'In progress'}</dd></div>
                  <div><dt><Clock3Icon aria-hidden="true" size={12} className="inline" /> Reading duration</dt><dd>{durationLabel(item.borrow_date, item.return_date)}</dd></div>
                  <div><dt>Remaining time after session</dt><dd>{remainingTimeLabel(item)}</dd></div>
                </dl>
                {titles.length > 0 && <section className="session-history-books" aria-label="Books read"><h5 className="session-history-section-title">Books read</h5><ul>{titles.map(title => <li key={title}><BookOpenIcon aria-hidden="true" size={15} /><span>{title}</span></li>)}</ul></section>}
                <section aria-label="Session charges" className="session-history-charges">
                  <div className="session-history-charge-head"><strong>Food & other charges</strong><span className={charges.unsettled ? 'due' : ''}>{charges.label}</span></div>
                  {charges.known && <dl className="session-history-charge-rows"><div className="session-history-charge-row"><dt>Food charges</dt><dd>{money(charges.food)}</dd></div><div className="session-history-charge-row"><dt>Other charges</dt><dd>{money(charges.other)}</dd></div><div className="session-history-charge-row total"><dt>{charges.unsettled ? 'Amount due' : 'Total charges'}</dt><dd>{money(charges.total)}</dd></div></dl>}
                  {charges.unsettled && <p className="session-history-charge-note">Please settle these charges with the librarian.</p>}
                </section>
              </div>
            </article>;
          })}</div>
        </section>)}
        {pending && !failure && <p role="status" className="session-history-state">Loading sessions…</p>}
        {hasMore && !failure && <button type="button" disabled={pending} onClick={() => setPage(value => value + 1)} className="session-history-load">Load older sessions</button>}
      </div>
    </section>
  </div>, document.body);
}
