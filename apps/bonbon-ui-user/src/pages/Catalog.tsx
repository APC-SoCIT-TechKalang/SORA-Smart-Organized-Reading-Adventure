import { useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon, LayoutGridIcon, ListIcon, SearchIcon, SparklesIcon, StarIcon, XIcon } from 'lucide-react';
import { CatalogGrid } from '../components/CatalogGrid';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { SectionHeading } from '../components/OrnatePanel';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';

type SortKey = 'popular' | 'newest';
const recommendedGenres = ['Action', 'Comedy', 'Fantasy', 'Horror', 'Supernatural', 'Adventure', 'Romance'];

interface CatalogProps {
  query: string;
  onQueryChange: (value: string) => void;
  initialLayout: 'grid' | 'list';
}

export function Catalog({ query, onQueryChange, initialLayout }: CatalogProps) {
  const { volumes } = useGame();
  const availableGenres = new Set(volumes.flatMap((volume) => splitGenres(volume.genre).map(normalizeGenre)));
  const genres = ['All', ...recommendedGenres.filter((item) => availableGenres.has(normalizeGenre(item))).slice(0, 5)];
  const [genre, setGenre] = useState('All');
  const [layout, setLayout] = useState<'grid' | 'list'>(initialLayout);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Volume | null>(null);

  const bestBooks = useMemo(() => [...volumes].sort((a, b) => {
    const score = (volume: Volume) => (volume.rating * 100) + (Math.max(0, volume.copies) * 12) + (volume.rarity * 4) + (volume.coverImage ? 6 : 0);
    return score(b) - score(a) || a.title.localeCompare(b.title);
  }).slice(0, 5), [volumes]);

  useEffect(() => {
    if (genre !== 'All' && !volumes.some((volume) => hasGenre(volume.genre, genre))) setGenre('All');
  }, [genre, volumes]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return volumes
      .filter((volume) => (genre === 'All' || hasGenre(volume.genre, genre)) && (!needle || [volume.title, volume.author, volume.genre].some((value) => value.toLowerCase().includes(needle))))
      .sort((a, b) => sort === 'newest' ? b.volume - a.volume : (b.rating - a.rating) || (b.copies - a.copies) || a.title.localeCompare(b.title));
  }, [genre, query, sort, volumes]);

  return (
    <div className="space-y-6">
      {bestBooks.length > 0 && <section aria-labelledby="best-picks-title" className="relative overflow-hidden rounded-[28px] border border-gold/30 bg-[linear-gradient(135deg,rgba(255,253,248,.98),rgba(243,215,147,.2))] p-4 shadow-[0_18px_48px_rgba(84,56,34,.1)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full border border-gold/15" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-5">
          <div>
            <p className="tb-eyebrow flex items-center gap-2"><SparklesIcon className="h-4 w-4" /> Curated for curious readers</p>
            <h2 id="best-picks-title" className="mt-2 font-display text-2xl font-900 text-umber sm:text-3xl">Five books worth opening</h2>
            <p className="mt-2 max-w-xl text-xs leading-5 text-umber/55 sm:text-sm">A focused shortlist chosen from reader ratings, available copies, and collection highlights.</p>
          </div>
          <span className="rounded-full border border-gold/30 bg-cream/75 px-3 py-2 text-[10px] font-900 uppercase tracking-[.16em] text-gold">Top {bestBooks.length} library picks</span>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bestBooks.map((book, index) => {
            const isFeatured = index === 0;
            return <button
              key={book.id}
              type="button"
              onClick={() => setSelected(book)}
              className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${isFeatured
                ? 'border-umber bg-[linear-gradient(145deg,#543822,#7a4c25)] text-cream shadow-[0_18px_38px_rgba(84,56,34,.24)] sm:col-span-2 lg:row-span-2 lg:p-5'
                : 'border-gold/30 bg-cream/90 shadow-[0_10px_28px_rgba(84,56,34,.08)] hover:border-gold hover:shadow-[0_16px_34px_rgba(84,56,34,.14)]'
              }`}
            >
              {isFeatured && <span aria-hidden="true" className="absolute -bottom-24 -right-20 h-56 w-56 rounded-full border border-sun/15" />}
              <div className={`relative grid min-w-0 gap-3 ${isFeatured ? 'grid-cols-[100px_minmax(0,1fr)] items-center sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5' : 'grid-cols-[70px_minmax(0,1fr)]'}`}>
                <DiscoveryCover volume={book} compact={!isFeatured} />
                <div className="min-w-0 py-1">
                  <span className={`inline-flex items-center gap-1.5 font-900 uppercase tracking-[.16em] ${isFeatured ? 'rounded-full bg-sun px-2.5 py-1 text-[9px] text-umber' : 'text-[9px] text-gold'}`}>
                    {isFeatured && <StarIcon className="h-3 w-3 fill-current" />} Pick #{index + 1}
                  </span>
                  <h3 className={`mt-2 line-clamp-2 font-display font-800 ${isFeatured ? 'text-xl leading-6 text-cream sm:text-2xl sm:leading-8' : 'text-sm leading-5 text-umber'}`}>{book.title}</h3>
                  <p className={`mt-1 truncate ${isFeatured ? 'text-xs text-sand/75' : 'text-[10px] text-umber/55'}`}>{book.author}</p>
                  <span className={`mt-3 flex items-center gap-1 font-800 ${isFeatured ? 'text-xs text-sun' : 'text-[10px] text-gold'}`}><StarIcon className="h-3 w-3 fill-sun text-sun" />{book.rating || 'Collection pick'}</span>
                  {isFeatured && <span className="mt-4 hidden text-[10px] font-800 uppercase tracking-[.18em] text-sand/70 sm:block">Open book details →</span>}
                </div>
              </div>
            </button>;
          })}
        </div>
      </section>}

      <div id="full-catalog" className="scroll-mt-24"><SectionHeading title="Explore the full collection" meta={`${results.length} of ${volumes.length} titles`} /></div>

      <section aria-label="Catalog controls" className="tb-surface relative overflow-visible rounded-2xl p-4 sm:p-5">
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
              {sort === 'popular' ? 'Most Read' : 'Newest first'}
              <ChevronDownIcon className={`h-3.5 w-3.5 text-gold transition ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && <div role="listbox" aria-label="Sort books" className="absolute right-0 top-[calc(100%+.5rem)] z-30 w-48 overflow-hidden rounded-xl border border-gold/35 bg-cream p-1.5 shadow-[0_16px_36px_rgba(84,56,34,.22)]">
              <SortOption label="Most Read" active={sort === 'popular'} onClick={() => { setSort('popular'); setSortOpen(false); }} />
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

        <div className="flex flex-wrap gap-2" aria-label="Filter by genre">
          {genres.map((item) => {
            const isActive = item === genre;
            return <button key={item} type="button" onClick={() => setGenre(item)} aria-pressed={isActive} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-800 transition ${isActive ? 'border-umber bg-umber text-sand' : 'border-gold/35 bg-cream text-umber/65 hover:border-gold hover:bg-parch/30'}`}>{item}</button>;
          })}
        </div></div>}
      </section>

      <CatalogGrid items={results} layout={layout} onSelect={setSelected} />
      <VolumeDrawer volume={selected ? volumes.find(volume => volume.id === selected.id) ?? selected : null} onClose={() => setSelected(null)} />
    </div>
  );
}

function DiscoveryCover({ volume, compact = false }: { volume: Volume; compact?: boolean }) {
  const plate = Array.isArray(volume.plate) && volume.plate.length ? volume.plate : [volume.title];
  return <span className={`relative block overflow-hidden border border-sand/35 bg-cream shadow-[0_18px_45px_rgba(28,15,7,.32)] ${compact ? 'h-[94px] w-[70px] rounded-lg' : 'aspect-[3/4] w-full rounded-xl'}`}>
    <span className="relative flex h-full w-full overflow-hidden rounded-[inherit]" style={{ backgroundColor: volume.plateColor }}>
      {volume.coverImage
        ? <img src={volume.coverImage} alt={`${volume.title} book cover`} className="h-full w-full bg-cream object-contain transition duration-500 group-hover:scale-[1.03]" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
        : <span className={`relative mt-auto block p-3 font-display font-900 uppercase leading-[1.05] ${compact ? 'text-[8px]' : 'text-xl sm:text-2xl'}`} style={{ color: volume.plateInk }}>{plate.map((line, index) => <span key={`${line}-${index}`} className="block">{line}</span>)}</span>}
    </span>
  </span>;
}

function splitGenres(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((genre) => genre.trim())
    .filter(Boolean);
}

const normalizeGenre = (value: string) => value.trim().toLowerCase();
const hasGenre = (value: string, genre: string) => splitGenres(value).some(item => normalizeGenre(item) === normalizeGenre(genre));

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
