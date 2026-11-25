import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CameraIcon,
  CheckIcon,
  LoaderCircleIcon,
  NfcIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TimerIcon,
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
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full border border-gold/15 bg-sun/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-4 h-96 w-96 rounded-full border border-rust/10 bg-rust/10 blur-3xl" />
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
  return <section aria-labelledby="kiosk-welcome-title" className="tb-cut-lg relative z-10 w-full max-w-6xl before:absolute before:-inset-2 before:-z-10 before:border before:border-gold/15 before:bg-cream/35 before:content-['']">
    <div className="grid overflow-hidden border border-gold/40 bg-cream shadow-[0_36px_110px_rgba(84,56,34,.25),0_4px_0_rgba(196,128,12,.2)] lg:grid-cols-[1.04fr_.96fr]">
      <div className="relative flex min-h-[390px] flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_92%_8%,rgba(196,128,12,.2),transparent_30%),linear-gradient(145deg,#5b3922,#3d2517)] p-7 text-cream sm:p-10 lg:min-h-[620px] lg:p-14">
        <div aria-hidden="true" className="absolute inset-0 opacity-[.055]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '13px 13px' }} />
        <div aria-hidden="true" className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-sun/20" />
        <div aria-hidden="true" className="absolute -right-9 -top-12 h-52 w-52 rounded-full border border-sun/15" />
        <div aria-hidden="true" className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-rust via-sun to-gold" />
        <div className="relative">
          <div className="flex items-center gap-3"><span className="border border-sun/30 bg-sun/10 px-2.5 py-1.5 font-display text-[9px] font-900 tracking-[.18em] text-sun">CH. 01</span><p className="flex items-center gap-2 text-[10px] font-800 uppercase tracking-[.24em] text-sun"><SparklesIcon aria-hidden="true" className="h-4 w-4" /> Welcome, reader</p></div>
          <h1 id="kiosk-welcome-title" className="mt-7 max-w-lg font-display text-[2.5rem] font-900 uppercase leading-[.94] tracking-[.01em] sm:text-5xl lg:text-[3.7rem]">Your next <span className="text-sun">chapter</span><br />starts here.</h1>
          <p className="mt-6 max-w-md border-l-2 border-sun/50 pl-4 text-sm leading-6 text-sand/75 sm:text-base sm:leading-7">Sign in with your reader card, choose a seat, then scan a book to begin your in-store reading session.</p>
        </div>
        <div className="relative mt-10">
          <p className="mb-4 text-[9px] font-800 uppercase tracking-[.22em] text-sand/40">Your reading journey</p>
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {steps.map((step, index) => <li key={step} className="group flex items-center gap-3 border border-cream/10 bg-cream/[.035] p-3 text-xs font-700 text-sand/80 transition hover:border-sun/25 hover:bg-sun/[.06]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-sun/40 bg-sun/10 font-display text-[10px] font-900 text-sun">0{index + 1}</span><span className="flex-1">{step}</span><ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5 text-sun/35" /></li>)}
          </ol>
        </div>
      </div>

      <div className="relative flex flex-col justify-center overflow-hidden bg-[linear-gradient(145deg,rgba(255,253,248,.99),rgba(255,247,226,.98))] p-7 sm:p-10 lg:p-14">
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-52 w-52 rotate-12 border border-gold/10 bg-parch/10" />
        <div className="relative flex items-center justify-between gap-4">
          <div><p className="tb-eyebrow">Reader sign in</p><h2 className="mt-2 font-display text-2xl font-900 uppercase tracking-[.025em] sm:text-3xl">Tap to begin</h2></div>
          <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-gold/30 bg-parch/45 text-rust shadow-[0_10px_28px_rgba(84,56,34,.1)]"><span className="absolute inset-1.5 animate-pulse rounded-xl border border-dashed border-gold/35" /><NfcIcon aria-hidden="true" className="relative h-7 w-7" /></span>
        </div>
        <p aria-live="polite" className="relative mt-4 text-sm leading-6 text-umber/60">For the fastest sign-in, hold your physical reader card near the scanner beside this screen.</p>
        {message && <p role={status === 'error' ? 'alert' : 'status'} className={`relative mt-5 rounded-xl border p-3.5 text-sm leading-5 ${status === 'error' ? 'border-rust/30 bg-rust/10 text-rust' : 'border-gold/30 bg-parch/30 text-umber/70'}`}>{message}</p>}

        <div className="relative mt-7 space-y-3">
          <button type="button" onClick={() => void startPhysicalScan()} disabled={isAuthorizing} className="group relative flex min-h-[88px] w-full items-center gap-4 overflow-hidden bg-rust px-5 text-left text-cream shadow-[0_14px_34px_rgba(169,58,24,.28)] transition duration-200 hover:-translate-y-1 hover:bg-[#923116] hover:shadow-[0_20px_42px_rgba(169,58,24,.34)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:px-6">
            <span aria-hidden="true" className="absolute -right-8 -top-12 h-32 w-32 rounded-full border border-cream/10" />
            <span aria-hidden="true" className="absolute right-8 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full border border-cream/10 transition-transform duration-500 group-hover:scale-125" />
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-cream/20 bg-cream/10 shadow-[inset_0_0_0_5px_rgba(255,255,255,.03)]">{isAuthorizing ? <LoaderCircleIcon aria-hidden="true" className="h-5 w-5 animate-spin" /> : <NfcIcon aria-hidden="true" className="h-6 w-6" />}</span>
            <span className="relative min-w-0 flex-1"><span className="mb-1 inline-flex rounded-full bg-sun px-2 py-0.5 text-[8px] font-900 uppercase tracking-[.12em] text-umber">Recommended</span><strong className="block text-sm font-900 uppercase tracking-[.09em] sm:text-base">{isAuthorizing ? 'Verifying your card…' : 'Tap physical card'}</strong><small className="mt-1 block text-[11px] text-cream/75">Hold your card near the reader beside this screen</small></span>
            <ArrowRightIcon aria-hidden="true" className="relative h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
          </button>

          <button type="button" onClick={startQrScan} disabled={isAuthorizing} className="group flex min-h-[74px] w-full items-center gap-4 border border-gold/45 bg-white/65 px-5 text-left text-umber transition duration-200 hover:-translate-y-1 hover:border-gold hover:bg-white hover:shadow-[0_14px_30px_rgba(84,56,34,.11)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:px-6">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/20 bg-parch/45 text-gold"><QrCodeIcon aria-hidden="true" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-900 uppercase tracking-[.07em] sm:text-base">Scan digital card</strong><small className="mt-1 block text-[11px] text-umber/55">Use the QR code on your phone</small></span>
            <ArrowRightIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-gold transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="relative mt-7 grid grid-cols-2 divide-x divide-gold/20 border-y border-gold/20 py-4 text-[10px] leading-4 text-umber/55"><div className="flex items-center gap-2 pr-3"><TimerIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gold" /><span>Signs in within seconds</span></div><div className="flex items-center gap-2 pl-3"><ShieldCheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" /><span>Private kiosk session</span></div></div>
        <p className="relative mt-4 flex items-center justify-center gap-2 text-center text-[10px] text-umber/40"><CheckIcon aria-hidden="true" className="h-3.5 w-3.5 text-emerald-700" /> No email, password, or typing required</p>
      </div>
    </div>
  </section>;
}
