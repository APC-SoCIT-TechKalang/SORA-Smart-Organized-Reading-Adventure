import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenIcon, CheckCircle2Icon, CreditCardIcon, RadioIcon, RotateCcwIcon } from 'lucide-react';
import { database, errorMessage } from './lib/supabase';
import { replacementApi, requireReaderAccount } from './lib/replacement-library';
import { normalizePhysicalCardUid, startWebNfcScan, subscribeToKeyboardReader, subscribeToReaderBridge, supportsWebNfc, type BridgeAuthentication } from './lib/kioskRfid';
import { subscribeToCardDirectory } from './lib/cardDirectorySync';

type CheckoutState = {
  session_id: number; session_status: string; borrow_date: string; return_date: string | null;
  checked_in_at: string | null; minutes: number;
  seat: { number: number; area: string } | null;
  books: { copy_id: number; title: string; author: string; copy_number: number; returned: boolean }[];
  food_charge: number; other_charge: number; total_charge: number;
  payment_status: string; disputed: boolean; books_to_return: number;
};
type Receipt = { session_id: number; minutes: number; total_charge: number };
type CheckinOnlyResult = { checkin_only: true; seat_released: boolean };
type Status = 'preparing' | 'ready' | 'scanning' | 'authorizing' | 'summary' | 'complete' | 'error';
const money = (value: number) => `₱${Number(value).toFixed(2)}`;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';

