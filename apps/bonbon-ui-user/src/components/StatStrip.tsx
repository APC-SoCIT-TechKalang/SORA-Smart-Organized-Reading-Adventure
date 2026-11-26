import { ArrowRightIcon, AwardIcon, BookCheckIcon, Clock3Icon, SparklesIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { useReadingStats } from '../lib/use-reading-stats';

export function StatStrip() {
  const { coins, rank, readerAccess, loading, error, setSection } = useGame();
  const { stats: reading } = useReadingStats('all');
  if (readerAccess !== 'active' || loading || error) return null;
  const stats = [
    { label: 'Books returned', value: reading.completed, icon: BookCheckIcon },
    { label: 'Reading minutes', value: reading.totalMinutes, icon: Clock3Icon },
    { label: 'Library points', value: coins, icon: SparklesIcon },
  ];

  return (
    <section aria-label="Your reading stats" className="reader-stat-strip">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="reader-stat">
            <span className="reader-stat-icon"><Icon aria-hidden="true" /></span>
            <span><strong>{value.toLocaleString()}</strong><small>{label}</small></span>
          </div>
        ))}
        <button type="button" className="reader-stat reader-stat-rank" onClick={() => setSection('commissions')}>
          <span className="reader-stat-icon"><AwardIcon aria-hidden="true" /></span>
          <span><strong>{rank}</strong><small>View rank progress</small></span>
          <ArrowRightIcon aria-hidden="true" className="reader-stat-arrow" />
        </button>
    </section>
  );
}
