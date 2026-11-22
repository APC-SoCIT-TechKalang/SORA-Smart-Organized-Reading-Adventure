import { useState } from 'react';
import { ArrowLeftIcon, BookOpenIcon, CalendarDaysIcon, Clock3Icon, FlaskConicalIcon, HistoryIcon, SparklesIcon } from 'lucide-react';
import { OrnatePanel } from '../components/OrnatePanel';
import { readingDay, statsTimeZone, summarizeReading, type StatsBook, type StatsPeriod, type StatsSession } from '../lib/reading-stats';

type PreviewState = 'sample' | 'empty' | 'loading' | 'error';
const books: StatsBook[] = [
  { id: 1, title: 'The Lantern Keeper', genre: 'Fantasy' },
  { id: 2, title: 'A Map of Small Wonders', genre: 'Adventure' },
  { id: 3, title: 'Letters from the Moon', genre: 'Science fiction' },
  { id: 4, title: 'The Garden Between Chapters', genre: 'Slice of life' },
  { id: 5, title: 'Beyond the Amber Gate', genre: 'Fantasy' },
];

function sampleSessions(now: Date): StatsSession[] {
  const completed = [0, 1, 2, 4, 6, 8, 11, 14, 18, 25, 38, 65, 110].map((days, index) => {
    const end = new Date(now.getTime() - days * 86_400_000 - 3_600_000);
    const minutes = [45, 60, 35, 90, 50][index % 5];
    return { id: index + 1, bookId: index % books.length + 1, startedAt: new Date(end.getTime() - minutes * 60_000).toISOString(), endedAt: end.toISOString(), minutes };
  });
  return [...completed, { id: 99, bookId: 2, startedAt: new Date(now.getTime() - 20 * 60_000).toISOString(), endedAt: null, minutes: null }];
}

