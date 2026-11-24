import { useCallback, useEffect, useState } from 'react';
import { BookOpenIcon, ChevronDownIcon, LogOutIcon, Settings2Icon, UserRoundIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { AccountDialog } from './AccountDialog';
import { ManageAccountDialog } from './ManageAccountDialog';
import { DigitalCardDialog } from './DigitalCardDialog';
import { ReadingStatsDialog } from './ReadingStatsDialog';
import { MyProfileDialog } from './MyProfileDialog';

export function GameHUD() {
  const [mode, setMode] = useState<'login' | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [manageAccountOpen, setManageAccountOpen] = useState(false);
  const [digitalCardOpen, setDigitalCardOpen] = useState(false);
  const [readingStatsOpen, setReadingStatsOpen] = useState(false);
  const [myProfileOpen, setMyProfileOpen] = useState(false);
  const { session, profile, coins, rank, setSection, signOut, busy, readerAccess } = useGame();
  const displayName = profile?.first_name || session?.user.user_metadata?.first_name || 'Reader';
  const initial = displayName.slice(0, 1).toUpperCase();
  const closeAuth = useCallback(() => setMode(null), []);
  const closeDigitalCard = useCallback(() => setDigitalCardOpen(false), []);

  useEffect(() => {
    const openAuth = () => setMode('login');
    window.addEventListener('tankobonbon:open-auth', openAuth);
    return () => window.removeEventListener('tankobonbon:open-auth', openAuth);
  }, []);

  const goToReadingStats = () => {
    setMyProfileOpen(false);
    setReadingStatsOpen(true);
  };
  const openMyProfile = () => {
    setAccountOpen(false);
    setMyProfileOpen(true);
  };
  const openDigitalCard = () => {
    setMyProfileOpen(false);
    setDigitalCardOpen(true);
  };
  const openManageAccount = () => {
    setAccountOpen(false);
    setManageAccountOpen(true);
  };

  return (
    <>
      <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 min-[390px]:gap-3 min-[390px]:px-4 sm:px-6 sm:py-3">
          <button type="button" onClick={() => setSection('archive')} className="group flex min-w-0 items-center gap-2 text-left text-umber sm:gap-3">
            <span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 transition group-hover:bg-parch/50 sm:h-11 sm:w-11">
              <BookOpenIcon aria-hidden="true" className="h-5 w-5 text-rust" />
            </span>
            <span className="min-w-0 font-display font-900 uppercase leading-none tracking-[0.04em] sm:tracking-[0.07em]">
              <span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl lg:text-[28px]">Tankobonbon</span>
              <small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:mt-1.5 sm:text-[10px] sm:tracking-[.17em] lg:text-xs">S.O.R.A. Reading Adventure</small>
            </span>
          </button>

          <div className="min-w-0 justify-self-end">
            {session ? (
              <div className="relative">
                <button type="button" aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen((value) => !value)} className="tb-button-secondary tb-cut-sm min-h-11 px-2.5 py-1.5 text-left">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-umber font-display text-xs font-900 text-sun">{initial}</span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[130px] truncate text-xs font-800 text-umber">{displayName}</span>
                    <span className="block text-[10px] font-700 text-gold">Rank {rank} · {coins} points</span>
                  </span>
                  <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5 text-gold" />
                </button>
                {accountOpen && (
                  <div role="menu" className="fixed inset-x-3 top-[68px] z-50 overflow-hidden rounded-xl border border-gold/35 bg-cream p-2 shadow-[0_20px_50px_rgba(64,43,29,.2)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-64">
                    <div className="border-b border-gold/25 px-3 py-2.5">
                      <p className="font-display text-sm font-800 text-umber">{displayName}’s account</p>
                      <p className="mt-1 truncate text-xs text-umber/60">{session.user.email}</p>
                      <p className="mt-2 text-[11px] font-800 text-rust">Rank {rank} · {coins} library points</p>
                    </div>
                    {readerAccess === 'active' && <AccountMenuItem icon={UserRoundIcon} label="My profile" onClick={openMyProfile} />}
                    <AccountMenuItem icon={Settings2Icon} label="Manage account" onClick={openManageAccount} />
                    <button role="menuitem" type="button" disabled={busy} onClick={() => { setAccountOpen(false); void signOut(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-800 text-rust transition hover:bg-parch/35 disabled:opacity-50">
                      <LogOutIcon aria-hidden="true" className="h-4 w-4" />Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setMode('login')} className="tb-button-secondary tb-cut-sm whitespace-nowrap px-3 text-xs lg:px-4 lg:text-sm">Sign in</button>
            )}
          </div>
        </div>
      </header>
      <AccountDialog mode={mode} onClose={closeAuth} />
      <ManageAccountDialog open={manageAccountOpen} onClose={() => setManageAccountOpen(false)} />
      <DigitalCardDialog open={digitalCardOpen} onClose={closeDigitalCard} />
      <ReadingStatsDialog open={readingStatsOpen} onClose={() => setReadingStatsOpen(false)} />
      <MyProfileDialog open={myProfileOpen} onClose={() => setMyProfileOpen(false)} onOpenReadingStats={goToReadingStats} onOpenDigitalCard={openDigitalCard} />
    </>
  );
}

function AccountMenuItem({ icon: Icon, label, onClick }: { icon: typeof UserRoundIcon; label: string; onClick: () => void }) {
  return <button role="menuitem" type="button" onClick={onClick} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-800 text-umber transition hover:bg-parch/35"><Icon aria-hidden="true" className="h-4 w-4 text-gold" />{label}</button>;
}
