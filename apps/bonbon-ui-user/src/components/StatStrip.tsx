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
    <section aria-label="Your reading stats" className="overflow-hidden rounded-2xl border border-gold/30 bg-cream/90 p-2 shadow-[0_12px_34px_rgba(84,56,34,.08)]">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, emblem }, index) => (
          <div key={label} className={`group flex min-w-0 items-center gap-3 rounded-xl p-3 transition hover:bg-parch/20 sm:p-4 ${index % 2 ? 'border-l border-gold/20' : ''} ${index >= 2 ? 'border-t border-gold/20 lg:border-t-0 lg:border-l' : ''}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center border transition group-hover:-translate-y-0.5 ${emblem ? 'rounded-xl border-gold/35 bg-[linear-gradient(135deg,#f9d219,#c4800c)] text-umber shadow-sm' : 'rounded-full border-gold/25 bg-parch/25 text-rust'}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
            <span className="min-w-0"><strong className="block truncate font-display text-xl font-900 text-umber sm:text-2xl">{value}</strong><span className="block text-[9px] font-800 uppercase leading-tight tracking-[.12em] text-umber/45 [overflow-wrap:anywhere] sm:text-[10px]">{label}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}
