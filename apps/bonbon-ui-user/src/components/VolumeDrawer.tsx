import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpenIcon, Layers3Icon, LockKeyholeIcon, MapPinIcon, StarIcon, XIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { catalogVolumeNumber } from '../lib/catalog-series';
import { splitCatalogGenres } from '../lib/catalog-genres';
import { useGame } from '../contexts/GameContext';

import { ShelfLocation } from './ShelfLocation';
import './catalog-readability.css';

const EASE = [0.23, 1, 0.32, 1] as const;

interface VolumeDrawerProps {
  volume: Volume | null;
  coverImage?: string;
  onClose: () => void;
}

export function VolumeDrawer({ volume, coverImage, onClose }: VolumeDrawerProps) {
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const image = coverImage ?? volume?.coverImage;
  const volumeNumber = volume ? catalogVolumeNumber(volume) : null;
  const genreParts = volume ? splitCatalogGenres(volume.genre) : [];
  const topicParts = volume ? splitCatalogGenres(volume.themes ?? '') : [];
  const isClassification = (part: string) => /^(?:\d|[a-z]+\s*[:/]|[a-z]+\d|(?:isbn|ddc|lcc)\b)/i.test(part);
  const displayTags = [...new Set([...genreParts, ...topicParts].filter(part => !isClassification(part)))];
  const classifications = genreParts.filter(isClassification);
  const { borrow, isBorrowed, setSection, busy, session } = useGame();

  useEffect(() => {
    if (!volume?.id) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[aria-label="Close book details"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [volume?.id]);

  const startReading = () => {
    if (!volume) return;
    if (!session) {
      onClose();
      window.dispatchEvent(new CustomEvent('tankobonbon:open-auth', { detail: { volumeId: volume.id } }));
      return;
    }
    void borrow(volume.id);
    onClose();
    setSection('shelf');
  };

  return createPortal(
    <AnimatePresence>
      {volume && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reducedMotion ? undefined : { opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
          <motion.button type="button" aria-label="Close volume details" onClick={onClose} className="absolute inset-0 bg-umber/70 backdrop-blur-md" />
          <motion.aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="volume-title" initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.28, ease: EASE }} className="reader-book-details tb-scroll relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-[900px] overflow-y-auto rounded-t-2xl border border-gold/45 bg-cream pb-[env(safe-area-inset-bottom)] shadow-[0_28px_75px_rgba(30,17,8,.42)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:pb-0">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold/30 bg-umber px-5 py-3 text-sand"><span className="font-display text-xs font-700 uppercase tracking-[.14em]">Book details</span><button type="button" onClick={onClose} aria-label="Close book details" className="flex h-10 w-10 items-center justify-center rounded-full text-sand/70 transition hover:bg-sand/10 hover:text-sun"><XIcon aria-hidden="true" className="h-5 w-5" /></button></div>

            <div className="reader-detail-layout">
              <div className="reader-detail-hero">
                <div className="reader-detail-cover">
                  <div className="overflow-hidden border-[3px] border-gold bg-umber p-1 shadow-[0_16px_28px_rgba(10,5,2,.36)]">
                    {image ? <img src={image} alt={`${volume.title} cover`} className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] flex-col justify-end p-4" style={{ backgroundColor: volume.plateColor }}><span className="font-display text-xl font-900 uppercase leading-tight" style={{ color: volume.plateInk }}>{volume.plate.map((line) => <span key={line} className="block">{line}</span>)}</span></div>}
                  </div>
                  <p className="reader-detail-cover-caption">Tankobonbon collection</p>
                </div>
                <div className="reader-detail-intro">
                  <p className="reader-detail-eyebrow">Discover the story</p>
                  {volumeNumber != null && <p className="reader-volume-label">Volume {volumeNumber}</p>}
                  <h2 id="volume-title" className="reader-title-plate">{volume.title}</h2>
                  <p className="reader-author-plate">by {volume.author || 'Author not recorded'}</p>
                  <div className={`reader-availability ${volume.copies < 0 ? 'reader-availability-locked' : volume.copies > 0 ? 'reader-availability-ready' : 'reader-availability-unavailable'}`}>
                    {volume.copies < 0 ? <LockKeyholeIcon aria-hidden="true" /> : <MapPinIcon aria-hidden="true" />}
                    <span>{volume.copies < 0 ? 'Sign in to check availability and shelf location' : volume.copies > 0 ? `${volume.copies} ${volume.copies === 1 ? 'copy' : 'copies'} available in the library` : 'No copies available right now. Please ask staff.'}</span>
                  </div>

                  {displayTags.length > 0 && <section className="reader-detail-tags" aria-label="Genres and subjects">{displayTags.map(tag => <span key={tag}>{tag}</span>)}</section>}
                  <div className="reader-detail-actions">
                    <button type="button" disabled={busy || isBorrowed(volume.id) || Boolean(session && volume.copies <= 0)} onClick={startReading} className="tb-button-primary tb-cut-sm px-5 py-3 font-display text-xs uppercase tracking-[.1em]"><BookOpenIcon aria-hidden="true" className="h-4 w-4" />{!session ? 'Sign in to read' : isBorrowed(volume.id) ? 'On your shelf' : busy ? 'Saving…' : volume.copies > 0 ? 'Start reading' : 'Ask staff'}</button>
                    <button type="button" onClick={onClose} className="tb-button-secondary tb-cut-sm px-5 py-3 font-display text-xs uppercase tracking-[.1em]">Back to catalog</button>
                  </div>
                </div>
              </div>
              <div className="reader-detail-body">
                <div className="reader-detail-badges"><Badge icon={<StarIcon aria-hidden="true" />} label={volume.rating ? `${volume.rating} reader rating` : 'Not rated'} /><Badge icon={<Layers3Icon aria-hidden="true" />} label={volume.chapters ? `${volume.chapters} chapters` : 'Chapter count pending'} /></div>
                {volume.synopsis && <section className="reader-detail-synopsis"><h3>About this title</h3><p>{volume.synopsis}</p></section>}
                <section className="book-record reader-publication-record" aria-labelledby="publication-heading"><h3 id="publication-heading" className="book-record-heading">Publication record</h3><dl><BookRow label="ISBN" value={volume.isbn || 'Not recorded'} /><BookRow label="Original title" value={volume.originalTitle || 'Not recorded'} /><BookRow label="Author" value={volume.author || 'Not recorded'} /><BookRow label="Publisher" value={volume.publisher || 'Not recorded'} /><BookRow label="Genre" value={volume.genre || 'Not recorded'} /><BookRow label="Volume / chapters" value={`${volumeNumber != null ? `Volume ${volumeNumber}` : 'Volume not recorded'} · ${volume.chapters ? `${volume.chapters} chapters` : 'Chapter count pending'}`} /><BookRow label="Availability" value={volume.copies < 0 ? 'Sign in to check availability' : volume.copies > 0 ? `${volume.copies} copies available` : 'No copies currently available — Please ask staff'} /><ShelfLocation copies={volume.physicalCopies} />{classifications.length > 0 && <BookRow label="Catalog classification" value={classifications.join(', ')} />}</dl></section>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Badge({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-parch/15 px-2.5 py-1.5 text-[11px] font-700 text-umber/65">{icon}{label}</span>;
}

function BookRow({ label, value }: { label: string; value: string }) {
  return <div className="book-record-row"><dt>{label}</dt><dd>{value}</dd></div>;
}
