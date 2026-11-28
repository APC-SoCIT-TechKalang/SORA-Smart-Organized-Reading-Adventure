import { useEffect, useMemo, useState } from 'react';
import { BookOpenIcon, LayoutGridIcon, ListIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { CatalogGrid } from '../components/CatalogGrid';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { ReaderPageHeading } from '../components/ReaderPageHeading';
import { useGame } from '../contexts/GameContext';
import { groupCatalog, matchesCatalogGroup } from '../lib/catalog-series';
import { formatOf, genreMatches, genreOptions, subjectMatches, subjectOptions } from '../lib/catalog-filters';
import type { Volume } from '../types/library';

type Sort = 'relevance' | 'title' | 'newest' | 'availability';
const PAGE_SIZE = 24;
type Props = { query: string; onQueryChange: (value: string) => void; initialLayout: 'grid' | 'list' };

export function Catalog({ query, onQueryChange, initialLayout }: Props) {
  const { volumes } = useGame();
  const groups = useMemo(() => groupCatalog(volumes), [volumes]);
  const formats = useMemo(() => [...new Set(volumes.map(formatOf))].sort((a,b) => { const order = ['Manga','Light Novel','Adult Manga']; return (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b); }), [volumes]);
  const genres = useMemo(() => genreOptions(volumes), [volumes]);
  const subjects = useMemo(() => subjectOptions(volumes), [volumes]);
  const [draft, setDraft] = useState(query);
  const [format, setFormat] = useState('All');
  const [genre, setGenre] = useState('All');
  const [subject, setSubject] = useState('All');
  const [availability, setAvailability] = useState('All');
  const [sort, setSort] = useState<Sort>('relevance');
  const [layout, setLayout] = useState<'grid'|'list'>(initialLayout);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selected, setSelected] = useState<Volume|null>(null);
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => { const timer = window.setTimeout(() => onQueryChange(draft), 250); return () => window.clearTimeout(timer); }, [draft, onQueryChange]);
  useEffect(() => { const open = (event: Event) => { const id = (event as CustomEvent<{volumeId?:string}>).detail?.volumeId; const found = volumes.find(volume => volume.id === id); if (found) setSelected(found); }; window.addEventListener('tankobonbon:open-volume', open); return () => window.removeEventListener('tankobonbon:open-volume', open); }, [volumes]);
  useEffect(() => { if (!filtersOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFiltersOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [filtersOpen]);
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const score = (title: string) => !needle ? 0 : title.toLocaleLowerCase() === needle ? 3 : title.toLocaleLowerCase().startsWith(needle) ? 2 : title.toLocaleLowerCase().includes(needle) ? 1 : 0;
    return groups.filter(group => matchesCatalogGroup(group, query) && group.volumes.some(volume =>
      (format === 'All' || formatOf(volume) === format) && (genre === 'All' || genreMatches(volume, genre)) &&
      (subject === 'All' || subjectMatches(volume, subject)) && (availability === 'All' || (availability === 'Available' ? volume.copies > 0 : volume.copies === 0))))
      .sort((a,b) => { const title = a.title.localeCompare(b.title) || a.id.localeCompare(b.id); if (sort === 'title') return title; if (sort === 'availability') return Number(b.copies > 0) - Number(a.copies > 0) || b.copies - a.copies || title; if (sort === 'newest') return Math.max(...b.volumes.map(v => Date.parse(v.addedAt ?? '') || 0)) - Math.max(...a.volumes.map(v => Date.parse(v.addedAt ?? '') || 0)) || title; return score(b.title) - score(a.title) || title; });
  }, [groups, query, format, genre, subject, availability, sort]);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); setExpandedId(null); }, [query, format, genre, subject, availability, sort]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const clear = () => { setDraft(''); onQueryChange(''); setFormat('All'); setGenre('All'); setSubject('All'); setAvailability('All'); };
  const chips = [[format,setFormat,'Format'],[genre,setGenre,'Genre'],[subject,setSubject,'Subject'],[availability,setAvailability,'Availability']] as const;
  const suggestions = draft.trim() ? groups.filter(group => matchesCatalogGroup(group,draft)).slice(0,5) : [];

  return <div className="reader-catalog space-y-5">
    <ReaderPageHeading kind="catalog" title="Browse books" detail={`${groups.length.toLocaleString()} titles and series · ${volumes.length.toLocaleString()} volumes in the library`} />
    <section className="tb-surface rounded-2xl border border-gold/30 p-4 sm:p-6" aria-label="Find books">
      <label htmlFor="catalog-search" className="block font-display text-xl font-900 text-umber">What would you like to read?</label>
      <div className="tb-input mt-3 flex min-h-14 items-center gap-3 rounded-xl px-4"><SearchIcon className="h-5 w-5 text-rust" aria-hidden="true"/><input id="catalog-search" autoComplete="off" value={draft} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)} onChange={event => setDraft(event.target.value)} placeholder="Search title, series, author, or interest…" className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-umber/45"/>{draft && <button type="button" onClick={() => { setDraft(''); onQueryChange(''); }} aria-label="Clear search"><XIcon className="h-4 w-4"/></button>}</div>
      {suggestions.length > 0 && searchFocused && <div className="mt-2 rounded-xl border border-gold/25 bg-cream p-2" role="listbox" aria-label="Search suggestions">{suggestions.map(group => <button key={group.id} type="button" role="option" aria-selected={false} onClick={() => { setDraft(group.title); onQueryChange(group.title); setSearchFocused(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-parch/40"><strong>{group.title}</strong><span className="ml-2 text-xs text-umber/55">{group.author}</span></button>)}</div>}
      <div className="mt-5"><p className="text-xs font-800 uppercase tracking-widest text-umber/65">Format</p><div className="mt-2 flex flex-wrap gap-2">{['All',...formats].map(item => <button key={item} type="button" aria-pressed={format === item} onClick={() => setFormat(item)} className={`min-h-11 rounded-full border px-4 text-sm font-800 ${format === item ? 'border-rust bg-rust text-cream' : 'border-gold/40 bg-cream text-umber'}`}>{item === 'All' ? 'All formats' : item === 'Light Novel' ? 'Light Novels' : item}</button>)}</div></div>
      {subjects.length > 0 && <div className="mt-5"><p className="text-xs font-800 uppercase tracking-widest text-umber/65">Browse by interest</p><div className="mt-2 flex flex-wrap gap-2">{subjects.map(item => <button key={item} type="button" aria-pressed={subject === item} onClick={() => setSubject(subject === item ? 'All' : item)} className={`min-h-10 rounded-full border px-4 text-xs font-800 ${subject === item ? 'border-rust bg-rust text-cream' : 'border-gold/40 bg-cream text-umber'}`}>{item}</button>)}</div></div>}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} className="tb-button-secondary tb-cut-sm min-h-11 px-4"><SlidersHorizontalIcon className="h-4 w-4"/> Filters</button><div className="flex items-center gap-2"><label htmlFor="catalog-sort" className="text-xs font-800">Sort</label><select id="catalog-sort" value={sort} onChange={event => setSort(event.target.value as Sort)} className="tb-input min-h-11 rounded-lg px-3 text-xs"><option value="relevance">Relevance</option><option value="title">Title A–Z</option><option value="newest">Recently added</option><option value="availability">Availability</option></select><button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} className="tb-input grid h-11 w-11 place-items-center rounded-lg"><LayoutGridIcon className="h-4 w-4"/></button><button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')} className="tb-input grid h-11 w-11 place-items-center rounded-lg"><ListIcon className="h-4 w-4"/></button></div></div>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <strong aria-live="polite" className="mr-2 text-umber">{results.length.toLocaleString()} {results.length === 1 ? 'result' : 'results'}</strong>
      {query && <Chip text={`Search: ${query}`} remove={() => { setDraft(''); onQueryChange(''); }} />}
      {chips.map(([value,setValue,label]) => value !== 'All' && <Chip key={label} text={`${label}: ${value}`} remove={() => setValue('All')} />)}
      {(query || chips.some(([value]) => value !== 'All')) && <button type="button" onClick={clear} className="min-h-10 px-2 text-xs font-800 text-rust underline">Clear all</button>}
    </div>
    {filtersOpen && <div className="fixed inset-0 z-[90] bg-umber/70 p-3 sm:grid sm:place-items-center" onMouseDown={event => { if (event.target === event.currentTarget) setFiltersOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="catalog-filter-title" className="ml-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-cream shadow-2xl"><header className="flex items-center justify-between border-b border-gold/25 p-5"><h2 id="catalog-filter-title" className="font-display text-xl font-900">Filter books</h2><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><XIcon/></button></header><div className="space-y-5 overflow-y-auto p-5"><Filter label="Format" value={format} options={formats} onChange={setFormat}/><Filter label="Genre" value={genre} options={genres} onChange={setGenre}/><Filter label="Subject" value={subject} options={subjects} onChange={setSubject}/><Filter label="Availability" value={availability} options={volumes.some(v => v.copies >= 0) ? ['Available','Unavailable'] : []} onChange={setAvailability}/></div><footer className="flex gap-2 border-t border-gold/25 p-5"><button type="button" onClick={clear} className="tb-button-secondary tb-cut-sm min-h-11 flex-1">Clear all</button><button type="button" onClick={() => setFiltersOpen(false)} className="tb-button-primary tb-cut-sm min-h-11 flex-1">Show {results.length.toLocaleString()} results</button></footer></section></div>}
    {visible.length ? <CatalogGrid items={visible} layout={layout} expandedId={expandedId} onToggle={id => setExpandedId(current => current === id ? null : id)} onSelect={setSelected}/> : <div className="tb-state tb-cut-sm text-center"><BookOpenIcon className="mx-auto h-9 w-9 text-gold"/><h2 className="mt-3 font-display text-xl font-900">No books match these choices</h2><p className="mt-2 text-sm text-umber/60">Try removing a format, genre, subject, or search term.</p><button type="button" onClick={clear} className="tb-button-primary tb-cut-sm mt-4 min-h-11 px-5">Show all books</button></div>}
    {pages > 1 && <nav aria-label="Collection pages" className="flex items-center justify-center gap-3 pb-5 text-sm font-700"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="tb-button-secondary tb-cut-sm min-h-11 px-4 disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage(page + 1)} className="tb-button-secondary tb-cut-sm min-h-11 px-4 disabled:opacity-40">Next</button></nav>}
    <VolumeDrawer volume={selected ? volumes.find(v => v.id === selected.id) ?? selected : null} onClose={() => setSelected(null)}/>
  </div>;
}

function Chip({text,remove}:{text:string;remove:()=>void}) { return <button type="button" onClick={remove} aria-label={`Remove ${text}`} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-gold/40 bg-parch/30 px-3 text-xs font-800 text-umber">{text}<XIcon className="h-3 w-3"/></button>; }
function Filter({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(value:string)=>void}) { return <label className="block text-sm font-800 text-umber">{label}<select value={value} onChange={event => onChange(event.target.value)} className="tb-input mt-2 min-h-12 w-full rounded-lg px-3"><option value="All">All {label.toLowerCase()}s</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>; }
