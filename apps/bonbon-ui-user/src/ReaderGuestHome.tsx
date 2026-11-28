import { useEffect, useState } from 'react';
import { ArrowRightIcon, BookOpenIcon, LibraryBigIcon, MailIcon } from 'lucide-react';
import { AccountDialog } from './components/AccountDialog';
import { AppShell } from './components/AppShell';
import { HeroReading } from './components/HeroReading';
import { GameProvider, useGame } from './contexts/GameContext';

export function ReaderGuestHome() {
  return <GameProvider><ReaderGuestContent /></GameProvider>;
}

function ReaderGuestContent() {
  const { setSection } = useGame();
  const [authMode, setAuthMode] = useState<'login' | null>(null);

  useEffect(() => {
    const openSignIn = () => setAuthMode('login');
    window.addEventListener('tankobonbon:open-auth', openSignIn);
    return () => window.removeEventListener('tankobonbon:open-auth', openSignIn);
  }, []);

  return <>
    <div className="reader-world min-h-screen text-umber">
      <header className="relative z-20 border-b border-gold/30 bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Tankobonbon reader home">
            <span className="reader-brand-seal flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><BookOpenIcon aria-hidden="true" className="h-5 w-5" /></span>
            <span className="min-w-0"><strong className="block truncate font-display text-lg font-900 uppercase leading-tight sm:text-2xl">Tankobonbon</strong><small className="block text-[10px] font-800 uppercase tracking-[.14em] text-gold">S.O.R.A. Reading Adventure</small></span>
          </a>
          <nav aria-label="Reader access" className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSection('catalog')} className="tb-button-secondary flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-700 sm:px-4"><LibraryBigIcon aria-hidden="true" className="h-4 w-4" />Browse books</button>
            <button type="button" onClick={() => setAuthMode('login')} className="tb-button-secondary flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-700 sm:px-4"><MailIcon aria-hidden="true" className="h-4 w-4" />Sign in with email</button>
            <a href="/kiosk" className="reader-gold-button min-h-11 px-3 text-sm sm:px-4">Use your card <ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></a>
          </nav>
        </div>
      </header>
      <AppShell guest showGuestNavigation bonAutoPeek={false} catalogLayout="grid" guestHero={<HeroReading />} onRequestAuth={() => setAuthMode('login')} />
      <AccountDialog mode={authMode} onClose={() => setAuthMode(null)} onSignedIn={() => window.location.replace('/')} />
    </div>
  </>;
}
