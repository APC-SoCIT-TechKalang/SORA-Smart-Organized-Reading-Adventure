import { useState } from 'react';
import { BookOpenIcon, SearchIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { AccountDialog } from './AccountDialog';
export function GameHUD({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const [mode, setMode] = useState<'login' | 'preregister' | null>(null);
  const { session, profile, coins, rank, setSection, signOut, busy } = useGame();
  return <><header className="sticky top-0 z-40 border-b-[3px] border-gold bg-cream/95 backdrop-blur">
    <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-4 px-5 py-4">
      <button onClick={() => setSection('archive')} className="flex items-center gap-3 text-left text-umber"><BookOpenIcon className="h-9 w-9 text-rust"/><span className="font-display text-xl font-900 uppercase tracking-wider">Tankobonbon<small className="block text-[10px] tracking-[.25em] text-gold">S.O.R.A. Reading Adventure</small></span></button>
      <label className="ml-auto flex items-center gap-2 border border-gold/40 px-3 py-2"><SearchIcon className="h-4 w-4 text-gold"/><input aria-label="Search catalog" value={query} onChange={e => { onQueryChange(e.target.value); setSection('catalog'); }} placeholder="Find a book…" className="w-36 bg-transparent text-sm outline-none sm:w-52"/></label>
      {session ? <><button onClick={() => setSection('shelf')} className="text-sm text-umber">{profile?.first_name ?? session.user.email} · Rank {rank} · {coins} points</button><button disabled={busy} onClick={() => void signOut()} className="text-sm text-rust underline">Sign out</button></> :
      <><button onClick={() => setMode('login')} className="border border-gold px-4 py-2 text-sm">Sign in</button><button onClick={() => setMode('preregister')} className="bg-rust px-4 py-2 text-sm text-cream">Pre-register</button></>}
    </div></header><AccountDialog mode={mode} onClose={() => setMode(null)}/></>;
}

