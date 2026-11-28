import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpenIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { catalogVolumeNumber, type CatalogSeries } from '../lib/catalog-series';
import { formatOf, genreOptions, subjectOptions } from '../lib/catalog-filters';
import { useGame } from '../contexts/GameContext';
import './catalog-volume-panel.css';

interface CatalogGridProps {
  items: CatalogSeries[];
  layout: 'grid' | 'list';
  expandedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (volume: Volume) => void;
}

const VOLUMES_PER_PAGE = 10;

export function CatalogGrid({ items, layout, expandedId, onToggle, onSelect }: CatalogGridProps) {
  const { isBorrowed, borrow, session, busy } = useGame();
  const gridRef = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState(2);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const element = gridRef.current;
    if (!element || layout !== 'grid') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColumns(width >= 1160 ? 5 : width >= 920 ? 4 : width >= 650 ? 3 : width >= 290 ? 2 : 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout, items.length]);

  const startReading = (id: string) => {
    if (!session) { window.dispatchEvent(new CustomEvent('tankobonbon:open-auth', { detail: { volumeId: id } })); return; }
    void borrow(id);
  };
  const actionLabel = (volume: Volume) => !session ? 'Sign in to read' : isBorrowed(volume.id) ? 'On your shelf' : volume.copies > 0 ? 'Start reading' : 'Ask staff';
  const panel = (group: CatalogSeries) => <VolumePanel key={group.id} group={group} onClose={() => onToggle(group.id)} onSelect={onSelect} onStart={startReading} actionLabel={actionLabel} busy={busy} isBorrowed={isBorrowed} session={!!session} />;

  if (!items.length) return <div className="tb-state tb-cut-sm"><BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" /><h3 className="mt-3 font-display text-lg font-800 text-umber">No matching books</h3><p className="mx-auto mt-2 max-w-md text-sm font-600 leading-6 text-umber/60">Try a different title, author, genre, or clear your filters.</p></div>;

  const card = (group: CatalogSeries, compact: boolean, index = 0) => {
    const series = group.volumes.length > 1;
    const expanded = expandedId === group.id;
    const panelId = `catalog-${encodeURIComponent(group.id)}`;
    const button = <button type="button" onClick={() => series ? onToggle(group.id) : onSelect(group.cover)} aria-expanded={series ? expanded : undefined} aria-controls={series ? panelId : undefined} className={`min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${compact ? 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3' : ''}`}>
      <Cover volume={group.cover} compact={compact} showStatus={!series} />
      <span className={compact ? 'min-w-0' : 'block min-w-0'}><span className="reader-card-title">{group.title}</span>
        <span className="reader-card-author">{group.author || 'Author not recorded'}</span>
        <span className="reader-card-tags"><span>{formatOf(group.cover)}</span>{genreOptions(group.volumes).slice(0,2).map(tag => <span key={tag}>{tag}</span>)}{subjectOptions(group.volumes).slice(0,1).map(tag => <span key={tag}>{tag}</span>)}</span>
        <span className={`reader-card-availability ${group.copies < 0 ? 'is-locked' : group.copies === 0 ? 'is-unavailable' : ''}`}>{series ? `${group.volumes.length} volumes · ` : ''}{group.copies < 0 ? 'Sign in for availability' : group.copies > 0 ? `${group.copies} ${group.copies === 1 ? 'copy' : 'copies'} available` : 'No copies available'}</span>
      </span>
    </button>;
    const action = series
      ? <button type="button" onClick={() => onToggle(group.id)} aria-expanded={expanded} aria-controls={panelId} className="tb-button-secondary tb-cut-sm min-h-10 px-2 text-[10px] uppercase tracking-[.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold sm:text-[11px]">{expanded ? 'Hide Volumes' : `View Volumes (${group.volumes.length})`}<ChevronDownIcon aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
      : !(session && group.cover.copies <= 0) && <button type="button" disabled={busy || isBorrowed(group.cover.id)} onClick={() => startReading(group.cover.id)} className="tb-button-secondary tb-cut-sm min-h-10 px-2 text-[10px] uppercase tracking-[.08em] sm:text-[11px]"><BookOpenIcon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />{actionLabel(group.cover)}</button>;
    if (compact) return <li className={`tb-list-row grid grid-cols-1 items-center gap-3 border-b border-gold/20 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-4 ${expanded ? 'bg-sun/10 ring-1 ring-inset ring-gold/60' : ''}`}>{button}{action}</li>;
    return <motion.li initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .28, delay: Math.min(index * .035, .2) }} className={`tb-book-card group flex min-w-0 flex-col ${expanded ? 'rounded-xl ring-2 ring-gold ring-offset-2 ring-offset-transparent' : ''}`}>{button}{action && <div className="mt-auto pt-3 [&>button]:w-full">{action}</div>}</motion.li>;
  };

  if (layout === 'list') return <ul className="tb-list-panel overflow-hidden rounded-xl border border-gold/30 bg-cream/85 shadow-sm">{items.map(group => <Fragment key={group.id}>{card(group, true)}{expandedId === group.id && <li id={`catalog-${encodeURIComponent(group.id)}`} className="border-b border-gold/30 bg-parch/20 p-3 sm:p-4">{panel(group)}</li>}</Fragment>)}</ul>;

  const rows: CatalogSeries[][] = [];
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
  return <ul ref={gridRef} className="space-y-5">{rows.map((row, rowIndex) => {
    const active = row.find(group => group.id === expandedId);
    return <li key={`${rowIndex}-${row[0].id}`} className="list-none"><ul className="grid gap-x-3 gap-y-6 sm:gap-x-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{row.map((group, index) => <Fragment key={group.id}>{card(group, false, index)}</Fragment>)}</ul>{active && <div id={`catalog-${encodeURIComponent(active.id)}`} className="mt-5">{panel(active)}</div>}</li>;
  })}</ul>;
}

