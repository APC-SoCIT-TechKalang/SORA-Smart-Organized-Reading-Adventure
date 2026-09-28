import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenIcon, LogOutIcon, RadioIcon, ShieldCheckIcon } from 'lucide-react';
import { database, errorMessage } from './lib/supabase';
import { startWebNfcScan, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';

type KioskAccount = { profile: { first_name: string; last_name: string }; membership: { number: string; expires_at: string | null }; progress: { points: number; streak: number }; reading_sessions: number };
type KioskStatus = 'ready' | 'scanning' | 'authorizing' | 'error';
const IDLE_MS = 2 * 60 * 1000;
const MAX_SESSION_MS = 15 * 60 * 1000;
const SESSION_STARTED_KEY = 'sora.kiosk.session-started-at';
const ACCOUNT_KEY = 'sora.kiosk.account';

export function KioskApp() {
  const [account, setAccount] = useState<KioskAccount | null>(null);
  const [status, setStatus] = useState<KioskStatus>('ready');
  const [message, setMessage] = useState('');
  const idleTimer = useRef<number>();

  const clearSession = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* Clear local kiosk state even if network is unavailable. */ }
    window.sessionStorage.removeItem(SESSION_STARTED_KEY);
    window.sessionStorage.removeItem(ACCOUNT_KEY);
    setAccount(null); setStatus('ready'); setMessage('');
  }, []);

  const establishSession = useCallback(async ({ tokenHash, account: nextAccount }: BridgeAuthentication) => {
    setStatus('authorizing'); setMessage('');
    try {
      // Use the same Supabase client/storage as the BONBON User UI. This is
      // what makes a successful card tap equivalent to normal customer login.
      const { data, error } = await database().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error || !data.session) throw error || new Error('The card session could not be verified.');
      window.sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      setAccount(nextAccount as KioskAccount);
      setStatus('ready');
      window.location.assign('/');
    } catch (cause) { await clearSession(); setMessage(errorMessage(cause)); setStatus('error'); }
  }, [clearSession]);

  const authenticateUid = useCallback(async (rfidUid: string) => {
    setStatus('authorizing'); setMessage('');
    try {
      const response = await fetch('/api/kiosk/rfid-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rfidUid }), cache: 'no-store' });
      const payload = await response.json() as BridgeAuthentication & { error?: string };
      if (!response.ok || !payload.tokenHash) throw new Error(payload.error || 'Card not recognized or inactive.');
      await establishSession(payload);
    } catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  }, [establishSession]);

  const startScan = useCallback(async () => {
    if (!supportsWebNfc()) { setMessage('Waiting for the connected library card reader. This browser cannot read NFC cards directly.'); setStatus('scanning'); return; }
    setStatus('scanning'); setMessage('Hold your library card near this device.');
    try { await startWebNfcScan(uid => void authenticateUid(uid)); }
    catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  }, [authenticateUid]);

  useEffect(() => subscribeToReaderBridge(authentication => void establishSession(authentication)), [establishSession]);
  useEffect(() => {
    const restore = async () => {
      const startedAt = Number(window.sessionStorage.getItem(SESSION_STARTED_KEY));
      if (!startedAt || Date.now() - startedAt > MAX_SESSION_MS) return void clearSession();
      const { data, error } = await database().auth.getUser();
      // getUser validates the stored token with Supabase rather than trusting a
      // cached session after a refresh.
      if (error || !data.user) return void clearSession();
      const stored = window.sessionStorage.getItem(ACCOUNT_KEY);
      if (!stored) return void clearSession();
      try { setAccount(JSON.parse(stored) as KioskAccount); } catch { await clearSession(); }
    };
    void restore();
  }, [clearSession]);
  useEffect(() => { if (account) window.sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)); }, [account]);
  useEffect(() => {
    if (!account) return;
    const expire = () => void clearSession();
    const reset = () => { window.clearTimeout(idleTimer.current); idleTimer.current = window.setTimeout(expire, IDLE_MS); };
    const remaining = Number(window.sessionStorage.getItem(SESSION_STARTED_KEY)) + MAX_SESSION_MS - Date.now();
    const maxTimer = window.setTimeout(expire, Math.max(0, remaining));
    (['pointerdown', 'keydown', 'touchstart'] as const).forEach(event => window.addEventListener(event, reset)); reset();
    return () => { (['pointerdown', 'keydown', 'touchstart'] as const).forEach(event => window.removeEventListener(event, reset)); window.clearTimeout(idleTimer.current); window.clearTimeout(maxTimer); };
  }, [account, clearSession]);

  return <main className="tb-field tb-world-shell min-h-screen text-umber"><KioskHeader />
    <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1480px] place-items-center px-4 py-8 sm:px-6 sm:py-12">
      {account ? <AccountView account={account} endSession={clearSession} /> : <WelcomeView status={status} message={message} startScan={startScan} />}
    </div>
  </main>;
}

