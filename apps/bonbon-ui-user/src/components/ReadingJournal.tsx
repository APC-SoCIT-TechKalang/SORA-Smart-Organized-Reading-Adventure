import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, ChevronDownIcon, Clock3Icon, HistoryIcon, SearchIcon } from 'lucide-react';
import { useGame, type ReadingLog } from '../contexts/GameContext';
import type { Volume } from '../types/library';
import { VolumeDrawer } from './VolumeDrawer';
import { completedHistory, dateGroups, filterHistory, groupHistoryByBook, readingDuration, type JournalRange } from '../lib/reading-journal';
import './reading-journal.css';

const PAGE_SIZE = 12;
type View = 'recent' | 'book';

interface Props {
  history: ReadingLog[];
  volumeById: (id: string) => Volume | undefined;
  browseBooks: () => void;
}

function titleFor(log: ReadingLog, volumeById: Props['volumeById']) {
  return volumeById(String(log.book_id))?.title ?? `Archived book #${log.book_id}`;
}

function matches(log: ReadingLog, query: string, volumeById: Props['volumeById']) {
  const volume = volumeById(String(log.book_id));
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const fields = [titleFor(log, volumeById), volume?.seriesName, volume?.author,
    volume?.volume ? `volume ${volume.volume}` : '', volume?.volume ? `vol ${volume.volume}` : ''];
  return fields.some(value => value?.toLocaleLowerCase().includes(needle));
}

function Cover({ volume }: { volume?: Volume }) {
  return <img src={volume?.coverImage ?? '/book-placeholder.svg'} alt="" loading="lazy" decoding="async"
    onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} className="reading-journal-cover" />;
}

function timeLabel(value: string | null) {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(date);
}

