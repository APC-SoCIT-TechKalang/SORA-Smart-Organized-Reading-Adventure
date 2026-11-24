import { ArrowRightIcon, BookOpenIcon, CalendarDaysIcon, CheckCircle2Icon, Clock3Icon, HistoryIcon, SparklesIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useGame, type ReadingLog } from '../contexts/GameContext';
import { GuestPrompt } from '../components/GuestPrompt';
import { SectionHeading } from '../components/OrnatePanel';
import { usesReplacementSchema } from '../lib/replacement-library';
import { ReturnBookPrompt } from '../components/ReturnBookPrompt';

export function Shelf() {
  const { session, profile, logs, volumeById, giveBack, busy, setSection } = useGame();
  const [returning, setReturning] = useState<ReadingLog | null>(null);
  if (!session) return <div className="space-y-6"><SectionHeading title="My shelf" meta="Reading activity" /><GuestPrompt title="Keep your reading adventure together" detail="Sign in to view active reading sessions, your history, membership details, and earned library points." /></div>;

  const active = logs.filter((log) => !log.returned_at);
  const history = logs.filter((log) => log.returned_at).slice().reverse();
  const displayName = profile?.first_name?.trim() || 'Reader';

  return (
    <div className="space-y-6 sm:space-y-8">
      <SectionHeading title="My shelf" meta="In-library reading" />
      <section className="relative overflow-hidden rounded-[26px] border border-[#76502f] bg-[linear-gradient(135deg,#543822,#754821)] p-5 text-cream shadow-[0_20px_50px_rgba(84,56,34,.2)] sm:p-7">
        <div aria-hidden="true" className="absolute -right-20 -top-28 h-72 w-72 rounded-full border border-sun/15" />
        <div aria-hidden="true" className="absolute -bottom-36 right-24 h-64 w-64 rounded-full border border-sand/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[10px] font-900 uppercase tracking-[.2em] text-sun"><SparklesIcon className="h-4 w-4" /> Your reading space</p>
            <h1 className="mt-3 font-display text-3xl font-900 leading-tight text-white sm:text-4xl">Welcome back, {displayName}.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-sand/70">Track your current books and revisit your reading history.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <ShelfMetric value={active.length} label="Reading now" icon={<BookOpenIcon />} />
            <ShelfMetric value={history.length} label="Books returned" icon={<CheckCircle2Icon />} />
          </div>
        </div>
      </section>

      <div className="space-y-6 sm:space-y-8">
          <section aria-labelledby="active-reading-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="tb-eyebrow">Current reading</p><h2 id="active-reading-title" className="mt-1 font-display text-2xl font-900 text-umber">{usesReplacementSchema ? 'Books in this session' : 'Active sessions'}</h2></div>
              <span className="rounded-full border border-gold/25 bg-cream/70 px-3 py-1.5 text-[10px] font-900 uppercase tracking-[.12em] text-gold">{usesReplacementSchema ? `${active.length} of 3 books` : `${active.length} in progress`}</span>
            </div>
            {active.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold/35 bg-cream/65 px-6 py-12 text-center shadow-[0_12px_32px_rgba(84,56,34,.06)]">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-parch/40"><BookOpenIcon aria-hidden="true" className="h-6 w-6 text-gold" /></span>
                <h3 className="mt-4 font-display text-xl font-800 text-umber">Your shelf is ready for a story</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-umber/60">{usesReplacementSchema ? 'If you have returned every book, use Check Out to stop your session timer. You can also browse for another book.' : 'Explore the catalog and begin an in-library reading session when you find your next book.'}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => setSection('catalog')} className="tb-button-primary tb-cut-sm min-h-11 px-5 py-3 font-display text-xs uppercase tracking-[.1em]">Browse books <ArrowRightIcon className="h-4 w-4" /></button>
                  {usesReplacementSchema && <a href="/checkout" className="tb-button-secondary tb-cut-sm min-h-11 px-5 py-3 font-display text-xs uppercase tracking-[.1em]">Check Out</a>}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">{active.map((log) => {
                const volume = volumeById(String(log.book_id));
                return <article key={log.reading_log_id} className="group relative overflow-hidden rounded-2xl border border-gold/30 bg-cream/90 shadow-[0_16px_38px_rgba(84,56,34,.1)]">
                  <div className="grid gap-5 p-5 sm:grid-cols-[110px_minmax(0,1fr)] sm:p-6">
                    <div className="mx-auto w-[110px] sm:mx-0">
                      <div className="aspect-[2/3] overflow-hidden rounded-lg border border-gold/25 bg-parch/30 p-1 shadow-[0_14px_28px_rgba(84,56,34,.18)]">
                        <img src={volume?.coverImage ?? '/book-placeholder.svg'} alt="" className="h-full w-full rounded-md bg-cream object-contain transition duration-500 group-hover:scale-[1.025]" onError={(event) => { event.currentTarget.src = '/book-placeholder.svg'; }} />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="tb-eyebrow">Reading now</p><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-900 uppercase tracking-[.1em] text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</span></div>
                      <h3 className="mt-2 font-display text-2xl font-900 leading-tight text-umber">{volume?.title ?? `Book #${log.book_id}`}</h3>
                      {volume?.author && <p className="mt-1 text-xs font-700 text-umber/55">{volume.author}</p>}
                      <p className="mt-4 flex items-center gap-2 text-xs font-700 text-umber/55"><Clock3Icon className="h-4 w-4 text-gold" /> Started {formatDate(log.started_at)}</p>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-gold/20 pt-4">
                        <p className="max-w-md text-xs leading-5 text-umber/60">{usesReplacementSchema ? 'Scan this copy again to return only this book. Your seat and session timer continue until Check Out.' : 'When you are done, return the physical copy to the return cart and close this session.'}</p>
                        <button type="button" disabled={busy} onClick={() => usesReplacementSchema ? setReturning(log) : void giveBack(log.reading_log_id)} className="tb-button-primary tb-cut-sm shrink-0 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">Finish reading</button>
                      </div>
                    </div>
                  </div>
                </article>;
              })}</div>
            )}
          </section>

          <section aria-labelledby="reading-history-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><HistoryIcon aria-hidden="true" className="h-5 w-5 text-gold" /><h2 id="reading-history-title" className="font-display text-xl font-900 text-umber">Reading history</h2></div>{history.length > 0 && <span className="text-xs font-700 text-umber/50">Most recent first</span>}</div>
            <div className="overflow-hidden rounded-2xl border border-gold/25 bg-cream/75 shadow-[0_12px_30px_rgba(84,56,34,.07)]">
              {history.length ? <div className="divide-y divide-gold/15">{history.map((log) => {
                const volume = volumeById(String(log.book_id));
                return <div key={log.reading_log_id} className="flex items-center gap-4 p-4 transition hover:bg-parch/20 sm:px-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/20 bg-parch/25"><CheckCircle2Icon className="h-4 w-4 text-gold" /></span>
                  <div className="min-w-0 flex-1"><h3 className="truncate font-display text-sm font-800 text-umber sm:text-base">{volume?.title ?? `Book #${log.book_id}`}</h3><p className="mt-1 flex items-center gap-1.5 text-[10px] font-700 text-umber/50"><CalendarDaysIcon className="h-3.5 w-3.5" /> Completed {formatDate(log.returned_at ?? '')}</p></div>
                  <span className="shrink-0 rounded-full bg-parch/35 px-3 py-1.5 text-[10px] font-900 text-rust">{log.total_reading_minutes ?? 0} min</span>
                </div>;
              })}</div> : <div className="px-6 py-10 text-center"><HistoryIcon className="mx-auto h-7 w-7 text-gold/60" /><p className="mt-3 text-sm font-700 text-umber/60">Finished books will appear here.</p><p className="mt-1 text-xs text-umber/45">Scan a book again after reading to add it to your history.</p></div>}
            </div>
          </section>
      </div>
      {returning && <ReturnBookPrompt title={volumeById(String(returning.book_id))?.title ?? `Book #${returning.book_id}`} busy={busy} close={() => setReturning(null)} confirm={async barcode => {
        const ok = await giveBack(returning.reading_log_id, barcode);
        if (ok) setReturning(null);
        return ok;
      }} />}
    </div>
  );
}

function ShelfMetric({ value, label, icon }: { value: number; label: string; icon: ReactNode }) {
  return <div className="min-w-[112px] rounded-xl border border-sand/15 bg-white/[.06] px-4 py-3 backdrop-blur"><div className="flex items-center gap-2 text-sun [&_svg]:h-4 [&_svg]:w-4">{icon}<strong className="font-display text-2xl text-white">{value}</strong></div><p className="mt-1 text-[9px] font-800 uppercase tracking-[.14em] text-sand/60">{label}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
