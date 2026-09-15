import React, { useState } from 'react';
import { LayoutGroup } from 'framer-motion';
import { ArrowRightIcon, SwordsIcon } from 'lucide-react';
import { HeroReading } from '../components/HeroReading';
import { StatStrip } from '../components/StatStrip';
import { CommissionCard } from '../components/CommissionCard';
import { SectionHeading } from '../components/OrnatePanel';


import { useGame } from '../contexts/GameContext';
import { ParallaxCarousel } from '../components/ParallaxCarousel';
import { VolumeDrawer } from '../components/VolumeDrawer';
import type { Volume } from '../types/library';

export function Archive() {
  const { setSection, volumes, commissions } = useGame();
  const [activeArrivalIndex, setActiveArrivalIndex] = useState(0);
  const [openedBook, setOpenedBook] = useState<{ volume: Volume; image: string } | null>(null);
  const dailies = commissions.filter((item) => item.track === 'daily');
  const arrivals = volumes.slice(-8);
  const arrivalItems = arrivals.map((volume) => ({
    id: volume.id,
    title: volume.title,
    subtitle: 'READ IN LIBRARY',
    image: volume.coverImage ?? '/book-placeholder.svg',
    color: volume.plateColor,
    ink: volume.plateInk,
    author: volume.author,
    genre: volume.genre,
    rating: volume.rating,
    volume,
  }));

  return (
    <div className="space-y-10">
      {/*
      <section aria-labelledby="start-here" className="tb-cut border border-gold/45 bg-cream/75 p-5 shadow-plate sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-body text-[10px] font-800 uppercase tracking-[0.26em] text-gold">Tankobonbon library</p>
            <h1 id="start-here" className="mt-1 font-display text-[24px] font-900 uppercase text-umber">Start here</h1>
          </div>
          <p className="max-w-md font-body text-[13px] font-600 text-umber/60">Browse the collection, get help from BON, track your quests, or plan your library visit.</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction icon={LibraryBigIcon} label="Browse books" detail="Search the catalog" onClick={() => setSection('catalog')} />
          <QuickAction icon={BotIcon} label="Ask chatbot" detail="Talk to BON" onClick={() => window.dispatchEvent(new Event('tankobonbon:open-chat'))} />
          <QuickAction icon={SwordsIcon} label="View quests" detail="Open quest board" onClick={() => setSection('commissions')} />
          <QuickAction icon={UsersRoundIcon} label="Available seats" detail="Check study spaces" onClick={() => setSection('guide')} />
        </div>
        <button type="button" onClick={() => setSection('guide')} className="mt-4 inline-flex items-center gap-2 font-body text-[11px] font-800 uppercase tracking-[0.16em] text-rust hover:text-umber">
          <MapPinnedIcon aria-hidden="true" className="h-4 w-4 text-gold" />
          Tankobonbon directions <span className="text-umber/45">· planned guide</span>
        </button>
      </section>
      */}
      <HeroReading />
      <StatStrip />

      <section>
        <SectionHeading title="Today's commissions" meta="Available quests" />
        <ul className="mt-5 grid gap-4 lg:grid-cols-3">
          {dailies.map((commission) =>
          <li key={commission.id}>
              <CommissionCard commission={commission} />
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => setSection('commissions')}
          className="tb-cut-sm mt-4 inline-flex items-center gap-2 border border-gold/60 bg-parch/25 px-5 py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.16em] text-umber transition-colors duration-150 ease-out hover:bg-parch/70">
          
          <SwordsIcon aria-hidden="true" className="h-4 w-4 text-gold" />
          Open the full board
          <ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </section>

      <section className="min-w-0">
          <SectionHeading title="New arrivals" meta="Fresh in the stacks" />
          <div className="mt-5 overflow-hidden border-y border-gold/30 bg-cream/40 px-2 py-4 sm:px-4">
            <LayoutGroup>
              <ParallaxCarousel
                items={arrivalItems}
                activeIndex={activeArrivalIndex}
                onActiveChange={setActiveArrivalIndex}
                onOpen={(item) => setOpenedBook({ volume: item.volume, image: item.image })} />
              <VolumeDrawer volume={openedBook?.volume ?? null} coverImage={openedBook?.image} onClose={() => setOpenedBook(null)} />
            </LayoutGroup>
          </div>
      </section>
    </div>);

}
