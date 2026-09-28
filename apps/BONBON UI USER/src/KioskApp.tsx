import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenIcon, LogOutIcon, RadioIcon, ShieldCheckIcon } from 'lucide-react';
import { database, errorMessage } from './lib/supabase';

type KioskAccount = {
  status: 'approved';
  profile: { first_name: string; last_name: string };
  membership: { number: string; status: string; expires_at: string | null; remaining_minutes: number | null };
  progress: { points: number; streak: number; rank: string };
  reading_sessions: number;
};

const IDLE_MS = 2 * 60 * 1000;

export function KioskApp() {
  const [account, setAccount] = useState<KioskAccount | null>(null);
  const [status, setStatus] = useState<'welcome' | 'starting' | 'error'>('welcome');
  const [message, setMessage] = useState('');
  const idleTimer = useRef<number>();

  const clearLocal = useCallback(() => {
    setAccount(null);
    setStatus('welcome');
    setMessage('');
  }, []);

  const endSession = useCallback(async () => { clearLocal(); }, [clearLocal]);

  const begin = async (rfidUid: string) => {
    setStatus('starting');
    setMessage('');
    try {
      const { data, error } = await database().rpc('kiosk_rfid_lookup', { p_rfid_uid: rfidUid.trim() });
      if (error) throw error;
      const result = data as KioskAccount & { status: string };
      if (result.status !== 'approved') throw new Error(result.status === 'not_found' ? 'Card not recognized or inactive.' : 'This reader account is not available.');
      setAccount(result);
    } catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  };

  useEffect(() => {
    if (!account) return;
    const resetIdle = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => void endSession(), IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdle));
    resetIdle();
    return () => { events.forEach(event => window.removeEventListener(event, resetIdle)); window.clearTimeout(idleTimer.current); };
  }, [account, endSession]);

  return <main className="tb-field tb-world-shell min-h-screen text-umber">
    <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 min-[390px]:px-4 sm:px-6 sm:py-3"><div className="flex min-w-0 items-center gap-2 text-umber sm:gap-3"><span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 sm:h-11 sm:w-11"><BookOpenIcon className="h-5 w-5 text-rust" /></span><span className="min-w-0 font-display font-900 uppercase leading-none tracking-[.04em] sm:tracking-[.07em]"><span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl">Tankobonbon</span><small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:text-[10px]">S.O.R.A. Reading Adventure</small></span></div><span className="tb-eyebrow hidden sm:block">Store kiosk</span></div>
    </header>
    <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1480px] place-items-center px-4 py-8 sm:px-6 sm:py-12">
      {account ? <AccountView account={account} endSession={endSession} /> :
       <WelcomeView status={status} message={message} begin={begin} />}
    </div>
  </main>;
}

function WelcomeView({ status, message, begin }: { status: string; message: string; begin: (rfidUid: string) => Promise<void> }) {
  const [rfidUid, setRfidUid] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (rfidUid.trim()) void begin(rfidUid); };
  return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-8 text-center shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-12">
    <span className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-parch/50 text-rust"><RadioIcon className="h-12 w-12" /></span>
    <h1 className="mt-7 font-display text-4xl font-900 uppercase tracking-[.04em]">Tap to log in</h1>
    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-umber/65">Tap your library card on the reader. For local testing, enter the card UID below.</p>
    {(status === 'error') && <p role="alert" className="mt-5 rounded-lg border border-rust/30 bg-rust/10 p-3 text-sm text-rust">{message || 'Card not recognized.'}</p>}
    <form onSubmit={submit} className="mt-8"><label className="sr-only" htmlFor="rfid-test-input">RFID card UID</label><input id="rfid-test-input" autoFocus value={rfidUid} onChange={event => setRfidUid(event.target.value)} placeholder="RFID UID (local test)" className="tb-input tb-cut-sm h-14 w-full text-center font-mono text-lg uppercase tracking-[.12em]" autoComplete="off" /><button type="submit" disabled={status === 'starting' || !rfidUid.trim()} className="tb-button-primary tb-cut-sm mt-3 min-h-14 w-full px-6 text-base uppercase tracking-[.1em] disabled:opacity-60">{status === 'starting' ? 'Checking card…' : 'Continue'}</button></form>
  </section>;
}

function AccountView({ account, endSession }: { account: KioskAccount; endSession: () => Promise<void> }) {
  const name = `${account.profile.first_name} ${account.profile.last_name}`;
  return <section className="w-full max-w-3xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="tb-eyebrow">Temporary kiosk session</p><h1 className="mt-2 font-display text-4xl font-900">Welcome, {account.profile.first_name}</h1></div><button type="button" onClick={() => void endSession()} className="tb-button-secondary tb-cut-sm min-h-12 px-5 text-rust"><LogOutIcon className="h-4 w-4" />End session</button></div>
    <div className="tb-surface tb-cut-lg border border-gold/35 p-6 sm:p-8"><div className="flex items-center gap-3 border-b border-gold/25 pb-5"><ShieldCheckIcon className="h-8 w-8 text-emerald-700"/><div><strong className="font-display text-xl font-900">{name}</strong><p className="text-xs text-umber/55">Membership {account.membership.number}</p></div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Rank', account.progress.rank], ['Library points', account.progress.points], ['Reading sessions', account.reading_sessions]].map(([label, value]) => <div key={label} className="rounded-xl bg-parch/35 p-5"><p className="text-[10px] font-800 uppercase tracking-[.14em] text-gold">{label}</p><strong className="mt-2 block font-display text-3xl font-900">{value}</strong></div>)}</div>
      <p className="mt-6 text-center text-xs text-umber/55">For your privacy, this local test session ends after two minutes without activity.</p>
    </div>
  </section>;
}
