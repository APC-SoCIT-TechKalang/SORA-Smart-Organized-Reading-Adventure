import { useMemo, useState } from 'react';
import { ChevronDownIcon, FilterIcon, LayoutGridIcon, ListIcon, SearchIcon, XIcon } from 'lucide-react';
import { CatalogGrid } from '../components/CatalogGrid';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { SectionHeading } from '../components/OrnatePanel';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';

type SortKey = 'popular' | 'newest';

interface CatalogProps {
  query: string;
  onQueryChange: (value: string) => void;
  initialLayout: 'grid' | 'list';
}

export function Catalog({ query, onQueryChange, initialLayout }: CatalogProps) {
  const { volumes } = useGame();
  const genres = ['All', ...new Set(volumes.map((volume) => volume.genre))];
  const [genre, setGenre] = useState('All');
  const [layout, setLayout] = useState<'grid' | 'list'>(initialLayout);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Volume | null>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return volumes
      .filter((volume) => (genre === 'All' || volume.genre === genre) && (!needle || [volume.title, volume.author, volume.genre].some((value) => value.toLowerCase().includes(needle))))
      .sort((a, b) => sort === 'newest' ? b.volume - a.volume : a.title.localeCompare(b.title));
  }, [genre, query, sort, volumes]);

  return (
    <div className="space-y-6">
      <section className="tb-cut-lg relative overflow-hidden border border-gold/35 bg-cream/90 p-4 shadow-[0_12px_34px_rgba(84,56,34,.08)] min-[390px]:p-5 sm:p-7">
        <div aria-hidden="true" className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_70%_20%,rgba(249,210,25,.22),transparent_45%),repeating-linear-gradient(135deg,transparent_0,transparent_18px,rgba(149,52,16,.045)_18px,rgba(149,52,16,.045)_19px)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl"><p className="tb-eyebrow">Browse the collection</p><h1 className="mt-2 font-display text-2xl font-900 tracking-[-.01em] text-umber sm:text-3xl">Find your next read</h1><p className="mt-2 text-sm font-600 leading-6 text-umber/60">Search the stacks by title, author, or genre. Open any book for its full publication record and reading availability.</p></div>
          <div className="flex gap-5 pr-1"><div><strong className="block font-display text-2xl font-900 text-umber">{volumes.length}</strong><span className="text-[10px] font-800 uppercase tracking-[.12em] text-gold">Titles</span></div><div><strong className="block font-display text-2xl font-900 text-umber">{new Set(volumes.map((volume) => volume.genre)).size}</strong><span className="text-[10px] font-800 uppercase tracking-[.12em] text-gold">Genres</span></div></div>
        </div>
      </section>
      <SectionHeading title="All books" meta={`${results.length} of ${volumes.length} titles`} />

      <section aria-label="Catalog controls" className="tb-surface tb-cut-sm p-4 sm:p-5">
        <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-800 uppercase tracking-[.1em] text-umber transition hover:bg-parch/35">
            <FilterIcon aria-hidden="true" className="h-4 w-4 text-gold" /> Filter
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
            {sortOpen && <div role="listbox" aria-label="Sort books" className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl border border-gold/35 bg-cream p-1 shadow-[0_16px_36px_rgba(84,56,34,.18)]">
              <SortOption label="Featured" active={false} onClick={() => setSortOpen(false)} />
              <SortOption label="Most relevant" active={false} onClick={() => setSortOpen(false)} />
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

        <div className="tb-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Filter by genre">
          {genres.map((item) => {
            const isActive = item === genre;
            return <button key={item} type="button" onClick={() => setGenre(item)} aria-pressed={isActive} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-800 transition ${isActive ? 'border-umber bg-umber text-sand' : 'border-gold/35 bg-cream text-umber/65 hover:border-gold hover:bg-parch/30'}`}>{item}</button>;
          })}
        </div></div>}
      </section>

      <CatalogGrid items={results} layout={layout} onSelect={setSelected} />
      <VolumeDrawer volume={selected} onClose={() => setSelected(null)} />
    </div>
  );
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
