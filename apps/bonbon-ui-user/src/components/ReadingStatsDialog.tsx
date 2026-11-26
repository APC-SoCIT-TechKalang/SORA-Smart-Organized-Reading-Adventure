import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { BarChart3Icon, BookOpenIcon, CalendarDaysIcon, Clock3Icon, HistoryIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { type StatsPeriod } from '../lib/reading-stats';
import { useReadingStats } from '../lib/use-reading-stats';
import { ReadingStatsData } from './ReadingStatsData';
import { OrnatePanel } from './OrnatePanel';

interface ReadingStatsDialogProps {
  open: boolean;
  onClose: () => void;
}

const duration = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function ReadingStatsDialog({ open, onClose }: ReadingStatsDialogProps) {
  const { readerAccess, setSection } = useGame();
  const [period, setPeriod] = useState<StatsPeriod>('30');
  const { stats } = useReadingStats(period);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const cards = [
    { label: 'Reading time', value: duration(stats.totalMinutes), icon: Clock3Icon, detail: 'From completed sessions' },
    { label: 'Books returned', value: stats.completed, icon: HistoryIcon, detail: 'Completed book reading records' },
    { label: 'Titles explored', value: stats.titles, icon: BookOpenIcon, detail: 'Unique titles across sessions' },
    { label: 'Days spent reading', value: stats.activeDays, icon: CalendarDaysIcon, detail: 'A little reading goes a long way' },
  ];

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/75 backdrop-blur-md sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={event => event.target === event.currentTarget && onClose()}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="reading-stats-title"
          className="relative max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-t-2xl border-2 border-gold bg-cream pb-[env(safe-area-inset-bottom)] shadow-[0_24px_80px_rgba(67,39,20,.38)] sm:tb-cut-lg sm:max-h-[min(780px,calc(100dvh-2rem))] sm:rounded-none sm:pb-0"
          initial={{ y: 24, scale: .97 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 18, scale: .97 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div className="sticky top-0 z-20 flex items-start justify-between border-b border-gold/40 bg-umber px-4 py-4 text-cream sm:px-6 sm:py-5">
            <div>
              <p className="font-body text-[10px] font-800 uppercase tracking-[.28em] text-sun">Your reading adventure</p>
              <h2 id="reading-stats-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[.06em]">My reading journal</h2>
              <p className="mt-1 text-xs text-sand/70">See where your library visits have taken you.</p>
            </div>
            <button type="button" aria-label="Close reading journal" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button>
          </div>

          {readerAccess !== 'active' ? (
            <div className="p-5 text-center sm:p-7">
              <BarChart3Icon className="mx-auto h-9 w-9 text-gold" />
              <h3 className="mt-3 font-display text-xl font-800">Reading stats unavailable</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-umber/65">Please sign in with an activated reader membership to view your journal.</p>
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-6">
              <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="tb-eyebrow">Your reading adventure</p>
                  <h3 className="mt-2 font-display text-2xl font-900 sm:text-3xl">A little time, a new world</h3>
                  <p className="mt-2 text-sm leading-6 text-umber/65">Your completed library sessions, explored titles, and active reading days.</p>
                </div>
                <label className="flex flex-col gap-2 text-xs font-800 uppercase tracking-wider">Time period
                  <select className="tb-input min-h-11 rounded-lg px-3 py-2 text-sm normal-case tracking-normal" value={period} onChange={event => setPeriod(event.target.value as StatsPeriod)}>
                    <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
                  </select>
                </label>
              </header>

              <ReadingStatsData>
              <section aria-label="Personal reading statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {cards.map(({ label, value, icon: Icon, detail }) => (
                  <OrnatePanel key={label} className="tb-cut-sm">
                    <div className="p-4 sm:p-5"><Icon aria-hidden="true" className="mb-3 h-5 w-5 text-rust" /><p className="text-xs font-800 text-umber/65">{label}</p><p className="mt-2 break-words font-display text-2xl font-900 sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-umber/60">{detail}</p></div>
                  </OrnatePanel>
                ))}
              </section>

              {stats.completed === 0 && (
                <section className="tb-state tb-cut-sm">
                  <BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" />
                  <h3 className="mt-3 font-display text-xl font-800">No returned books in this period</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-umber/65">Return a book after reading to record its time here, or choose a longer time period.</p>
                  <button type="button" onClick={() => { setSection('archive'); onClose(); }} className="tb-button-primary tb-cut-sm mt-5 inline-flex min-h-11 items-center px-5 py-2">Explore the library</button>
                </section>
              )}
              </ReadingStatsData>
            </div>
          )}
        </motion.section>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
