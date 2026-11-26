import { useEffect, useState } from 'react';
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
import '../reader-world.css';

interface AppShellProps {
  bonAutoPeek: boolean;
  catalogLayout: 'grid' | 'list';
}

export function AppShell({ bonAutoPeek, catalogLayout }: AppShellProps) {
  const { section, setSection, error, refresh } = useGame();
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ambientMotion, setAmbientMotion] = useState(true);

  useEffect(() => {
    // Navigation must reveal the new page even after scrolling the previous one.
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [section]);

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
    <div className="reader-world tb-field tb-world-shell relative min-h-full w-full" data-reader-motion={ambientMotion ? 'on' : 'off'}>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div aria-hidden="true" className="tb-vignette pointer-events-none fixed inset-0 z-0" />
      <GameHUD ambientMotion={ambientMotion} onToggleMotion={() => setAmbientMotion(value => !value)} />
      <main id="main" tabIndex={-1} className="reader-main tb-main-stage relative z-10 mx-auto flex max-w-[1440px] gap-5 px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4 min-[390px]:px-4 sm:px-6 sm:pt-6 lg:gap-6 lg:pb-24">
        <SideRail open={sidebarOpen} onToggle={() => setSidebarOpen((value) => !value)} />
        <div className="min-w-0 flex-1">
          {error && (
            <div className="tb-cut-sm mb-5 flex flex-wrap items-center justify-between gap-3 border border-rust/35 bg-cream/90 px-4 py-3 font-body text-sm font-600 text-umber/75 shadow-sm" role="alert">
              <span>We couldn’t load the latest library data.</span>
              <button type="button" onClick={() => void refresh()} className="tb-button-secondary tb-cut-sm min-h-9 px-3 py-1.5 text-xs">Try again</button>
            </div>
          )}
          {/* Mount pages immediately; a suspended exit animation must not hide navigation. */}
          <div key={section} className="reader-scene">
              {section === 'archive' ? <Archive /> : null}
              {section === 'catalog' ? <Catalog query={query} onQueryChange={setQuery} initialLayout={catalogLayout} /> : null}
              {section === 'shelf' ? <Shelf /> : null}
              {section === 'commissions' ? <Commissions /> : null}
              {section === 'guide' ? <VisitorGuide /> : null}
          </div>
        </div>
      </main>
      <ToastStack />
      <MobileNav />
      {section !== 'shelf' ? <BonChatbot autoPeek={bonAutoPeek} /> : null}
    </div>
  );
}
