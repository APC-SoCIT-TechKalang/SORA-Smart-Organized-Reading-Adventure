import { AwardIcon, BookCheckIcon, Clock3Icon, SparklesIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

export function StatStrip() {
  const { logs, coins, rank, readerAccess } = useGame();
  if (readerAccess !== 'active') return null;
  const completed = logs.filter((log) => log.returned_at);
  const stats = [
    { label: 'Sessions', value: completed.length, icon: BookCheckIcon, emblem: false },
    { label: 'Minutes', value: completed.reduce((sum, log) => sum + (log.total_reading_minutes ?? 0), 0), icon: Clock3Icon, emblem: false },
    { label: 'Guild points', value: coins, icon: SparklesIcon, emblem: true },
    { label: 'Archivist rank', value: rank, icon: AwardIcon, emblem: true },
  ];

  return (
    <section aria-label="Your reading stats" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, emblem }) => (
        <div key={label} className={`tb-stat-card tb-surface tb-cut-sm flex min-w-0 items-center gap-2.5 p-3 min-[390px]:p-4 ${emblem ? 'is-emblem' : ''}`}>
          <span className={`tb-stat-icon flex h-10 w-10 shrink-0 items-center justify-center bg-parch/35 text-rust ${emblem ? 'tb-crest-icon' : 'rounded-full'}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
          <span className="min-w-0"><strong className="block truncate font-display text-xl font-900 text-umber">{value}</strong><span className="block text-[10px] font-800 uppercase leading-tight tracking-[0.08em] text-umber/50 [overflow-wrap:anywhere] min-[390px]:tracking-[0.12em]">{label}</span></span>
        </div>
      ))}
    </section>
  );
}
