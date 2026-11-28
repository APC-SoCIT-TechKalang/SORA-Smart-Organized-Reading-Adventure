import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  guest?: boolean;
  showGuestNavigation?: boolean;
  guestHero?: ReactNode;
  onRequestAuth?: (reason: string) => void;
}

export function AppShell({ bonAutoPeek, catalogLayout, guest = false, showGuestNavigation = false, guestHero, onRequestAuth }: AppShellProps) {
  const { section, setSection, error, refresh } = useGame();
  const [query, setQuery] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem('sora.kiosk.browse') ?? '{}').query;
      return typeof value === 'string' ? value.slice(0, 200) : '';
    } catch { return ''; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigate = useCallback((id: SectionId) => {
    if (guest && (id === 'shelf' || id === 'commissions' || id === 'guide')) {
      onRequestAuth?.(id === 'shelf' ? 'Sign in to view your shelf.' : id === 'commissions' ? 'Sign in to track your reading quests.' : 'Sign in to choose a seat.');
      return;
    }
    if (guest && !showGuestNavigation && id === 'catalog') {
      sessionStorage.setItem('sora.kiosk.browse', sessionStorage.getItem('sora.kiosk.browse') ?? '{}');
      document.getElementById('guest-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSection(id);
  }, [guest, showGuestNavigation, onRequestAuth, setSection]);

  useEffect(() => {
    // Navigation must reveal the new page even after scrolling the previous one.
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [section]);

  useEffect(() => {
    // HID card scanners send digits as keystrokes; guest navigation must not intercept them.
    if (guest) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const match = navItems.find((item) => item.shortcut === event.key);
      if (match) navigate(match.id as SectionId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guest, navigate]);

  return (
    <div className="reader-world relative min-h-screen w-full">
      <a href="#main" className="skip-link">Skip to main content</a>
      {!guest && <GameHUD />}
      <main id="main" tabIndex={-1} className={`reader-main tb-main-stage relative z-10 mx-auto flex max-w-[1440px] gap-5 px-3 pt-4 min-[390px]:px-4 sm:px-6 sm:pt-6 lg:gap-6 ${guest && !showGuestNavigation ? 'pb-16 sm:pb-20' : 'pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-24'}`}>
        {(!guest || showGuestNavigation) && <SideRail open={sidebarOpen} onToggle={() => setSidebarOpen((value) => !value)} onNavigate={navigate} guest={guest} />}
        <div className="min-w-0 flex-1">
          {error && (
            <div className="tb-cut-sm mb-5 flex flex-wrap items-center justify-between gap-3 border border-rust/35 bg-cream/90 px-4 py-3 font-body text-sm font-600 text-umber/75 shadow-sm" role="alert">
              <span>We couldn’t load the latest library data.</span>
              <button type="button" onClick={() => void refresh()} className="tb-button-secondary tb-cut-sm min-h-9 px-3 py-1.5 text-xs">Try again</button>
            </div>
          )}
          {/* Mount pages immediately; a suspended exit animation must not hide navigation. */}
          <div key={section} className="reader-scene">
              {section === 'archive' ? <><Archive hero={guestHero} guest={guest} />{guest && <div id="guest-catalog" className="mt-10 scroll-mt-24"><Catalog query={query} onQueryChange={setQuery} initialLayout={catalogLayout} /></div>}</> : null}
              {section === 'catalog' ? <Catalog query={query} onQueryChange={setQuery} initialLayout={catalogLayout} /> : null}
              {section === 'shelf' && !guest ? <Shelf /> : null}
              {section === 'commissions' && !guest ? <Commissions /> : null}
              {section === 'guide' && !guest ? <VisitorGuide /> : null}
          </div>
        </div>
      </main>
      <ToastStack />
      {(!guest || showGuestNavigation) && <MobileNav guest={guest} onNavigate={navigate} />}
      {!guest && section !== 'shelf' ? <BonChatbot autoPeek={bonAutoPeek} /> : null}
    </div>
  );
}
