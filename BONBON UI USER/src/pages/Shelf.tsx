import React from 'react';
import { motion } from 'framer-motion';
import { BookOpenIcon, ClockIcon, UndoIcon } from 'lucide-react';
import { OrnatePanel, SectionHeading } from '../components/OrnatePanel';
import { useGame } from '../contexts/GameContext';
import { volumeById } from '../data/manga';

const HISTORY = [
{ id: 'h1', title: 'Vinland Saga Vol. 26', finished: 'Two days ago', xp: 180 },
{ id: 'h2', title: 'Haikyu!! Vol. 44', finished: 'Last week', xp: 150 },
{ id: 'h3', title: 'Kaguya-sama Vol. 27', finished: 'Last week', xp: 160 }];


export function Shelf() {
  const { borrowed, logSession, giveBack, setSection, lanterns } = useGame();

  return (
    <div className="space-y-8">
      <SectionHeading title="My Shelf" meta={`${borrowed.length} volumes checked out`} />

      {borrowed.length === 0 ?
      <OrnatePanel className="tb-cut">
          <div className="flex flex-col items-start gap-4 p-8">
            <p className="font-display text-[20px] font-700 uppercase text-umber">
              Nothing borrowed yet
            </p>
            <button
            type="button"
            onClick={() => setSection('catalog')}
            className="tb-cut-sm border border-gold bg-rust px-5 py-2.5 font-display text-[12px] font-700 uppercase tracking-[0.16em] text-sand transition-colors duration-150 ease-out hover:bg-umber">
            
              Browse the catalog
            </button>
          </div>
        </OrnatePanel> :

      <ul className="space-y-4">
          {borrowed.map((entry) => {
          const volume = volumeById(entry.volumeId);
          if (!volume) return null;
          const urgent = entry.dueInDays <= 3;
          return (
            <motion.li
              key={entry.volumeId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
              
                <OrnatePanel corners={false} className="tb-cut-sm">
                  <div className="flex flex-wrap items-center gap-5 p-4">
                    <span
                    className="flex h-[92px] w-[64px] shrink-0 flex-col justify-end border-2 border-gold p-1.5"
                    style={{ backgroundColor: volume.plateColor }}>
                    
                      <span
                      className="font-display text-[10px] font-900 uppercase leading-tight"
                      style={{ color: volume.plateInk }}>
                      
                        {volume.plate.map((line) =>
                      <span key={line} className="block">
                            {line}
                          </span>
                      )}
                      </span>
                    </span>

                    <div className="min-w-[200px] flex-1">
                      <p className="font-display text-[17px] font-700 text-umber">
                        {volume.title}{' '}
                        <span className="text-umber/50">Vol. {volume.volume}</span>
                      </p>
                      <p className="mt-0.5 font-body text-[12px] font-600 text-umber/60">
                        {volume.author} · {volume.chapters} chapters
                      </p>

                      <div className="mt-3 max-w-[380px]">
                        <div className="flex items-baseline justify-between font-body text-[10px] font-800 uppercase tracking-[0.2em]">
                          <span className="text-gold">Progress</span>
                          <span className="font-display text-[13px] tracking-normal text-umber">
                            {entry.progress}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-[8px] border border-gold/50 bg-parch/30 p-[1px]">
                          <motion.div
                          className="h-full bg-rust"
                          animate={{ width: `${entry.progress}%` }}
                          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} />
                        
                        </div>
                      </div>
                    </div>

                    <span
                    className={`flex items-center gap-1.5 font-body text-[12px] font-800 uppercase tracking-[0.12em] ${
                    urgent ? 'text-rust' : 'text-umber/55'}`
                    }>
                    
                      <ClockIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      Due in {entry.dueInDays}d
                    </span>

                    <div className="flex gap-2">
                      <button
                      type="button"
                      onClick={() => logSession(entry.volumeId)}
                      disabled={lanterns === 0}
                      className="tb-cut-sm inline-flex items-center gap-1.5 border border-gold bg-rust px-4 py-2.5 font-display text-[11px] font-700 uppercase tracking-[0.14em] text-sand transition-colors duration-150 ease-out hover:bg-umber disabled:opacity-40">
                      
                        <BookOpenIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        Read
                      </button>
                      <button
                      type="button"
                      onClick={() => giveBack(entry.volumeId)}
                      className="tb-cut-sm inline-flex items-center gap-1.5 border border-gold/60 bg-parch/25 px-4 py-2.5 font-display text-[11px] font-700 uppercase tracking-[0.14em] text-umber transition-colors duration-150 ease-out hover:bg-parch/70">
                      
                        <UndoIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        Return
                      </button>
                    </div>
                  </div>
                </OrnatePanel>
              </motion.li>);

        })}
        </ul>
      }

      <section>
        <SectionHeading title="Recently cleared" level={3} />
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {HISTORY.map((entry) =>
          <li
            key={entry.id}
            className="tb-cut-sm border border-gold/40 bg-parch/15 px-4 py-3">
            
              <p className="font-display text-[14px] font-700 text-umber">
                {entry.title}
              </p>
              <p className="mt-1 font-body text-[12px] font-600 text-umber/60">
                {entry.finished}
              </p>
              <p className="mt-2 font-body text-[12px] font-800 text-gold">
                +{entry.xp} XP
              </p>
            </li>
          )}
        </ul>
      </section>
    </div>);

}