function VolumePanel({ group, onClose, onSelect, onStart, actionLabel, busy, isBorrowed, session }: {
  group: CatalogSeries; onClose: () => void; onSelect: (volume: Volume) => void; onStart: (id: string) => void;
  actionLabel: (volume: Volume) => string; busy: boolean; isBorrowed: (id: string) => boolean; session: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const needle = search.trim().toLocaleLowerCase();
  const matching = needle ? group.volumes.filter(volume => {
    const number = catalogVolumeNumber(volume);
    return volume.title.toLocaleLowerCase().includes(needle) || (number !== null && String(number).includes(needle));
  }) : group.volumes;
  const pages = Math.max(1, Math.ceil(matching.length / VOLUMES_PER_PAGE));
  const currentPage = Math.min(page, pages);
  const volumes = matching.slice((currentPage - 1) * VOLUMES_PER_PAGE, currentPage * VOLUMES_PER_PAGE);
  const jumpToVolume = (id: string) => {
    const index = group.volumes.findIndex(volume => volume.id === id);
    if (index < 0) return;
    setSearch('');
    setPage(Math.floor(index / VOLUMES_PER_PAGE) + 1);
    setTargetId(id);
  };
  return <section aria-label={`${group.title} volumes`} className="catalog-volume-panel overflow-hidden rounded-2xl border border-gold/45 bg-cream/95 shadow-[0_16px_36px_rgba(62,32,18,.18)]">
    <div className="catalog-volume-panel-header">
      <div className="min-w-0"><p className="catalog-volume-eyebrow">Series collection</p><h3 className="font-display text-xl font-900 text-cream sm:text-2xl">{group.title}</h3><p className="mt-1 text-sm text-cream/75">{group.volumes.length} volumes · {group.author || 'Author not recorded'}</p></div>
      <button type="button" onClick={onClose} aria-label={`Close ${group.title} volumes`} className="catalog-volume-close"><XIcon className="h-4 w-4" aria-hidden="true" /> Close</button>
    </div>
    <div className="catalog-volume-panel-body">
      <div className="catalog-volume-toolbar">
        <label className="catalog-volume-search"><SearchIcon className="h-5 w-5 shrink-0 text-rust" aria-hidden="true" /><span className="sr-only">Find a volume in {group.title}</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setTargetId(null); }} placeholder="Find a volume by number or title" /></label>
        <label className="catalog-volume-jump"><span>Jump to</span><select value={targetId ?? ''} onChange={event => jumpToVolume(event.target.value)} aria-label={`Jump to a volume of ${group.title}`}><option value="" disabled>Choose volume</option>{group.volumes.map((volume, index) => <option key={volume.id} value={volume.id}>Volume {catalogVolumeNumber(volume) ?? index + 1}</option>)}</select></label>
      </div>
      <p aria-live="polite" className="catalog-volume-result-count">{needle ? `${matching.length} ${matching.length === 1 ? 'volume' : 'volumes'} found` : `Browse ${group.volumes.length} volumes · ${VOLUMES_PER_PAGE} at a time`}</p>
      {volumes.length ? <ul className="catalog-volume-grid">{volumes.map(volume => {
        const number = catalogVolumeNumber(volume);
        return <li key={volume.id} className={`catalog-volume-item reader-volume-card ${targetId === volume.id ? 'is-target' : ''}`}>
          <span className="catalog-volume-number" aria-label={number === null ? 'Volume number not recorded' : `Volume ${number}`}>{number === null ? '—' : String(number).padStart(2, '0')}</span>
          <div className="catalog-volume-item-main"><Cover volume={volume} compact /><div className="min-w-0"><p className="catalog-volume-item-kicker">{number === null ? 'Collection edition' : `Volume ${number}`}</p><h4 className="catalog-volume-item-title">{volume.title}</h4><span className={`reader-volume-card-status ${volume.copies < 0 ? 'is-locked' : volume.copies === 0 ? 'is-unavailable' : ''}`}>{volume.copies < 0 ? 'Sign in for availability' : volume.copies > 0 ? `${volume.copies} ${volume.copies === 1 ? 'copy' : 'copies'} available` : 'Ask staff'}</span></div></div>
          <div className="catalog-volume-item-actions"><button type="button" onClick={() => onSelect(volume)} className="catalog-volume-details">View details <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button>{!(session && volume.copies <= 0) && <button type="button" disabled={busy || isBorrowed(volume.id)} onClick={() => onStart(volume.id)} className="catalog-volume-read">{actionLabel(volume)}</button>}</div>
        </li>;
      })}</ul> : <div className="catalog-volume-empty"><BookOpenIcon className="h-7 w-7" aria-hidden="true" /><p>No volumes match “{search.trim()}”.</p><button type="button" onClick={() => { setSearch(''); setPage(1); setTargetId(null); }}>Show all volumes</button></div>}
      {pages > 1 && <nav aria-label={`${group.title} volume pages`} className="catalog-volume-pagination"><span>Showing {(currentPage - 1) * VOLUMES_PER_PAGE + 1}–{Math.min(currentPage * VOLUMES_PER_PAGE, matching.length)} of {matching.length}</span><div><button type="button" aria-label="Previous volumes" disabled={currentPage === 1} onClick={() => { setTargetId(null); setPage(value => value - 1); }}><ChevronLeftIcon className="h-4 w-4" /></button><span aria-live="polite">Page {currentPage} of {pages}</span><button type="button" aria-label="Next volumes" disabled={currentPage === pages} onClick={() => { setTargetId(null); setPage(value => value + 1); }}><ChevronRightIcon className="h-4 w-4" /></button></div></nav>}
    </div>
  </section>;
}

