import { useGame } from '../contexts/GameContext';
import { CommissionCard } from '../components/CommissionCard';
import { SectionHeading } from '../components/OrnatePanel';
import { GuestPrompt } from '../components/GuestPrompt';

export function Commissions() {
  const { commissions, session, rank, coins, error, questUpdatedAt, nextRank, rewards, redeemReward, busy } = useGame();
  const active = commissions.filter(q => q.status === 'IN PROGRESS');
  const history = commissions.filter(q => q.status !== 'IN PROGRESS');
  return <div className="space-y-6"><SectionHeading title="Quest Board" meta="Verified reading adventures"/>
    {!session ? <GuestPrompt title="Your quests await" detail="Sign in to view automatically tracked reading quests, earned rank, and library points." /> : <>
      <div className="grid gap-3 sm:grid-cols-2"><div className="tb-surface tb-cut-sm border border-gold/30 p-5"><p className="tb-eyebrow">Earned reader rank</p><strong className="mt-2 block font-display text-2xl text-umber">{rank}</strong><p className="mt-1 text-xs text-umber/55">{nextRank ? `${Math.max(0,nextRank.pointsRequired-coins)} points to ${nextRank.name}` : 'Highest configured rank reached'} · separate from paid membership</p></div><div className="tb-surface tb-cut-sm border border-gold/30 p-5"><p className="tb-eyebrow">Available points</p><strong className="mt-2 block font-display text-2xl text-rust">{coins}</strong><p className="mt-1 text-xs text-umber/55">Spend earned quest points on available rewards.</p></div></div>
      <p className="max-w-3xl text-sm leading-6 text-umber/65">Progress comes only from verified RFID sessions and a scanned return of the same physical copy. Points are awarded automatically and cannot be edited from this screen.</p>
      {error && commissions.length > 0 && <p role="status" className="rounded-lg border border-gold/30 bg-parch/20 p-3 text-xs text-umber/65">Showing the last safely loaded quest progress. Refresh will retry automatically.</p>}
      {questUpdatedAt && <p className="text-right text-[11px] text-umber/45">Last safely updated {new Date(questUpdatedAt).toLocaleString()}</p>}
      {!active.length ? <div className="tb-state tb-cut-sm text-sm text-umber/60">No active quest is available yet. The system will assign a quest from the approved pool when your next quest cycle begins.</div> : <div className="grid gap-4 lg:grid-cols-2">{active.map(q => <CommissionCard key={q.id} commission={q}/>)}</div>}
      {history.length > 0 && <section><h2 className="mb-3 font-display text-xl font-800 text-umber">Quest history</h2><div className="grid gap-4 lg:grid-cols-2">{history.map(q => <CommissionCard key={q.id} commission={q}/>)}</div></section>}
      <section><h2 className="mb-3 font-display text-xl font-800 text-umber">Reward exchange</h2>{rewards.length?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rewards.map(reward=><article key={reward.reward_id} className="tb-surface tb-cut-sm border border-gold/30 p-5"><p className="tb-eyebrow">{reward.stock_quantity} available</p><h3 className="mt-2 font-display text-lg font-800 text-umber">{reward.reward_name}</h3><p className="mt-2 text-sm font-bold text-rust">{reward.points_cost} points</p><button type="button" disabled={busy||coins<reward.points_cost} onClick={()=>void redeemReward(reward.reward_id)} className="tb-button-primary tb-cut-sm mt-4 w-full justify-center px-4 py-2 text-sm disabled:opacity-45">{coins<reward.points_cost?'More points needed':'Redeem'}</button></article>)}</div>:<div className="tb-state tb-cut-sm text-sm text-umber/60">No rewards are available right now.</div>}</section>
    </>}</div>;
}
