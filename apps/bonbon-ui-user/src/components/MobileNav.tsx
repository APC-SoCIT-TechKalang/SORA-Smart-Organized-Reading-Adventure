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
      aria-label="Library sections"
      className="reader-tabbar fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {navItems.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = item.id === section;
          return (
            <li key={item.id} className="relative flex-1">
              <button
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="reader-tab relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 px-1 py-1.5">
                
                <Icon
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0" />
                
                <span
                  className="max-w-full truncate text-[10px] font-800 tracking-[.025em]">
                  
                  {MOBILE_LABELS[item.id]}
                </span>
              </button>
            </li>);

        })}
      </ul>
    </nav>);

}