export function CheckoutKioskApp() {
  const [status, setStatus] = useState<Status>('preparing');
  const [message, setMessage] = useState('');
  const [readerName, setReaderName] = useState('Reader');
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checkinOnly, setCheckinOnly] = useState<CheckinOnlyResult | null>(null);
  const [reason, setReason] = useState('');
  const ready = useRef(false);
  const authenticating = useRef(false);

  const signOut = useCallback(async () => {
    try { await database().auth.signOut({ scope: 'local' }); } catch { /* The kiosk still resets locally. */ }
    window.sessionStorage.removeItem('sora.kiosk.session-started-at');
  }, []);

  const reset = useCallback(async () => {
    ready.current = false;
    setStatus('preparing'); setMessage(''); setCheckout(null); setReceipt(null); setCheckinOnly(null); setReason(''); setReaderName('Reader');
    await signOut();
    ready.current = true;
    setStatus('ready');
  }, [signOut]);

  const establishSession = useCallback(async (authentication: BridgeAuthentication, scannedUid?: string) => {
    const rfidUid = scannedUid || authentication.account?.rfidUid;
    if (!rfidUid) throw new Error('The card reader did not provide an RFID identifier. Ask staff to update the reader bridge.');
    const verified = await database().auth.verifyOtp({ token_hash: authentication.tokenHash, type: 'email' });
    if (verified.error || !verified.data.session) throw verified.error || new Error('The card session could not be verified.');
    await requireReaderAccount();
    setReaderName([authentication.account?.firstName, authentication.account?.lastName].filter(Boolean).join(' ') || 'Reader');
    const begun = await replacementApi().rpc('kiosk_begin_checkout', { p_card_rfid: rfidUid });
    if (begun.error) {
      const current = await replacementApi().rpc('kiosk_checkout_state');
      if (!current.error && current.data) {
        setCheckout(current.data as CheckoutState);
        setStatus('summary');
      }
      throw begun.error;
    }
    if ((begun.data as CheckinOnlyResult)?.checkin_only) {
      setCheckinOnly(begun.data as CheckinOnlyResult);
      setCheckout(null);
      setStatus('complete');
      await signOut();
      return;
    }
    const state = begun.data as CheckoutState;
    setCheckout(state);
    setStatus('summary');
    setMessage('');
  }, [signOut]);

  const authenticateUid = useCallback(async (rawUid: string) => {
    if (!ready.current || authenticating.current) return;
    const rfidUid = normalizePhysicalCardUid(rawUid);
    if (rfidUid.length < 4) return;
    authenticating.current = true;
    setStatus('authorizing'); setMessage('');
    try {
      const response = await fetch('/api/kiosk/rfid-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfidUid }), cache: 'no-store',
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The kiosk card service is unavailable. Ask staff for help.');
      const payload = await response.json() as BridgeAuthentication & { error?: string };
      if (!response.ok || !payload.tokenHash) throw new Error(payload.error || 'Card not recognized or inactive.');
      await establishSession(payload, rfidUid);
    } catch (cause) {
      setMessage(errorMessage(cause));
      setStatus(previous => previous === 'summary' ? 'summary' : 'error');
    } finally { authenticating.current = false; }
  }, [establishSession]);

  useEffect(() => { void reset(); }, [reset]);
  useEffect(() => subscribeToKeyboardReader(uid => void authenticateUid(uid)), [authenticateUid]);
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

  const startScan = async () => {
    setMessage(''); setStatus('scanning');
    if (!supportsWebNfc()) {
      setMessage('Tap the linked RFID card on the connected reader.');
      return;
    }
    try { await startWebNfcScan(uid => void authenticateUid(uid)); }
    catch (cause) { setMessage(errorMessage(cause)); setStatus('error'); }
  };

  const dispute = async () => {
    if (!checkout || authenticating.current) return;
    authenticating.current = true; setMessage('');
    const result = await replacementApi().rpc('kiosk_dispute_checkout', { p_session_id: checkout.session_id, p_reason: reason });
    if (result.error) setMessage(result.error.message);
    else { setCheckout(result.data as CheckoutState); setReason(''); }
    authenticating.current = false;
  };

  const complete = async () => {
    if (!checkout || authenticating.current) return;
    authenticating.current = true; setMessage('');
    const result = await replacementApi().rpc('kiosk_complete_checkout', { p_session_id: checkout.session_id });
    if (result.error) setMessage(result.error.message);
    else {
      setReceipt(result.data as Receipt); setCheckout(null); setStatus('complete');
      await signOut();
    }
    authenticating.current = false;
  };

  return <main className="tb-field tb-world-shell min-h-screen text-umber">
    <header className="tb-hud border-b border-gold/35 bg-cream/90 shadow-[0_8px_30px_rgba(84,56,34,.07)]"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><span className="tb-brand-seal grid h-11 w-11 place-items-center rounded-full border border-gold/50 bg-parch/25"><BookOpenIcon className="h-5 w-5 text-rust" /></span><span className="font-display text-xl font-900 uppercase tracking-[.06em]">Tankobonbon</span></div><span className="tb-eyebrow">Checkout kiosk</span></div></header>
    <div className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-[1360px] place-items-center px-4 py-5 sm:px-6">
      <section className="tb-surface tb-cut-lg w-full max-w-xl border border-gold/35 p-5 shadow-[0_24px_70px_rgba(84,56,34,.18)] sm:p-7">
        {status === 'preparing' && <p role="status" className="text-center">Preparing checkout kiosk…</p>}
        {['ready', 'scanning', 'authorizing', 'error'].includes(status) && !checkout && <div className="text-center">
          <span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-parch/50 text-rust"><CreditCardIcon className="h-11 w-11" /></span>
          <p className="tb-eyebrow mt-6">UC-05 · Settle session</p><h1 className="mt-2 font-display text-3xl font-900 uppercase">Tap card to check out</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-umber/65">Tap the RFID card used at check-in. If you started reading, the kiosk will stop the timer and display your session summary.</p>
          {message && <p role={status === 'error' ? 'alert' : 'status'} className="mt-5 rounded-lg border border-rust/30 bg-rust/10 p-3 text-sm">{message}</p>}
          <button type="button" disabled={status === 'authorizing' || status === 'preparing'} onClick={() => void startScan()} className="tb-button-primary tb-cut-sm mt-7 min-h-14 w-full justify-center px-6 text-base disabled:opacity-60"><RadioIcon className="h-5 w-5" />{status === 'authorizing' ? 'Finding your session…' : 'Start RFID scan'}</button>
          <p className="mt-4 text-xs text-umber/50">No username, password, or account sign-in is required.</p>
        </div>}
        {checkout && <div>
          <p className="tb-eyebrow">Checkout summary</p><h1 className="mt-2 font-display text-3xl font-900">{readerName}</h1>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><Summary label="Session" value={`#${checkout.session_id}`} /><Summary label="Seat" value={checkout.seat ? `${checkout.seat.number} · ${checkout.seat.area}` : '—'} /><Summary label="Checked in" value={dateTime(checkout.checked_in_at)} /><Summary label="Reading time" value={`${checkout.minutes} ${checkout.minutes === 1 ? 'minute' : 'minutes'}${checkout.session_status === 'READING' ? ' and counting' : ''}`} /><Summary label="Timer stopped" value={checkout.return_date ? dateTime(checkout.return_date) : 'Still running'} /><Summary label="Total due" value={money(checkout.total_charge)} /></div>
          <section className="mt-5 rounded-xl border border-gold/30 bg-parch/25 p-5 text-sm" aria-labelledby="checkout-books-title">
            <h2 id="checkout-books-title" className="font-display text-lg font-900">Books borrowed ({checkout.books?.length ?? 0})</h2>
            {checkout.books?.length ? <ul className="mt-3 divide-y divide-gold/20">{checkout.books.map(book => <li key={book.copy_id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"><span><strong className="block">{book.title}</strong><span className="text-umber/60">{book.author} · Copy #{book.copy_number}</span></span><span className={book.returned ? 'text-emerald-700' : 'font-bold text-rust'}>{book.returned ? 'Returned' : 'Return needed'}</span></li>)}</ul> : <p className="mt-3 text-umber/60">No books recorded for this session.</p>}
          </section>
          {checkout.books_to_return > 0 && <p role="alert" className="mt-5 rounded-lg border border-rust/35 bg-rust/10 p-4 text-sm">Return and scan every remaining book before tapping the card again. This session has not ended.</p>}
          <div className="mt-5 rounded-xl border border-gold/30 bg-parch/25 p-5 text-sm"><h2 className="font-display text-lg font-900">Charges</h2><p className="mt-3 flex justify-between"><span>Food</span><strong>{money(checkout.food_charge)}</strong></p><p className="mt-2 flex justify-between"><span>Other / damages</span><strong>{money(checkout.other_charge)}</strong></p><p className="mt-3 flex justify-between border-t border-gold/25 pt-3 text-lg"><span>Total due</span><strong>{money(checkout.total_charge)}</strong></p></div>
          {checkout.disputed ? <p role="status" className="mt-5 rounded-lg border border-rust/30 bg-rust/10 p-4 text-sm">Checkout is paused while staff review the disputed charge. This summary refreshes automatically.</p> : checkout.session_status === 'CHECKOUT PENDING' && checkout.total_charge > 0 && checkout.payment_status !== 'PAID' ? <div className="mt-5 space-y-3"><p className="text-sm">Settle {money(checkout.total_charge)} with staff at the counter, or request a review below.</p><textarea className="tb-input w-full rounded-lg px-3 py-3" rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the charge you want staff to review" /><button type="button" disabled={reason.trim().length < 5 || authenticating.current} onClick={() => void dispute()} className="tb-button-secondary tb-cut-sm px-4 py-3 text-sm">Dispute charge</button></div> : checkout.session_status === 'CHECKOUT PENDING' && <button type="button" disabled={authenticating.current} onClick={() => void complete()} className="tb-button-primary tb-cut-sm mt-5 w-full justify-center px-5 py-3">Complete checkout</button>}
          {message && <p role="alert" className="mt-5 rounded-lg border border-rust/35 bg-rust/10 p-3 text-sm">{message}</p>}
          {checkout.books_to_return > 0 && <button type="button" onClick={() => void reset()} className="tb-button-secondary tb-cut-sm mt-5 px-4 py-3"><RotateCcwIcon className="h-4 w-4" /> Ready for another card</button>}
        </div>}
        {status === 'complete' && receipt && <div className="text-center"><CheckCircle2Icon className="mx-auto h-14 w-14 text-emerald-700" /><p className="tb-eyebrow mt-4">Session closed</p><h1 className="mt-2 font-display text-3xl font-900">Checkout complete</h1><p className="mt-3 text-sm">Session #{receipt.session_id} · {receipt.minutes} minutes · {money(receipt.total_charge)} settled.</p><button type="button" onClick={() => void reset()} className="tb-button-primary tb-cut-sm mt-7 px-6 py-3"><RotateCcwIcon className="h-4 w-4" /> Next reader</button></div>}
        {status === 'complete' && checkinOnly && <div className="text-center"><CheckCircle2Icon className="mx-auto h-14 w-14 text-emerald-700" /><p className="tb-eyebrow mt-4">Check-in ended</p><h1 className="mt-2 font-display text-3xl font-900">Checkout complete</h1><p className="mt-3 text-sm">Your check-in is closed{checkinOnly.seat_released ? ' and your reserved seat has been released' : ''}. No reading time was used.</p><button type="button" onClick={() => void reset()} className="tb-button-primary tb-cut-sm mt-7 px-6 py-3"><RotateCcwIcon className="h-4 w-4" /> Next reader</button></div>}
      </section>
    </div>
  </main>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gold/25 bg-parch/20 p-4"><span className="text-xs text-umber/55">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div>;
}
