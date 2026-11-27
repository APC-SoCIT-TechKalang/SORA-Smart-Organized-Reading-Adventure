import { useMemo, useState } from 'react';
import { CoinsIcon, GiftIcon, SearchIcon } from 'lucide-react';
import type { ReaderReward } from '../lib/replacement-library';
import { categoriesForReward, demonstrationRewards, rewardIdentity, type DisplayReward, type RewardCategory } from './reward-catalog';
import './rewards-gallery.css';

const filters = ['All Rewards', 'Snacks', 'Drinks', 'Noodles', 'Korean Picks', 'Filipino Picks', 'Energy Drinks'] as const;
type Filter = typeof filters[number];
type Sort = 'default' | 'low' | 'high' | 'name';

export function RewardsGallery({ rewards, points, loading }: { rewards: ReaderReward[]; points: number; loading: boolean }) {
  const [filter, setFilter] = useState<Filter>('All Rewards');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [shown, setShown] = useState(12);
  const catalog = useMemo(() => {
    const actual: DisplayReward[] = rewards.map(reward => ({
      id: `reward-${reward.reward_id}`, name: reward.reward_name, points: reward.points_cost,
      image: reward.image_url, categories: categoriesForReward(reward.reward_name, reward.reward_category), illustrative: false,
    }));
    const existing = new Set(actual.map(item => rewardIdentity(item.name)));
    return [...actual, ...demonstrationRewards.filter(item => !existing.has(rewardIdentity(item.name)))];
  }, [rewards]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const results = catalog.filter(item => (filter === 'All Rewards' || item.categories.includes(filter as RewardCategory))
      && (!term || `${item.name} ${item.categories.join(' ')}`.toLocaleLowerCase().includes(term)));
    if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'low' || sort === 'high') results.sort((a, b) => {
      if (a.points === null) return 1;
      if (b.points === null) return -1;
      return sort === 'low' ? a.points - b.points : b.points - a.points;
    });
    return results;
  }, [catalog, filter, query, sort]);

  return <section className="rewards-gallery" aria-labelledby="rewards-gallery-title">
    <header className="rewards-gallery-hero">
      <div><p className="rewards-gallery-eyebrow"><GiftIcon aria-hidden="true" /> Reader rewards</p>
        <h2 id="rewards-gallery-title">Treasures await</h2>
        <p>Every chapter brings you closer to new treasures. Explore rewards inspired by your reading adventures.</p></div>
      <div className="rewards-points" aria-label={`Reader points: ${points.toLocaleString()}`}><CoinsIcon aria-hidden="true" /><span>Reader points<strong>{points.toLocaleString()}</strong></span></div>
    </header>
    <div className="rewards-gallery-body">
      <p className="rewards-gallery-notice">View-only reward gallery. Rewards are for reference purposes and cannot be claimed through S.O.R.A. Product examples and unpriced items do not indicate current stock or guarantee a reward.</p>
      <div className="rewards-gallery-toolbar">
        <div className="rewards-filters" role="group" aria-label="Reward categories">{filters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setShown(12); }}>{item}</button>)}</div>
        <div className="rewards-search-sort"><label className="rewards-search"><SearchIcon aria-hidden="true" /><span className="sr-only">Search rewards</span><input value={query} onChange={event => { setQuery(event.target.value); setShown(12); }} placeholder="Find your next treasure..." /></label>
          <label className="rewards-sort"><span className="sr-only">Sort rewards</span><select value={sort} onChange={event => { setSort(event.target.value as Sort); setShown(12); }}><option value="default">Default</option><option value="low">Points: Low to High</option><option value="high">Points: High to Low</option><option value="name">Name: A to Z</option></select></label></div>
      </div>
      {loading && !rewards.length ? <p role="status" className="rewards-empty">Loading reader rewards…</p> : visible.length ? <>
        <div className="rewards-grid">{visible.slice(0, shown).map(item => <article key={item.id} className="reward-treasure">
          <RewardArt item={item} />
          <div className="reward-treasure-info"><span className="reward-treasure-category">{item.categories[0]}</span><h3>{item.name}</h3><p className="reward-treasure-cost">{item.points === null ? 'Points to be announced' : <><CoinsIcon aria-hidden="true" /> {item.points.toLocaleString()} points</>}</p>{item.illustrative && <small>Illustrative item</small>}</div>
        </article>)}</div>
        {visible.length > shown && <button type="button" className="rewards-load-more" onClick={() => setShown(value => value + 12)}>Show more treasures ({visible.length - shown} remaining)</button>}
      </> : <p role="status" className="rewards-empty">No rewards match your search. Try another name or category.</p>}
    </div>
  </section>;
}

function RewardArt({ item }: { item: DisplayReward }) {
  const [failed, setFailed] = useState(false);
  return <div className="reward-treasure-art">{item.image && !failed
    ? <img src={item.image} alt={`${item.name} packaging`} loading="lazy" onError={() => setFailed(true)} />
    : <span aria-hidden="true" className="reward-art-fallback">{item.name.slice(0, 1)}</span>}</div>;
}
