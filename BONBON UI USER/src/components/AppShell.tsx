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
  const { section, setSection, loading, error, refresh, session } = useGame();
  const [query, setQuery] = useState('');

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
    <div className="tb-field relative min-h-full w-full">
      {/* Ambient game frame */}
      <div aria-hidden="true" className="tb-vignette pointer-events-none fixed inset-0 z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-2 z-50 border border-gold/25" />
      

      <GameHUD query={query} onQueryChange={setQuery} />

      <main
        id="main"
        className="relative z-10 mx-auto flex max-w-[1480px] gap-8 px-4 pb-40 pt-6 sm:px-5 sm:pb-28 sm:pt-8 lg:pr-[250px]">
        
        <SideRail />

        <div className="min-w-0 flex-1">
          <div className="mb-4 text-sm" role="status">{error ? <p role="alert">{error} <button onClick={() => void refresh()} className="underline">Retry</button></p> : loading ? "Loading library…" : !session ? "Browse the catalog, or sign in to see your membership and reading activity." : "Library connected · refreshes every 30 seconds"}</div><AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
              
              {section === 'archive' ? <Archive /> : null}
              {section === 'catalog' ?
              <Catalog
                query={query}
                onQueryChange={setQuery}
                initialLayout={catalogLayout} /> :

              null}
              {section === 'shelf' ? <Shelf /> : null}
              {section === 'commissions' ? <Commissions /> : null}
              {section === 'guide' ? <VisitorGuide /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <ToastStack />
      <MobileNav />
      <BonChatbot autoPeek={bonAutoPeek} />
    </div>);

}
