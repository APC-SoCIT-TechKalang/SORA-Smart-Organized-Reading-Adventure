import { useGame } from '../contexts/GameContext';
export function StatStrip() {
  const { logs, coins, rank } = useGame();
  const completed = logs.filter(l => l.returned_at);
  const stats = [['Completed sessions', completed.length], ['Minutes recorded', completed.reduce((sum, l) => sum + (l.total_reading_minutes ?? 0), 0)], ['Library points', coins], ['Membership rank', rank]];
  return <section aria-label="Your reading stats" className="grid grid-cols-2 gap-4 xl:grid-cols-4">{stats.map(([label,value]) => <div key={label} className="tb-cut-sm border border-gold/40 bg-cream/60 p-5"><strong className="font-display text-2xl text-umber">{value}</strong><p className="mt-1 text-xs uppercase tracking-widest text-gold">{label}</p></div>)}</section>;
}

