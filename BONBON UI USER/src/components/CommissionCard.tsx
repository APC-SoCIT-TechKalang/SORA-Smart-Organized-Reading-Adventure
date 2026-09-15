import type { Commission } from '../types/library';
import { useGame } from '../contexts/GameContext';
export function CommissionCard({ commission: q }: { commission: Commission }) {
  const { claim, claimed, enrolled, joinQuest, busy } = useGame();
  const done = claimed.includes(q.id);
  const joined = enrolled.includes(q.id);
  return <article className="tb-cut-sm border border-gold/40 bg-parch/15 p-5">
    <p className="text-xs uppercase tracking-widest text-gold">{q.track === 'daily' ? 'Regular quest' : q.track}</p>
    <h3 className="mt-2 font-display text-lg font-700 text-umber">{q.name}</h3>
    <p className="mt-2 text-sm text-umber/70">{q.detail}</p>
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-gold/30 pt-4"><span className="text-sm text-rust">{q.coins} points</span>
    <button disabled={busy || done || (joined && q.progress < 100)} onClick={() => void (q.progress === 100 ? claim(q) : joinQuest(q.id))} className="bg-rust px-4 py-2 text-sm text-cream disabled:opacity-50">{done ? 'Claimed' : q.progress === 100 ? 'Claim points' : joined ? 'Awaiting staff verification' : 'Join quest'}</button></div>
  </article>;
}

