import { ArrowRightIcon, BookOpenIcon, CheckCircle2Icon, Clock3Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useGame, type ReadingLog } from '../contexts/GameContext';
import { GuestPrompt } from '../components/GuestPrompt';
import { ReaderPageHeading } from '../components/ReaderPageHeading';
import { usesReplacementSchema } from '../lib/replacement-library';
import { ReturnBookPrompt } from '../components/ReturnBookPrompt';
import { ReadingJournal } from '../components/ReadingJournal';

export function Shelf() {
  const { session, profile, logs, volumeById, giveBack, busy, setSection } = useGame();
  const [returning, setReturning] = useState<ReadingLog | null>(null);
  if (!session) return <div className="space-y-6"><ReaderPageHeading kind="shelf" title="My shelf" /><GuestPrompt title="Keep your reading adventure together" detail="Sign in to view active reading sessions, your history, membership details, and earned library points." /></div>;

  const active = logs.filter((log) => !log.returned_at);
  const history = logs.filter((log) => log.returned_at);
  const displayName = profile?.first_name?.trim() || 'Reader';

  return (
    <div className="space-y-6 sm:space-y-8">
      <ReaderPageHeading kind="shelf" title="My shelf" detail={`${displayName}’s current reads and library history`}>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <ShelfMetric value={active.length} label="Reading now" icon={<BookOpenIcon />} />
          <ShelfMetric value={history.length} label="Books returned" icon={<CheckCircle2Icon />} />
        </div>
      </ReaderPageHeading>

      <div className="space-y-6 sm:space-y-8">
          <section aria-labelledby="active-reading-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="tb-eyebrow">Current reading</p><h2 id="active-reading-title" className="mt-1 font-display text-2xl font-900 text-umber">{usesReplacementSchema ? 'Books in this session' : 'Active sessions'}</h2></div>
              <span className="rounded-full border border-gold/25 bg-cream/70 px-3 py-1.5 text-[10px] font-900 uppercase tracking-[.12em] text-gold">{usesReplacementSchema ? `${active.length} of 3 books` : `${active.length} in progress`}</span>
            </div>
            {active.length === 0 ? (
              <div className="reader-shelf-empty rounded-2xl px-5 py-9 text-center sm:py-12">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-parch/40"><BookOpenIcon aria-hidden="true" className="h-6 w-6 text-gold" /></span>
                <h3 className="mt-4 font-display text-xl font-800 text-umber">Your shelf is ready for a story</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-umber/60">Explore the catalog and find your next book to read in the library.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => setSection('catalog')} className="tb-button-primary tb-cut-sm min-h-11 px-5 py-3 font-display text-xs uppercase tracking-[.1em]">Browse books <ArrowRightIcon className="h-4 w-4" /></button>
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
                        <p className="max-w-md text-xs leading-5 text-umber/60">{usesReplacementSchema ? 'Scan this book’s ISBN or copy barcode to return it. Your seat and session timer continue until Check Out.' : 'When you are done, return the physical copy to the return cart and close this session.'}</p>
                        <button type="button" disabled={busy} onClick={() => usesReplacementSchema ? setReturning(log) : void giveBack(log.reading_log_id)} className="tb-button-primary tb-cut-sm shrink-0 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">Finish reading</button>
                      </div>
                    </div>
                  </div>
                </article>;
              })}</div>
            )}
          </section>

          <ReadingJournal history={history} volumeById={volumeById} browseBooks={() => setSection('catalog')} />
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
  return <div className="rounded-xl border border-sand/25 bg-black/15 px-3 py-2.5 sm:px-4"><div className="flex items-center gap-2 text-sun [&_svg]:h-4 [&_svg]:w-4">{icon}<strong className="font-display text-2xl tabular-nums text-white">{value}</strong></div><p className="mt-1 text-[10px] font-800 uppercase tracking-[.07em] text-sand">{label}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
