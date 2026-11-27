import { useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CoinsIcon, CupSodaIcon, GiftIcon, InfoIcon, SearchIcon, SoupIcon, CookieIcon } from 'lucide-react';
import type { ReaderReward } from '../lib/replacement-library';
import { categoriesForReward, demonstrationRewards, featuredRewardNames, rewardIdentity, rewardImage, type DisplayReward, type RewardCategory } from './reward-catalog';
import './rewards-gallery.css';

const galleryTabs = ['Featured', 'Snacks', 'Drinks', 'Noodles'] as const;
const fullFilters = ['All Rewards', 'Snacks', 'Drinks', 'Noodles', 'Korean Picks', 'Filipino Picks', 'Energy Drinks'] as const;
type GalleryTab = typeof galleryTabs[number];
type FullFilter = typeof fullFilters[number];
type Sort = 'default' | 'low' | 'high' | 'name';
const PAGE_SIZE = 12;

export function RewardsGallery({ rewards, points, loading, onFullViewChange }: { rewards: ReaderReward[]; points: number; loading: boolean; onFullViewChange?: (open: boolean) => void }) {
  const galleryRef = useRef<HTMLElement>(null);
  const [fullView, setFullView] = useState(false);
  const [tab, setTab] = useState<GalleryTab>('Featured');
  const [filter, setFilter] = useState<FullFilter>('All Rewards');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [page, setPage] = useState(1);

  const catalog = useMemo(() => {
    const actual: DisplayReward[] = rewards.map(reward => ({
      id: `reward-${reward.reward_id}`, name: reward.reward_name, points: reward.points_cost,
      image: rewardImage(reward.reward_name, reward.image_url),
      categories: categoriesForReward(reward.reward_name, reward.reward_category), illustrative: false,
    }));
    const existing = new Set(actual.map(item => rewardIdentity(item.name)));
    return [...actual, ...demonstrationRewards.filter(item => !existing.has(rewardIdentity(item.name)))
      .map(item => ({ ...item, image: rewardImage(item.name, item.image) }))];
  }, [rewards]);

  const curated = useMemo(() => {
    if (tab !== 'Featured') return catalog.filter(item => item.categories.includes(tab as RewardCategory))
      .sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, 3);
    const preferred = featuredRewardNames.map(name => catalog.find(item => rewardIdentity(item.name) === rewardIdentity(name)))
      .filter((item): item is DisplayReward => !!item?.image);
    const selected = new Set(preferred.map(item => item.id));
    return [...preferred, ...catalog.filter(item => item.image && !selected.has(item.id))].slice(0, 3);
  }, [catalog, tab]);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = catalog.filter(item => (filter === 'All Rewards' || item.categories.includes(filter as RewardCategory))
      && (!term || `${item.name} ${item.categories.join(' ')}`.toLocaleLowerCase().includes(term)));
    if (sort === 'name') matches.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'low' || sort === 'high') matches.sort((a, b) => {
      if (a.points === null && b.points === null) return 0;
      if (a.points === null) return 1;
      if (b.points === null) return -1;
      return sort === 'low' ? a.points - b.points : b.points - a.points;
    });
    return matches;
  }, [catalog, filter, query, sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const showFull = (open: boolean) => {
    setFullView(open);
    onFullViewChange?.(open);
    requestAnimationFrame(() => galleryRef.current?.scrollIntoView({ block: 'start' }));
  };

  return <section ref={galleryRef} className="rewards-gallery" aria-labelledby="rewards-gallery-title">
    <header className="rewards-gallery-hero">
      <div><p className="rewards-gallery-eyebrow"><GiftIcon aria-hidden="true" /> Reader rewards</p>
        <h2 id="rewards-gallery-title">Treasures await</h2>
        <p>Great stories. Greater rewards.</p></div>
      <div className="rewards-points" aria-label={`Your reading points: ${points.toLocaleString()}`}><CoinsIcon aria-hidden="true" /><span>Your reading points<strong>{points.toLocaleString()}</strong></span></div>
    </header>

    <div className="rewards-gallery-body">
      {loading && !rewards.length && <span className="sr-only" role="status">Updating reader rewards…</span>}
      {fullView ? <>
        <div className="rewards-full-heading"><div><button type="button" className="rewards-back" onClick={() => showFull(false)}><ArrowLeftIcon aria-hidden="true" /> Back to Rewards Gallery</button><h3>All rewards</h3><p>Browse the full collection of reward ideas.</p></div><span>{results.length} {results.length === 1 ? 'item' : 'items'}</span></div>
        <div className="rewards-gallery-toolbar">
          <div className="rewards-filters" role="group" aria-label="Reward categories">{fullFilters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(1); }}>{item}</button>)}</div>
          <div className="rewards-search-sort"><label className="rewards-search"><SearchIcon aria-hidden="true" /><span className="sr-only">Search rewards</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Find your next treasure..." /></label>
            <label className="rewards-sort"><span className="sr-only">Sort rewards</span><select value={sort} onChange={event => { setSort(event.target.value as Sort); setPage(1); }}><option value="default">Default</option><option value="low">Points: Low to High</option><option value="high">Points: High to Low</option><option value="name">Name: A to Z</option></select></label></div>
        </div>
        {visible.length ? <div className="rewards-grid rewards-grid-full">{visible.map(item => <RewardCard key={item.id} item={item} />)}</div>
          : <p role="status" className="rewards-empty">No rewards match your search. Try another name or category.</p>}
        {pageCount > 1 && <nav className="rewards-pagination" aria-label="Reward pages"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
      </> : <>
        <div className="rewards-featured-heading"><div><p className="rewards-section-eyebrow">The treasure shelf</p><h3>Discover your rewards</h3><p>A little inspiration for your next reading quest.</p></div><span className="rewards-featured-mark" aria-hidden="true"><GiftIcon /></span></div>
        <div className="rewards-filters rewards-gallery-tabs" role="group" aria-label="Featured reward categories">{galleryTabs.map(item => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
        {curated.length
          ? <div className="rewards-grid rewards-grid-featured">{curated.map(item => <RewardCard key={item.id} item={item} featured />)}</div>
          : <p role="status" className="rewards-empty">No rewards in this category yet.</p>}
        <button type="button" className="rewards-explore" onClick={() => showFull(true)}>Explore All Rewards <ArrowRightIcon aria-hidden="true" /></button>
      </>}
      <div className="rewards-view-only"><p><InfoIcon aria-hidden="true" /> For viewing only · No in-app redemption</p><details><summary>About this gallery</summary><p>This gallery contains illustrative rewards. Products cannot be claimed through S.O.R.A. Displayed products and unconfirmed point requirements do not indicate current stock or guarantee a reward.</p></details></div>
    </div>
  </section>;
}

function RewardCard({ item, featured = false }: { item: DisplayReward; featured?: boolean }) {
  return <article className={`reward-treasure ${featured ? 'reward-treasure-featured' : ''}`}>
    <RewardArt key={item.image ?? item.id} item={item} />
    <div className="reward-treasure-info"><span className="reward-treasure-category">{item.categories[0]}</span><h4>{item.name}</h4><p className="reward-treasure-cost">{item.points === null ? 'Points TBA' : <><CoinsIcon aria-hidden="true" /> {item.points.toLocaleString()} pts</>}</p></div>
  </article>;
}

function RewardArt({ item }: { item: DisplayReward }) {
  const [failed, setFailed] = useState(false);
  const category = item.categories[0];
  const Icon = category === 'Noodles' ? SoupIcon : category === 'Drinks' ? CupSodaIcon : category === 'Snacks' ? CookieIcon : GiftIcon;
  return <div className="reward-treasure-art">{item.image && !failed
    ? <img src={item.image} alt={`${item.name} product packaging`} loading="lazy" width="180" height="180" onError={() => setFailed(true)} />
    : <Icon aria-hidden="true" className="reward-art-fallback" />}</div>;
}
