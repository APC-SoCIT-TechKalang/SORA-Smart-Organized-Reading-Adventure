import React from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, CoinsIcon, SparklesIcon, UsersIcon } from 'lucide-react';
import type { Commission } from '../types/library';
import { useGame } from '../contexts/GameContext';

export function CommissionCard({ commission }: {commission: Commission;}) {
  const { claim, claimed } = useGame();
  const isClaimed = claimed.includes(commission.id);
  const ready = commission.progress >= 100 && !isClaimed;

  return (
    <article
      className={`tb-cut-sm relative border p-4 transition-colors duration-150 ease-out ${
      ready ?
      'border-gold bg-sun/15' :
      isClaimed ?
      'border-gold/30 bg-parch/10' :
      'border-gold/40 bg-parch/15'}`
      }>
      
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-body text-[10px] font-800 uppercase tracking-[0.24em] text-gold">
            {commission.track}
          </span>
          <h4 className="mt-1 font-display text-[15px] font-700 leading-snug text-umber">
            {commission.name}
          </h4>
        </div>
        <span className="flex shrink-0 items-center gap-1 font-body text-[11px] font-800 text-umber/45">
          <UsersIcon aria-hidden="true" className="h-3 w-3" />
          {commission.participants}
        </span>
      </div>

      <p className="mt-1.5 font-body text-[12px] font-600 leading-relaxed text-umber/65">
        {commission.detail}
      </p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between font-body text-[10px] font-800 uppercase tracking-[0.2em]">
          <span className="text-gold">Progress</span>
          <span className="font-display text-[13px] tracking-normal text-umber">
            {commission.progress}%
          </span>
        </div>
        <div className="mt-1.5 h-[8px] border border-gold/50 bg-cream p-[1px]">
          <motion.div
            className={`h-full ${ready ? 'bg-rust' : 'bg-gold'}`}
            initial={{ width: 0 }}
            animate={{ width: `${commission.progress}%` }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} />
          
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gold/25 pt-3">
        <span className="flex items-center gap-1.5 font-body text-[12px] font-800 text-rust">
          <span
            aria-hidden="true"
            className="h-[7px] w-[7px] rotate-45 border border-umber bg-sun" />
          
          {commission.seal}
        </span>
        <span className="flex items-center gap-1 font-body text-[12px] font-700 text-umber/65">
          <SparklesIcon aria-hidden="true" className="h-3 w-3 text-gold" />
          {commission.xp} XP
        </span>
        <span className="flex items-center gap-1 font-body text-[12px] font-700 text-umber/65">
          <CoinsIcon aria-hidden="true" className="h-3 w-3 text-gold" />
          {commission.coins}
        </span>

        <button
          type="button"
          disabled={!ready}
          onClick={() => claim(commission)}
          className={`tb-cut-sm ml-auto inline-flex items-center gap-1.5 border px-4 py-2 font-display text-[11px] font-700 uppercase tracking-[0.14em] transition-colors duration-150 ease-out ${
          ready ?
          'border-gold bg-rust text-sand hover:bg-umber' :
          isClaimed ?
          'border-gold/40 bg-transparent text-umber/45' :
          'border-gold/30 bg-transparent text-umber/35'}`
          }>
          
          {isClaimed ?
          <>
              <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Claimed
            </> :
          ready ?
          'Claim reward' :

          'In progress'
          }
        </button>
      </div>
    </article>);

}