function dateTimeLabel(value: string | null) {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function Entry({ log, volumeById, openBook }: { log: ReadingLog; volumeById: Props['volumeById']; openBook: (volume: Volume) => void }) {
  const volume = volumeById(String(log.book_id));
  const content = <>
    <Cover volume={volume} />
    <span className="reading-journal-entry-copy"><strong>{titleFor(log, volumeById)}</strong><span>{timeLabel(log.returned_at)} · Completed</span></span>
    <span className="reading-journal-duration"><Clock3Icon size={13} aria-hidden="true" />{readingDuration(log)}</span>
  </>;
  return volume
    ? <button type="button" className="reading-journal-entry" onClick={() => openBook(volume)} aria-label={`View book details for ${volume.title}, ${readingDuration(log)}`}>{content}</button>
    : <div className="reading-journal-entry reading-journal-entry--missing" aria-label={`${titleFor(log, volumeById)}, book no longer in catalog`}>{content}</div>;
}

export function ReadingJournal({ history, volumeById, browseBooks }: Props) {
  const { session } = useGame();
  const storageKey = `sora.reading-journal.${session?.user.id ?? 'guest'}`;
  const saved = useMemo(() => {
    try { return JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}') as { full?: boolean; view?: View; query?: string; range?: JournalRange; page?: number }; }
    catch { return {}; }
  }, [storageKey]);
  const [full, setFull] = useState(() => saved.full === true);
  const [view, setView] = useState<View>(() => saved.view === 'book' ? 'book' : 'recent');
  const [query, setQuery] = useState(() => saved.query ?? '');
  const [range, setRange] = useState<JournalRange>(() => saved.range === 'week' || saved.range === 'month' || saved.range === 'this-month' ? saved.range : 'all');
  const [page, setPage] = useState(() => Math.max(1, Number(saved.page) || 1));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Volume | null>(null);
  const sorted = useMemo(() => completedHistory(history), [history]);
  const filtered = useMemo(() => filterHistory(sorted, range).filter(log => matches(log, query, volumeById)), [sorted, range, query, volumeById]);
  const bookGroups = useMemo(() => groupHistoryByBook(filtered), [filtered]);
  const itemCount = view === 'recent' ? filtered.length : bookGroups.length;
  const maxPage = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pagedBooks = bookGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const uniqueBooks = new Set(sorted.map(log => log.book_id)).size;
  const series = new Set(sorted.map(log => volumeById(String(log.book_id))?.seriesName?.trim()).filter(Boolean)).size;

  useEffect(() => { try { window.sessionStorage.setItem(storageKey, JSON.stringify({ full, view, query, range, page: safePage })); } catch { /* Optional view preference. */ } }, [storageKey, full, view, query, range, safePage]);

  return <section aria-labelledby="reading-history-title" className="reading-journal">
    <div className="reading-journal-heading">
      <div><p className="tb-eyebrow">Your reading journey</p><h2 id="reading-history-title"><HistoryIcon aria-hidden="true" />The Reading Journal</h2><p>Every story leaves a mark. Look back on the chapters you've completed.</p></div>
      {full && <button type="button" className="reading-journal-back" onClick={() => setFull(false)}><ArrowLeftIcon size={16} /> Back to shelf</button>}
    </div>

    {sorted.length > 0 && <div className="reading-journal-summary" aria-label="Reading history summary">
      <div><strong>{sorted.length}</strong><span>Completed sessions</span></div>
      <div><strong>{uniqueBooks}</strong><span>Unique volumes read</span></div>
      {series > 0 && <div><strong>{series}</strong><span>Series explored</span></div>}
    </div>}

    {!sorted.length ? <div className="reading-journal-empty"><BookOpenIcon aria-hidden="true" /><h3>Your story is just beginning.</h3><p>Your completed reading sessions will appear here.</p><button type="button" className="tb-button-primary tb-cut-sm" onClick={browseBooks}>Browse books <ArrowRightIcon size={16} /></button></div> : <>
      {full && <div className="reading-journal-controls">
        <div role="group" aria-label="Reading history view" className="reading-journal-tabs">
          <button type="button" className={view === 'recent' ? 'is-active' : ''} aria-pressed={view === 'recent'} onClick={() => { setView('recent'); setPage(1); setExpanded(null); }}>Recent activity</button>
          <button type="button" className={view === 'book' ? 'is-active' : ''} aria-pressed={view === 'book'} onClick={() => { setView('book'); setPage(1); setExpanded(null); }}>By book</button>
        </div>
        <div className="reading-journal-filters"><label><SearchIcon size={17} aria-hidden="true" /><span className="sr-only">Search reading history</span><input type="search" placeholder="Search books, series, or authors" value={query} onChange={event => { setQuery(event.target.value); setPage(1); setExpanded(null); }} /></label>
          <select aria-label="Filter by date" value={range} onChange={event => { setRange(event.target.value as JournalRange); setPage(1); setExpanded(null); }}><option value="all">All time</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option><option value="this-month">This month</option></select></div>
      </div>}

      <div className="reading-journal-list">
        {!full || view === 'recent' ? dateGroups(full ? paged : sorted.slice(0, 5)).map(group => <div className="reading-journal-day" key={group.date}>
          <h3>{group.date === 'unknown' ? 'Date unavailable' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date(`${group.date}T12:00:00`))}</h3>
          {group.logs.map(log => <Entry key={log.reading_log_id} log={log} volumeById={volumeById} openBook={setSelected} />)}
        </div>) : pagedBooks.map(group => {
          const volume = volumeById(String(group.bookId));
          const isExpanded = expanded === group.bookId;
          const hasMultiple = group.logs.length > 1;
          const validMinutes = group.logs.map(log => log.total_reading_minutes).filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);
          return <div className="reading-journal-book" key={group.bookId}>
            <div className="reading-journal-book-top">
              <button type="button" className="reading-journal-book-main" disabled={!hasMultiple && !volume} aria-expanded={hasMultiple ? isExpanded : undefined} aria-controls={hasMultiple ? `journal-book-${group.bookId}` : undefined} onClick={() => hasMultiple ? setExpanded(isExpanded ? null : group.bookId) : volume && setSelected(volume)}>
                <Cover volume={volume} />
                <span className="reading-journal-book-copy"><strong>{titleFor(group.logs[0], volumeById)}</strong><span>{group.logs.length} reading {group.logs.length === 1 ? 'session' : 'sessions'}{validMinutes.length === group.logs.length ? ` · ${validMinutes.reduce((sum, value) => sum + value, 0)} min recorded` : ''}</span></span>
              </button>
              {hasMultiple && <button type="button" className="reading-journal-expand" aria-expanded={isExpanded} aria-controls={`journal-book-${group.bookId}`} onClick={() => setExpanded(isExpanded ? null : group.bookId)}>{isExpanded ? 'Hide sessions' : 'Show sessions'}<ChevronDownIcon size={16} aria-hidden="true" /></button>}
              {volume && <button type="button" className="reading-journal-details" onClick={() => setSelected(volume)}>View book details</button>}
            </div>
            {hasMultiple && isExpanded && <div id={`journal-book-${group.bookId}`} className="reading-journal-sessions">{group.logs.map(log => <div key={log.reading_log_id}><span>{dateTimeLabel(log.returned_at)} · Completed</span><strong>{readingDuration(log)}</strong></div>)}</div>}
          </div>;
        })}
        {full && !itemCount && <div className="reading-journal-no-results"><p>No reading sessions match these filters.</p><button type="button" onClick={() => { setQuery(''); setRange('all'); }}>Reset filters</button></div>}
      </div>
      {!full && sorted.length > 5 && <button type="button" className="reading-journal-full" onClick={() => setFull(true)}>View full reading history <ArrowRightIcon size={16} aria-hidden="true" /></button>}
      {full && itemCount > PAGE_SIZE && <nav className="reading-journal-pages" aria-label="Reading history pages"><span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, itemCount)} of {itemCount}</span><div><button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</button><span>Page {safePage} of {maxPage}</span><button type="button" disabled={safePage === maxPage} onClick={() => setPage(safePage + 1)}>Next</button></div></nav>}
    </>}
    <VolumeDrawer volume={selected} onClose={() => setSelected(null)} />
  </section>;
}
