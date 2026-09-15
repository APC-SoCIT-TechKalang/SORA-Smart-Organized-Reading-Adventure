import React from 'react';
import { motion } from 'framer-motion';
import { BookmarkIcon, CheckCircle2Icon, PlayIcon } from 'lucide-react';
import { OrnatePanel } from './OrnatePanel';
import { useGame } from '../contexts/GameContext';
import { volumeById } from '../data/manga';

const HERO_ART = "/6e74d0b1-981c-4e24-a41f-0448d6db3ac7.jpg";


export function HeroReading() {
  const { borrowed, logSession, giveBack, setSection } = useGame();
  const active = borrowed[0];
  const volume = active ? volumeById(active.volumeId) : undefined;

  if (!active || !volume) {
    return (
      <OrnatePanel as="section" className="tb-cut">
        <div className="flex flex-col items-start gap-4 p-9">
          <h1 className="font-display text-[32px] font-900 uppercase text-umber">
            Your shelf is empty
          </h1>
          <p className="max-w-[420px] font-body text-[14px] font-600 text-umber/65">
            Head to the catalog and borrow a volume to start a new reading run.
          </p>
          <button
            type="button"
            onClick={() => setSection('catalog')}
            className="tb-cut-sm border border-gold bg-rust px-6 py-3 font-display text-[13px] font-700 uppercase tracking-[0.16em] text-sand transition-colors duration-150 ease-out hover:bg-umber">
            
            Open the catalog
          </button>
        </div>
      </OrnatePanel>);

  }

  return (
    <OrnatePanel as="section" className="tb-cut reading-panel overflow-hidden">
      <div
        aria-hidden="true"
        className="reading-live-bg"
        style={{ backgroundImage: `url(${HERO_ART})` }} />
      <div aria-hidden="true" className="reading-live-orbit reading-live-orbit-one" />
      <div aria-hidden="true" className="reading-live-orbit reading-live-orbit-two" />
      <div aria-hidden="true" className="reading-live-glow" />
      <div aria-hidden="true" className="reading-sweep" />
      <div aria-hidden="true" className="reading-embers">
        {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
      </div>
      <div className="grid gap-8 p-7 md:grid-cols-[1fr_240px] md:p-9">
        <div className="flex min-w-0 flex-col">
          <span className="inline-flex w-fit items-center gap-2 border border-gold/60 bg-parch/40 px-3 py-1">
            <span aria-hidden="true" className="h-[7px] w-[7px] rotate-45 bg-rust" />
            <span className="font-body text-[10px] font-800 uppercase tracking-[0.3em] text-gold">
              Currently reading
            </span>
          </span>

          <h1 className="mt-4 font-display text-[40px] font-900 uppercase leading-[1.02] tracking-[0.02em] text-umber md:text-[52px]">
            {volume.title}
            <span className="block text-rust">Vol. {volume.volume}</span>
          </h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[15px] font-600 text-umber/70">
            <span>{volume.chapters} chapters</span>
            <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-gold" />
            <span>due in {active.dueInDays} days</span>
            <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-gold" />
            <span>{volume.author}</span>
          </p>
          <p className="reading-kicker">A new chapter begins · keep the journey moving</p>

          <div className="mt-7 max-w-[430px]">
            <div className="flex items-baseline justify-between font-body text-[11px] font-800 uppercase tracking-[0.24em]">
              <span className="text-gold">Volume progress</span>
              <span className="font-display text-[15px] tracking-normal text-umber">
                {active.progress}%
              </span>
            </div>
            <div className="mt-2 h-[10px] border border-gold/60 bg-parch/40 p-[2px]">
              <motion.div
                className="h-full bg-rust"
                animate={{ width: `${active.progress}%` }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} />
              
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-3 pt-8">
            <button
              type="button"
              onClick={() => logSession(active.volumeId)}
              className="tb-cut-sm inline-flex items-center gap-2 border border-gold bg-rust px-6 py-3 font-display text-[13px] font-700 uppercase tracking-[0.16em] text-sand transition-colors duration-150 ease-out hover:bg-umber">
              
              <PlayIcon aria-hidden="true" className="h-4 w-4" />
              Read a session
            </button>
            <button
              type="button"
              onClick={() => setSection('shelf')}
              className="tb-cut-sm inline-flex items-center gap-2 border border-gold/60 bg-parch/30 px-5 py-3 font-display text-[13px] font-700 uppercase tracking-[0.16em] text-umber transition-colors duration-150 ease-out hover:bg-parch/70">
              
              <BookmarkIcon aria-hidden="true" className="h-4 w-4" />
              My shelf
            </button>
            <button
              type="button"
              onClick={() => giveBack(active.volumeId)}
              className="tb-cut-sm inline-flex items-center gap-2 border border-gold/60 bg-parch/30 px-5 py-3 font-display text-[13px] font-700 uppercase tracking-[0.16em] text-umber transition-colors duration-150 ease-out hover:bg-parch/70">
              
              <CheckCircle2Icon aria-hidden="true" className="h-4 w-4" />
              Finish & return
            </button>
          </div>
        </div>

        <div className="reading-cover relative mx-auto w-[200px] md:w-full">
          <div className="relative border-[3px] border-gold bg-umber p-[3px]">
            <img
              src={HERO_ART}
              alt={`Cover art for ${volume.title} volume ${volume.volume}`}
              className="h-[300px] w-full object-cover md:h-[330px]" />
            
            <span className="absolute -right-3 -top-3 flex h-10 w-10 rotate-45 items-center justify-center border border-umber bg-sun">
              <span className="-rotate-45 font-display text-[13px] font-900 text-umber">
                {volume.volume}
              </span>
            </span>
          </div>
          <p className="mt-3 text-center font-body text-[11px] font-800 uppercase tracking-[0.24em] text-gold">
            Borrowed · due in {active.dueInDays} days
          </p>
        </div>
      </div>
    </OrnatePanel>);

}
