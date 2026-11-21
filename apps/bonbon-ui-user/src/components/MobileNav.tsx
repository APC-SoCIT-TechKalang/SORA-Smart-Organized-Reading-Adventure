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
const MOBILE_LABELS: Record<SectionId, string> = { archive: 'Home', catalog: 'Catalog', shelf: 'Shelf', commissions: 'Quests', guide: 'Seats' };

/** Bottom tab bar shown below the lg breakpoint, mirroring the SideRail. */
export function MobileNav() {
  const { section, setSection } = useGame();

  return (
    <nav
      aria-label="Archive sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-cream/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_rgba(84,56,34,.1)] backdrop-blur-xl lg:hidden">
      
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {navItems.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = item.id === section;
          return (
            <li key={item.id} className="relative flex-1">
              {isActive ?
              <motion.span
                layoutId="mobile-nav-active"
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-x-1.5 inset-y-1.5 rounded-xl bg-umber shadow-sm" /> :

              null}
              <button
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 px-1 py-1.5 transition-colors duration-150 ease-out ${
                isActive ? 'text-sand' : 'text-umber/70'}`
                }>
                
                <Icon
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 ${isActive ? 'text-sun' : 'text-gold'}`} />
                
                <span
                  className={`max-w-full truncate font-display text-[10px] font-700 uppercase tracking-[0.08em] ${
                  isActive ? 'text-sand' : 'text-umber/70'}`
                  }>
                  
                  {MOBILE_LABELS[item.id]}
                </span>
              </button>
            </li>);

        })}
      </ul>
    </nav>);

}
