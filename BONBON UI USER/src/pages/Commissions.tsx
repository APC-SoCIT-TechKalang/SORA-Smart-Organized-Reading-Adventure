import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, LockIcon } from 'lucide-react';
import { OrnatePanel, SectionHeading } from '../components/OrnatePanel';
import { CommissionCard } from '../components/CommissionCard';
import { commissions, seasonTrack } from '../data/commissions';
import type { QuestTrack } from '../types/library';
import { useGame } from '../contexts/GameContext';

const TRACKS: {id: QuestTrack;label: string;reset: string;}[] = [
{ id: 'daily', label: 'Daily', reset: 'Resets in 9h 12m' },
{ id: 'weekly', label: 'Weekly', reset: 'Resets in 3d 6h' },
{ id: 'seasonal', label: 'Seasonal', reset: 'Amber Season · 6d left' }];


const SEASON_PROGRESS = 72;

export function Commissions() {
  const [track, setTrack] = useState<QuestTrack>('daily');
  const { claimed } = useGame();
  const active = TRACKS.find((item) => item.id === track);
  const list = commissions.filter((item) => item.track === track);
  const readyCount = commissions.filter(
    (item) => item.progress >= 100 && !claimed.includes(item.id)
  ).length;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Commission Board"
        meta={readyCount > 0 ? `${readyCount} rewards ready` : 'All caught up'} />
      

      {/* Season reward track */}
      <OrnatePanel className="tb-cut">
        <div className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-body text-[10px] font-800 uppercase tracking-[0.26em] text-gold">
                Amber Season pass
              </p>
              <h3 className="mt-1 font-display text-[22px] font-900 uppercase text-umber">
                Lantern Track
              </h3>
            </div>
            <p className="font-body text-[12px] font-700 uppercase tracking-[0.14em] text-umber/60">
              {SEASON_PROGRESS}% to the amber cloak
            </p>
          </div>

          <div className="relative mt-8">
            <div className="h-[10px] border border-gold/60 bg-parch/35 p-[2px]">
              <motion.div
                className="h-full bg-rust"
                initial={{ width: 0 }}
                animate={{ width: `${SEASON_PROGRESS}%` }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }} />
              
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {seasonTrack.map((tier) => {
                const unlocked = SEASON_PROGRESS >= tier.at;
                return (
                  <li
                    key={tier.level}
                    className={`tb-cut-sm border px-3 py-3 text-center ${
                    unlocked ?
                    'border-gold bg-sun/20' :
                    'border-gold/30 bg-parch/10'}`
                    }>
                    
                    <span
                      className={`mx-auto flex h-8 w-8 rotate-45 items-center justify-center border ${
                      unlocked ? 'border-umber bg-sun' : 'border-gold/40 bg-cream'}`
                      }>
                      
                      {unlocked ?
                      <CheckIcon
                        aria-hidden="true"
                        className="h-4 w-4 -rotate-45 text-umber" /> :


                      <LockIcon
                        aria-hidden="true"
                        className="h-3.5 w-3.5 -rotate-45 text-gold/70" />

                      }
                    </span>
                    <p className="mt-2 font-display text-[11px] font-700 uppercase tracking-[0.12em] text-umber">
                      Tier {tier.level}
                    </p>
                    <p className="mt-1 font-body text-[11px] font-600 leading-snug text-umber/60">
                      {tier.reward}
                    </p>
                  </li>);

              })}
            </ul>
          </div>
        </div>
      </OrnatePanel>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-gold/50 bg-cream" role="tablist">
          {TRACKS.map((item) =>
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === track}
            onClick={() => setTrack(item.id)}
            className={`px-5 py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.16em] transition-colors duration-150 ease-out ${
            item.id === track ?
            'bg-umber text-sand' :
            'text-umber/60 hover:bg-parch/40'}`
            }>
            
              {item.label}
            </button>
          )}
        </div>
        <p className="font-body text-[12px] font-700 uppercase tracking-[0.14em] text-gold">
          {active?.reset}
        </p>
      </div>

      <motion.ul
        key={track}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="grid gap-4 lg:grid-cols-2">
        
        {list.map((commission) =>
        <li key={commission.id}>
            <CommissionCard commission={commission} />
          </li>
        )}
      </motion.ul>
    </div>);

}