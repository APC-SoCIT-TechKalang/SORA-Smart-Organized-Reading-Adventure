import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CameraIcon,
  CheckIcon,
  LoaderCircleIcon,
  QrCodeIcon,
  RadioIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { database, errorMessage } from './lib/supabase';
import { requireReaderAccount } from './lib/replacement-library';
import { startWebNfcScan, subscribeToHidScanner, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';
import { parseKioskQrPayload } from './lib/kioskQr';

type KioskStatus = 'ready' | 'scanning' | 'authorizing' | 'error';
const SESSION_STARTED_KEY = 'sora.kiosk.session-started-at';

export function KioskApp() {
  const [status, setStatus] = useState<KioskStatus>('ready');
  const [message, setMessage] = useState('');
  const [qrScanning, setQrScanning] = useState(false);
  const authenticating = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const clearSession = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* Clear local kiosk state even if network is unavailable. */ }
    window.sessionStorage.removeItem(SESSION_STARTED_KEY);
    setStatus('ready'); setMessage('');
  }, []);

  const establishSession = useCallback(async ({ tokenHash }: BridgeAuthentication) => {
    setStatus('authorizing'); setMessage('');
    try {
      const { data, error } = await database().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error || !data.session) throw error || new Error('The card session could not be verified.');
      await requireReaderAccount();
      window.sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      window.location.replace('/');
    } catch (cause) { await clearSession(); setMessage(errorMessage(cause)); setStatus('error'); }
  }, [clearSession]);

  const authenticate = useCallback(async (credential: { rfidUid: string } | { userId: string }) => {
    if (authenticating.current) return;
    authenticating.current = true;
    setStatus('authorizing'); setMessage('');
    try {
      const response = await fetch('/api/kiosk/rfid-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credential), cache: 'no-store' });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Card detected, but the kiosk login service is unavailable. Please ask staff to start the kiosk server.');
      }
      const payload = await response.json() as BridgeAuthentication & { error?: string };
      if (!response.ok || !payload.tokenHash) throw new Error(payload.error || 'Card not recognized or inactive.');
      await establishSession(payload);
    } catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
    finally { authenticating.current = false; }
  }, [establishSession]);

  const authenticateUid = useCallback((rfidUid: string) => authenticate({ rfidUid }), [authenticate]);
  const authenticateUser = useCallback((userId: string) => authenticate({ userId }), [authenticate]);
  const authenticateScannerPayload = useCallback((payload: string) => {
    if (authenticating.current) return;
    const userId = parseKioskQrPayload(payload);
    if (userId) {
      void authenticateUser(userId);
      return;
    }
    if (payload.startsWith('tankobonbon:')) {
      setStatus('error');
      setMessage('That QR code is not a valid Tankobonbon digital card.');
      return;
    }
    void authenticateUid(payload);
  }, [authenticateUid, authenticateUser]);

  const startPhysicalScan = useCallback(async () => {
    if (!supportsWebNfc()) { setMessage('USB card scanning is enabled. Keep this window focused and tap your card on the reader.'); setStatus('scanning'); return; }
    setStatus('scanning'); setMessage('Hold your library card near this device.');
    try { await startWebNfcScan(uid => void authenticateUid(uid)); }
    catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  }, [authenticateUid]);

  const startQrScan = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setMessage('Camera scanning is unavailable. Open this secure kiosk page in Safari or Chrome and allow camera access.');
      return;
    }
    setMessage('');
    setStatus('scanning');
    setQrScanning(true);
  }, []);

  useEffect(() => {
    if (!qrScanning) return;
    let disposed = false;
    let controls: IScannerControls | null = null;

    const stop = () => {
      disposed = true;
      controls?.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    const openCamera = async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 750 });
        const video = videoRef.current;
        if (!video) throw new Error('The QR camera could not be opened.');
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video,
          result => {
            if (disposed || !result) return;
            const userId = parseKioskQrPayload(result.getText());
            if (!userId) {
              setMessage('That QR code is not a Tankobonbon digital card.');
              return;
            }
            controls?.stop();
            setQrScanning(false);
            void authenticateUser(userId);
          },
        );
        if (disposed) controls.stop();
      } catch (cause) {
        stop();
        setQrScanning(false);
        setStatus('error');
        setMessage(cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access and try again.'
          : errorMessage(cause));
      }
    };
    void openCamera();
    return stop;
  }, [authenticateUser, qrScanning]);

  useEffect(() => subscribeToReaderBridge(authentication => void establishSession(authentication)), [establishSession]);
  useEffect(() => subscribeToHidScanner(authenticateScannerPayload), [authenticateScannerPayload]);
  useEffect(() => { void clearSession(); }, [clearSession]);

  return <main className="tb-field tb-world-shell min-h-screen overflow-hidden text-umber"><KioskHeader />
    <div className="relative mx-auto grid min-h-[calc(100dvh-76px)] max-w-[1480px] place-items-center px-4 py-7 sm:px-6 sm:py-10 lg:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full border border-gold/15 bg-sun/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-4 h-96 w-96 rounded-full border border-rust/10 bg-rust/5 blur-3xl" />
      <WelcomeView status={status} message={message} startPhysicalScan={startPhysicalScan} startQrScan={startQrScan} qrScanning={qrScanning} stopQrScan={() => { setQrScanning(false); setStatus('ready'); setMessage(''); }} videoRef={videoRef} />
    </div>
  </main>;
}