function Cover({ volume, compact = false, showStatus = true }: { volume: Volume; compact?: boolean; showStatus?: boolean }) {
  const { isBorrowed } = useGame();
  const plate = Array.isArray(volume.plate) && volume.plate.length ? volume.plate : [volume.title || 'Untitled book'];
  return <span className={`tb-book-cover relative block shrink-0 overflow-visible border-2 border-gold bg-cream p-[3px] shadow-[0_8px_20px_rgba(84,56,34,.11)] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_34px_rgba(84,56,34,.2)] ${compact ? 'h-16 w-11' : 'w-full'}`}><span className={`relative flex overflow-hidden ${compact ? 'h-full' : 'aspect-[3/4]'}`} style={{ backgroundColor: volume.plateColor }}>
    {volume.coverImage ? <img src={volume.coverImage} alt={`${volume.title} book cover`} loading="lazy" className="h-full w-full bg-cream object-contain" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} /> : <span className={`relative mt-auto block p-3 font-display font-900 uppercase leading-[1.05] ${compact ? 'text-[7px]' : 'text-base sm:text-lg'}`} style={{ color: volume.plateInk }}>{plate.map((line, index) => <span key={`${line}-${index}`} className="block">{line}</span>)}</span>}
    {!compact && <span aria-hidden="true" className="pointer-events-none absolute inset-2 border border-current opacity-25" style={{ color: volume.plateInk }} />}
    {!compact && showStatus && (isBorrowed(volume.id) || volume.copies === 0) && <span className={`absolute left-0 top-3 border-y border-r border-umber px-2 py-1 text-[8px] font-800 uppercase tracking-[.12em] ${isBorrowed(volume.id) ? 'bg-sun text-umber' : 'bg-cream text-rust'}`}>{isBorrowed(volume.id) ? 'On shelf' : 'Check staff'}</span>}
  </span></span>;
}
