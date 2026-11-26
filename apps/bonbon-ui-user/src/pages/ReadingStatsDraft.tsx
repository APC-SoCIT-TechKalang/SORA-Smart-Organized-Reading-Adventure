import { useState } from 'react';
import { ArrowLeftIcon, BookOpenIcon, CalendarDaysIcon, Clock3Icon, HistoryIcon, SparklesIcon } from 'lucide-react';
import { OrnatePanel } from '../components/OrnatePanel';
import { useGame } from '../contexts/GameContext';
import { readingDay, statsTimeZone, type StatsPeriod } from '../lib/reading-stats';
import { useReadingStats } from '../lib/use-reading-stats';
import { ReadingStatsData } from '../components/ReadingStatsData';
import { ReaderPageHeading } from '../components/ReaderPageHeading';
import '../reader-world.css';

function duration(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function ReadingStatsDraft() {
  const { readerAccess } = useGame();
  if (readerAccess !== 'active') {
    const checking = readerAccess === 'checking';
    return <main className="reader-world min-h-screen px-4 py-12 text-umber"><div className="tb-surface mx-auto max-w-lg rounded-xl border border-gold/30 p-6 text-center">
      <h1 className="font-display text-2xl font-800">Reading stats</h1>
      <p role="status" className="mt-4 text-sm leading-6">{checking ? 'Checking your reader activation…' : readerAccess === 'signed-out' ? 'Sign in with an activated reader account to view reading stats.' : readerAccess === 'error' ? 'We couldn’t verify your activation. Please try again shortly.' : 'Please ask library staff to activate or renew your membership before viewing reading stats.'}</p>
      <a href="/" className="tb-button-secondary tb-cut-sm mt-6 inline-flex min-h-11 items-center px-4 py-2">Back to library</a>
    </div></main>;
  }
  return <ActivatedReadingStatsDraft />;
}

function ActivatedReadingStatsDraft() {
  const [period, setPeriod] = useState<StatsPeriod>('30');
  const { stats, books, now } = useReadingStats(period);
  const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-PH', { timeZone: statsTimeZone, month: 'short', day: 'numeric' });
  const cards = [
    { label: 'Reading time', value: duration(stats.totalMinutes), icon: Clock3Icon, detail: 'From completed sessions' },
    { label: 'Books returned', value: stats.completed, icon: HistoryIcon, detail: 'Completed book reading records' },
    { label: 'Titles explored', value: stats.titles, icon: BookOpenIcon, detail: 'Unique titles across sessions' },
    { label: 'Days spent reading', value: stats.activeDays, icon: CalendarDaysIcon, detail: 'A little reading goes a long way' },
  ];

  return (
    <div className="reader-world min-h-screen px-4 py-6 text-umber sm:px-8 sm:py-10">
      <main className="mx-auto max-w-6xl space-y-6">
        <a className="inline-flex min-h-11 items-center gap-2 text-sm font-700 underline underline-offset-4" href="/"><ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />Back to library</a>

        <ReaderPageHeading kind="journal" title="My reading journal" detail="Explore the books, genres, and time behind your library visits.">
          <label className="flex flex-col gap-2 text-xs font-800 uppercase tracking-wider">Time period
            <select className="tb-input min-h-11 rounded-lg px-3 py-2 text-sm normal-case tracking-normal" value={period} onChange={event => setPeriod(event.target.value as StatsPeriod)}>
              <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
            </select>
          </label>
        </ReaderPageHeading>

        <ReadingStatsData>
          <section aria-label="Personal reading statistics" className="reader-journal-stats grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, detail }) => <OrnatePanel key={label} className="tb-cut-sm"><div className="p-4 sm:p-5"><Icon aria-hidden="true" className="mb-4 h-5 w-5 text-rust" /><p className="text-xs font-800 text-umber/65">{label}</p><p className="mt-2 break-words font-display text-2xl font-900 sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-umber/60">{detail}</p></div></OrnatePanel>)}
          </section>

          {stats.completed === 0 ? <section className="tb-state tb-cut-sm"><BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" /><h2 className="mt-3 font-display text-xl font-800">No returned books in this period</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-umber/65">Return a book after reading to record its time here, or choose a longer time period.</p><a href="/" className="tb-button-primary tb-cut-sm mt-5 inline-flex min-h-11 items-center px-5 py-2">Explore the library</a></section> : <>
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
                  <span className="text-xs font-700 text-umber/65">{duration(stats.averageMinutes)} average per returned book</span>
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
          {stats.active > 0 && <p className="flex items-start gap-2 rounded-xl border border-gold/30 bg-cream p-4 text-sm leading-6"><SparklesIcon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-rust" />A book is still being read. Its recorded time will be added after it is returned.</p>}
          <p className="pb-6 text-xs leading-6 text-umber/60">Journal as of {readingDay(now)}. Returned books do not necessarily mean books finished. Overlapping book time in one visit is counted once. Page progress and reading streaks are not yet available.</p>
        </ReadingStatsData>
      </main>
    </div>
  );
}
