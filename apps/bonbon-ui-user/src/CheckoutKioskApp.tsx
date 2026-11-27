import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AlertTriangleIcon, ArrowRightIcon, BookCheckIcon, BookMarkedIcon, BookOpenIcon, CameraIcon,
  CheckCircle2Icon, Clock3Icon, CreditCardIcon, LoaderCircleIcon, MapPinIcon,
  NfcIcon, QrCodeIcon, RotateCcwIcon, ShieldCheckIcon, WalletCardsIcon, XIcon,
} from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { database, errorMessage } from './lib/supabase';
import { replacementApi, requireReaderAccount } from './lib/replacement-library';
import {
  normalizePhysicalCardUid, startWebNfcScan, subscribeToHidScanner,
  subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication,
} from './lib/kioskRfid';
import { parseKioskQrPayload } from './lib/kioskQr';
import { subscribeToCardDirectory } from './lib/cardDirectorySync';
import { ReaderAtmosphere } from './components/ReaderAtmosphere';
import './kiosk-entrance.css';
import './checkout-farewell.css';

type CheckoutState = {
  session_id: number; session_status: string; borrow_date: string; return_date: string | null;
  checked_in_at: string | null; minutes: number; seat: { number: number; area: string } | null;
  books: { copy_id: number; title: string; author: string; copy_number: number; returned: boolean }[];
  food_charge: number; other_charge: number; total_charge: number; payment_status: string;
  disputed: boolean; books_to_return: number;
};
type Receipt = { session_id: number; minutes: number; total_charge: number };
type CheckinOnlyResult = { checkin_only: true; seat_released: boolean };
type ReaderBalance = { remainingMinutes: number; unlimited: boolean };
type Status = 'preparing' | 'ready' | 'scanning' | 'authorizing' | 'summary' | 'complete' | 'error';

const money = (value: number) => `₱${Number(value).toFixed(2)}`;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const shortCard = (value: string) => value ? `•••• ${value.slice(-6).toUpperCase()}` : 'Digital card verified';

