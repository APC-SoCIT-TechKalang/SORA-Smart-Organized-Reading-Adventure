import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { BookOpenIcon, CameraIcon, QrCodeIcon, RadioIcon, XIcon } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { database, errorMessage } from './lib/supabase';
import { requireReaderAccount } from './lib/replacement-library';
import { startWebNfcScan, subscribeToKeyboardReader, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';
import { parseKioskNfcPayload, parseKioskQrPayload } from './lib/kioskQr';

type KioskStatus = 'ready' | 'scanning' | 'detected' | 'authorizing' | 'success' | 'error';
const SESSION_STARTED_KEY = 'sora.kiosk.session-started-at';
const KIOSK_ACCOUNT_KEY = 'sora.kiosk.account';

function playTone(kind: 'detected' | 'success' | 'error') {
  try {
    const context = new AudioContext();
    const frequencies = kind === 'success' ? [660, 880] : kind === 'error' ? [220, 165] : [520];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.11;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.11);
    });
    window.setTimeout(() => void context.close(), 450);
  } catch { /* Visual status remains available when audio is blocked. */ }
}

export function KioskApp() {
  const [status, setStatus] = useState<KioskStatus>('ready');
  const [message, setMessage] = useState('');
  const [qrScanning, setQrScanning] = useState(false);
  const authenticating = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const clearSession = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* Clear local kiosk state even if network is unavailable. */ }
    window.sessionStorage.removeItem(SESSION_STARTED_KEY);
    window.sessionStorage.removeItem(KIOSK_ACCOUNT_KEY);
    setStatus('ready'); setMessage('');
  }, []);

  const establishSession = useCallback(async ({ tokenHash, account }: BridgeAuthentication) => {
    setStatus('authorizing'); setMessage('Card verified. Starting your secure session…');
    try {
      const { data, error } = await database().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error || !data.session) throw error || new Error('The card session could not be verified.');
      await requireReaderAccount();
      window.sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
      window.sessionStorage.setItem(KIOSK_ACCOUNT_KEY, JSON.stringify(account));
      setStatus('success');
      setMessage('Login successful. Opening your dashboard…');
      playTone('success');
      window.setTimeout(() => window.location.replace('/'), 450);
    } catch (cause) { await clearSession(); setMessage(errorMessage(cause)); setStatus('error'); playTone('error'); }
  }, [clearSession]);

  const authenticateUid = useCallback(async (rfidUid: string) => {
    if (authenticating.current) return;
    authenticating.current = true;
    setStatus('detected'); setMessage('Library card detected. Verifying your account…'); playTone('detected');
    try {
      const cardId = parseKioskNfcPayload(rfidUid);
      if (!cardId) throw new Error('This card does not contain a valid Tankobonbon Library ID.');
      setStatus('authorizing');
      const response = await fetch('/api/kiosk/rfid-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rfidUid: cardId }), cache: 'no-store' });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Card detected, but the kiosk login service is unavailable. Please ask staff to start the kiosk server.');
      }
      const payload = await response.json() as BridgeAuthentication & { error?: string };
      if (!response.ok || !payload.tokenHash) throw new Error(payload.error || 'Card not recognized or inactive.');
      await establishSession(payload);
    } catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); playTone('error'); }
    finally { authenticating.current = false; }
  }, [establishSession]);

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
            const cardId = parseKioskQrPayload(result.getText());
            if (!cardId) {
              setMessage('That QR code is not a Tankobonbon digital card.');
              playTone('error');
              return;
            }
            controls?.stop();
            setQrScanning(false);
            void authenticateUid(cardId);
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
        playTone('error');
      }
    };
    void openCamera();
    return stop;
  }, [authenticateUid, qrScanning]);

  useEffect(() => subscribeToReaderBridge(authentication => void establishSession(authentication)), [establishSession]);
  useEffect(() => subscribeToKeyboardReader(uid => void authenticateUid(uid)), [authenticateUid]);
  useEffect(() => { void clearSession(); }, [clearSession]);

  return <main className="tb-field tb-world-shell min-h-screen text-umber"><KioskHeader />
    <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1480px] place-items-center px-4 py-8 sm:px-6 sm:py-12">
      <WelcomeView status={status} message={message} startPhysicalScan={startPhysicalScan} startQrScan={startQrScan} qrScanning={qrScanning} stopQrScan={() => { setQrScanning(false); setStatus('ready'); setMessage(''); }} videoRef={videoRef} />
    </div>
  </main>;
}

