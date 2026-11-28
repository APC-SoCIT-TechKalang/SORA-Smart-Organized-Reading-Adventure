import { useEffect, useState, type ReactNode } from 'react';
import { BookOpenIcon } from 'lucide-react';
import { HeroReading } from '../components/HeroReading';
import { StatStrip } from '../components/StatStrip';
import { arrivalCover, NewArrivals } from '../components/NewArrivals';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';

export function Archive({ hero, guest = false }: { hero?: ReactNode; guest?: boolean }) {
  const { volumes, setSection } = useGame();
  const [activeArrivalIndex, setActiveArrivalIndex] = useState(0);
  const [openedBook, setOpenedBook] = useState<Volume | null>(null);
  const arrivalItems = guest ? [...volumes].sort((a, b) => (Date.parse(b.addedAt ?? '') || 0) - (Date.parse(a.addedAt ?? '') || 0) || Number(b.id) - Number(a.id)).slice(0, 8) : volumes.slice(-8);

  useEffect(() => {
    if (!arrivalItems.length) {
      setActiveArrivalIndex(0);
      setOpenedBook(null);
      return;
    }
    if (activeArrivalIndex >= arrivalItems.length) setActiveArrivalIndex(arrivalItems.length - 1);
    if (openedBook && !volumes.some((volume) => volume.id === openedBook.id)) setOpenedBook(null);
  }, [activeArrivalIndex, arrivalItems.length, openedBook, volumes]);

  return (
    <div className="space-y-8 sm:space-y-10">
      {hero ?? <HeroReading />}
      {!guest && <StatStrip />}
      <section className="reader-arrival-section" aria-labelledby="new-arrivals-title">
        <header className="reader-arrival-heading">
          <BookOpenIcon aria-hidden="true" />
          <h2 id="new-arrivals-title">New arrivals</h2>
        </header>
        <div className="mt-4">
          {arrivalItems.length ? (
            <>
              <NewArrivals books={arrivalItems} activeIndex={Math.min(activeArrivalIndex, arrivalItems.length - 1)} onSelect={setActiveArrivalIndex} onOpen={setOpenedBook} />
              <VolumeDrawer volume={openedBook} coverImage={openedBook ? arrivalCover(openedBook) : undefined} onClose={() => setOpenedBook(null)} />
            </>
          ) : (
            <div className="tb-cut border border-dashed border-gold/45 bg-cream/50 px-6 py-14 text-center"><BookOpenIcon aria-hidden="true" className="mx-auto h-9 w-9 text-gold" /><h3 className="mt-5 font-display text-[22px] font-700 uppercase text-umber">The stacks are being prepared</h3><p className="mx-auto mt-3 max-w-md text-[15px] font-600 leading-6 text-umber/60">New arrivals will appear here as soon as the catalog is available.</p><button type="button" onClick={() => setSection('catalog')} className="tb-cut-sm mt-6 border border-gold/55 bg-cream px-5 py-3 font-display text-xs font-800 uppercase tracking-[.12em] text-umber transition hover:bg-parch/45">Open catalog</button></div>
          )}
        </div>
      </section>
    </div>
  );
}
