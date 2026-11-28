import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpenIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { catalogVolumeNumber, type CatalogSeries } from '../lib/catalog-series';
import { formatOf, genreOptions, subjectOptions } from '../lib/catalog-filters';
import { useGame } from '../contexts/GameContext';

interface CatalogGridProps {
  items: CatalogSeries[];
  layout: 'grid' | 'list';
  expandedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (volume: Volume) => void;
}

const VOLUMES_PER_PAGE = 8;

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
      <span className={compact ? 'min-w-0' : 'block min-w-0'}><span className="mt-3 block font-display text-sm font-800 leading-snug text-umber sm:text-[15px]">{group.title}</span>
        <span className="mt-1 block text-[11px] font-600 text-umber/65 sm:text-xs">{group.author}</span>
        <span className="mt-2 flex flex-wrap gap-1"><span className="rounded-full bg-parch/50 px-2 py-1 text-[10px] font-800 text-rust">{formatOf(group.cover)}</span>{genreOptions(group.volumes).slice(0,2).map(tag => <span key={tag} className="rounded-full bg-parch/30 px-2 py-1 text-[10px] text-umber/70">{tag}</span>)}{subjectOptions(group.volumes).slice(0,1).map(tag => <span key={tag} className="rounded-full bg-parch/30 px-2 py-1 text-[10px] text-umber/70">{tag}</span>)}</span>
        <span className="mt-2 block text-[11px] font-700 text-umber/65">{series ? `${group.volumes.length} volumes · ` : ''}{group.copies < 0 ? 'Sign in for availability' : `${group.copies} ${group.copies === 1 ? 'copy' : 'copies'} available`}</span>
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
  const pages = Math.ceil(group.volumes.length / VOLUMES_PER_PAGE);
  const volumes = group.volumes.slice((page - 1) * VOLUMES_PER_PAGE, page * VOLUMES_PER_PAGE);
  return <section aria-label={`${group.title} volumes`} className="rounded-xl border border-gold/45 bg-cream/95 p-3 shadow-[0_12px_28px_rgba(84,56,34,.12)] sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/25 pb-3"><div><h3 className="font-display text-lg font-900 text-umber">{group.title}</h3><p className="text-xs font-700 text-umber/60">{group.volumes.length} volumes in the collection</p></div><button type="button" onClick={onClose} aria-label={`Close ${group.title} volumes`} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-800 text-rust hover:bg-parch/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"><XIcon className="h-4 w-4" aria-hidden="true" /> Close</button></div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-umber/70"><span>Volumes {(page - 1) * VOLUMES_PER_PAGE + 1}–{Math.min(page * VOLUMES_PER_PAGE, group.volumes.length)} of {group.volumes.length}</span>{pages > 1 && <label className="flex items-center gap-2">Jump to volume<select aria-label={`Jump to a ${group.title} volume`} value="" onChange={event => setPage(Math.floor(Number(event.target.value) / VOLUMES_PER_PAGE) + 1)} className="tb-input max-w-40 rounded-lg px-2 py-1 text-xs"><option value="" disabled>Choose volume</option>{group.volumes.map((item, index) => <option key={item.id} value={index}>Volume {catalogVolumeNumber(item) ?? index + 1}</option>)}</select></label>}</div>
    <ul className="catalog-volume-grid mt-3 grid gap-2">{volumes.map(volume => <li key={volume.id} className="flex min-w-0 flex-col rounded-lg border border-gold/25 bg-white/55 p-2.5"><button type="button" onClick={() => onSelect(volume)} aria-label={`View ${volume.title} details`} className="flex min-h-16 min-w-0 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"><Cover volume={volume} compact /><span className="flex min-w-0 flex-1 flex-col"><strong className="line-clamp-2 font-display text-xs font-800 text-umber">{volume.title}</strong><span className="mt-1 text-[11px] text-umber/60">Volume {catalogVolumeNumber(volume) ?? '—'}</span><span className="mt-1 text-[11px] font-700 text-gold">{volume.copies < 0 ? 'Sign in for availability' : volume.copies > 0 ? `${volume.copies} available` : 'Ask staff'}</span></span></button>{!(session && volume.copies <= 0) && <button type="button" disabled={busy || isBorrowed(volume.id)} onClick={() => onStart(volume.id)} className="mt-2 min-h-11 border-t border-gold/20 pt-2 text-left text-xs font-800 text-rust underline underline-offset-2 disabled:opacity-50">{actionLabel(volume)}</button>}</li>)}</ul>
    {pages > 1 && <nav aria-label={`${group.title} volume pages`} className="mt-4 flex items-center justify-end gap-2 text-xs font-700 text-umber"><button type="button" aria-label="Previous volumes" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="grid h-11 w-11 place-items-center rounded-lg border border-gold/35 disabled:opacity-40"><ChevronLeftIcon className="h-4 w-4" /></button><span>{page} / {pages}</span><button type="button" aria-label="Next volumes" disabled={page === pages} onClick={() => setPage(value => value + 1)} className="grid h-11 w-11 place-items-center rounded-lg border border-gold/35 disabled:opacity-40"><ChevronRightIcon className="h-4 w-4" /></button></nav>}
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
