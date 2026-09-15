import React from 'react';
import { motion } from 'framer-motion';
import { StarIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { useGame } from '../contexts/GameContext';

interface CatalogGridProps {
  items: Volume[];
  layout: 'grid' | 'list';
  onSelect: (volume: Volume) => void;
}

export function CatalogGrid({ items, layout, onSelect }: CatalogGridProps) {
  const { isBorrowed, borrow } = useGame();

  if (items.length === 0) {
    return (
      <p className="border border-dashed border-gold/50 px-6 py-14 text-center font-body text-sm font-600 text-umber/60">
        No volumes match that search. Try another title, author, or genre.
      </p>);

  }

  if (layout === 'list') {
    return (
      <ul className="divide-y divide-gold/25 border border-gold/40 bg-cream">
        {items.map((volume) =>
        <li
          key={volume.id}
          className="flex items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-parch/25">
          
            <button
            type="button"
            onClick={() => onSelect(volume)}
            className="flex min-w-0 flex-1 items-center gap-4 text-left">
            
              <span
              className="flex h-14 w-10 shrink-0 items-center justify-center border border-gold/70 font-display text-[10px] font-900 leading-none"
              style={{ backgroundColor: volume.plateColor, color: volume.plateInk }}>
              
                {volume.volume}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-700 text-umber">
                  {volume.title}
                </span>
                <span className="block truncate font-body text-[12px] font-600 text-umber/60">
                  {volume.author} · {volume.genre}
                </span>
              </span>
            </button>
            <Rarity value={volume.rarity} />
            <span className="hidden items-center gap-1 font-body text-[12px] font-800 text-gold sm:flex">
              <StarIcon aria-hidden="true" className="h-3 w-3 fill-sun text-sun" />
              {volume.rating}
            </span>
            <button
            type="button"
            onClick={() => borrow(volume.id)}
            className="tb-cut-sm border border-gold bg-parch/40 px-4 py-2 font-display text-[11px] font-700 uppercase tracking-[0.14em] text-umber transition-colors duration-150 ease-out hover:bg-rust hover:text-sand">
            
              {isBorrowed(volume.id) ?
            'On shelf' :
            volume.copies > 0 ?
            'Borrow' :
            'Queue'}
            </button>
          </li>
        )}
      </ul>);

  }

  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
      {items.map((volume, index) =>
      <motion.li
        key={volume.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.24,
          delay: Math.min(index * 0.03, 0.2),
          ease: [0.23, 1, 0.32, 1]
        }}
        className="flex flex-col">
        
          <button
          type="button"
          onClick={() => onSelect(volume)}
          className="group flex flex-1 flex-col text-left">
          
            <span className="relative block border-2 border-gold bg-cream p-[3px] transition-transform duration-200 ease-out group-hover:-translate-y-1">
              <span
              className="relative flex h-[218px] flex-col justify-end p-3"
              style={{ backgroundColor: volume.plateColor }}>
              
                <span
                aria-hidden="true"
                className="absolute inset-2 border border-current opacity-30"
                style={{ color: volume.plateInk }} />
              
                <span
                className="relative font-display text-[19px] font-900 uppercase leading-[1.05] tracking-[0.02em]"
                style={{ color: volume.plateInk }}>
                
                  {volume.plate.map((line) =>
                <span key={line} className="block">
                      {line}
                    </span>
                )}
                </span>
                {volume.copies === 0 && !isBorrowed(volume.id) ?
              <span className="absolute left-0 top-4 border-y border-r border-umber bg-cream px-2 py-1 font-body text-[9px] font-800 uppercase tracking-[0.18em] text-rust">
                    On loan
                  </span> :
              null}
                {isBorrowed(volume.id) ?
              <span className="absolute left-0 top-4 border-y border-r border-umber bg-sun px-2 py-1 font-body text-[9px] font-800 uppercase tracking-[0.18em] text-umber">
                    Borrowed
                  </span> :
              null}
              </span>
              <span className="absolute -right-2 -top-2 flex h-8 w-8 rotate-45 items-center justify-center border border-umber bg-sun">
                <span className="-rotate-45 font-display text-[11px] font-900 text-umber">
                  {volume.volume}
                </span>
              </span>
            </span>

            <span className="mt-3 block truncate font-display text-[15px] font-700 text-umber">
              {volume.title}
            </span>
            <span className="mt-0.5 block truncate font-body text-[12px] font-600 text-umber/60">
              {volume.author}
            </span>
            <span className="mt-auto flex items-center justify-between pt-3">
              <Rarity value={volume.rarity} />
              <span className="flex items-center gap-1 font-body text-[12px] font-800 text-gold">
                <StarIcon aria-hidden="true" className="h-3 w-3 fill-sun text-sun" />
                {volume.rating}
              </span>
            </span>
          </button>
        </motion.li>
      )}
    </ul>);

}

function Rarity({ value }: {value: number;}) {
  return (
    <span
      className="flex items-center gap-[3px]"
      aria-label={`Rarity ${value} of 5`}>
      
      {Array.from({ length: 5 }).map((_, index) =>
      <span
        key={index}
        aria-hidden="true"
        className={`h-[6px] w-[6px] rotate-45 border ${
        index < value ? 'border-gold bg-sun' : 'border-gold/35 bg-transparent'}`
        } />

      )}
    </span>);

}