import { useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, BookOpenIcon, ChevronDownIcon, CrownIcon, LayoutGridIcon, ListIcon, SearchIcon, SparklesIcon, StarIcon, XIcon } from 'lucide-react';
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
  const featured = bestBooks[0] ?? null;

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
      {featured && <section className="relative isolate overflow-hidden rounded-[28px] border border-[#7f512a] bg-[#543822] text-cream shadow-[0_24px_60px_rgba(84,56,34,.24)]">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(249,210,25,.25),transparent_31%),linear-gradient(110deg,transparent_48%,rgba(196,128,12,.16)_48%,rgba(196,128,12,.16)_49%,transparent_49%)]" />
        <div aria-hidden="true" className="absolute -bottom-36 -left-20 h-72 w-72 rounded-full border border-sand/10" />
        <div className="relative grid items-center gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,.85fr)] lg:p-10">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sun/30 bg-sun/10 px-3 py-1.5 text-[9px] font-900 uppercase tracking-[.2em] text-sun"><CrownIcon className="h-3.5 w-3.5" /> No. 1 staff spotlight</span>
            <p className="mt-5 text-[10px] font-800 uppercase tracking-[.22em] text-sand/65">The best of Tankobonbon</p>
            <h1 className="mt-2 max-w-xl font-display text-3xl font-900 leading-[1.05] tracking-[-.02em] text-white sm:text-5xl">{featured.title}</h1>
            <p className="mt-2 text-sm font-700 text-sand/75">{featured.author}</p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-cream/70">{featured.synopsis || 'A standout title from the Tankobonbon collection, selected to begin your next reading adventure.'}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {splitGenres(featured.genre).slice(0, 2).map(item => <span key={item} className="rounded-full border border-sand/20 bg-white/5 px-3 py-1.5 text-[10px] font-800 text-sand">{item}</span>)}
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-900 ${featured.copies > 0 ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/10 text-sand/65'}`}>{featured.copies > 0 ? `${featured.copies} available` : 'Ask staff for availability'}</span>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSelected(featured)} className="tb-button-primary tb-cut-sm min-h-12 px-5 text-xs uppercase tracking-[.1em]"><BookOpenIcon className="h-4 w-4" /> View book details</button>
              <button type="button" onClick={() => document.getElementById('full-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-sand/30 px-5 text-xs font-800 uppercase tracking-[.1em] text-sand transition hover:bg-white/10">Browse all books <ArrowRightIcon className="h-4 w-4" /></button>
            </div>
          </div>
          <button type="button" onClick={() => setSelected(featured)} className="group relative mx-auto w-full max-w-[320px] text-left lg:justify-self-end">
            <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-sun/15 blur-3xl" />
            <DiscoveryCover volume={featured} featured />
            <span className="absolute -right-2 -top-2 grid h-14 w-14 rotate-6 place-items-center rounded-2xl border border-[#fff2a8]/40 bg-sun font-display text-lg font-900 text-umber shadow-xl transition group-hover:rotate-0">#1</span>
          </button>
        </div>
      </section>}

      {bestBooks.length > 1 && <section aria-labelledby="best-picks-title" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div><p className="tb-eyebrow flex items-center gap-2"><SparklesIcon className="h-4 w-4" /> Curated for curious readers</p><h2 id="best-picks-title" className="mt-2 font-display text-2xl font-900 text-umber sm:text-3xl">Five books worth opening</h2></div>
          <p className="hidden max-w-sm text-right text-xs leading-5 text-umber/55 sm:block">Strong reader ratings, availability, and collection highlights—all in one short list.</p>
        </div>
        <div className="flex snap-x gap-3 overflow-x-auto pb-3 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
          {bestBooks.slice(1).map((book, index) => <button key={book.id} type="button" onClick={() => setSelected(book)} className="group min-w-[210px] snap-start rounded-2xl border border-gold/30 bg-cream/90 p-3 text-left shadow-[0_10px_28px_rgba(84,56,34,.08)] transition hover:-translate-y-1 hover:border-gold hover:shadow-[0_16px_34px_rgba(84,56,34,.14)] sm:min-w-0">
            <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3">
              <DiscoveryCover volume={book} compact />
              <div className="min-w-0 py-1"><span className="text-[9px] font-900 uppercase tracking-[.16em] text-gold">Pick #{index + 2}</span><h3 className="mt-1 line-clamp-2 font-display text-sm font-800 leading-5 text-umber">{book.title}</h3><p className="mt-1 truncate text-[10px] text-umber/55">{book.author}</p><span className="mt-3 flex items-center gap-1 text-[10px] font-800 text-gold"><StarIcon className="h-3 w-3 fill-sun text-sun" />{book.rating || 'Collection pick'}</span></div>
            </div>
          </button>)}
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
              {sort === 'popular' ? 'Best selling' : 'Newest first'}
              <ChevronDownIcon className={`h-3.5 w-3.5 text-gold transition ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && <div role="listbox" aria-label="Sort books" className="absolute right-0 top-[calc(100%+.5rem)] z-30 w-48 overflow-hidden rounded-xl border border-gold/35 bg-cream p-1.5 shadow-[0_16px_36px_rgba(84,56,34,.22)]">
              <SortOption label="Best selling" active={sort === 'popular'} onClick={() => { setSort('popular'); setSortOpen(false); }} />
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

function DiscoveryCover({ volume, featured = false, compact = false }: { volume: Volume; featured?: boolean; compact?: boolean }) {
  const plate = Array.isArray(volume.plate) && volume.plate.length ? volume.plate : [volume.title];
  return <span className={`relative block overflow-hidden border border-sand/35 bg-cream shadow-[0_18px_45px_rgba(28,15,7,.32)] ${compact ? 'h-[94px] w-[70px] rounded-lg' : featured ? 'aspect-[3/4] w-full rounded-[22px] p-1.5' : 'aspect-[3/4] w-full rounded-xl'}`}>
    <span className="relative flex h-full w-full overflow-hidden rounded-[inherit]" style={{ backgroundColor: volume.plateColor }}>
      {volume.coverImage
        ? <img src={volume.coverImage} alt={`${volume.title} book cover`} className="h-full w-full bg-cream object-contain transition duration-500 group-hover:scale-[1.03]" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
        : <span className={`relative mt-auto block p-3 font-display font-900 uppercase leading-[1.05] ${compact ? 'text-[8px]' : 'text-xl sm:text-2xl'}`} style={{ color: volume.plateInk }}>{plate.map((line, index) => <span key={`${line}-${index}`} className="block">{line}</span>)}</span>}
      {featured && <span aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-xl border border-current opacity-20" style={{ color: volume.plateInk }} />}
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
