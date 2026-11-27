import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, CheckCircle2Icon, ChevronDownIcon, CoinsIcon, CookieIcon, CupSodaIcon, GiftIcon, HistoryIcon, ShieldCheckIcon, SparklesIcon, SwordsIcon, TrophyIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { CommissionCard } from '../components/CommissionCard';
import { GuestPrompt } from '../components/GuestPrompt';
import { ReaderAtmosphere } from '../components/ReaderAtmosphere';
import type { ReaderReward, RedemptionReceipt } from '../lib/replacement-library';
import './quest-board.css';

export function Commissions() {
  const { commissions, session, rank, rankPoints, coins, error, loading, questUpdatedAt, nextRank, rewards, redemptions, redeemReward, busy } = useGame();
  const [filter, setFilter] = useState<'All'|'Snacks'|'Drinks'>('All');
  const [selected, setSelected] = useState<ReaderReward|null>(null);
  const [requestKey, setRequestKey] = useState('');
  const [receipt, setReceipt] = useState<RedemptionReceipt|null>(null);
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
      <div className="quest-board-layout">
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

        <aside className="quest-rewards" aria-labelledby="quest-rewards-title">
          <div className="quest-section-heading">
            <span className="quest-section-icon"><GiftIcon size={20} aria-hidden="true" /></span>
            <h2 id="quest-rewards-title">Reward exchange</h2>
          </div>
          <div className="quest-wallet">
            <CoinsIcon size={23} aria-hidden="true" />
            <div><p>Available points</p><strong>{coins.toLocaleString()}</strong></div>
          </div>
          <p className="quest-wallet-note">Spendable balance after pending and fulfilled redemptions. Spending never lowers your reader rank.</p>
          <p className="quest-wallet-note">{rewards.length ? `${rewards.filter(item => item.is_available && item.stock_quantity > 0).length} products are currently available below.` : loading ? 'Loading rewards…' : error ? 'Rewards are unavailable.' : 'No rewards are configured right now.'}</p>
        </aside>
      </div>

      <RewardMarketplace rewards={rewards} redemptions={redemptions} points={coins} busy={busy} filter={filter} setFilter={setFilter}
        selected={selected} receipt={receipt}
        open={reward => { setSelected(reward); setReceipt(null); setRequestKey(crypto.randomUUID()); }}
        close={() => setSelected(null)}
        redeem={async () => { if (!selected) return; const result = await redeemReward(selected.reward_id, requestKey); if (result) setReceipt(result); }} />

      {history.length > 0 && <details className="quest-history">
        <summary className="quest-section-heading">
          <span className="quest-section-icon"><HistoryIcon size={20} aria-hidden="true" /></span>
          <span className="quest-history-title">Quest history</span><span className="quest-count">{history.length}</span>
          <ChevronDownIcon className="quest-history-chevron" size={20} aria-hidden="true" />
        </summary>
        <div className="quest-card-grid">{history.map(quest => <CommissionCard key={quest.assignmentId ?? quest.id} commission={quest} />)}</div>
      </details>}
      {questUpdatedAt && <p className="quest-updated"><SparklesIcon size={13} aria-hidden="true" /> Updated <time dateTime={questUpdatedAt}>{new Date(questUpdatedAt).toLocaleString()}</time></p>}
    </>}
  </div>;
}

