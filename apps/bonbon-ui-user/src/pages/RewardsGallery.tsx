import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CoinsIcon, CupSodaIcon, GiftIcon, InfoIcon, SearchIcon, SoupIcon, CookieIcon, XIcon } from 'lucide-react';
import type { ReaderReward } from '../lib/replacement-library';
import { categoriesForReward, demonstrationRewards, rewardIdentity, rewardImage, type DisplayReward, type RewardCategory } from './reward-catalog';
import './rewards-gallery.css';

const filters = ['All Rewards', 'Snacks', 'Drinks', 'Noodles', 'Korean Picks', 'Filipino Picks', 'Energy Drinks'] as const;
type Filter = typeof filters[number];
type Sort = 'default' | 'low' | 'high' | 'name';
const PAGE_SIZE = 12;

export function RewardsGallery({ rewards, points, loading, onClose }: { rewards: ReaderReward[]; points: number; loading: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<Filter>('All Rewards');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);

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
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = catalog.filter(item => (filter === 'All Rewards' || item.categories.includes(filter as RewardCategory))
      && (!term || `${item.name} ${item.categories.join(' ')}`.toLocaleLowerCase().includes(term)));
    if (sort === 'name') matches.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'low' || sort === 'high') matches.sort((a, b) => {
      if (a.points === null) return 1;
      if (b.points === null) return -1;
      return sort === 'low' ? a.points - b.points : b.points - a.points;
    });
    return matches;
  }, [catalog, filter, query, sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return createPortal(<div className="rewards-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="rewards-gallery-title" aria-describedby="rewards-gallery-description" className="rewards-gallery rewards-modal">
      <header className="rewards-gallery-hero">
        <div><p className="rewards-gallery-eyebrow"><GiftIcon aria-hidden="true" /> Reader rewards</p><h2 id="rewards-gallery-title">Treasures Await</h2><p id="rewards-gallery-description">Browse the rewards your reading points can bring you.</p></div>
        <div className="rewards-points" aria-label={`Your reading points: ${points.toLocaleString()}`}><CoinsIcon aria-hidden="true" /><span>Your reading points<strong>{points.toLocaleString()}</strong></span></div>
        <button ref={closeRef} type="button" className="rewards-modal-close" onClick={onClose} aria-label="Close rewards"><XIcon aria-hidden="true" /></button>
      </header>
      <div className="rewards-gallery-body">
        {loading && !rewards.length && <span className="sr-only" role="status">Updating reader rewards…</span>}
        <div className="rewards-gallery-toolbar">
          <div className="rewards-filters" role="group" aria-label="Reward categories">{filters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(1); }}>{item}</button>)}</div>
          <div className="rewards-search-sort"><label className="rewards-search"><SearchIcon aria-hidden="true" /><span className="sr-only">Search rewards</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Find your next treasure..." /></label>
            <label className="rewards-sort"><span className="sr-only">Sort rewards</span><select value={sort} onChange={event => { setSort(event.target.value as Sort); setPage(1); }}><option value="default">Default</option><option value="low">Points: Low to High</option><option value="high">Points: High to Low</option><option value="name">Name: A to Z</option></select></label></div>
        </div>
        {visible.length ? <div className="rewards-grid rewards-grid-full">{visible.map(item => <RewardCard key={item.id} item={item} points={points} />)}</div>
          : <p role="status" className="rewards-empty">No rewards match your search. Try another name or category.</p>}
        {pageCount > 1 && <nav className="rewards-pagination" aria-label="Reward pages"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
        <div className="rewards-view-only"><p><InfoIcon aria-hidden="true" /> For viewing only · No in-app redemption</p><details><summary>About this gallery</summary><p>Illustrative products cannot be claimed through S.O.R.A. Unconfirmed points and images do not indicate current stock or guarantee a reward.</p></details></div>
      </div>
    </section>
  </div>, document.body);
}

function RewardCard({ item, points }: { item: DisplayReward; points: number }) {
  const remaining = item.points === null ? null : Math.max(0, item.points - points);
  const progress = item.points && item.points > 0 ? Math.min(100, (points / item.points) * 100) : 100;
  return <article className="reward-treasure">
    <RewardArt key={item.image ?? item.id} item={item} />
    <div className="reward-treasure-info"><span className="reward-treasure-category">{item.categories[0]}</span><h4>{item.name}</h4><p className="reward-treasure-cost">{item.points === null ? 'Points TBA' : <><CoinsIcon aria-hidden="true" /> {item.points.toLocaleString()} pts</>}</p>
      {remaining !== null && <><p className="reward-treasure-remaining">{remaining ? `${remaining.toLocaleString()} more points needed` : 'Points goal reached'}</p><div className="reward-treasure-meter" role="progressbar" aria-label={`${item.name} points progress`} aria-valuemin={0} aria-valuemax={item.points ?? 0} aria-valuenow={Math.min(points, item.points ?? 0)}><span style={{ width: `${progress}%` }} /></div></>}
    </div>
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
