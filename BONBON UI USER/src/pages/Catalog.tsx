import React, { useMemo, useState } from 'react';
import { ChevronDownIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
import { CatalogGrid } from '../components/CatalogGrid';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { SectionHeading } from '../components/OrnatePanel';
import { genres, volumes } from '../data/manga';
import type { Volume } from '../types/library';

type SortKey = 'popular' | 'rating' | 'newest';

const SORTS: {id: SortKey;label: string;}[] = [
{ id: 'popular', label: 'Popular' },
{ id: 'rating', label: 'Top rated' },
{ id: 'newest', label: 'Newest volume' }];


interface CatalogProps {
  query: string;
  onQueryChange: (value: string) => void;
  initialLayout: 'grid' | 'list';
}

export function Catalog({ query, onQueryChange, initialLayout }: CatalogProps) {
  const [genre, setGenre] = useState('All');
  const [layout, setLayout] = useState<'grid' | 'list'>(initialLayout);
  const [sort, setSort] = useState<SortKey>('popular');
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Volume | null>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = volumes.filter((volume) => {
      const matchesGenre = genre === 'All' || volume.genre === genre;
      const matchesQuery =
      needle.length === 0 ||
      volume.title.toLowerCase().includes(needle) ||
      volume.author.toLowerCase().includes(needle) ||
      volume.genre.toLowerCase().includes(needle);
      return matchesGenre && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'newest') return b.volume - a.volume;
      return b.rarity - a.rarity || b.rating - a.rating;
    });
  }, [genre, query, sort]);

  return (
    <div className="space-y-6">
      <SectionHeading title="Catalog" meta={`${results.length} of 247 titles`} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="catalog-search">
          Filter the catalog
        </label>
        <input
          id="catalog-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Title, author, or genre…"
          className="tb-cut-sm h-10 w-[240px] border border-gold/50 bg-parch/20 px-3 font-body text-[13px] font-600 text-umber placeholder:text-umber/45" />
        

        <div className="flex flex-wrap gap-2">
          {genres.map((item) => {
            const isActive = item === genre;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setGenre(item)}
                aria-pressed={isActive}
                className={`border px-3 py-1.5 font-body text-[12px] font-700 uppercase tracking-[0.1em] transition-colors duration-150 ease-out ${
                isActive ?
                'border-gold bg-umber text-sand' :
                'border-gold/40 bg-cream text-umber/70 hover:bg-parch/40'}`
                }>
                
                {item}
              </button>);

          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((value) => !value)}
              aria-expanded={sortOpen}
              className="tb-cut-sm flex items-center gap-1.5 border border-gold/45 bg-cream px-3 py-2 font-body text-[12px] font-700 text-umber/75 transition-colors duration-150 ease-out hover:bg-parch/40">
              
              Sort: {SORTS.find((item) => item.id === sort)?.label}
              <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            {sortOpen ?
            <ul className="absolute right-0 z-20 mt-1 w-[170px] border border-gold bg-cream shadow-plate">
                {SORTS.map((item) =>
              <li key={item.id}>
                    <button
                  type="button"
                  onClick={() => {
                    setSort(item.id);
                    setSortOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left font-body text-[12px] font-700 transition-colors duration-150 ease-out hover:bg-parch/40 ${
                  item.id === sort ? 'text-rust' : 'text-umber/75'}`
                  }>
                  
                      {item.label}
                    </button>
                  </li>
              )}
              </ul> :
            null}
          </div>

          <div
            className="flex border border-gold/45 bg-cream"
            role="group"
            aria-label="Catalog layout">
            
            <LayoutToggle
              active={layout === 'grid'}
              label="Cover grid"
              onClick={() => setLayout('grid')}
              Icon={LayoutGridIcon} />
            
            <LayoutToggle
              active={layout === 'list'}
              label="Compact list"
              onClick={() => setLayout('list')}
              Icon={ListIcon} />
            
          </div>
        </div>
      </div>

      <CatalogGrid items={results} layout={layout} onSelect={setSelected} />

      <VolumeDrawer volume={selected} onClose={() => setSelected(null)} />
    </div>);

}

interface LayoutToggleProps {
  active: boolean;
  label: string;
  onClick: () => void;
  Icon: typeof ListIcon;
}

function LayoutToggle({ active, label, onClick, Icon }: LayoutToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`flex h-[34px] w-[34px] items-center justify-center transition-colors duration-150 ease-out ${
      active ? 'bg-umber text-sun' : 'text-umber/60 hover:bg-parch/40'}`
      }>
      
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>);

}