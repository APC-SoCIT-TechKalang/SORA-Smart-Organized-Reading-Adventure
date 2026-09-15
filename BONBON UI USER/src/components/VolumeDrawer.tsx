import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpenIcon, CalendarDaysIcon, Layers3Icon, StarIcon, XIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { useGame } from '../contexts/GameContext';

const EASE = [0.23, 1, 0.32, 1] as const;

interface VolumeDrawerProps {
  volume: Volume | null;
  coverImage?: string;
  onClose: () => void;
}

export function VolumeDrawer({ volume, coverImage, onClose }: VolumeDrawerProps) {
  coverImage = coverImage ?? volume?.coverImage;
  const { borrow, isBorrowed, setSection, busy } = useGame();

  useEffect(() => {
    if (!volume) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [volume, onClose]);

  return createPortal(<AnimatePresence>
    {volume ? <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <motion.button type="button" aria-label="Close volume details" onClick={onClose} className="absolute inset-0 bg-umber/72 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.aside role="dialog" aria-modal="true" aria-label={`${volume.title} details`} initial={{ opacity: 0, y: 26, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ duration: 0.32, ease: EASE }} className="tb-scroll relative z-10 max-h-[92dvh] w-full max-w-[980px] overflow-y-auto border-2 border-gold bg-cream shadow-[0_28px_75px_rgba(30,17,8,.42)]">
        <div className="flex items-center justify-between border-b border-gold/40 bg-umber px-5 py-3">
          <span className="font-display text-[12px] font-700 uppercase tracking-[0.18em] text-sand">Book details</span>
          <button type="button" onClick={onClose} aria-label="Close book details" className="flex h-8 w-8 items-center justify-center text-sand/70 transition-colors hover:bg-sand/10 hover:text-sun"><XIcon aria-hidden="true" className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-7 p-5 sm:p-8 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="mx-auto w-[180px] md:mx-0 md:w-[220px]">
            {coverImage ? <motion.div layoutId={`volume-cover-${volume.id}`} transition={{ type: 'spring', stiffness: 330, damping: 30 }} className="overflow-hidden border-[3px] border-gold bg-umber p-[4px] shadow-[0_16px_28px_rgba(84,56,34,.25)]"><img src={coverImage} alt={`${volume.title} cover`} className="aspect-[3/4] w-full object-cover" /></motion.div> : <div className="border-[3px] border-gold bg-umber p-[4px] shadow-[0_16px_28px_rgba(84,56,34,.25)]"><div className="flex aspect-[3/4] flex-col justify-end p-4" style={{ backgroundColor: volume.plateColor }}><span className="font-display text-[22px] font-900 uppercase leading-tight" style={{ color: volume.plateInk }}>{volume.plate.map((line) => <span key={line} className="block">{line}</span>)}</span></div></div>}
            <p className="mt-4 text-center font-body text-[10px] font-800 uppercase tracking-[0.2em] text-gold">Tankobonbon collection</p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-body text-[10px] font-800 uppercase tracking-[0.24em] text-gold"><span>{volume.genre} · Volume {volume.volume}</span><span className={`book-status ${volume.copies > 0 ? 'is-available' : 'is-loan'}`}>{volume.copies < 0 ? 'Sign in for availability' : volume.copies > 0 ? 'Available' : 'Ask staff'}</span></div>
            <h2 className="mt-2 font-display text-[30px] font-900 uppercase leading-[1.05] text-umber sm:text-[38px]">{volume.title}</h2>
            <p className="mt-2 font-body text-[15px] font-600 text-umber/65">by {volume.author}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge icon={<StarIcon aria-hidden="true" className="h-3.5 w-3.5 fill-sun text-sun" />} label={volume.rating ? `${volume.rating} reader rating` : 'Not rated'} />
              <Badge icon={<Layers3Icon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />} label={volume.chapters ? `${volume.chapters} chapters` : 'Chapter count not recorded'} />
              <Badge icon={<CalendarDaysIcon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />} label="Collection edition" />
            </div>
            <div className="book-record mt-6">
              <div className="book-record-heading"><span>Publication record</span><span>Tankobonbon archive</span></div>
              <BookRow label="Release" value="Collection record pending" />
              <BookRow label="ISBN" value={volume.isbn ?? "Not recorded"} />
              <BookRow label="Original title" value={volume.originalTitle ?? "Not recorded"} />
              <BookRow label="Romanized title" value={volume.title} />
              <BookRow label="Author / Contributor" value={volume.author} />
              <BookRow label="Publisher" value={volume.publisher ?? "Not recorded"} />
              <BookRow label="Imprint" value="Manga library edition" />
              <BookRow label="Demography" value={volume.genre} />
              <BookRow label="Genres" value={volume.genre} />
              <BookRow label="Volume / Chapters" value={`Volume ${volume.volume} · ${volume.chapters} chapters`} />
              <BookRow label="Shelf availability" value={volume.copies > 0 ? `${volume.copies} copies available` : 'All copies on loan'} />
            </div>
            <div className="mt-5 border border-gold/35 bg-parch/15 p-4"><p className="font-body text-[10px] font-800 uppercase tracking-[0.2em] text-gold">Description</p><p className="mt-2 font-body text-[14px] font-600 leading-relaxed text-umber/75">{volume.synopsis}</p></div>
            <div className="mt-7 flex flex-wrap gap-3 border-t border-gold/30 pt-5">
              <button type="button" onClick={() => { void borrow(volume.id); onClose(); setSection('shelf'); }} className="tb-cut-sm inline-flex items-center justify-center gap-2 border border-gold bg-rust px-5 py-3 font-display text-[12px] font-700 uppercase tracking-[0.16em] text-sand transition-colors hover:bg-umber"><BookOpenIcon aria-hidden="true" className="h-4 w-4" />{isBorrowed(volume.id) ? 'On your shelf' : busy ? 'Saving…' : 'Start reading in library'}</button>
              <button type="button" onClick={onClose} className="tb-cut-sm border border-gold/55 bg-parch/20 px-5 py-3 font-display text-[12px] font-700 uppercase tracking-[0.16em] text-umber transition-colors hover:bg-parch/45">Back to arrivals</button>
            </div>
          </div>
        </div>
      </motion.aside>
    </motion.div> : null}
  </AnimatePresence>, document.body);
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 border border-gold/40 bg-parch/15 px-2.5 py-1.5 font-body text-[11px] font-700 text-umber/70">{icon}{label}</span>;
}

function BookRow({ label, value }: { label: string; value: string }) {
  return <div className="book-record-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="tb-cut-sm border border-gold/40 bg-parch/15 px-3 py-2.5"><dt className="font-body text-[9px] font-800 uppercase tracking-[0.15em] text-gold">{label}</dt><dd className="mt-1 truncate font-display text-[13px] font-700 text-umber">{value}</dd></div>;
}
