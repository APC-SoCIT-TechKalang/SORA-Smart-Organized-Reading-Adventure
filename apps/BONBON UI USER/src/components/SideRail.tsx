import { motion } from 'framer-motion';
import { CompassIcon, LibraryBigIcon, ScrollTextIcon, SwordsIcon, MapPinnedIcon, MenuIcon, XIcon } from 'lucide-react';
import { navItems } from '../data/commissions';
import { useGame } from '../contexts/GameContext';
import type { SectionId } from '../types/library';

const ICONS: Record<SectionId, typeof CompassIcon> = {
  archive: CompassIcon,
  catalog: LibraryBigIcon,
  shelf: ScrollTextIcon,
  commissions: SwordsIcon,
  guide: MapPinnedIcon,
};

export function SideRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { section, setSection, borrowed, claimed, commissions, volumes, loading } = useGame();
  const catalogCount = loading ? 'Loading catalog…' : `${volumes.length} ${volumes.length === 1 ? 'title' : 'titles'}`;
  const openQuestCount = commissions.filter((quest) => !claimed.includes(quest.id)).length;
  const counts: Record<SectionId, string> = {
    archive: 'Reading hall',
    catalog: catalogCount,
    shelf: `${borrowed.length} reading`,
    commissions: `${openQuestCount} ${openQuestCount === 1 ? 'quest' : 'quests'} open`,
    guide: 'Seat availability',
  };

  return (
    <nav aria-label="Archive sections" className={`sticky top-[92px] hidden shrink-0 self-start lg:block ${open ? 'w-[240px]' : 'w-12'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Collapse navigation' : 'Expand navigation'} className="tb-nav-toggle mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-gold/40 bg-cream text-umber shadow-sm hover:bg-parch/35">
        {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>
      {!open ? null : <>
      <div className="tb-surface tb-nav-panel tb-cut-sm p-2">
        <p className="px-3 pb-2 pt-2 text-[10px] font-800 uppercase tracking-[0.2em] text-gold">Explore</p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = ICONS[item.id];
            const isActive = item.id === section;
            return (
              <li key={item.id} className="relative">
                {isActive && <motion.span layoutId="rail-active" transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} className="tb-cut-sm absolute inset-0 bg-umber shadow-sm" />}
                <button type="button" onClick={() => setSection(item.id)} aria-current={isActive ? 'page' : undefined} className={`tb-nav-item tb-cut-sm relative flex min-h-[58px] w-full items-center gap-3 px-3 py-2 text-left transition ${isActive ? 'text-sand' : 'text-umber hover:bg-parch/30'}`}>
                  <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-sun' : 'text-gold'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap font-display text-xs font-700 uppercase tracking-[0.1em]">{item.label}</span>
                    <span className={`mt-0.5 block truncate text-[10px] font-600 ${isActive ? 'text-sand/70' : 'text-umber/55'}`}>{counts[item.id]}</span>
                  </span>
                  <span aria-hidden="true" className={`rounded border px-1.5 py-0.5 text-[9px] font-800 ${isActive ? 'border-sand/20 text-sun' : 'border-gold/25 text-umber/35'}`}>{item.shortcut}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4 px-3">
        <p className="tb-eyebrow">Library status</p>
        <div className="mt-2 flex items-center gap-2 text-xs font-700 text-umber/65"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600" />Live collection data</div>
        <p className="mt-2 text-[11px] font-600 leading-5 text-umber/50">Use keys 1–5 to move between sections.</p>
      </div>
      </>}
    </nav>
  );
}