export function CheckoutKioskApp() {
  const [status, setStatus] = useState<Status>('preparing');
  const [message, setMessage] = useState('');
  const [readerName, setReaderName] = useState('Reader');
  const [readerCard, setReaderCard] = useState('');
  const [readerBalance, setReaderBalance] = useState<ReaderBalance | null>(null);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checkinOnly, setCheckinOnly] = useState<CheckinOnlyResult | null>(null);
  const [reason, setReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const ready = useRef(false);
  const authenticating = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const signOut = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* Reset locally if offline. */ }
    window.sessionStorage.removeItem('sora.kiosk.session-started-at');
  }, []);

  const reset = useCallback(async () => {
    ready.current = false;
    setStatus('preparing'); setMessage(''); setCheckout(null); setReceipt(null); setCheckinOnly(null);
    setReason(''); setShowDispute(false); setQrScanning(false); setReaderName('Reader');
    setReaderCard(''); setReaderBalance(null);
    await signOut();
    ready.current = true;
    setStatus('ready');
  }, [signOut]);

  const activeCardFor = useCallback(async (userId?: string) => {
    if (!userId) return null;
    const result = await replacementApi().from('librarycard').select('librarycard_rfid')
      .eq('user_id', userId).eq('is_active', true).is('deactivated_at', null).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return result.data?.librarycard_rfid
      ? normalizePhysicalCardUid(String(result.data.librarycard_rfid)) : null;
  }, []);

  const refreshBalance = useCallback(async (userId?: string) => {
    if (!userId) return;
    const result = await replacementApi().from('users').select('remaining_minutes,membership_type')
      .eq('id', userId).maybeSingle();
    if (!result.error && result.data) setReaderBalance({
      remainingMinutes: Number(result.data.remaining_minutes ?? 0),
      unlimited: result.data.membership_type === 'Guild Adventurer',
    });
  }, []);

  const establishSession = useCallback(async (authentication: BridgeAuthentication, scannedUid?: string) => {
    const verified = await database().auth.verifyOtp({ token_hash: authentication.tokenHash, type: 'email' });
    if (verified.error || !verified.data.session) throw verified.error || new Error('The card session could not be verified.');
    await requireReaderAccount();
    const userId = authentication.account?.userId;
    const directUid = normalizePhysicalCardUid(scannedUid || authentication.account?.rfidUid || '');
    const rfidUid = directUid || await activeCardFor(userId);
    if (!rfidUid) throw new Error('No active library card is assigned to this reader. Please ask library staff for help.');

    setReaderName([authentication.account?.firstName, authentication.account?.lastName].filter(Boolean).join(' ') || 'Reader');
    setReaderCard(shortCard(rfidUid));
    const begun = await replacementApi().rpc('kiosk_begin_checkout', { p_card_rfid: rfidUid });
    if (begun.error) {
      const current = await replacementApi().rpc('kiosk_checkout_state');
      if (!current.error && current.data) {
        setCheckout(current.data as CheckoutState); setStatus('summary'); await refreshBalance(userId);
      }
      throw begun.error;
    }
    if ((begun.data as CheckinOnlyResult)?.checkin_only) {
      setCheckinOnly(begun.data as CheckinOnlyResult); setCheckout(null); setStatus('complete');
      await signOut(); return;
    }
    setCheckout(begun.data as CheckoutState); setStatus('summary'); setMessage('');
    await refreshBalance(userId);
  }, [activeCardFor, refreshBalance, signOut]);

  const authenticate = useCallback(async (credential: { rfidUid: string } | { userId: string }, scannedUid?: string) => {
    if (!ready.current || authenticating.current) return;
    authenticating.current = true; setQrScanning(false); setStatus('authorizing'); setMessage('');
    try {
      const response = await fetch('/api/kiosk/rfid-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential), cache: 'no-store',
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The checkout card service is unavailable. Please ask staff for help.');
      }
      const payload = await response.json() as BridgeAuthentication & { error?: string };
      if (!response.ok || !payload.tokenHash) throw new Error(payload.error || 'Card not recognized or inactive.');
      await establishSession(payload, scannedUid);
    } catch (cause) {
      setMessage(errorMessage(cause));
      setStatus(previous => previous === 'summary' ? 'summary' : 'error');
    } finally { authenticating.current = false; }
  }, [establishSession]);

  const authenticateUid = useCallback((rawUid: string) => {
    const rfidUid = normalizePhysicalCardUid(rawUid);
    if (rfidUid.length >= 4) void authenticate({ rfidUid }, rfidUid);
  }, [authenticate]);
  const authenticateUser = useCallback((userId: string) => void authenticate({ userId }), [authenticate]);
  const authenticateScannerPayload = useCallback((payload: string) => {
    if (authenticating.current) return;
    const userId = parseKioskQrPayload(payload);
    if (userId) { authenticateUser(userId); return; }
    if (payload.startsWith('tankobonbon:')) {
      setStatus('error'); setMessage('That QR code is not a valid Tankobonbon digital card.'); return;
    }
    authenticateUid(payload);
  }, [authenticateUid, authenticateUser]);

  const startPhysicalScan = useCallback(async () => {
    setMessage(''); setStatus('scanning');
    if (!supportsWebNfc()) {
      setMessage('USB card scanning is ready. Keep this page focused and tap your card on the connected reader.'); return;
    }
    try { await startWebNfcScan(authenticateUid); }
    catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  }, [authenticateUid]);

  const startQrScan = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setMessage('Camera scanning is unavailable. Open this secure page in Safari or Chrome and allow camera access.');
      return;
    }
    setMessage(''); setStatus('scanning'); setQrScanning(true);
  }, []);

  useEffect(() => {
    if (!qrScanning) return;
    let disposed = false;
    let controls: IScannerControls | null = null;
    const stop = () => {
      disposed = true; controls?.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    const openCamera = async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 750 });
        if (!videoRef.current) throw new Error('The QR camera could not be opened.');
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current,
          result => {
            if (disposed || !result) return;
            const userId = parseKioskQrPayload(result.getText());
            if (!userId) { setMessage('That QR code is not a Tankobonbon digital card.'); return; }
            controls?.stop(); setQrScanning(false); authenticateUser(userId);
          },
        );
        if (disposed) controls.stop();
      } catch (cause) {
        stop(); setQrScanning(false); setStatus('error');
        setMessage(cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access in your browser and try again.' : errorMessage(cause));
      }
    };
    void openCamera();
    return stop;
  }, [authenticateUser, qrScanning]);

  useEffect(() => { void reset(); }, [reset]);
  useEffect(() => subscribeToHidScanner(authenticateScannerPayload), [authenticateScannerPayload]);
  useEffect(() => subscribeToCardDirectory(() => {
    if (ready.current && !authenticating.current && !checkout) { setMessage(''); setStatus('ready'); }
  }), [checkout]);
  useEffect(() => subscribeToReaderBridge(authentication => {
    if (!ready.current || authenticating.current) return;
    authenticating.current = true; setStatus('authorizing'); setMessage('');
    void establishSession(authentication).catch(cause => { setMessage(errorMessage(cause)); setStatus('error'); })
      .finally(() => { authenticating.current = false; });
  }), [establishSession]);
  useEffect(() => {
    if (!checkout || checkout.session_status !== 'CHECKOUT PENDING') return;
    const timer = window.setInterval(async () => {
      const result = await replacementApi().rpc('kiosk_checkout_state');
      if (!result.error && result.data) setCheckout(result.data as CheckoutState);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkout?.session_id, checkout?.session_status]);
  useEffect(() => {
    if (status !== 'complete') return;
    const timer = window.setTimeout(() => void reset(), 5000);
    return () => window.clearTimeout(timer);
  }, [reset, status]);

  const dispute = async () => {
    if (!checkout || authenticating.current) return;
    authenticating.current = true; setMessage('');
    const result = await replacementApi().rpc('kiosk_dispute_checkout', { p_session_id: checkout.session_id, p_reason: reason });
    if (result.error) setMessage(result.error.message);
    else { setCheckout(result.data as CheckoutState); setReason(''); setShowDispute(false); }
    authenticating.current = false;
  };
  const complete = async () => {
    if (!checkout || authenticating.current) return;
    authenticating.current = true; setMessage('');
    const result = await replacementApi().rpc('kiosk_complete_checkout', { p_session_id: checkout.session_id });
    if (result.error) setMessage(result.error.message);
    else { setReceipt(result.data as Receipt); setCheckout(null); setStatus('complete'); await signOut(); }
    authenticating.current = false;
  };

  return <main className="kiosk-entrance checkout-farewell text-umber">
    <CheckoutHeader />
    <div className="kiosk-entrance-stage">
      {qrScanning ? <QrCamera message={message} videoRef={videoRef} onCancel={() => { setQrScanning(false); setStatus('ready'); setMessage(''); }} />
        : checkout ? <CheckoutSummary readerName={readerName} readerCard={readerCard} balance={readerBalance} checkout={checkout} message={message} reason={reason} setReason={setReason} showDispute={showDispute} setShowDispute={setShowDispute} busy={authenticating.current} onDispute={() => void dispute()} onComplete={() => void complete()} onReset={() => void reset()} />
          : status === 'complete' ? <Completion receipt={receipt} checkinOnly={checkinOnly} onReset={() => void reset()} />
            : <Welcome status={status} message={message} onPhysical={() => void startPhysicalScan()} onQr={startQrScan} />}
    </div>
  </main>;
}

function CheckoutHeader() {
  return <header className="kiosk-entrance-header">
    <div className="mx-auto w-full max-w-[1440px] px-4 py-3 sm:px-8">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className="kiosk-entrance-seal"><BookOpenIcon aria-hidden="true" size={21} /></span>
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-900 min-[390px]:text-lg sm:text-2xl">Tankobonbon</span>
          <small className="block truncate text-[8px] font-800 uppercase tracking-[.09em] text-[#e7bf86] sm:text-[10px]">S.O.R.A. Reading Adventure</small>
        </span>
      </div>
    </div>
  </header>;
}

function Welcome({ status, message, onPhysical, onQr }: { status: Status; message: string; onPhysical: () => void; onQr: () => void }) {
  const busy = status === 'authorizing' || status === 'preparing';

  return <section aria-labelledby="checkout-title" className="kiosk-entrance-frame checkout-welcome">
    <div className="kiosk-entrance-illustration checkout-illustration">
      <ReaderAtmosphere />
      <div className="kiosk-entrance-arch" aria-hidden="true" />
      <div className="kiosk-entrance-title">
        <p className="checkout-kicker"><BookMarkedIcon aria-hidden="true" /> Your library visit</p>
        <h1 id="checkout-title" className="checkout-hero-heading">Check <em>out.</em></h1>
        <p className="checkout-hero-subtitle">Close this chapter. Your next story awaits.</p>
      </div>
    </div>

    <div className="kiosk-entry-card">
      <p className="checkout-entry-eyebrow">Check-out station</p>
      <h2>Present your reader card</h2>
      <p className="checkout-entry-description">Review your visit and confirm your check-out.</p>
      <div className="kiosk-entry-actions" aria-busy={busy}>
        <button type="button" disabled={busy} onClick={onPhysical} className="kiosk-entry-action kiosk-entry-action--primary">
          <span className="kiosk-entry-icon">
            {busy ? <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" /> : <NfcIcon aria-hidden="true" />}
          </span>
          <span className="kiosk-entry-action-copy"><strong>Tap physical card</strong><small>Use the reader beside this screen</small></span>
          <ArrowRightIcon aria-hidden="true" className="kiosk-entry-arrow" />
        </button>
        <button type="button" disabled={busy} onClick={onQr} className="kiosk-entry-action">
          <span className="kiosk-entry-icon"><QrCodeIcon aria-hidden="true" /></span>
          <span className="kiosk-entry-action-copy"><strong>Scan digital card</strong><small>Use the camera or USB 2D scanner</small></span>
          <ArrowRightIcon aria-hidden="true" className="kiosk-entry-arrow" />
        </button>
      </div>
      {status === 'authorizing' && <p role="status" className="kiosk-entry-feedback">Finding your visit…</p>}
      {message && <p role={status === 'error' ? 'alert' : 'status'} className={`kiosk-entry-feedback ${status === 'error' ? 'is-error' : ''}`}>{message}</p>}
    </div>
  </section>;
}

function QrCamera({ message, videoRef, onCancel }: { message: string; videoRef: RefObject<HTMLVideoElement>; onCancel: () => void }) {
  return <section aria-labelledby="checkout-qr-title" className="kiosk-entrance-frame max-w-5xl"><div className="relative min-h-[300px] bg-umber p-4 sm:p-6 lg:min-h-[500px]"><div className="relative mx-auto h-full min-h-[268px] overflow-hidden rounded-2xl border border-sun/60 bg-[#24150d] sm:min-h-[410px]"><video ref={videoRef} muted playsInline aria-label="Digital card QR camera preview" className="absolute inset-0 h-full w-full object-cover" /><div aria-hidden="true" className="pointer-events-none absolute inset-[13%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(30,17,8,.48)] sm:inset-[16%]" /><div aria-hidden="true" className="absolute left-[18%] right-[18%] top-1/2 h-0.5 bg-sun shadow-[0_0_16px_#f9d219]" /><span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-umber/85 px-3 py-2 text-[10px] font-800 uppercase tracking-[.15em] text-cream"><CameraIcon className="h-3.5 w-3.5 text-sun" /> Camera active</span></div></div><div className="kiosk-entry-card"><p className="tb-eyebrow">Digital checkout</p><h1 id="checkout-qr-title" className="kiosk-camera-title mt-2">Hold your QR code inside the frame</h1><p className="mt-4 text-sm leading-6 text-umber/65 sm:text-base">Open your Digital ID and show the QR code on its back. Keep the screen steady and bright.</p><div className="mt-7 flex items-start gap-3 border-y border-gold/20 py-4 text-xs leading-5 text-umber/60"><ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><p>The USB 2D scanner remains active while the camera is open.</p></div>{message && <p role="status" className="mt-5 rounded-xl border border-rust/25 bg-rust/10 p-3 text-sm text-rust">{message}</p>}<button type="button" onClick={onCancel} className="tb-button-secondary tb-cut-sm mt-6 min-h-14 w-full justify-center px-5"><XIcon className="h-4 w-4" /> Cancel scan</button></div></section>;
}

type SummaryProps = {
  readerName: string; readerCard: string; balance: ReaderBalance | null; checkout: CheckoutState;
  message: string; reason: string; setReason: (value: string) => void;
  showDispute: boolean; setShowDispute: (value: boolean) => void; busy: boolean;
  onDispute: () => void; onComplete: () => void; onReset: () => void;
};

function CheckoutSummary(props: SummaryProps) {
  const { readerName, readerCard, balance, checkout, message, reason, setReason, showDispute, setShowDispute, busy, onDispute, onComplete, onReset } = props;
  const canComplete = checkout.books_to_return === 0 && !checkout.disputed && checkout.session_status === 'CHECKOUT PENDING' && (checkout.total_charge <= 0 || checkout.payment_status === 'PAID');
  return <section role="dialog" aria-modal="true" aria-labelledby="summary-title" className="checkout-summary relative flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden"><header className="checkout-summary-header relative shrink-0 overflow-hidden px-5 py-5 text-cream sm:px-7 sm:py-6"><div aria-hidden="true" className="absolute -right-12 -top-20 h-56 w-56 rounded-full border border-sun/15" /><p className="checkout-kicker">Check-out summary</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 id="summary-title" className="break-words font-display text-2xl font-900 sm:text-3xl">{readerName}</h1><p className="mt-1 text-xs text-cream/60">Library card {readerCard}</p></div><span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-800 uppercase tracking-[.12em] text-emerald-200">Session found</span></div></header><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Clock3Icon />} label="Time used" value={`${checkout.minutes} min`} /><Metric icon={<WalletCardsIcon />} label="Time remaining" value={balance ? (balance.unlimited ? 'Unlimited' : `${balance.remainingMinutes} min`) : 'Updating…'} /><Metric icon={<MapPinIcon />} label="Seat" value={checkout.seat ? `${checkout.seat.number} · ${checkout.seat.area}` : 'No seat'} /><Metric icon={<CreditCardIcon />} label="Amount due" value={money(checkout.total_charge)} /></div><div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl border border-gold/25 bg-white/55 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-900">Borrowed items</h2><span className="rounded-full bg-parch/45 px-2.5 py-1 text-xs font-800">{checkout.books?.length ?? 0}</span></div>{checkout.books?.length ? <ul className="mt-3 max-h-48 divide-y divide-gold/15 overflow-y-auto pr-1">{checkout.books.map(book => <li key={book.copy_id} className="flex items-start gap-3 py-3 first:pt-1"><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${book.returned ? 'bg-emerald-100 text-emerald-700' : 'bg-rust/10 text-rust'}`}><BookCheckIcon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{book.title}</strong><span className="block truncate text-xs text-umber/55">{book.author} · Copy #{book.copy_number}</span></span><span className={`shrink-0 text-[10px] font-800 uppercase ${book.returned ? 'text-emerald-700' : 'text-rust'}`}>{book.returned ? 'Returned' : 'Return needed'}</span></li>)}</ul> : <p className="mt-4 text-sm text-umber/55">No books were recorded for this visit.</p>}</section><section className="rounded-2xl border border-gold/25 bg-parch/20 p-4 sm:p-5"><h2 className="font-display text-lg font-900">Visit details</h2><dl className="mt-3 space-y-2.5 text-sm"><Detail label="Session" value={`#${checkout.session_id}`} /><Detail label="Checked in" value={dateTime(checkout.checked_in_at)} /><Detail label="Timer stopped" value={checkout.return_date ? dateTime(checkout.return_date) : 'Still running'} /><Detail label="Food" value={money(checkout.food_charge)} /><Detail label="Other / damages" value={money(checkout.other_charge)} /><Detail label="Payment" value={checkout.payment_status || 'Not required'} /></dl></section></div>{checkout.books_to_return > 0 && <p role="alert" className="mt-4 flex gap-3 rounded-xl border border-rust/30 bg-rust/10 p-4 text-sm leading-5 text-rust"><AlertTriangleIcon className="h-5 w-5 shrink-0" /> Return and scan {checkout.books_to_return} remaining {checkout.books_to_return === 1 ? 'book' : 'books'} before completing checkout.</p>}{checkout.disputed && <p role="status" className="mt-4 rounded-xl border border-rust/30 bg-rust/10 p-4 text-sm">Checkout is paused while staff review the disputed charge. This summary refreshes automatically.</p>}{message && <p role="alert" className="mt-4 rounded-xl border border-rust/30 bg-rust/10 p-3 text-sm text-rust">{message}</p>}{showDispute && !checkout.disputed && <div className="mt-4 rounded-2xl border border-gold/25 bg-white/60 p-4"><label htmlFor="checkout-dispute" className="text-sm font-800">What should staff review?</label><textarea id="checkout-dispute" className="tb-input mt-2 w-full rounded-xl px-3 py-3 text-sm" rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Briefly explain the charge you want reviewed" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={reason.trim().length < 5 || busy} onClick={onDispute} className="tb-button-primary tb-cut-sm px-4 py-2.5 text-sm">Send for review</button><button type="button" onClick={() => setShowDispute(false)} className="tb-button-secondary tb-cut-sm px-4 py-2.5 text-sm">Cancel</button></div></div>}</div><footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-gold/20 bg-[#fffaf0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7"><button type="button" onClick={onReset} className="tb-button-secondary tb-cut-sm min-h-12 justify-center px-4"><RotateCcwIcon className="h-4 w-4" /> Another card</button><div className="flex flex-col-reverse gap-2 sm:flex-row">{checkout.total_charge > 0 && !checkout.disputed && <button type="button" onClick={() => setShowDispute(true)} className="tb-button-secondary tb-cut-sm min-h-12 justify-center px-4">Report a charge</button>}<button type="button" disabled={!canComplete || busy} onClick={onComplete} className="tb-button-primary tb-cut-sm min-h-12 justify-center px-6 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircleIcon className="h-4 w-4 animate-spin" /> : <CheckCircle2Icon className="h-4 w-4" />} Confirm check-out</button></div></footer></section>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-gold/25 bg-parch/20 p-3.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/10 text-gold [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="min-w-0"><span className="block truncate text-[10px] font-800 uppercase tracking-[.12em] text-umber/50">{label}</span><strong className="mt-0.5 block truncate text-base">{value}</strong></span></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><dt className="text-umber/55">{label}</dt><dd className="max-w-[65%] text-right font-700">{value}</dd></div>; }

function Completion({ receipt, checkinOnly, onReset }: { receipt: Receipt | null; checkinOnly: CheckinOnlyResult | null; onReset: () => void }) {
  return <section className="checkout-completion" aria-labelledby="checkout-complete-title">
    <div className="checkout-completion-scene" aria-hidden="true">
      <ReaderAtmosphere />
      <div className="checkout-closing-book">
        <span className="checkout-book-pages" />
        <span className="checkout-book-cover"><BookMarkedIcon /></span>
      </div>
    </div>
    <div className="checkout-completion-body">
      <div role="status" aria-atomic="true">
        <p className="checkout-completion-confirmed"><CheckCircle2Icon aria-hidden="true" /> You’re checked out</p>
        <h1 id="checkout-complete-title">See you in the next chapter.</h1>
        {receipt ? <p>Session #{receipt.session_id} closed after {receipt.minutes} minutes. {money(receipt.total_charge)} was settled.</p>
          : checkinOnly ? <p>Your check-in is closed{checkinOnly.seat_released ? ' and your reserved seat has been released' : ''}. No reading time was used.</p> : null}
      </div>
      <button type="button" onClick={onReset} className="kiosk-entry-action kiosk-entry-action--primary checkout-next-reader">
        <RotateCcwIcon aria-hidden="true" size={17} /> Next reader now
      </button>
      <p className="checkout-completion-reset">The terminal resets automatically.</p>
    </div>
  </section>;
}