function KioskHeader() { return <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 min-[390px]:px-4 sm:px-6 sm:py-3"><div className="flex min-w-0 items-center gap-2 text-umber sm:gap-3"><span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 sm:h-11 sm:w-11"><BookOpenIcon className="h-5 w-5 text-rust" /></span><span className="min-w-0 font-display font-900 uppercase leading-none tracking-[.04em] sm:tracking-[.07em]"><span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl">Tankobonbon</span><small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:text-[10px]">S.O.R.A. Reading Adventure</small></span></div><span className="tb-eyebrow hidden sm:block">Store kiosk</span></div></header>; }

function WelcomeView({ status, message, startScan }: { status: KioskStatus; message: string; startScan: () => Promise<void> }) { return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-7 text-center shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-12"><span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-parch/50 text-rust sm:h-28 sm:w-28"><RadioIcon className="h-11 w-11 sm:h-12 sm:w-12" /></span><h1 className="mt-7 font-display text-3xl font-900 uppercase tracking-[.04em] sm:text-4xl">Tap to log in</h1><p aria-live="polite" className="mx-auto mt-3 max-w-md text-sm leading-6 text-umber/65">{status === 'scanning' ? 'Reader ready. Hold your library card near the reader.' : 'Use your library card on the kiosk reader to open your account.'}</p>{message && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-lg border p-3 text-sm ${status === 'error' ? 'border-rust/30 bg-rust/10 text-rust' : 'border-gold/30 bg-parch/30 text-umber/70'}`}>{message}</p>}<button type="button" onClick={() => void startScan()} disabled={status === 'authorizing'} className="tb-button-primary tb-cut-sm mt-8 min-h-14 w-full px-6 text-base uppercase tracking-[.1em] disabled:opacity-60">{status === 'authorizing' ? 'Verifying card…' : status === 'scanning' ? 'Reader is waiting' : 'Start card reader'}</button><p className="mt-4 text-xs leading-5 text-umber/50">No email, password, or manual card number is required.</p></section>; }

function AccountView({ account, endSession }: { account: KioskAccount; endSession: () => Promise<void> }) { const name = `${account.profile.first_name} ${account.profile.last_name}`; return <section className="w-full max-w-3xl"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="tb-eyebrow">Temporary kiosk session</p><h1 className="mt-2 font-display text-3xl font-900 sm:text-4xl">Welcome, {account.profile.first_name}</h1></div><button type="button" onClick={() => void endSession()} className="tb-button-secondary tb-cut-sm min-h-12 px-5 text-rust"><LogOutIcon className="h-4 w-4" />End session</button></div><div className="tb-surface tb-cut-lg border border-gold/35 p-6 sm:p-8"><div className="flex items-center gap-3 border-b border-gold/25 pb-5"><ShieldCheckIcon className="h-8 w-8 text-emerald-700"/><div><strong className="font-display text-xl font-900">{name}</strong><p className="text-xs text-umber/55">Membership {account.membership.number}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Rank streak', account.progress.streak], ['Library points', account.progress.points], ['Reading sessions', account.reading_sessions]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-parch/35 p-5"><p className="text-[10px] font-800 uppercase tracking-[.14em] text-gold">{label}</p><strong className="mt-2 block font-display text-3xl font-900">{value}</strong></div>)}</div><p className="mt-6 text-center text-xs text-umber/55">For privacy, this session ends after two minutes without activity and never lasts longer than fifteen minutes.</p></div></section>; }
