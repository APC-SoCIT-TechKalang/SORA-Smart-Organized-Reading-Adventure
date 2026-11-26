import { useEffect, useState } from 'react';
import { LayoutGroup } from 'framer-motion';
import { BookOpenIcon } from 'lucide-react';
import { HeroReading } from '../components/HeroReading';
import { StatStrip } from '../components/StatStrip';
import { SectionHeading } from '../components/OrnatePanel';
import { ParallaxCarousel } from '../components/ParallaxCarousel';
import { VolumeDrawer } from '../components/VolumeDrawer';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';

export function Archive() {
  const { volumes, setSection } = useGame();
  const [activeArrivalIndex, setActiveArrivalIndex] = useState(0);
  const [openedBook, setOpenedBook] = useState<{ volume: Volume; image: string } | null>(null);
  const arrivalItems = volumes.slice(-8).map((volume) => ({
    id: volume.id,
    title: volume.title,
    subtitle: 'Read in library',
    image: volume.coverImage ?? '/book-placeholder.svg',
    color: '#f3d793',
    ink: volume.plateInk,
    author: volume.author,
    genre: volume.genre,
    rating: volume.rating,
    volume,
  }));

  useEffect(() => {
    if (!arrivalItems.length) {
      setActiveArrivalIndex(0);
      setOpenedBook(null);
      return;
    }
    if (activeArrivalIndex >= arrivalItems.length) setActiveArrivalIndex(arrivalItems.length - 1);
    if (openedBook && !volumes.some((volume) => volume.id === openedBook.volume.id)) setOpenedBook(null);
  }, [activeArrivalIndex, arrivalItems.length, openedBook, volumes]);

  return (
    <div className="space-y-8 sm:space-y-10">
      <HeroReading />
      <StatStrip />
      <section className="min-w-0">
        <SectionHeading title="New arrivals" meta="Fresh in the stacks" />
        <div className="arrival-spotlight-shell mt-5">
          {arrivalItems.length ? (
            <LayoutGroup>
              <ParallaxCarousel items={arrivalItems} activeIndex={activeArrivalIndex} onActiveChange={setActiveArrivalIndex} onOpen={(item) => setOpenedBook({ volume: item.volume, image: item.image })} />
              <VolumeDrawer volume={openedBook?.volume ?? null} coverImage={openedBook?.image} onClose={() => setOpenedBook(null)} />
            </LayoutGroup>
          ) : (
            <div className="tb-cut border border-dashed border-gold/45 bg-cream/50 px-6 py-14 text-center"><BookOpenIcon aria-hidden="true" className="mx-auto h-9 w-9 text-gold" /><h3 className="mt-5 font-display text-[22px] font-700 uppercase text-umber">The stacks are being prepared</h3><p className="mx-auto mt-3 max-w-md text-[15px] font-600 leading-6 text-umber/60">New arrivals will appear here as soon as the catalog is available.</p><button type="button" onClick={() => setSection('catalog')} className="tb-cut-sm mt-6 border border-gold/55 bg-cream px-5 py-3 font-display text-xs font-800 uppercase tracking-[.12em] text-umber transition hover:bg-parch/45">Open catalog</button></div>
          )}
        </div>
      </section>
    </div>
  );
}
