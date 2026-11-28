import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CameraIcon,
  LoaderCircleIcon,
  NfcIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { database, errorMessage } from './lib/supabase';
import { requireReaderAccount } from './lib/replacement-library';
import { normalizePhysicalCardUid, startWebNfcScan, subscribeToHidScanner, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';
import { parseKioskQrPayload } from './lib/kioskQr';
import { subscribeToCardDirectory } from './lib/cardDirectorySync';
import { ReaderAtmosphere } from './components/ReaderAtmosphere';
import './reader-world.css';
import './kiosk-entrance.css';

type KioskStatus = 'ready' | 'scanning' | 'authorizing' | 'entering' | 'error';
const SESSION_STARTED_KEY = 'sora.kiosk.session-started-at';
const ENTRANCE_DURATION_MS = 600;

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
      setQrScanning(false);
      if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        setStatus('entering');
        await new Promise<void>(resolve => window.setTimeout(resolve, ENTRANCE_DURATION_MS));
      }
      window.sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      window.location.replace('/');
    } catch (cause) { await clearSession(); setMessage(errorMessage(cause)); setStatus('error'); }
  }, [clearSession]);

  const authenticate = useCallback(async (credential: { rfidUid: string }) => {
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

  const authenticateUid = useCallback((rawUid: string) => {
    const rfidUid = normalizePhysicalCardUid(rawUid);
    if (rfidUid.length >= 4) void authenticate({ rfidUid });
  }, [authenticate]);
  const authenticateScannerPayload = useCallback((payload: string) => {
    if (authenticating.current) return;
    const cardUid = parseKioskQrPayload(payload);
    if (cardUid) {
      void authenticateUid(cardUid);
      return;
    }
    if (payload.startsWith('tankobonbon:')) {
      setStatus('error');
      setMessage('That QR code is not a valid Tankobonbon digital card.');
      return;
    }
    void authenticateUid(payload);
  }, [authenticateUid]);

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
            const cardUid = parseKioskQrPayload(result.getText());
            if (!cardUid) {
              setMessage('That QR code is not a Tankobonbon digital card.');
              return;
            }
            controls?.stop();
            setQrScanning(false);
            void authenticateUid(cardUid);
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
  }, [authenticateUid, qrScanning]);

  useEffect(() => subscribeToReaderBridge(authentication => {
    if (authenticating.current) return;
    authenticating.current = true;
    void establishSession(authentication).finally(() => { authenticating.current = false; });
  }), [establishSession]);
  useEffect(() => subscribeToHidScanner(authenticateScannerPayload), [authenticateScannerPayload]);
  useEffect(() => subscribeToCardDirectory(() => {
    // Clear a stale rejection as soon as staff changes a card or reader record.
    if (!authenticating.current) { setMessage(''); setStatus('ready'); }
  }), []);
  useEffect(() => { void clearSession(); }, [clearSession]);

  return <main className="reader-world kiosk-entrance text-umber"><KioskHeader />
    <div className="kiosk-entrance-stage">
      <WelcomeView status={status} message={message} startPhysicalScan={startPhysicalScan} startQrScan={startQrScan} qrScanning={qrScanning} stopQrScan={() => { setQrScanning(false); setStatus('ready'); setMessage(''); }} videoRef={videoRef} />
    </div>
    {status === 'entering' && <div className="kiosk-door-reveal" role="status">
      <span className="kiosk-door-leaf kiosk-door-leaf--left" aria-hidden="true" />
      <span className="kiosk-door-leaf kiosk-door-leaf--right" aria-hidden="true" />
      <span className="kiosk-door-reveal-caption">Card verified. Opening the library…</span>
    </div>}
  </main>;
}

