import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenIcon, Clock3Icon, LogOutIcon, RadioIcon, ShieldCheckIcon } from 'lucide-react';
import { database, errorMessage } from './lib/supabase';

type LoginRequest = { request_id: string; request_secret: string; pairing_code: string; expires_at: string };
type KioskAccount = {
  status: 'approved';
  session_expires_at: string;
  profile: { first_name: string; last_name: string };
  membership: { number: string; status: string; expires_at: string | null; remaining_minutes: number | null };
  progress: { points: number; streak: number; rank: string };
  reading_sessions: number;
};

const STORAGE_KEY = 'tankobonbon-kiosk-request';
const IDLE_MS = 2 * 60 * 1000;

export function KioskApp() {
  const [request, setRequest] = useState<LoginRequest | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as LoginRequest | null; }
    catch { return null; }
  });
  const [account, setAccount] = useState<KioskAccount | null>(null);
  const [status, setStatus] = useState<'welcome' | 'starting' | 'waiting' | 'expired' | 'error'>(request ? 'waiting' : 'welcome');
  const [message, setMessage] = useState('');
  const idleTimer = useRef<number>();

  const clearLocal = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setRequest(null);
    setAccount(null);
    setStatus('welcome');
    setMessage('');
  }, []);

  const endSession = useCallback(async () => {
    if (request) await database().rpc('kiosk_end_session', { p_request_id: request.request_id, p_request_secret: request.request_secret });
    clearLocal();
  }, [clearLocal, request]);

  const begin = async () => {
    setStatus('starting');
    setMessage('');
    try {
      const { data, error } = await database().rpc('kiosk_begin_login', { p_device_label: 'Store kiosk' }).single();
      if (error) throw error;
      const created = data as LoginRequest;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(created));
      setRequest(created);
      setStatus('waiting');
    } catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  };

  useEffect(() => {
    if (!request || account) return;
    let active = true;
    const check = async () => {
      const { data, error } = await database().rpc('kiosk_login_status', { p_request_id: request.request_id, p_request_secret: request.request_secret });
      if (!active) return;
      if (error) { setMessage(error.message); setStatus('error'); return; }
      const result = data as { status: string } & Partial<KioskAccount>;
      if (result.status === 'approved') { setAccount(result as KioskAccount); setStatus('waiting'); }
      else if (['expired', 'ended', 'invalid', 'unavailable'].includes(result.status)) { sessionStorage.removeItem(STORAGE_KEY); setStatus('expired'); setRequest(null); }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [account, request]);

  useEffect(() => {
    if (!account) return;
    const resetIdle = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => void endSession(), IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdle));
    resetIdle();
    const remaining = new Date(account.session_expires_at).getTime() - Date.now();
    const maximum = window.setTimeout(() => void endSession(), Math.max(0, remaining));
    return () => { events.forEach(event => window.removeEventListener(event, resetIdle)); window.clearTimeout(idleTimer.current); window.clearTimeout(maximum); };
  }, [account, endSession]);

  return <main className="tb-field min-h-screen bg-cream text-umber">
    <header className="border-b border-gold/35 bg-umber px-5 py-4 text-cream shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full border border-sun/50"><BookOpenIcon className="h-5 w-5 text-sun" /></span><div><strong className="font-display text-xl font-900 uppercase tracking-[.08em]">Tankobonbon</strong><p className="text-[10px] font-800 uppercase tracking-[.2em] text-sand/70">Store kiosk</p></div></div>
    </header>
    <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-5xl place-items-center px-5 py-10">
      {account ? <AccountView account={account} endSession={endSession} /> :
       status === 'waiting' && request ? <WaitingView code={request.pairing_code} cancel={endSession} /> :
       <WelcomeView status={status} message={message} begin={begin} />}
    </div>
  </main>;
}

function WelcomeView({ status, message, begin }: { status: string; message: string; begin: () => void }) {
  return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-8 text-center shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-12">
    <span className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-parch/50 text-rust"><RadioIcon className="h-12 w-12" /></span>
    <h1 className="mt-7 font-display text-4xl font-900 uppercase tracking-[.04em]">Welcome, reader</h1>
    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-umber/65">Start here, then ask a staff member to connect your library account. RFID tap will replace this temporary step.</p>
    {(status === 'expired' || status === 'error') && <p role="alert" className="mt-5 rounded-lg border border-rust/30 bg-rust/10 p-3 text-sm text-rust">{message || 'That request expired. Please start again.'}</p>}
    <button type="button" disabled={status === 'starting'} onClick={() => void begin()} className="tb-button-primary tb-cut-sm mt-8 min-h-14 w-full px-6 text-base uppercase tracking-[.1em] disabled:opacity-60">{status === 'starting' ? 'Starting…' : 'Tap to log in'}</button>
  </section>;
}

function WaitingView({ code, cancel }: { code: string; cancel: () => Promise<void> }) {
  return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-8 text-center sm:p-12">
    <Clock3Icon className="mx-auto h-10 w-10 animate-pulse text-gold" />
    <h1 className="mt-5 font-display text-3xl font-900 uppercase">Waiting for staff</h1>
    <p className="mt-3 text-sm text-umber/65">Show this code to the librarian:</p>
    <div className="my-7 font-display text-6xl font-900 tracking-[.18em] text-rust" aria-label={`Pairing code ${code}`}>{code}</div>
    <p className="text-xs leading-5 text-umber/55">This code expires in five minutes and only works on this kiosk.</p>
    <button type="button" onClick={() => void cancel()} className="tb-button-secondary tb-cut-sm mt-7 px-6 py-3">Cancel</button>
  </section>;
}

function AccountView({ account, endSession }: { account: KioskAccount; endSession: () => Promise<void> }) {
  const name = `${account.profile.first_name} ${account.profile.last_name}`;
  return <section className="w-full max-w-3xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="tb-eyebrow">Temporary kiosk session</p><h1 className="mt-2 font-display text-4xl font-900">Welcome, {account.profile.first_name}</h1></div><button type="button" onClick={() => void endSession()} className="tb-button-secondary tb-cut-sm min-h-12 px-5 text-rust"><LogOutIcon className="h-4 w-4" />End session</button></div>
    <div className="tb-surface tb-cut-lg border border-gold/35 p-6 sm:p-8"><div className="flex items-center gap-3 border-b border-gold/25 pb-5"><ShieldCheckIcon className="h-8 w-8 text-emerald-700"/><div><strong className="font-display text-xl font-900">{name}</strong><p className="text-xs text-umber/55">Membership {account.membership.number}</p></div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Rank', account.progress.rank], ['Library points', account.progress.points], ['Reading sessions', account.reading_sessions]].map(([label, value]) => <div key={label} className="rounded-xl bg-parch/35 p-5"><p className="text-[10px] font-800 uppercase tracking-[.14em] text-gold">{label}</p><strong className="mt-2 block font-display text-3xl font-900">{value}</strong></div>)}</div>
      <p className="mt-6 text-center text-xs text-umber/55">For your privacy, this session ends after two minutes without activity or after fifteen minutes total.</p>
    </div>
  </section>;
}
