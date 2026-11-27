import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRightIcon, BookOpenIcon, ChevronDownIcon, CrownIcon, LayoutGridIcon, ListIcon, SearchIcon, SparklesIcon, StarIcon, XIcon } from 'lucide-react';
import { CatalogGrid } from '../components/CatalogGrid';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { SectionHeading } from '../components/OrnatePanel';
import { ReaderPageHeading } from '../components/ReaderPageHeading';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';
import { groupCatalog, matchesCatalogGroup } from '../lib/catalog-series';
import { catalogGenreOptions, matchesCatalogGenre } from '../lib/catalog-genres';

type SortKey = 'popular' | 'newest';
const QUICK_GENRE_COUNT = 6;
const PAGE_SIZE = 24;

interface CatalogProps {
  query: string;
  onQueryChange: (value: string) => void;
  initialLayout: 'grid' | 'list';
}

export function Catalog({ query, onQueryChange, initialLayout }: CatalogProps) {
  const { volumes } = useGame();
  const genres = useMemo(() => catalogGenreOptions(volumes), [volumes]);
  const quickGenres = genres.slice(0, QUICK_GENRE_COUNT);
  const otherGenres = genres.slice(QUICK_GENRE_COUNT);
  const [genre, setGenre] = useState('All');
  const [layout, setLayout] = useState<'grid' | 'list'>(initialLayout);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filtersOpen, setFiltersOpen] = useState(() => !window.matchMedia('(max-width: 639px)').matches);
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Volume | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const groups = useMemo(() => groupCatalog(volumes), [volumes]);

  const bestBooks = useMemo(() => [...volumes].sort((a, b) => {
    const score = (volume: Volume) => (volume.rating * 100) + (Math.max(0, volume.copies) * 12) + (volume.rarity * 4) + (volume.coverImage ? 6 : 0);
    return score(b) - score(a) || a.title.localeCompare(b.title);
  }).slice(0, 5), [volumes]);

  useEffect(() => {
    if (genre !== 'All' && !genres.includes(genre)) setGenre('All');
  }, [genre, genres]);

  useEffect(() => {
    const openRecommendedVolume = (event: Event) => {
      const volumeId = (event as CustomEvent<{ volumeId?: string }>).detail?.volumeId;
      const volume = volumes.find((item) => item.id === volumeId);
      if (volume) setSelected(volume);
    };
    window.addEventListener('tankobonbon:open-volume', openRecommendedVolume);
    return () => window.removeEventListener('tankobonbon:open-volume', openRecommendedVolume);
  }, [volumes]);

  const results = useMemo(() => {
    return groups
      .filter((group) => (genre === 'All' || group.volumes.some(volume => matchesCatalogGenre(volume.genre, genre)))
        && matchesCatalogGroup(group, query))
      .sort((a, b) => sort === 'newest'
        ? Math.max(...b.volumes.map(volume => Number(volume.id) || 0)) - Math.max(...a.volumes.map(volume => Number(volume.id) || 0))
        : (b.rating - a.rating) || (b.copies - a.copies) || a.title.localeCompare(b.title));
  }, [genre, query, sort, groups]);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = useMemo(() => results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [results, page]);
  useEffect(() => { setPage(1); setExpandedId(null); }, [query, genre, sort]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  useEffect(() => { if (expandedId && !visible.some(group => group.id === expandedId)) setExpandedId(null); }, [expandedId, visible]);

  return (
    <div className="reader-catalog space-y-6">
      <ReaderPageHeading kind="catalog" title="Browse the collection" detail={`${groups.length} ${groups.length === 1 ? 'title' : 'titles'} · ${volumes.length} ${volumes.length === 1 ? 'volume' : 'volumes'} in the library`}>
        <a href="#full-catalog" onClick={() => setFiltersOpen(true)} className="reader-ghost-button"><SearchIcon aria-hidden="true" /> Search & filter</a>
      </ReaderPageHeading>
      {bestBooks.length > 0 && <TopFiveShowcase books={bestBooks} onSelect={setSelected} />}

      <div id="full-catalog" className="scroll-mt-24"><SectionHeading title="Explore the full collection" meta={`${results.length} ${results.length === 1 ? 'title' : 'titles'} · ${results.reduce((sum, group) => sum + group.volumes.length, 0)} volumes`} /></div>

      <section aria-label="Catalog controls" className="reader-catalog-controls tb-surface relative overflow-visible rounded-2xl p-4 sm:p-5">
        <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-800 uppercase tracking-[.1em] text-umber transition hover:bg-parch/35">
            <SearchIcon aria-hidden="true" className="h-4 w-4 text-gold" /> Search
          </button>

          <div className="order-3 col-span-2 flex w-full items-center justify-center gap-1.5 sm:order-none sm:w-auto" role="group" aria-label="Catalog layout">
            <LayoutToggle active={layout === 'grid'} label="Cover grid" onClick={() => setLayout('grid')} Icon={LayoutGridIcon} />
            <LayoutToggle active={layout === 'list'} label="Compact list" onClick={() => setLayout('list')} Icon={ListIcon} />
          </div>

          <div className="relative justify-self-end">
            <button type="button" onClick={() => setSortOpen((value) => !value)} aria-expanded={sortOpen} aria-haspopup="listbox" className="tb-input flex min-h-11 min-w-[9rem] items-center justify-between gap-3 rounded-full px-3 text-xs font-700 text-umber sm:min-w-40 sm:gap-5 sm:px-4">
              {sort === 'popular' ? 'Recommended' : 'Newest first'}
              <ChevronDownIcon className={`h-3.5 w-3.5 text-gold transition ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && <div role="listbox" aria-label="Sort books" className="absolute right-0 top-[calc(100%+.5rem)] z-30 w-48 overflow-hidden rounded-xl border border-gold/35 bg-cream p-1.5 shadow-[0_16px_36px_rgba(84,56,34,.22)]">
              <SortOption label="Recommended" active={sort === 'popular'} onClick={() => { setSort('popular'); setSortOpen(false); }} />
              <SortOption label="Newest first" active={sort === 'newest'} onClick={() => { setSort('newest'); setSortOpen(false); }} />
            </div>}
          </div>
        </div>

        {filtersOpen && <div className="mt-4 space-y-4 border-t border-gold/20 pt-4">
          <label className="tb-input flex items-center gap-2.5 rounded-lg px-3.5">
            <SearchIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gold" />
            <span className="sr-only">Filter the catalog</span>
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search title, author, or genre" className="min-w-0 flex-1 bg-transparent text-sm font-600 outline-none placeholder:text-umber/40" />
            {query && <button type="button" onClick={() => onQueryChange('')} className="flex h-8 w-8 items-center justify-center rounded-full text-umber/45 hover:bg-parch/35 hover:text-rust" aria-label="Clear catalog search"><XIcon aria-hidden="true" className="h-4 w-4" /></button>}
          </label>

        <label className="block text-xs font-800 text-umber sm:hidden">Genre
          <select value={genre} onChange={event => setGenre(event.target.value)} className="tb-input mt-2 min-h-11 w-full rounded-lg px-3 text-umber">
            <option value="All">All genres</option>
            {genres.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="hidden flex-wrap items-center gap-2 sm:flex" aria-label="Filter by genre">
          {['All', ...quickGenres].map((item) => {
            const isActive = item === genre;
            return <button key={item} type="button" onClick={() => setGenre(item)} aria-pressed={isActive} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-800 transition ${isActive ? 'border-umber bg-umber text-sand' : 'border-gold/35 bg-cream text-umber/65 hover:border-gold hover:bg-parch/30'}`}>{item}</button>;
          })}
          {otherGenres.length > 0 && <select aria-label="More reading genres" value={otherGenres.includes(genre) ? genre : ''} onChange={event => setGenre(event.target.value || 'All')} className="tb-input min-h-10 max-w-[11rem] rounded-full border border-gold/35 bg-cream px-3 text-xs font-800 text-umber">
            <option value="">More genres</option>
            {otherGenres.map(item => <option key={item} value={item}>{item}</option>)}
          </select>}
        </div></div>}
      </section>

      <CatalogGrid items={visible} layout={layout} expandedId={expandedId} onToggle={id => setExpandedId(current => current === id ? null : id)} onSelect={setSelected} />
      {pageCount > 1 && <nav aria-label="Collection pages" className="flex items-center justify-center gap-3 pb-4 text-sm font-700 text-umber">
        <button type="button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setExpandedId(null); }} className="tb-button-secondary tb-cut-sm min-h-10 px-4 disabled:opacity-40">Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => { setPage(value => value + 1); setExpandedId(null); }} className="tb-button-secondary tb-cut-sm min-h-10 px-4 disabled:opacity-40">Next</button>
      </nav>}
      <VolumeDrawer volume={selected ? volumes.find(volume => volume.id === selected.id) ?? selected : null} onClose={() => setSelected(null)} />
    </div>
  );
}

