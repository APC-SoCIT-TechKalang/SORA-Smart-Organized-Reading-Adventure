import { useCallback, useEffect, useState } from 'react';
import { BookOpenIcon, RadioIcon } from 'lucide-react';
import { database, errorMessage } from './lib/supabase';
import { startWebNfcScan, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';

type KioskStatus = 'ready' | 'scanning' | 'authorizing' | 'error';
const SESSION_STARTED_KEY = 'sora.kiosk.session-started-at';

export function KioskApp() {
  const [status, setStatus] = useState<KioskStatus>('ready');
  const [message, setMessage] = useState('');

  const clearSession = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* Clear local kiosk state even if network is unavailable. */ }
    window.sessionStorage.removeItem(SESSION_STARTED_KEY);
    setStatus('ready'); setMessage('');
  }, []);

  const establishSession = useCallback(async ({ tokenHash }: BridgeAuthentication) => {
    setStatus('authorizing'); setMessage('');
    try {
      // Use the same Supabase client/storage as the BONBON User UI. This is
      // what makes a successful card tap equivalent to normal customer login.
      const { data, error } = await database().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error || !data.session) throw error || new Error('The card session could not be verified.');
      window.sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      // The shared Supabase client now contains the same session used by the
      // regular BONBON UI. Do not render a second kiosk dashboard first.
      window.location.replace('/');
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
  useEffect(() => { void clearSession(); }, [clearSession]);

  return <main className="tb-field tb-world-shell min-h-screen text-umber"><KioskHeader />
    <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1480px] place-items-center px-4 py-8 sm:px-6 sm:py-12">
      <WelcomeView status={status} message={message} startScan={startScan} />
    </div>
  </main>;
}

function KioskHeader() { return <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 min-[390px]:px-4 sm:px-6 sm:py-3"><div className="flex min-w-0 items-center gap-2 text-umber sm:gap-3"><span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 sm:h-11 sm:w-11"><BookOpenIcon className="h-5 w-5 text-rust" /></span><span className="min-w-0 font-display font-900 uppercase leading-none tracking-[.04em] sm:tracking-[.07em]"><span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl">Tankobonbon</span><small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:text-[10px]">S.O.R.A. Reading Adventure</small></span></div><span className="tb-eyebrow hidden sm:block">Store kiosk</span></div></header>; }

function WelcomeView({ status, message, startScan }: { status: KioskStatus; message: string; startScan: () => Promise<void> }) { return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-7 text-center shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-12"><span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-parch/50 text-rust sm:h-28 sm:w-28"><RadioIcon className="h-11 w-11 sm:h-12 sm:w-12" /></span><h1 className="mt-7 font-display text-3xl font-900 uppercase tracking-[.04em] sm:text-4xl">Tap to log in</h1><p aria-live="polite" className="mx-auto mt-3 max-w-md text-sm leading-6 text-umber/65">{status === 'scanning' ? 'Reader ready. Hold your library card near the reader.' : 'Use your library card on the kiosk reader to open your account.'}</p>{message && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-lg border p-3 text-sm ${status === 'error' ? 'border-rust/30 bg-rust/10 text-rust' : 'border-gold/30 bg-parch/30 text-umber/70'}`}>{message}</p>}<button type="button" onClick={() => void startScan()} disabled={status === 'authorizing'} className="tb-button-primary tb-cut-sm mt-8 min-h-14 w-full px-6 text-base uppercase tracking-[.1em] disabled:opacity-60">{status === 'authorizing' ? 'Verifying card…' : status === 'scanning' ? 'Reader is waiting' : 'Start card reader'}</button><p className="mt-4 text-xs leading-5 text-umber/50">No email, password, or manual card number is required.</p></section>; }