function KioskHeader() { return <header className="tb-hud sticky top-0 z-40 border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 min-[390px]:px-4 sm:px-6 sm:py-3"><div className="flex min-w-0 items-center gap-2 text-umber sm:gap-3"><span className="tb-brand-seal flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-parch/25 sm:h-11 sm:w-11"><BookOpenIcon className="h-5 w-5 text-rust" /></span><span className="min-w-0 font-display font-900 uppercase leading-none tracking-[.04em] sm:tracking-[.07em]"><span className="block truncate text-[15px] min-[390px]:text-lg sm:text-2xl">Tankobonbon</span><small className="mt-1 block truncate font-body text-[7px] font-800 leading-tight tracking-[.11em] text-gold min-[390px]:text-[8px] sm:text-[10px]">S.O.R.A. Reading Adventure</small></span></div><span className="tb-eyebrow hidden sm:block">Store kiosk</span></div></header>; }

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
  return <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-7 text-center shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-12">
    {qrScanning ? <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border-2 border-sun bg-umber shadow-inner">
        <video ref={videoRef} muted playsInline aria-label="QR code camera preview" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[13%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(30,17,8,.4)]" />
        <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-1/2 h-0.5 bg-sun shadow-[0_0_12px_#f9d219]" />
        <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-umber/80 px-3 py-1.5 text-[10px] font-800 uppercase tracking-wider text-cream"><CameraIcon className="h-3.5 w-3.5" /> Camera active</span>
      </div>
      <h1 className="mt-6 font-display text-2xl font-900 uppercase tracking-[.04em] sm:text-3xl">Scan digital card</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-umber/65">Show the QR code on the back of your Tankobonbon digital reader card.</p>
      {message && <p role="status" className="mt-4 rounded-lg border border-gold/30 bg-parch/30 p-3 text-sm text-umber/70">{message}</p>}
      <button type="button" onClick={stopQrScan} className="tb-button-secondary tb-cut-sm mt-5 min-h-12 w-full justify-center px-5"><XIcon className="h-4 w-4" /> Cancel scan</button>
    </div> : <>
      <span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-parch/50 text-rust sm:h-28 sm:w-28"><QrCodeIcon className="h-11 w-11 sm:h-12 sm:w-12" /></span>
      <h1 className="mt-7 font-display text-3xl font-900 uppercase tracking-[.04em] sm:text-4xl">Scan to log in</h1>
      <p aria-live="polite" className="mx-auto mt-3 max-w-md text-sm leading-6 text-umber/65">Use your digital reader card QR code or your physical library card.</p>
      {message && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-lg border p-3 text-sm ${status === 'error' ? 'border-rust/30 bg-rust/10 text-rust' : status === 'success' ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800' : 'border-gold/30 bg-parch/30 text-umber/70'}`}>{message}</p>}
      <button type="button" onClick={startQrScan} disabled={status === 'detected' || status === 'authorizing' || status === 'success'} className="tb-button-primary tb-cut-sm mt-8 min-h-14 w-full px-6 text-base uppercase tracking-[.1em] disabled:opacity-60"><QrCodeIcon className="h-5 w-5" />{status === 'detected' || status === 'authorizing' ? 'Verifying card…' : status === 'success' ? 'Opening dashboard…' : 'Scan digital card'}</button>
      <button type="button" onClick={() => void startPhysicalScan()} disabled={status === 'detected' || status === 'authorizing' || status === 'success'} className="tb-button-secondary tb-cut-sm mt-3 min-h-12 w-full justify-center px-5 text-sm disabled:opacity-60"><RadioIcon className="h-4 w-4" /> Use physical card reader</button>
      <p className="mt-4 text-xs leading-5 text-umber/50">No email, password, or manual card number is required.</p>
    </>}
  </section>;
}