function TopFiveShowcase({ books, onSelect }: { books: Volume[]; onSelect: (book: Volume) => void }) {
  const [featured, ...supporting] = books;
  const featuredGenre = catalogGenreOptions([featured])[0] || 'Library favorite';

  return <section aria-labelledby="best-picks-title" className="top-five-showcase relative overflow-hidden rounded-[30px] border border-umber/80 bg-umber p-3 text-cream shadow-[0_28px_70px_rgba(61,36,19,.25)] sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-sun/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 h-52 w-52 rounded-full border border-sun/10" />

    <header className="top-five-header relative flex flex-col gap-4 px-2 pb-5 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-3 sm:pb-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[10px] font-900 uppercase tracking-[.2em] text-sun sm:text-xs"><SparklesIcon className="h-4 w-4" /> Handpicked from the Bonbon collection</p>
        <h2 id="best-picks-title" className="mt-2 font-display text-3xl font-900 leading-none sm:text-4xl">The Bonbon Essential Five</h2>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-cream/60 sm:text-sm">Five standout stories selected from reader ratings, collection quality, and books you can discover in the library today.</p>
      </div>
      <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-sun/25 bg-sun/10 px-3 py-2 text-[9px] font-900 uppercase tracking-[.16em] text-sun sm:text-[10px]"><CrownIcon className="h-3.5 w-3.5" /> Bonbon Top {books.length}</span>
    </header>

    <div className="top-five-layout relative grid gap-3">
      <button type="button" onClick={() => onSelect(featured)} className="top-five-featured group relative min-h-[300px] min-w-0 overflow-hidden rounded-[24px] border border-sun/30 bg-[linear-gradient(135deg,#9f3518_0%,#6e3e21_52%,#4a2e1c_100%)] p-5 text-left shadow-[0_22px_55px_rgba(22,11,5,.34)] transition duration-300 hover:-translate-y-1 hover:border-sun/60 hover:shadow-[0_28px_65px_rgba(22,11,5,.42)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun sm:min-h-[360px] sm:p-7">
        {featured.coverImage && <img src={featured.coverImage} alt="" aria-hidden="true" className="absolute -right-12 -top-16 h-[130%] w-2/3 rotate-6 object-cover opacity-[.11] blur-2xl transition duration-700 group-hover:scale-110" />}
        <div aria-hidden="true" className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full border border-sun/15" />
        <span className="absolute right-5 top-3 font-display text-[5.5rem] font-900 leading-none text-cream/[.055] sm:right-7 sm:text-[8rem]">01</span>

        <div className="top-five-featured-grid relative grid h-full grid-cols-[105px_minmax(0,1fr)] items-center gap-5 sm:grid-cols-[175px_minmax(0,1fr)] sm:gap-8">
          <div className="relative">
            <span className="absolute -left-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full border-2 border-umber bg-sun text-umber shadow-lg"><CrownIcon className="h-4 w-4 fill-current" /></span>
            <DiscoveryCover volume={featured} />
          </div>
          <div className="min-w-0 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sun px-3 py-1 text-[9px] font-900 uppercase tracking-[.15em] text-umber"><StarIcon className="h-3 w-3 fill-current" /> No. 1 library pick</span>
            <p className="mt-4 text-[9px] font-800 uppercase tracking-[.17em] text-sand/65 sm:text-[10px]">{featuredGenre}</p>
            <h3 className="mt-1.5 line-clamp-3 font-display text-2xl font-900 leading-[1.04] text-cream sm:text-4xl">{featured.title}</h3>
            <p className="mt-2 truncate text-xs text-sand/70 sm:text-sm">by {featured.author}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-800"><span className="inline-flex items-center gap-1.5 rounded-full border border-sun/25 bg-umber/30 px-3 py-1.5 text-sun"><StarIcon className="h-3 w-3 fill-current" /> {ratingLabel(featured)}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-cream/15 bg-cream/5 px-3 py-1.5 text-cream/75"><BookOpenIcon className="h-3 w-3" /> {availabilityLabel(featured)}</span></div>
            <span className="mt-6 hidden items-center gap-2 text-[10px] font-900 uppercase tracking-[.16em] text-sun sm:inline-flex">Explore this book <ArrowUpRightIcon className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
          </div>
        </div>
      </button>

      <div className="top-five-support-grid grid min-w-0 gap-3">
        {supporting.map((book, index) => <button key={book.id} type="button" onClick={() => onSelect(book)} className="top-five-support-card group relative min-h-[158px] min-w-0 overflow-hidden rounded-[20px] border border-gold/25 bg-[#fffaf0] p-3 text-left text-umber shadow-[0_12px_30px_rgba(27,14,6,.13)] transition duration-300 hover:-translate-y-1 hover:border-sun/70 hover:shadow-[0_18px_38px_rgba(27,14,6,.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sun sm:p-4">
          <span aria-hidden="true" className="absolute -right-1 -top-4 font-display text-[5.5rem] font-900 leading-none text-umber/[.045]">0{index + 2}</span>
          <div className="top-five-support-inner relative grid h-full grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
            <DiscoveryCover volume={book} compact />
            <div className="min-w-0 py-1">
              <span className="text-[9px] font-900 uppercase tracking-[.17em] text-rust">Essential pick #{index + 2}</span>
              <h3 className="mt-1.5 line-clamp-2 font-display text-base font-900 leading-5 sm:text-lg">{book.title}</h3>
              <p className="mt-1 truncate text-[10px] text-umber/50">{book.author}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-800"><span className="flex items-center gap-1 text-gold"><StarIcon className="h-3 w-3 fill-current" /> {ratingLabel(book)}</span><span className={book.copies > 0 ? 'text-emerald-700' : 'text-rust'}>{availabilityLabel(book)}</span></div>
              <span className="mt-3 inline-flex items-center gap-1 text-[9px] font-900 uppercase tracking-[.12em] text-rust opacity-70 transition group-hover:opacity-100">View details <ArrowUpRightIcon className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </button>)}
      </div>
    </div>
  </section>;
}