function duration(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function ReadingStatsDraft() {
  const [state, setState] = useState<PreviewState>('sample');
  const [period, setPeriod] = useState<StatsPeriod>('30');
  const [now] = useState(() => new Date());
  const stats = summarizeReading(state === 'sample' ? sampleSessions(now) : [], books, period, now);
  const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-PH', { timeZone: statsTimeZone, month: 'short', day: 'numeric' });
  const cards = [
    { label: 'Reading time', value: duration(stats.totalMinutes), icon: Clock3Icon, detail: 'From completed sessions' },
    { label: 'Sessions completed', value: stats.completed, icon: HistoryIcon, detail: 'Every visit adds a chapter' },
    { label: 'Titles explored', value: stats.titles, icon: BookOpenIcon, detail: 'Unique titles across sessions' },
    { label: 'Days spent reading', value: stats.activeDays, icon: CalendarDaysIcon, detail: 'A little reading goes a long way' },
  ];

  return (
    <div className="tb-field min-h-screen px-4 py-6 text-umber sm:px-8 sm:py-10">
      <main className="mx-auto max-w-6xl space-y-6">
        <a className="inline-flex min-h-11 items-center gap-2 text-sm font-700 underline underline-offset-4" href="/"><ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />Back to library</a>
        <aside aria-label="Draft preview controls" className="rounded-xl border border-gold/40 bg-cream p-4 sm:p-5">
          <div className="flex items-center gap-2 font-800"><FlaskConicalIcon aria-hidden="true" className="h-5 w-5 text-rust" />Draft preview · Sample data</div>
          <p className="mt-2 text-sm leading-6 text-umber/70">This reading journal is a design preview. The activity below is fictional and does not come from your account.</p>
          <label className="mt-3 flex flex-wrap items-center gap-3 text-sm font-700">Preview state
            <select className="tb-input min-h-11 rounded-lg px-3 py-2" value={state} onChange={event => setState(event.target.value as PreviewState)}>
              <option value="sample">Sample reader</option><option value="empty">No reading history</option><option value="loading">Loading</option><option value="error">Unable to load</option>
            </select>
          </label>
        </aside>

        <header className="flex flex-wrap items-end justify-between gap-5 py-3">
          <div><p className="tb-eyebrow">Your reading adventure</p><h1 className="mt-2 font-display text-3xl font-900 sm:text-4xl">My reading journal</h1><p className="mt-3 max-w-xl text-sm leading-6 text-umber/70">A little time, a new world. See where your library visits have taken you.</p></div>
          <label className="flex flex-col gap-2 text-xs font-800 uppercase tracking-wider">Time period
            <select className="tb-input min-h-11 rounded-lg px-3 py-2 text-sm normal-case tracking-normal" value={period} onChange={event => setPeriod(event.target.value as StatsPeriod)}>
              <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
            </select>
          </label>
        </header>

        {state === 'loading' ? <div role="status" className="tb-state tb-cut-sm"><Clock3Icon aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-gold" />Gathering your reading moments…</div> : state === 'error' ? (
          <div role="alert" className="tb-state tb-cut-sm"><h2 className="font-display text-xl font-800">Your journal couldn’t load</h2><p className="mt-2 text-sm text-umber/70">Try again to see your reading activity.</p><button type="button" className="tb-button-primary tb-cut-sm mt-5 min-h-11 px-5 py-2" onClick={() => setState('sample')}>Try again</button></div>
        ) : <>
          <section aria-label="Personal reading statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, detail }) => <OrnatePanel key={label} className="tb-cut-sm"><div className="p-4 sm:p-5"><Icon aria-hidden="true" className="mb-4 h-5 w-5 text-rust" /><p className="text-xs font-800 text-umber/65">{label}</p><p className="mt-2 break-words font-display text-2xl font-900 sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-umber/60">{detail}</p></div></OrnatePanel>)}
          </section>

          {stats.completed === 0 ? <section className="tb-state tb-cut-sm"><BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" /><h2 className="mt-3 font-display text-xl font-800">Your story is just beginning</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-umber/65">Completed library sessions will bring this journal to life. There is no reading history in this time period yet.</p><a href="/" className="tb-button-primary tb-cut-sm mt-5 inline-flex min-h-11 items-center px-5 py-2">Explore the library</a></section> : <>
            <div className="grid gap-6 lg:grid-cols-3">
              <OrnatePanel as="section" className="tb-cut-sm lg:col-span-2"><div className="p-5 sm:p-6"><p className="tb-eyebrow">Make room for a good book</p><h2 className="mt-2 font-display text-xl font-800">Your reading rhythm</h2><p className="mt-2 text-xs leading-5 text-umber/65">Minutes from completed sessions over the last 14 days. Dates use Philippine time.</p>
                <div className="mt-6 flex h-44 items-end gap-1.5 border-b border-gold/30 pb-2 sm:gap-3" aria-hidden="true">{stats.activity.map(day => <div key={day.day} className="flex h-full min-w-0 flex-1 items-end" title={`${day.day}: ${day.minutes} minutes`}><div className={`w-full rounded-t-sm ${day.minutes ? 'bg-rust/80' : 'bg-gold/20'}`} style={{ height: `${Math.max(3, day.minutes / Math.max(1, ...stats.activity.map(item => item.minutes)) * 100)}%` }} /></div>)}</div>
                <div className="mt-2 flex justify-between text-xs text-umber/60"><span>{dateLabel(`${stats.activity[0].day}T12:00:00+08:00`)}</span><span>Today</span></div>
                <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-700">View daily minutes</summary><dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">{stats.activity.map(day => <div key={day.day} className="flex justify-between gap-2 text-xs"><dt>{dateLabel(`${day.day}T12:00:00+08:00`)}</dt><dd>{day.minutes} min</dd></div>)}</dl></details>
              </div></OrnatePanel>
              <OrnatePanel as="section" className="tb-cut-sm"><div className="p-5 sm:p-6"><p className="tb-eyebrow">Worlds you explore</p><h2 className="mt-2 font-display text-xl font-800">Your genre mix</h2><p className="mt-2 text-xs leading-5 text-umber/65">Unique titles by catalog genre in this period.</p><ul className="mt-6 space-y-5">{stats.genres.map(([genre, count]) => <li key={genre}><div className="flex justify-between gap-3 text-sm font-700"><span>{genre}</span><span className="shrink-0 text-xs text-umber/60">{count} {count === 1 ? 'title' : 'titles'}</span></div><div aria-hidden="true" className="mt-2 h-2 rounded-full bg-gold/15"><div className="h-2 rounded-full bg-gold" style={{ width: `${count / stats.titles * 100}%` }} /></div></li>)}</ul></div></OrnatePanel>
            </div>

            <OrnatePanel as="section" className="tb-cut-sm">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-800">Recent reading moments</h2>
                  <span className="text-xs font-700 text-umber/65">{duration(stats.averageMinutes)} average session</span>
                </div>
                <ul className="mt-4 divide-y divide-gold/20">
                  {stats.recent.map(session => (
                    <li key={session.id} className="flex items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-800">{books.find(book => book.id === session.bookId)?.title ?? 'Unavailable title'}</h3>
                        <p className="mt-1 text-xs text-umber/60">Session ended {dateLabel(session.endedAt)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-parch/30 px-3 py-1.5 text-xs font-800 text-rust">{duration(session.minutes ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </OrnatePanel>
          </>}
          {stats.active > 0 && <p className="flex items-start gap-2 rounded-xl border border-gold/30 bg-cream p-4 text-sm leading-6"><SparklesIcon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-rust" />A reading session is in progress. Its time will appear here after the session ends.</p>}
          <p className="pb-6 text-xs leading-6 text-umber/60">Sample journal as of {readingDay(now)}. A completed session means a library session ended; it does not mean a book was finished. Page progress and reading streaks are not yet available.</p>
        </>}
      </main>
    </div>
  );
}
