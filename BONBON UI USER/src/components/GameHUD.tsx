import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CoinsIcon, FlameIcon, LampIcon, SearchIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { AccountDialog } from './AccountDialog';

const LOGO_URL = "/6ad15ba6-6115-4388-9841-28404d9788a5.jpg";


interface GameHUDProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function GameHUD({ query, onQueryChange }: GameHUDProps) {
  const [accountMode, setAccountMode] = useState<'login' | 'preregister' | null>(null);
  const { rank, xp, xpPercent, coins, lanterns, maxLanterns, streak, setSection } =
  useGame();

  return (<>
    <header className="sticky top-0 z-40 border-b-[3px] border-gold bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => setSection('archive')}
          className="flex items-center gap-2.5 text-left sm:gap-3">
          
          <img
            src={LOGO_URL}
            alt="Tankobonbon crest"
            className="h-9 w-9 rounded-full border border-gold/60 object-cover sm:h-12 sm:w-12" />
          
          <span className="leading-none">
            <span className="block font-display text-[15px] font-900 uppercase tracking-[0.14em] text-umber sm:text-[19px] sm:tracking-[0.18em]">
              Tankobonbon
            </span>
            <span className="mt-1 hidden font-body text-[10px] font-800 uppercase tracking-[0.32em] text-gold sm:block">
              Amber Season · Reading Archive
            </span>
          </span>
        </button>

        {/* Rank + experience meter */}
        <div className="hidden min-w-[230px] items-center gap-3 border-l border-gold/30 pl-5 xl:flex">
          <span className="flex h-11 w-11 rotate-45 items-center justify-center border-2 border-gold bg-umber">
            <span className="-rotate-45 font-display text-[15px] font-900 text-sun">
              {rank}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between font-body text-[10px] font-800 uppercase tracking-[0.2em] text-gold">
              Archivist rank
              <span className="font-600 tracking-normal text-umber/60">
                {xp}/500
              </span>
            </span>
            <span className="mt-1 block h-[8px] border border-gold/60 bg-parch/40 p-[1px]">
              <motion.span
                className="block h-full bg-rust"
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} />
              
            </span>
          </span>
        </div>

        <form
          role="search"
          onSubmit={(event) => event.preventDefault()}
          className="relative order-last w-full pb-1 md:order-none md:ml-auto md:w-[250px] md:pb-0">
          
          <label className="sr-only" htmlFor="hud-search">
            Search the archive
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold" />
          
          <input
            id="hud-search"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setSection('catalog');
            }}
            placeholder="Search the archive…"
            className="tb-cut-sm h-10 w-full border border-gold/50 bg-parch/25 pl-9 pr-3 font-body text-sm font-600 text-umber placeholder:text-umber/45" />
          
        </form>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0 md:gap-2">
          <Pip
            icon={<CoinsIcon aria-hidden="true" className="h-4 w-4 text-gold" />}
            value={coins.toLocaleString()}
            label="Bonbon coins" />
          
          <Pip
            icon={<LampIcon aria-hidden="true" className="h-4 w-4 text-gold" />}
            value={`${lanterns}/${maxLanterns}`}
            label="Reading lanterns" />
          
          <Pip
            icon={<FlameIcon aria-hidden="true" className="h-4 w-4 text-rust" />}
            value={`${streak}d`}
            label="Day streak" />
        </div>

        <div className="flex items-center gap-2 border-l border-gold/25 pl-2 sm:pl-3">
          <button type="button" onClick={() => setAccountMode('login')} className="tb-cut-sm border border-gold/45 bg-cream px-3 py-2 font-display text-[10px] font-700 uppercase tracking-[0.12em] text-umber transition hover:border-rust hover:text-rust">Login</button>
          <button type="button" onClick={() => setAccountMode('preregister')} className="tb-cut-sm border border-gold/45 bg-parch/35 px-3 py-2 font-display text-[10px] font-700 uppercase tracking-[0.12em] text-umber transition hover:border-rust hover:text-rust">Pre-register</button>
        </div>
      </div>
    </header>
    <AccountDialog mode={accountMode} onClose={() => setAccountMode(null)} />
  </>);

}

function Pip({
  icon,
  value,
  label




}: {icon: React.ReactNode;value: string;label: string;}) {
  return (
    <span
      title={label}
      className="tb-cut-sm flex items-center gap-1.5 border border-gold/50 bg-parch/25 px-2.5 py-1.5">
      
      {icon}
      <span className="font-display text-[13px] font-700 text-umber">
        {value}
      </span>
      <span className="sr-only">{label}</span>
    </span>);

}