function ratingLabel(book: Volume) {
  return book.rating > 0 ? `${book.rating.toFixed(1)} reader score` : 'Collection favorite';
}

function availabilityLabel(book: Volume) {
  if (book.copies <= 0) return 'Currently in use';
  return `${book.copies} ${book.copies === 1 ? 'copy' : 'copies'} available`;
}

function DiscoveryCover({ volume, compact = false }: { volume: Volume; compact?: boolean }) {
  const plate = Array.isArray(volume.plate) && volume.plate.length ? volume.plate : [volume.title];
  return <span className={`relative block overflow-hidden border border-sand/35 bg-cream shadow-[0_18px_45px_rgba(28,15,7,.32)] ${compact ? 'h-[112px] w-[82px] rounded-lg' : 'aspect-[3/4] w-full rounded-xl'}`}>
    <span className="relative flex h-full w-full overflow-hidden rounded-[inherit]" style={{ backgroundColor: volume.plateColor }}>
      {volume.coverImage
        ? <img src={volume.coverImage} alt={`${volume.title} book cover`} loading={compact ? 'lazy' : 'eager'} className="h-full w-full bg-cream object-contain transition duration-500 group-hover:scale-[1.03]" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
        : <span className={`relative mt-auto block p-3 font-display font-900 uppercase leading-[1.05] ${compact ? 'text-[8px]' : 'text-xl sm:text-2xl'}`} style={{ color: volume.plateInk }}>{plate.map((line, index) => <span key={`${line}-${index}`} className="block">{line}</span>)}</span>}
    </span>
  </span>;
}

interface LayoutToggleProps {
  active: boolean;
  label: string;
  onClick: () => void;
  Icon: typeof ListIcon;
}

function LayoutToggle({ active, label, onClick, Icon }: LayoutToggleProps) {
  return <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${active ? 'border-umber bg-umber text-sun' : 'border-gold/25 text-umber/55 hover:bg-parch/35'}`}><Icon aria-hidden="true" className="h-4 w-4" /></button>;
}

function SortOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" role="option" aria-selected={active} onClick={onClick} className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs font-700 ${active ? 'bg-parch/45 text-rust' : 'text-umber/70 hover:bg-parch/30'}`}>{label}</button>;
}
