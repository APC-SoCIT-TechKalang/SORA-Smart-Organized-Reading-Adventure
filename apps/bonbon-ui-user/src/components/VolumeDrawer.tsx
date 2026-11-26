import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpenIcon, CalendarDaysIcon, Layers3Icon, StarIcon, XIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { useGame } from '../contexts/GameContext';

import { ShelfLocation } from './ShelfLocation';

const EASE = [0.23, 1, 0.32, 1] as const;

interface VolumeDrawerProps {
  volume: Volume | null;
  coverImage?: string;
  onClose: () => void;
}

export function VolumeDrawer({ volume, coverImage, onClose }: VolumeDrawerProps) {
  const image = coverImage ?? volume?.coverImage;
  const { borrow, isBorrowed, setSection, busy, session } = useGame();

  useEffect(() => {
    if (!volume) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); };
  }, [volume, onClose]);

  const startReading = () => {
    if (!volume) return;
    if (!session) {
      onClose();
      window.dispatchEvent(new Event('tankobonbon:open-auth'));
      return;
    }
    void borrow(volume.id);
    onClose();
    setSection('shelf');
  };

  return createPortal(
    <AnimatePresence>
      {volume && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <motion.button type="button" aria-label="Close volume details" onClick={onClose} className="absolute inset-0 bg-umber/70 backdrop-blur-md" />
          <motion.aside role="dialog" aria-modal="true" aria-labelledby="volume-title" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} transition={{ duration: 0.28, ease: EASE }} className="tb-scroll relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-[860px] overflow-y-auto rounded-t-2xl border border-gold/45 bg-cream pb-[env(safe-area-inset-bottom)] shadow-[0_28px_75px_rgba(30,17,8,.42)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:pb-0">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold/30 bg-umber px-5 py-3 text-sand"><span className="font-display text-xs font-700 uppercase tracking-[.14em]">Book details</span><button type="button" onClick={onClose} aria-label="Close book details" className="flex h-10 w-10 items-center justify-center rounded-full text-sand/70 transition hover:bg-sand/10 hover:text-sun"><XIcon aria-hidden="true" className="h-5 w-5" /></button></div>

            <div className="grid gap-4 p-4 min-[390px]:p-5 sm:gap-5 sm:p-6 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="mx-auto w-[132px] min-[390px]:w-[150px] sm:w-[170px] md:mx-0 md:w-[200px]">
                <div className="overflow-hidden border-[3px] border-gold bg-umber p-1 shadow-[0_16px_28px_rgba(84,56,34,.22)]">
                  {image ? <img src={image} alt={`${volume.title} cover`} className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] flex-col justify-end p-4" style={{ backgroundColor: volume.plateColor }}><span className="font-display text-xl font-900 uppercase leading-tight" style={{ color: volume.plateInk }}>{volume.plate.map((line) => <span key={line} className="block">{line}</span>)}</span></div>}
                </div>
                <p className="mt-4 text-center text-[9px] font-800 uppercase tracking-[.18em] text-gold">Tankobonbon collection</p>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="tb-eyebrow">{volume.genre} · Volume {volume.volume}</span><span className={`book-status text-[9px] font-800 uppercase ${volume.copies > 0 ? 'is-available' : 'is-loan'}`}>{volume.copies < 0 ? 'Sign in for availability' : volume.copies > 0 ? 'Available' : 'Ask staff'}</span></div>
                <h2 id="volume-title" className="mt-2 font-display text-2xl font-900 leading-tight text-umber sm:text-3xl">{volume.title}</h2>
                <p className="mt-2 text-sm font-600 text-umber/60">by {volume.author}</p>

                <div className="mt-5 flex flex-wrap gap-2"><Badge icon={<StarIcon aria-hidden="true" className="h-3.5 w-3.5 fill-sun text-sun" />} label={volume.rating ? `${volume.rating} reader rating` : 'Not rated'} /><Badge icon={<Layers3Icon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />} label={volume.chapters ? `${volume.chapters} chapters` : 'Chapter count pending'} /><Badge icon={<CalendarDaysIcon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />} label="Collection edition" /></div>

                <div className="book-record mt-6 rounded-lg"><div className="book-record-heading"><span>Publication record</span><span>Archive</span></div><BookRow label="ISBN" value={volume.isbn ?? 'Not recorded'} /><BookRow label="Original title" value={volume.originalTitle ?? 'Not recorded'} /><BookRow label="Author" value={volume.author} /><BookRow label="Publisher" value={volume.publisher ?? 'Not recorded'} /><BookRow label="Genre" value={volume.genre} /><BookRow label="Volume / chapters" value={`Volume ${volume.volume} · ${volume.chapters} chapters`} /><BookRow label="Availability" value={volume.copies < 0 ? 'Sign in to check availability' : volume.copies > 0 ? `${volume.copies} copies available` : 'No copies currently available — Please ask staff'} /><ShelfLocation copies={volume.physicalCopies} /></div>
                <div className="mt-5 rounded-lg border border-gold/25 bg-parch/15 p-4"><p className="tb-eyebrow">About this title</p><p className="mt-2 text-sm font-600 leading-6 text-umber/70">{volume.synopsis}</p></div>

                <div className="mt-6 grid gap-2.5 border-t border-gold/25 pt-5 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap sm:gap-3">
                  <button type="button" disabled={busy || isBorrowed(volume.id) || Boolean(session && volume.copies <= 0)} onClick={startReading} className="tb-button-primary tb-cut-sm px-5 py-3 font-display text-xs uppercase tracking-[.1em]"><BookOpenIcon aria-hidden="true" className="h-4 w-4" />{!session ? 'Sign in to read' : isBorrowed(volume.id) ? 'On your shelf' : busy ? 'Saving…' : volume.copies > 0 ? 'Start reading' : 'Ask staff'}</button>
                  <button type="button" onClick={onClose} className="tb-button-secondary tb-cut-sm px-5 py-3 font-display text-xs uppercase tracking-[.1em]">Back to catalog</button>
                </div>
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
