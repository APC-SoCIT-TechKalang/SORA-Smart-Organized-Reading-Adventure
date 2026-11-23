import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { replacementApi } from '../lib/replacement-library';
import { errorMessage } from '../lib/supabase';
import { LibrarySeatMap } from './LibrarySeatMap';

type Seat = { seat_id: number; seat_number: number; seat_area: string; seat_status: string };
type Active = { session_id: number; seat_id: number; borrow_date: string; session_status: string };
type Reservation = { seat_id: number; expires_at: string };
type ReadingAccount = { membership_type: string | null; membership_status: string; membership_expires_at: string | null; remaining_minutes: number };
type ReadingState = { seats: Seat[]; active: Active | null; checked_in: boolean; waiting: boolean; staff: boolean; reservation: Reservation | null };

export function KioskReading() {
  const { profile, refresh } = useGame();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [account, setAccount] = useState<ReadingAccount | null>(null);
  const [barcode, setBarcode] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [staff, setStaff] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mutation = useRef(false);
  const scanner = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [result, user] = await Promise.all([
      replacementApi().rpc('kiosk_reading_state'),
      replacementApi().from('users').select('membership_type,membership_status,membership_expires_at,remaining_minutes').eq('id', profile.user_id).single(),
    ]);
    if (result.error) throw result.error;
    if (user.error) throw user.error;
    const state = result.data as ReadingState;
    setSeats(state.seats); setActive(state.active);
    setCheckedIn(state.checked_in); setWaiting(state.waiting);
    setStaff(state.staff); setLoaded(true);
    setReservation(state.reservation ?? null);
    setAccount(user.data as ReadingAccount);
  }, [profile]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const update = async () => {
      if (stopped || inFlight || mutation.current) return;
      inFlight = true;
      try { await load(); } catch (cause) { if (!stopped) { setLoaded(false); setError(errorMessage(cause)); } }
      finally { inFlight = false; }
    };
    void update();
    // Polling works without requiring Supabase Realtime publication changes.
    const timer = window.setInterval(() => void update(), 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (error) feedback.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [error]);

  const run = async (action: () => Promise<void>) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); await load(); await refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { mutation.current = false; setBusy(false); scanner.current?.focus({ preventScroll: true }); }
  };
  const call = async (name: string, args?: Record<string, unknown>) => {
    const result = await replacementApi().rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  };
  const available = seats.filter(seat => seat.seat_status === 'AVAILABLE');
  const chosen = seats.find(seat => seat.seat_id === selected);
  const holdSeconds = reservation ? Math.max(0, Math.ceil((new Date(reservation.expires_at).getTime() - now) / 1000)) : 0;
  const hasHold = !!reservation && holdSeconds > 0;
  const membershipActive = account?.membership_status === 'ACTIVE' && !!account.membership_expires_at && new Date(account.membership_expires_at).getTime() > now;
  const unlimited = account?.membership_type === 'Guild Adventurer';
  const hasTime = unlimited || (account?.remaining_minutes ?? 0) > 0;
  const readingIssue = !membershipActive ? 'An active, unexpired membership is required. Ask library staff to activate your membership.'
    : !hasTime ? 'You have 0 reading minutes. Ask the librarian to add reading time in the admin Top-up terminal, then scan your book again.' : '';
  const input = 'tb-input mt-2 w-full rounded-lg px-3 py-3';
  const button = 'tb-button-primary tb-cut-sm min-h-12 px-5 py-3 disabled:opacity-50';

  return <section className="tb-surface tb-cut-lg space-y-5 border border-gold/35 p-5 sm:p-7" aria-label="Kiosk reading session">
    <div><p className="tb-eyebrow">In-library kiosk</p><h2 className="mt-1 font-display text-2xl font-800">Choose a seat & scan your book</h2>
      <p className="mt-2 text-sm text-umber/70">Choose your spot on the lounge map and confirm it. We’ll hold it for 5 minutes while you scan your book.</p></div>
    {!loaded && <p role="status">Loading seat and session information...</p>}
    {staff ? <>
      <p role="status">Librarian accounts use the admin dashboard. Sign out here and use a reader account for the kiosk.</p>
    </> : <>
      {!checkedIn && loaded && <p className="rounded bg-parch/40 p-3">Please have a librarian approve your check-in before scanning a book.</p>}
      <LibrarySeatMap seats={seats} selectedId={selected} ownSeatId={active?.seat_id} heldSeatId={hasHold ? reservation?.seat_id : undefined} disabled={busy || !loaded} onSelect={setSelected} />
      {loaded && seats.length === 0 && <p role="status" className="rounded bg-parch/40 p-3 text-sm">The layout is ready. Library staff need to load the 20 seat records before booking opens.</p>}
      {loaded && !active && !hasHold && seats.length > 0 && available.length === 0 && <div className="space-y-3"><p>All seats are currently occupied.</p><button className={button} disabled={busy || waiting} onClick={() => void run(async () => {
        await call('kiosk_join_waitlist'); setMessage('You joined the waitlist. Keep this page open for a seat availability notice.');
      })}>{waiting ? 'You are on the waitlist' : 'Join seat waitlist'}</button></div>}
      {waiting && !hasHold && available.length > 0 && <p role="status" className="rounded bg-parch/50 p-4">A seat is now available! Choose and confirm one, then scan your book.</p>}
      {chosen?.seat_status === 'AVAILABLE' && <p role="status">Selected: Seat {chosen.seat_number} · {chosen.seat_area}</p>}
      {!active && chosen?.seat_status === 'AVAILABLE' && <button className={button} disabled={busy || !loaded || !checkedIn || !!readingIssue} onClick={() => void run(async () => {
        await call('kiosk_reserve_seat', { p_seat_id: selected }); setSelected(null); setMessage('Seat confirmed. Scan your book within 5 minutes to start reading.');
      })}>Confirm seat {chosen.seat_number}</button>}
      {!active && hasHold && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rust/25 bg-parch/40 p-4">
        <div><p className="font-800">Your seat: {seats.find(seat => seat.seat_id === reservation.seat_id)?.seat_number}</p><p className="mt-1 text-sm">Held for {Math.floor(holdSeconds / 60)}:{String(holdSeconds % 60).padStart(2, '0')} · Scan your book to begin.</p></div>
        <button type="button" disabled={busy} className="tb-button-secondary rounded-lg px-4 py-2 text-sm" onClick={() => void run(async () => {
          await call('kiosk_cancel_seat'); setSelected(null); setMessage('Seat released. You can choose another spot.');
        })}>Release seat</button>
      </div>}
      {active && <button className={button} disabled={busy || !loaded || chosen?.seat_status !== 'AVAILABLE'} onClick={() => void run(async () => {
        await call('kiosk_change_seat', { p_seat_id: selected }); setSelected(null); setMessage('Seat changed. Your previous seat is now available.');
      })}>Move to selected seat</button>}
      <div ref={feedback} className="space-y-3 scroll-mt-24" aria-live="polite">
        {loaded && account && <div aria-label="Reading time balance" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-parch/25 px-4 py-3 text-sm">
          <span className="font-700">Reading time</span><strong>{unlimited ? 'Unlimited · Guild Adventurer' : `${account.remaining_minutes} minutes remaining`}</strong>
        </div>}
        {loaded && readingIssue && <p role="alert" className="rounded-lg border border-rust/35 bg-rust/10 p-3 text-sm">{readingIssue}</p>}
        {error && <p role="alert" className="rounded-lg border border-rust/40 bg-rust/10 p-3">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-gold/40 p-3">{message}</p>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        if (readingIssue) throw new Error(readingIssue);
        const result = await call('kiosk_scan_book', { p_barcode: barcode.trim(), p_seat_id: active ? null : reservation?.seat_id }) as { error?: string; title: string };
        if (result.error) throw new Error(result.error);
        setBarcode(''); setSelected(null); setMessage(`${result.title} ${active ? 'added to your session' : 'scanned. Your reading session has started'}.`);
      }); }}>
        <label className="block font-700">Book ISBN or copy barcode<input ref={scanner} className={input} value={barcode} onChange={event => setBarcode(event.target.value)} autoComplete="off" required maxLength={100} placeholder="Scan here, then press Enter" disabled={busy || !loaded || !checkedIn} /></label>
        <p className="mt-2 text-xs text-umber/65">USB barcode scanners can type into this field and submit with Enter. You can also enter a barcode manually for testing.</p>
        <button className={`${button} mt-4`} disabled={busy || !loaded || !checkedIn || !!readingIssue || !barcode.trim() || (!active && !hasHold) || active?.session_status === 'CHECKOUT PENDING'}>{busy ? 'Saving...' : active ? 'Scan & add book' : 'Scan & start session'}</button>
      </form>
    </>}
  </section>;
}