function KioskHeader() {
  return <header className="tb-hud kiosk-entrance-header sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl">
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 min-[390px]:gap-3 min-[390px]:px-4 sm:px-6 sm:py-3">
      <div className="flex min-w-0 items-center gap-2 text-umber sm:gap-3">
        <span className="reader-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 sm:h-11 sm:w-11"><BookOpenIcon aria-hidden="true" className="h-5 w-5" /></span>
        <span className="min-w-0 font-display font-900 uppercase leading-none tracking-[0.04em] sm:tracking-[0.07em]">
          <span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl lg:text-[28px]">Tankobonbon</span>
          <small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:mt-1.5 sm:text-[10px] sm:tracking-[.17em] lg:text-xs">S.O.R.A. Reading Adventure</small>
        </span>
      </div>
      <span className="kiosk-guest-indicator">Guest</span>
    </div>
  </header>;
}

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
  if (qrScanning) return <section aria-labelledby="scan-title" className="kiosk-entrance-frame max-w-5xl">
    <div className="relative min-h-[320px] bg-umber p-4 sm:p-6 lg:min-h-[480px]">
      <div className="relative mx-auto h-full min-h-[288px] w-full overflow-hidden rounded-2xl border border-sun/60 bg-[#24150d] shadow-[inset_0_0_50px_rgba(0,0,0,.45)] sm:min-h-[410px]">
        <video ref={videoRef} muted playsInline aria-label="QR code camera preview" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(30,17,8,.48)] sm:inset-[16%]" />
        <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-1/2 h-0.5 bg-sun shadow-[0_0_16px_#f9d219] sm:left-[20%] sm:right-[20%]" />
        <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-umber/85 px-3 py-2 text-[10px] font-800 uppercase tracking-[.15em] text-cream backdrop-blur"><CameraIcon aria-hidden="true" className="h-3.5 w-3.5 text-sun" /> Camera active</span>
      </div>
    </div>
    <div className="kiosk-entry-card">
      <p className="tb-eyebrow">Digital reader card</p>
      <h1 id="scan-title" className="kiosk-camera-title mt-2">Hold your QR code inside the frame</h1>
      <p className="mt-4 text-sm leading-6 text-umber/65 sm:text-base">Open your digital reader card and show the QR code on its back. Keep your screen steady and bright.</p>
      <div className="mt-7 flex items-start gap-3 border-y border-gold/20 py-4 text-left text-xs leading-5 text-umber/60"><ShieldCheckIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><p>Your QR code is used only to identify your reader account for this kiosk session.</p></div>
      {message && <p role="status" className="mt-5 rounded-xl border border-gold/30 bg-parch/30 p-3 text-sm text-umber/70">{message}</p>}
      <button type="button" onClick={stopQrScan} className="tb-button-secondary tb-cut-sm mt-6 min-h-14 w-full justify-center px-5"><XIcon aria-hidden="true" className="h-4 w-4" /> Cancel scan</button>
    </div>
  </section>;

  const busy = status === 'authorizing' || status === 'entering';
  return <section aria-labelledby="kiosk-welcome-title" className="reader-archive kiosk-archive">
    <ReaderAtmosphere />
    <div className="reader-archive-copy kiosk-archive-copy">
      <p className="reader-kicker">Welcome to the Archive</p>
      <h1 id="kiosk-welcome-title">Your next<br />chapter<br /><em>awaits.</em></h1>
      <p className="reader-archive-description">Every great adventure begins with a page. Sign in to begin your reading journey.</p>
    </div>

    <div className="kiosk-entry-card kiosk-signin-panel">
      <p className="kiosk-signin-eyebrow">Reader sign-in</p>
      <h2>Begin your adventure.</h2>
      <p className="kiosk-signin-intro">Present your reader ID to continue.</p>
      <div className="kiosk-entry-actions" aria-busy={busy}>
        <button type="button" onClick={() => void startPhysicalScan()} disabled={busy} className="kiosk-entry-action kiosk-entry-action--primary">
          <span className="kiosk-entry-icon">
            {status === 'authorizing' ? <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" /> : <NfcIcon aria-hidden="true" />}
          </span>
          <span className="kiosk-entry-action-copy"><strong>Tap physical ID</strong><small>Use the card reader beside you</small></span>
          <ArrowRightIcon aria-hidden="true" className="kiosk-entry-arrow" />
        </button>
        <button type="button" onClick={startQrScan} disabled={busy} className="kiosk-entry-action">
          <span className="kiosk-entry-icon"><QrCodeIcon aria-hidden="true" /></span>
          <span className="kiosk-entry-action-copy"><strong>Scan Digital ID</strong><small>Show your QR code</small></span>
          <ArrowRightIcon aria-hidden="true" className="kiosk-entry-arrow" />
        </button>
      </div>
      {status === 'authorizing' && <p role="status" className="kiosk-entry-feedback">Verifying your card…</p>}
      {message && <p role={status === 'error' ? 'alert' : 'status'} className={`kiosk-entry-feedback ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
      <p className="kiosk-entry-privacy"><ShieldCheckIcon aria-hidden="true" /> Private reader session</p>
    </div>
  </section>;
}