function RewardMarketplace({rewards,redemptions,points,busy,filter,setFilter,selected,receipt,open,close,redeem}:{rewards:ReaderReward[];redemptions:{redemption_id:number;redemption_reference:string;points_spent:number;redemption_status:string;redeemed_at:string;rewards:{reward_name:string}|null}[];points:number;busy:boolean;filter:'All'|'Snacks'|'Drinks';setFilter:(value:'All'|'Snacks'|'Drinks')=>void;selected:ReaderReward|null;receipt:RedemptionReceipt|null;open:(reward:ReaderReward)=>void;close:()=>void;redeem:()=>Promise<void>}) {
  const visible=rewards.filter(item=>filter==='All'||item.reward_category===filter);
  return <section className="tb-surface tb-cut-lg overflow-hidden border border-gold/35"><header className="border-b border-gold/25 bg-[linear-gradient(135deg,rgba(89,53,30,.98),rgba(130,69,30,.96))] p-5 text-cream sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="flex items-center gap-2 text-[10px] font-800 uppercase tracking-[.18em] text-sun"><GiftIcon className="h-4 w-4"/>Quest marketplace</p><h2 className="mt-2 font-display text-3xl font-900">SNACK REWARDS</h2><p className="mt-2 text-sm text-cream/75">Exchange your reading points for delicious treats!</p></div><div className="rounded-xl border border-sun/30 bg-black/15 px-4 py-3"><span className="block text-[9px] font-800 uppercase tracking-[.14em] text-sun">Available points</span><strong className="mt-1 block font-display text-2xl">{points.toLocaleString()}</strong></div></div></header>
    <div className="p-4 sm:p-6"><div className="flex flex-wrap gap-2" role="group" aria-label="Reward categories">{(['All','Snacks','Drinks'] as const).map(item=><button key={item} type="button" onClick={()=>setFilter(item)} className={`min-h-10 rounded-full border px-4 text-xs font-800 ${filter===item?'border-rust bg-rust text-cream':'border-gold/40 bg-cream text-umber'}`}>{item}</button>)}</div>
      {visible.length?<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(reward=>{const available=reward.is_available&&reward.stock_quantity>0;return <button key={reward.reward_id} type="button" onClick={()=>open(reward)} className="group overflow-hidden rounded-2xl border border-gold/35 bg-cream text-left shadow-[0_10px_24px_rgba(84,56,34,.08)] transition hover:-translate-y-1 hover:border-gold"><RewardImage reward={reward}/><span className="block p-4"><span className="flex items-center justify-between gap-2"><span className="rounded-full bg-parch px-2 py-1 text-[9px] font-800 uppercase tracking-[.1em] text-rust">{reward.reward_category}</span><span className={`text-[10px] font-800 ${available?'text-emerald-700':'text-umber/45'}`}>{available?`${reward.stock_quantity} available`:'Unavailable'}</span></span><strong className="mt-3 block font-display text-lg font-900 text-umber">{reward.reward_name}</strong><span className="mt-2 flex items-center gap-1 text-sm font-800 text-rust"><CoinsIcon className="h-4 w-4"/>{reward.points_cost.toLocaleString()} points</span></span></button>})}</div>:<div className="tb-state tb-cut-sm mt-5 text-sm text-umber/60">No {filter==='All'?'rewards':filter.toLowerCase()} have been configured yet.</div>}
      {redemptions.length>0&&<div className="mt-8 border-t border-gold/25 pt-5"><h3 className="font-display text-lg font-900 text-umber">Recent redemptions</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{redemptions.slice(0,6).map(item=><div key={item.redemption_id} className="rounded-xl border border-gold/25 bg-parch/20 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{item.rewards?.reward_name??'Reward'}</strong><span className="font-800 text-rust">{item.redemption_status}</span></div><p className="mt-1 text-umber/55">{item.redemption_reference.slice(0,8).toUpperCase()} · {item.points_spent} pts · {new Date(item.redeemed_at).toLocaleString()}</p></div>)}</div></div>}
    </div>{selected&&createPortal(<RewardDialog reward={selected} points={points} busy={busy} receipt={receipt} redeem={redeem} close={close}/>,document.body)}
  </section>;
}

function RewardImage({reward}:{reward:ReaderReward}){return <span className="grid aspect-[16/10] place-items-center overflow-hidden bg-[radial-gradient(circle_at_top,#fff7dd,#ead3ad)]">{reward.image_url?<img src={reward.image_url} alt={reward.reward_name} className="h-full w-full object-cover"/>:reward.reward_category==='Drinks'?<CupSodaIcon className="h-16 w-16 text-rust/70"/>:<CookieIcon className="h-16 w-16 text-rust/70"/>}</span>}
function RewardDialog({reward,points,busy,receipt,redeem,close}:{reward:ReaderReward;points:number;busy:boolean;receipt:RedemptionReceipt|null;redeem:()=>Promise<void>;close:()=>void}){const available=reward.is_available&&reward.stock_quantity>0;const shortage=Math.max(0,reward.points_cost-points);return <div className="fixed inset-0 z-[120] grid place-items-center bg-umber/70 p-3 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)close()}}><section role="dialog" aria-modal="true" aria-labelledby="reward-dialog-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold bg-cream shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-gold/25 p-4"><div><p className="tb-eyebrow">{receipt?'Redemption confirmation':reward.reward_category}</p><h2 id="reward-dialog-title" className="mt-1 font-display text-2xl font-900 text-umber">{receipt?'Reserved for pickup':reward.reward_name}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full border border-gold/30"><XIcon className="h-5 w-5"/></button></header>{receipt?<div className="p-5 text-center"><CheckCircle2Icon className="mx-auto h-14 w-14 text-emerald-600"/><p className="mt-3 text-sm text-umber/70">Show this confirmation to a librarian. It is not fulfilled until staff hand you the item.</p><dl className="mt-5 space-y-3 rounded-xl border border-gold/30 bg-parch/25 p-4 text-left text-sm"><ReceiptRow label="Reward" value={receipt.reward_name}/><ReceiptRow label="Points used" value={`${receipt.points_used.toLocaleString()} points`}/><ReceiptRow label="Reference" value={receipt.reference.toUpperCase()}/><ReceiptRow label="Date" value={new Date(receipt.redeemed_at).toLocaleString()}/><ReceiptRow label="Status" value={receipt.status}/></dl><button type="button" onClick={close} className="tb-button-primary tb-cut-sm mt-5 w-full justify-center px-4 py-3">Done</button></div>:<><RewardImage reward={reward}/><div className="p-5"><div className="grid grid-cols-2 gap-3"><Metric label="Required" value={`${reward.points_cost.toLocaleString()} pts`}/><Metric label="Your balance" value={`${points.toLocaleString()} pts`}/><Metric label="After redemption" value={`${Math.max(0,points-reward.points_cost).toLocaleString()} pts`}/><Metric label="Stock" value={available?`${reward.stock_quantity} available`:'Unavailable'}/></div>{shortage>0&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-700 text-amber-800">Earn {shortage.toLocaleString()} more points to redeem this item.</p>}{!available&&<p className="mt-4 rounded-xl bg-stone-100 p-3 text-sm font-700 text-stone-700">Currently unavailable. Please check again after the library restocks.</p>}<button type="button" disabled={busy||shortage>0||!available} onClick={()=>void redeem()} className="tb-button-primary tb-cut-sm mt-5 w-full justify-center px-4 py-3 disabled:cursor-not-allowed disabled:opacity-45">{busy?'Reserving…':!available?'Currently Unavailable':shortage>0?'More points needed':'Confirm redemption'}</button></div></>}</section></div>}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-gold/25 bg-white/55 p-3"><span className="block text-[9px] font-800 uppercase tracking-[.1em] text-umber/50">{label}</span><strong className="mt-1 block text-sm text-umber">{value}</strong></div>}
function ReceiptRow({label,value}:{label:string;value:string}){return <div className="flex items-start justify-between gap-4"><dt className="text-umber/55">{label}</dt><dd className="break-all text-right font-800 text-umber">{value}</dd></div>}
