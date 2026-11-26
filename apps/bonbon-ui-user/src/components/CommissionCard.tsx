import { BookOpenIcon, CheckCircle2Icon, Clock3Icon, SparklesIcon, TimerIcon } from 'lucide-react';
import type { Commission } from '../types/library';
import { useGame } from '../contexts/GameContext';

export function CommissionCard({ commission: quest }: { commission: Commission }) {
  const { claimed } = useGame();
  const done = quest.status ? quest.status === 'COMPLETED' : claimed.includes(quest.id);
  const archived = done || quest.status === 'EXPIRED' || quest.status === 'CANCELLED';
  const progress = done ? 100 : Math.min(100, Math.max(0, quest.progress));
  const status = done ? 'Completed' : quest.status === 'EXPIRED' ? 'Expired' : quest.status === 'CANCELLED' ? 'Cancelled' : 'In progress';
  const unit = quest.objectiveType === 'READING_MINUTES' ? 'min' : 'books';
  const Icon = done ? CheckCircle2Icon : unit === 'min' ? TimerIcon : BookOpenIcon;

  return <article className="quest-card" data-archived={archived} data-difficulty={quest.difficulty ?? 'Easy'}>
    <div className="quest-card-top">
      <span className="quest-objective-icon"><Icon size={24} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="quest-kicker quest-difficulty">{quest.difficulty ?? 'Easy'} quest</p>
        <h3>{quest.name}</h3>
      </div>
      <span className="quest-points" aria-label={`${quest.coins} reward points`}><SparklesIcon size={15} aria-hidden="true" /> +{quest.coins.toLocaleString()} pts</span>
    </div>
    <p className="quest-objective">{quest.detail}</p>
    {quest.targetGenre && <p className="quest-target">Genre: {quest.targetGenre}</p>}
    <div className="quest-card-progress">
      <div className="quest-card-progress-label">
        <span>{status}</span>
        <span>{progress}%</span>
      </div>
      <div className="quest-card-meter" role="progressbar" aria-label={`${quest.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="quest-card-meta">
        <span>{quest.currentValue ?? 0} / {quest.targetValue ?? 0} {unit}</span>
        {done ? <span><CheckCircle2Icon size={14} aria-hidden="true" /> Points awarded</span> :
          quest.deadlineAt && <span><Clock3Icon size={14} aria-hidden="true" /> Due <time dateTime={quest.deadlineAt}>{new Date(quest.deadlineAt).toLocaleDateString()}</time></span>}
      </div>
    </div>
  </article>;
}
