import { motion } from 'framer-motion';
import {
  CompassIcon,
  LibraryBigIcon,
  ScrollTextIcon,
  SwordsIcon,
  MapPinnedIcon } from
'lucide-react';
import { navItems } from '../data/commissions';
import { useGame } from '../contexts/GameContext';
import type { SectionId } from '../types/library';

const ICONS: Record<SectionId, typeof CompassIcon> = {
  archive: CompassIcon,
  catalog: LibraryBigIcon,
  shelf: ScrollTextIcon,
  commissions: SwordsIcon,
  guide: MapPinnedIcon
};

export function SideRail() {
  const { section, setSection, borrowed, claimed, commissions, volumes, loading } = useGame();
  const catalogCount = loading ? 'Loading catalog…' : `${volumes.length} ${volumes.length === 1 ? 'title' : 'titles'}`;
  const openQuestCount = commissions.filter((quest) => !claimed.includes(quest.id)).length;

  const counts: Record<SectionId, string> = {
    archive: 'Your reading hall',
    catalog: catalogCount,
    shelf: `${borrowed.length} reading`,
    commissions: `${openQuestCount} ${openQuestCount === 1 ? 'quest' : 'quests'} open`,
    guide: 'Study space availability'
  };

  return (
    <nav
      aria-label="Archive sections"
      className="sticky top-[84px] hidden w-[250px] shrink-0 self-start lg:block">
      
      <ul className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = item.id === section;
          return (
            <li key={item.id} className="relative">
              {isActive ?
              <motion.span
                layoutId="rail-active"
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="tb-cut-sm absolute inset-0 border border-gold bg-umber" /> :

              null}
              <button
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`tb-cut-sm relative flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors duration-150 ease-out ${
                isActive ?
                'border-transparent text-sand' :
                'border-transparent text-umber hover:border-gold/40 hover:bg-parch/35'}`
                }>
                
                <Icon
                  aria-hidden="true"
                  className={`h-[18px] w-[18px] shrink-0 ${
                  isActive ? 'text-sun' : 'text-gold'}`
                  } />
                
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[13px] font-700 uppercase tracking-[0.12em]">
                    {item.label}
                  </span>
                  <span
                    className={`block truncate font-body text-[11px] font-600 ${
                    isActive ? 'text-sand/70' : 'text-umber/55'}`
                    }>
                    
                    {counts[item.id]}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`font-body text-[10px] font-800 ${
                  isActive ? 'text-sun' : 'text-umber/30'}`
                  }>
                  
                  {item.shortcut}
                </span>
              </button>
            </li>);

        })}
      </ul>

      <div className="mt-6 border-t border-gold/35 pt-4">
        <p className="font-body text-[10px] font-800 uppercase tracking-[0.26em] text-gold">
          Library status
        </p>
        <p className="mt-1 font-display text-[15px] font-700 text-umber">
          Live data
        </p>
        <p className="mt-3 font-body text-[11px] font-600 leading-relaxed text-umber/55">
          Press 1–5 to move between halls.
        </p>
      </div>
    </nav>);

}
