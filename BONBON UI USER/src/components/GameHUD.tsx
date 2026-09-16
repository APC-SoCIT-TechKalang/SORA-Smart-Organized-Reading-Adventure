import { useCallback, useEffect, useState } from 'react';
import { BookOpenIcon, ChevronDownIcon, LogOutIcon, SearchIcon, Settings2Icon, UserRoundIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { AccountDialog } from './AccountDialog';
import { ManageAccountDialog } from './ManageAccountDialog';

export function GameHUD({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const [mode, setMode] = useState<'login' | 'preregister' | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [manageAccountOpen, setManageAccountOpen] = useState(false);
  const { session, profile, coins, rank, setSection, signOut, busy } = useGame();
  const displayName = profile?.first_name || session?.user.user_metadata?.first_name || 'Reader';
  const initial = displayName.slice(0, 1).toUpperCase();
  const closeAuth = useCallback(() => setMode(null), []);

  useEffect(() => {
    const openAuth = () => setMode('login');
    window.addEventListener('tankobonbon:open-auth', openAuth);
    return () => window.removeEventListener('tankobonbon:open-auth', openAuth);
  }, []);

  const goToAccount = () => {
    setAccountOpen(false);
    setSection('shelf');
  };
  const openManageAccount = () => {
    setAccountOpen(false);
    setManageAccountOpen(true);
  };

  return (
    <>
      <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 lg:grid-cols-[auto_minmax(240px,430px)_auto] lg:gap-5">
          <button type="button" onClick={() => setSection('archive')} className="group flex min-w-0 items-center gap-2.5 text-left text-umber">
            <span className="tb-brand-seal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 transition group-hover:bg-parch/50">
              <BookOpenIcon aria-hidden="true" className="h-5 w-5 text-rust" />
            </span>
            <span className="min-w-0 font-display text-[15px] font-900 uppercase tracking-[0.08em] sm:text-lg">
              Tankobonbon
              <small className="block truncate font-body text-[8px] font-800 tracking-[.18em] text-gold sm:text-[9px]">S.O.R.A. Reading Adventure</small>
            </span>
          </button>

          <label className="tb-input tb-search-rune order-3 col-span-2 flex w-full items-center gap-2.5 rounded-full px-4 lg:order-none lg:col-span-1">
            <SearchIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gold" />
            <input aria-label="Search catalog" value={query} onChange={(event) => { onQueryChange(event.target.value); setSection('catalog'); }} placeholder="Search title, author, or genre" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-umber/45" />
            {query && <button type="button" onClick={() => onQueryChange('')} className="rounded-full px-1 text-xs font-800 text-umber/50 hover:text-rust" aria-label="Clear search">Clear</button>}
          </label>

          <div className="justify-self-end">
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
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gold/35 bg-cream p-2 shadow-[0_20px_50px_rgba(64,43,29,.2)]">
                    <div className="border-b border-gold/25 px-3 py-2.5">
                      <p className="font-display text-sm font-800 text-umber">{displayName}’s account</p>
                      <p className="mt-1 truncate text-xs text-umber/60">{session.user.email}</p>
                      <p className="mt-2 text-[11px] font-800 text-rust">Rank {rank} · {coins} library points</p>
                    </div>
                    <AccountMenuItem icon={UserRoundIcon} label="My reading shelf" onClick={goToAccount} />
                    <AccountMenuItem icon={Settings2Icon} label="Manage account" onClick={openManageAccount} />
                    <button role="menuitem" type="button" disabled={busy} onClick={() => { setAccountOpen(false); void signOut(); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-800 text-rust transition hover:bg-parch/35 disabled:opacity-50">
                      <LogOutIcon aria-hidden="true" className="h-4 w-4" />Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode('login')} className="tb-button-secondary tb-cut-sm px-3 text-xs sm:px-4 sm:text-sm">Sign in</button>
                <button type="button" onClick={() => setMode('preregister')} className="tb-button-primary tb-cut-sm hidden px-4 text-sm sm:inline-flex">Pre-register</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <AccountDialog mode={mode} onClose={closeAuth} />
      <ManageAccountDialog open={manageAccountOpen} onClose={() => setManageAccountOpen(false)} />
    </>
  );
}

function AccountMenuItem({ icon: Icon, label, onClick }: { icon: typeof UserRoundIcon; label: string; onClick: () => void }) {
  return <button role="menuitem" type="button" onClick={onClick} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-800 text-umber transition hover:bg-parch/35"><Icon aria-hidden="true" className="h-4 w-4 text-gold" />{label}</button>;
}
