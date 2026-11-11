import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameHUD } from './GameHUD';
import { SideRail } from './SideRail';
import { MobileNav } from './MobileNav';
import { ToastStack } from './ToastStack';
import { BonChatbot } from './BonChatbot';
import { Archive } from '../pages/Archive';
import { Catalog } from '../pages/Catalog';
import { Shelf } from '../pages/Shelf';
import { Commissions } from '../pages/Commissions';
import { VisitorGuide } from '../pages/VisitorGuide';
import { useGame } from '../contexts/GameContext';
import { navItems } from '../data/commissions';
import type { SectionId } from '../types/library';

interface AppShellProps {
  bonAutoPeek: boolean;
  catalogLayout: 'grid' | 'list';
}

export function AppShell({ bonAutoPeek, catalogLayout }: AppShellProps) {
  const { section, setSection, error, refresh } = useGame();
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const match = navItems.find((item) => item.shortcut === event.key);
      if (match) setSection(match.id as SectionId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSection]);

  return (
    <div className="tb-field tb-world-shell relative min-h-full w-full overflow-x-hidden">
      <a href="#main" className="skip-link">Skip to main content</a>
      <div aria-hidden="true" className="tb-vignette pointer-events-none fixed inset-0 z-0" />
      <GameHUD />
      <main id="main" tabIndex={-1} className={`tb-main-stage relative z-10 mx-auto flex max-w-[1480px] gap-6 px-3 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-4 min-[390px]:px-4 sm:px-6 sm:pb-[calc(13rem+env(safe-area-inset-bottom))] sm:pt-7 lg:pb-28 lg:gap-8 ${sidebarOpen ? 'xl:pr-[210px]' : ''}`}>
        <SideRail open={sidebarOpen} onToggle={() => setSidebarOpen((value) => !value)} />
        <div className="min-w-0 flex-1">
          {error && (
            <div className="tb-cut-sm mb-5 flex flex-wrap items-center justify-between gap-3 border border-rust/35 bg-cream/90 px-4 py-3 font-body text-sm font-600 text-umber/75 shadow-sm" role="alert">
              <span>We couldn’t load the latest library data.</span>
              <button type="button" onClick={() => void refresh()} className="tb-button-secondary tb-cut-sm min-h-9 px-3 py-1.5 text-xs">Try again</button>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
              {section === 'archive' ? <Archive /> : null}
              {section === 'catalog' ? <Catalog query={query} onQueryChange={setQuery} initialLayout={catalogLayout} /> : null}
              {section === 'shelf' ? <Shelf /> : null}
              {section === 'commissions' ? <Commissions /> : null}
              {section === 'guide' ? <VisitorGuide /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <ToastStack />
      <MobileNav />
      {section !== 'shelf' ? <BonChatbot autoPeek={bonAutoPeek} /> : null}
    </div>
  );
}
