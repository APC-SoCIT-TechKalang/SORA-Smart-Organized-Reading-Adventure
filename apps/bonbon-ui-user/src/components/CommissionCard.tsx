import { CheckCircle2Icon, Clock3Icon, SparklesIcon } from 'lucide-react';
import type { Commission } from '../types/library';
import { useGame } from '../contexts/GameContext';

export function CommissionCard({ commission: q }: { commission: Commission }) {
  const { claimed } = useGame();
  const done = claimed.includes(q.id) || q.status === 'COMPLETED';
  const progress = done ? 100 : q.progress;
  const status = done ? 'Completed · points awarded' : q.status === 'EXPIRED' ? 'Expired' : q.status === 'CANCELLED' ? 'Cancelled' : 'Active quest';
  const value = q.objectiveType === 'READING_MINUTES' ? `${q.currentValue ?? 0} / ${q.targetValue ?? 0} min` : `${q.currentValue ?? 0} / ${q.targetValue ?? 0} books`;
  return <article className="tb-quest-card tb-cut-sm relative overflow-hidden border border-gold/45 bg-cream p-5 shadow-[0_8px_20px_rgba(84,56,34,.06)]"><div aria-hidden="true" className="absolute right-0 top-0 h-20 w-20 bg-sun/10 [clip-path:polygon(100%_0,0_0,100%_100%)]" />
    <div className="relative flex items-start justify-between gap-4"><div><p className="font-body text-[10px] font-800 uppercase tracking-[0.2em] text-gold">{q.difficulty ?? 'Easy'} · {q.source === 'AI' ? 'AI generated' : 'Library quest'}</p><h3 className="mt-2 font-display text-xl font-800 uppercase leading-tight text-umber">{q.name}</h3></div><span className="flex shrink-0 items-center gap-1 border border-gold/45 bg-parch/35 px-2.5 py-1 font-body text-xs font-800 text-rust"><SparklesIcon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />{q.coins}</span></div>
    <p className="relative mt-3 min-h-12 font-body text-sm font-600 leading-6 text-umber/65">{q.detail}</p><div className="relative mt-5"><div className="mb-2 flex items-center justify-between gap-3 font-body text-[10px] font-800 uppercase tracking-[0.13em]"><span className={done ? 'text-rust' : 'text-umber/55'}>{status}</span><span className="text-gold">{progress}%</span></div><div className="h-2 overflow-hidden border border-gold/40 bg-parch/25"><span className="block h-full bg-rust transition-all duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-xs text-umber/55"><b>{value}</b>{q.deadlineAt && <span className="flex items-center gap-1"><Clock3Icon className="h-3.5 w-3.5" />{new Date(q.deadlineAt).toLocaleDateString()}</span>}</div></div>
    <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-gold/30 pt-4"><span className="font-body text-xs font-700 text-umber/55">{q.coins} library points</span><span className="inline-flex items-center gap-1.5 text-xs font-800 text-rust">{done && <CheckCircle2Icon aria-hidden="true" className="h-4 w-4" />}{done ? 'Reward recorded' : 'Updates automatically'}</span></div>
  </article>;
}
