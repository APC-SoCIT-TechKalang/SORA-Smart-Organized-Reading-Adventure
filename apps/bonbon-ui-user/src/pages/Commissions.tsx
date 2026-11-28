import { useState } from 'react';
import { BookOpenIcon, ChevronDownIcon, GiftIcon, HistoryIcon, ShieldCheckIcon, SwordsIcon, TrophyIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { CommissionCard } from '../components/CommissionCard';
import { GuestPrompt } from '../components/GuestPrompt';
import { ReaderAtmosphere } from '../components/ReaderAtmosphere';
import { RewardsGallery } from './RewardsGallery';
import './quest-board.css';

export function Commissions() {
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const { commissions, session, rank, rankPoints, coins, error, loading, questUpdatedAt, nextRank, rewards } = useGame();
  const active = commissions.filter(quest => quest.status === 'IN PROGRESS');
  const history = commissions.filter(quest => quest.status !== 'IN PROGRESS');
  const hasProgress = Boolean(nextRank || questUpdatedAt);
  const nextThreshold = nextRank?.pointsRequired ?? 0;
  const meterValue = Math.min(nextThreshold, Math.max(0, rankPoints));
  const percent = nextThreshold > 0 ? (meterValue / nextThreshold) * 100 : hasProgress ? 100 : 0;

  return <div className="quest-board">
    <header className="quest-hero" aria-labelledby="quest-board-title">
      <ReaderAtmosphere />
      <div className="quest-hero-content">
        <p className="quest-kicker text-[#f5cc86]"><SwordsIcon size={17} aria-hidden="true" /> Reading adventures</p>
        <h1 id="quest-board-title" className="quest-display">Quest Board</h1>
        <p className="quest-hero-intro">Finish library quests, earn points, and climb the reader ranks.</p>
        {session && <div className="quest-rank">
          <div className="quest-rank-heading">
            <span className="quest-crest"><TrophyIcon size={24} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="quest-kicker text-[#f5cc86]">Reader rank</p>
              <h2 className="quest-rank-name">{loading && !hasProgress ? 'Loading rank…' : rank}</h2>
            </div>
          </div>
          <div className="quest-rank-actions"><span>{coins.toLocaleString()} reading points</span><button type="button" onClick={() => setRewardsOpen(true)} aria-haspopup="dialog"><GiftIcon size={17} aria-hidden="true" /> View Rewards</button></div>
          {hasProgress && <>
            <div className="quest-rank-meter" role="progressbar" aria-label="Reader rank progress"
              aria-valuemin={0} aria-valuemax={nextThreshold || 100} aria-valuenow={nextThreshold ? meterValue : 100}
              aria-valuetext={nextRank ? `${rankPoints.toLocaleString()} of ${nextThreshold.toLocaleString()} points toward ${nextRank.name}` : 'Highest rank reached'}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="quest-rank-caption">
              {nextRank ? <><span>{rankPoints.toLocaleString()} / {nextThreshold.toLocaleString()} pts</span><span><strong>{Math.max(0, nextThreshold - rankPoints).toLocaleString()} pts</strong> to {nextRank.name}</span></> : <span>Highest rank reached</span>}
            </p>
          </>}
          {!hasProgress && !loading && <p className="quest-rank-caption">Rank progress is unavailable.</p>}
        </div>}
      </div>
    </header>

    {!session ? <GuestPrompt title="Your quests await" detail="Sign in to see your reader rank, active quests, and rewards." /> : <>
      {error && hasProgress && <p role="status" className="quest-notice">Showing your last saved quest progress. The board will retry automatically.</p>}
      <div className="quest-board-layout quest-board-layout-single">
        <section aria-labelledby="active-quests-title" className="quest-active-panel min-w-0">
          <div className="quest-section-heading">
            <span className="quest-section-icon"><SwordsIcon size={20} aria-hidden="true" /></span>
            <h2 id="active-quests-title">Active quests</h2>
            <span className="quest-count">{active.length}</span>
          </div>
          {active.length ? <div className="quest-card-grid">{active.map(quest => <CommissionCard key={quest.assignmentId ?? quest.id} commission={quest} />)}</div>
            : <div className="quest-empty">
              <BookOpenIcon size={28} aria-hidden="true" />
              <h3>{loading ? 'Loading your quests…' : error ? 'Quest progress is unavailable' : 'No active quests yet'}</h3>
              {!loading && !error && <p>Your next quest will appear when a new quest cycle begins.</p>}
            </div>}
          <p className="quest-verification"><ShieldCheckIcon size={17} aria-hidden="true" /> Progress updates when you return the physical copy from a verified reading session.</p>
        </section>

      </div>

      {history.length > 0 && <details className="quest-history">
        <summary className="quest-section-heading">
          <span className="quest-section-icon"><HistoryIcon size={20} aria-hidden="true" /></span>
          <span className="quest-history-title">Quest history</span><span className="quest-count">{history.length}</span>
          <ChevronDownIcon className="quest-history-chevron" size={20} aria-hidden="true" />
        </summary>
        <div className="quest-card-grid">{history.map(quest => <CommissionCard key={quest.assignmentId ?? quest.id} commission={quest} />)}</div>
      </details>}
      {rewardsOpen && <RewardsGallery rewards={rewards} points={coins} loading={loading} onClose={() => setRewardsOpen(false)} />}
    </>}
  </div>;
}