function KioskHeader() { return <header className="tb-hud sticky top-0 z-40 border-b border-gold/30 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 min-[390px]:px-4 sm:px-6 sm:py-3 lg:px-10"><div className="flex min-w-0 items-center gap-2.5 text-umber sm:gap-3"><span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 shadow-[0_3px_12px_rgba(84,56,34,.08)] sm:h-11 sm:w-11"><BookOpenIcon aria-hidden="true" className="h-5 w-5 text-rust" /></span><span className="min-w-0 font-display font-900 uppercase leading-none tracking-[.04em] sm:tracking-[.07em]"><span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl">Tankobonbon</span><small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:text-[10px]">S.O.R.A. Reading Adventure</small></span></div><div className="flex items-center gap-2 rounded-full border border-gold/25 bg-white/55 px-3 py-2 sm:px-4"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" /></span><span className="text-[9px] font-800 uppercase tracking-[.16em] text-umber/65 sm:text-[10px]">Kiosk ready</span></div></div></header>; }

interface WelcomeViewProps {
  status: KioskStatus;
  message: string;
  startPhysicalScan: () => Promise<void>;
  startQrScan: () => void;
  qrScanning: boolean;
  stopQrScan: () => void;
  videoRef: RefObject<HTMLVideoElement>;
}

function WelcomeView({ status, message, startPhysicalScan, startQrScan, qrScanning, stopQrScan, videoRef }: WelcomeViewProps) {
  if (qrScanning) return <section aria-labelledby="scan-title" className="tb-surface tb-cut-lg relative z-10 grid w-full max-w-5xl overflow-hidden border border-gold/35 shadow-[0_30px_90px_rgba(84,56,34,.2)] lg:grid-cols-[1.15fr_.85fr]">
    <div className="relative min-h-[360px] bg-umber p-4 sm:p-7 lg:min-h-[560px]">
      <div className="relative mx-auto h-full min-h-[328px] w-full overflow-hidden rounded-2xl border border-sun/60 bg-[#24150d] shadow-[inset_0_0_50px_rgba(0,0,0,.45)] sm:min-h-[480px]">
        <video ref={videoRef} muted playsInline aria-label="QR code camera preview" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(30,17,8,.48)] sm:inset-[16%]" />
        <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-1/2 h-0.5 bg-sun shadow-[0_0_16px_#f9d219] sm:left-[20%] sm:right-[20%]" />
        <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-umber/85 px-3 py-2 text-[10px] font-800 uppercase tracking-[.15em] text-cream backdrop-blur"><CameraIcon aria-hidden="true" className="h-3.5 w-3.5 text-sun" /> Camera active</span>
      </div>
    </div>
    <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
      <p className="tb-eyebrow">Digital reader card</p>
      <h1 id="scan-title" className="mt-4 font-display text-3xl font-900 uppercase leading-[1.08] tracking-[.035em] sm:text-4xl">Hold your QR code inside the frame</h1>
      <p className="mt-4 text-sm leading-6 text-umber/65 sm:text-base">Open your digital reader card and show the QR code on its back. Keep your screen steady and bright.</p>
      <div className="mt-7 flex items-start gap-3 border-y border-gold/20 py-4 text-left text-xs leading-5 text-umber/60"><ShieldCheckIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><p>Your QR code is used only to identify your reader account for this kiosk session.</p></div>
      {message && <p role="status" className="mt-5 rounded-xl border border-gold/30 bg-parch/30 p-3 text-sm text-umber/70">{message}</p>}
      <button type="button" onClick={stopQrScan} className="tb-button-secondary tb-cut-sm mt-6 min-h-14 w-full justify-center px-5"><XIcon aria-hidden="true" className="h-4 w-4" /> Cancel scan</button>
    </div>
  </section>;

  const isAuthorizing = status === 'authorizing';
  const steps = ['Scan your reader card', 'Choose an available seat', 'Scan a book and start reading'];
  return <section aria-labelledby="kiosk-welcome-title" className="tb-cut-lg relative z-10 grid w-full max-w-6xl overflow-hidden border border-gold/35 bg-cream shadow-[0_30px_90px_rgba(84,56,34,.2)] lg:grid-cols-[1.02fr_.98fr]">
    <div className="relative flex min-h-[360px] flex-col justify-between overflow-hidden bg-umber p-7 text-cream sm:p-10 lg:min-h-[590px] lg:p-14">
      <div aria-hidden="true" className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-sun/15" />
      <div aria-hidden="true" className="absolute -right-9 -top-12 h-52 w-52 rounded-full border border-sun/10" />
      <div aria-hidden="true" className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-rust via-sun to-gold" />
      <div className="relative">
        <p className="flex items-center gap-2 text-[10px] font-800 uppercase tracking-[.24em] text-sun"><SparklesIcon aria-hidden="true" className="h-4 w-4" /> Welcome, reader</p>
        <h1 id="kiosk-welcome-title" className="mt-6 max-w-lg font-display text-[2.5rem] font-900 uppercase leading-[.98] tracking-[.02em] sm:text-5xl lg:text-[3.5rem]">Your next chapter starts here.</h1>
        <p className="mt-5 max-w-md text-sm leading-6 text-sand/75 sm:text-base sm:leading-7">Sign in with your reader card, choose a seat, then scan a book to begin your in-store reading session.</p>
      </div>
      <ol className="relative mt-10 grid gap-3 sm:grid-cols-3 lg:mt-14 lg:grid-cols-1">
        {steps.map((step, index) => <li key={step} className="flex items-center gap-3 border-t border-cream/15 pt-3 text-xs font-700 text-sand/80"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-sun/35 bg-sun/10 font-display text-[11px] font-900 text-sun">0{index + 1}</span>{step}</li>)}
      </ol>
    </div>

    <div className="flex flex-col justify-center bg-[linear-gradient(145deg,rgba(255,253,248,.98),rgba(255,248,231,.96))] p-7 sm:p-10 lg:p-14">
      <div className="flex items-center justify-between gap-4">
        <div><p className="tb-eyebrow">Quick sign in</p><h2 className="mt-2 font-display text-2xl font-900 uppercase tracking-[.035em] sm:text-3xl">Choose your card</h2></div>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-gold/25 bg-parch/35 text-rust shadow-[0_8px_24px_rgba(84,56,34,.08)]"><QrCodeIcon aria-hidden="true" className="h-7 w-7" /></span>
      </div>
      <p aria-live="polite" className="mt-4 text-sm leading-6 text-umber/60">Both options securely open the same reader experience. No password is needed.</p>
      {message && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-xl border p-3.5 text-sm leading-5 ${status === 'error' ? 'border-rust/30 bg-rust/10 text-rust' : 'border-gold/30 bg-parch/30 text-umber/70'}`}>{message}</p>}

      <div className="mt-7 space-y-3">
        <button type="button" onClick={startQrScan} disabled={isAuthorizing} className="group flex min-h-[68px] w-full items-center gap-4 bg-rust px-5 text-left text-cream shadow-[0_10px_25px_rgba(169,58,24,.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#923116] hover:shadow-[0_14px_32px_rgba(169,58,24,.27)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:px-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cream/10">{isAuthorizing ? <LoaderCircleIcon aria-hidden="true" className="h-5 w-5 animate-spin" /> : <QrCodeIcon aria-hidden="true" className="h-5 w-5" />}</span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-900 uppercase tracking-[.09em] sm:text-base">{isAuthorizing ? 'Verifying your card…' : 'Scan digital card'}</strong><small className="mt-1 block text-[11px] text-cream/70">Use the QR code on your phone</small></span>
          <ArrowRightIcon aria-hidden="true" className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
        </button>

        <button type="button" onClick={() => void startPhysicalScan()} disabled={isAuthorizing} className="group flex min-h-[68px] w-full items-center gap-4 border border-gold/45 bg-white/55 px-5 text-left text-umber transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:bg-white/85 hover:shadow-[0_10px_26px_rgba(84,56,34,.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:px-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-parch/45 text-gold"><RadioIcon aria-hidden="true" className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm font-900 uppercase tracking-[.07em] sm:text-base">Tap physical card</strong><small className="mt-1 block text-[11px] text-umber/55">Use the card reader beside this screen</small></span>
          <ArrowRightIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-gold transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      <div className="mt-7 flex items-center gap-3 border-t border-gold/20 pt-5 text-xs leading-5 text-umber/50"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckIcon aria-hidden="true" className="h-4 w-4" /></span><p>Your session stays private and signs out automatically when you finish.</p></div>
    </div>
  </section>;
}
