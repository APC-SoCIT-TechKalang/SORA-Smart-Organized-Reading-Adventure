import { useEffect } from 'react';
import { ArrowRightIcon, BookOpenIcon } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { HeroReading } from './components/HeroReading';
import { GameProvider } from './contexts/GameContext';

export function ReaderGuestHome() {
  useEffect(() => {
    const openSignIn = () => { window.location.assign('/kiosk'); };
    window.addEventListener('tankobonbon:open-auth', openSignIn);
    return () => window.removeEventListener('tankobonbon:open-auth', openSignIn);
  }, []);

  return <GameProvider>
    <div className="reader-world min-h-screen text-umber">
      <header className="relative z-20 border-b border-gold/30 bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Tankobonbon reader home">
            <span className="reader-brand-seal flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><BookOpenIcon aria-hidden="true" className="h-5 w-5" /></span>
            <span className="min-w-0"><strong className="block truncate font-display text-lg font-900 uppercase leading-tight sm:text-2xl">Tankobonbon</strong><small className="block text-[10px] font-800 uppercase tracking-[.14em] text-gold">S.O.R.A. Reading Adventure</small></span>
          </a>
          <a href="/kiosk" className="reader-gold-button min-h-11 px-4 text-sm">Sign in with your card <ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></a>
        </div>
      </header>
      <AppShell guest bonAutoPeek={false} catalogLayout="grid" guestHero={<HeroReading />} onRequestAuth={() => window.location.assign('/kiosk')} />
    </div>
  </GameProvider>;
}
