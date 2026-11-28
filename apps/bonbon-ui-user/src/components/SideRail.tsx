import { CompassIcon, LibraryBigIcon, ScrollTextIcon, SwordsIcon, MapPinnedIcon, MenuIcon, XIcon, LockKeyholeIcon } from 'lucide-react';
import { navItems } from '../data/commissions';
import { useGame } from '../contexts/GameContext';
import type { SectionId } from '../types/library';
import { groupCatalog } from '../lib/catalog-series';

const ICONS: Record<SectionId, typeof CompassIcon> = {
  archive: CompassIcon,
  catalog: LibraryBigIcon,
  shelf: ScrollTextIcon,
  commissions: SwordsIcon,
  guide: MapPinnedIcon,
};

export function SideRail({ open, onToggle, guest = false, onNavigate }: { open: boolean; onToggle: () => void; guest?: boolean; onNavigate?: (id: SectionId) => void }) {
  const { section, setSection, borrowed, claimed, commissions, volumes, loading } = useGame();
  const titleCount = groupCatalog(volumes).length;
  const catalogCount = loading ? 'Loading catalog…' : `${titleCount} ${titleCount === 1 ? 'title' : 'titles'}`;
  const openQuestCount = commissions.filter((quest) => !claimed.includes(quest.id)).length;
  const counts: Record<SectionId, string> = {
    archive: 'Reading hall',
    catalog: catalogCount,
    shelf: guest ? 'Sign in to view' : `${borrowed.length} reading`,
    commissions: guest ? 'Sign in to view' : `${openQuestCount} ${openQuestCount === 1 ? 'quest' : 'quests'} open`,
    guide: guest ? 'Sign in to choose' : 'Seat availability',
  };

  return (
    <nav aria-label="Library sections" className={`reader-rail sticky top-[92px] hidden shrink-0 self-start lg:block ${open ? 'w-[196px] xl:w-[215px]' : 'w-12'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Collapse navigation' : 'Expand navigation'} className="tb-nav-toggle mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-gold/40 bg-cream text-umber shadow-sm hover:bg-parch/35">
        {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>
      {!open ? null : <>
      <div className="reader-rail-panel p-2">
        <p className="px-3 pb-2 pt-2 text-[10px] font-800 uppercase tracking-[0.2em] text-gold">Explore</p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = ICONS[item.id];
            const isActive = item.id === section;
            return (
              <li key={item.id} className="relative">
                <button type="button" onClick={() => onNavigate ? onNavigate(item.id) : setSection(item.id)} aria-current={isActive ? 'page' : undefined} className={`reader-rail-item relative flex min-h-[58px] w-full items-center gap-2.5 px-2.5 py-2 text-left ${isActive ? 'text-sand' : 'text-cream'}`}>
                  <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-sun' : 'text-gold'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xs font-800 tracking-[.04em]">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-600 text-sand/80">{counts[item.id]}</span>
                  </span>
                  {guest && (item.id === 'shelf' || item.id === 'commissions' || item.id === 'guide') ? <LockKeyholeIcon aria-hidden="true" className="h-3.5 w-3.5 text-sand/75" /> : <span aria-hidden="true" className="rounded border border-sand/20 px-1.5 py-0.5 text-[9px] font-800 text-sand/75">{item.shortcut}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      </>}
    </nav>
  );
}
