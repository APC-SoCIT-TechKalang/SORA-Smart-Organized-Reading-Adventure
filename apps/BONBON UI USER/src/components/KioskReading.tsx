import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { replacementApi } from '../lib/replacement-library';
import { errorMessage } from '../lib/supabase';

type Seat = { seat_id: number; seat_number: number; seat_area: string; seat_status: string };
type Active = { session_id: number; seat_id: number; borrow_date: string; session_status: string };
type Book = { copy_id: number; book_copies: { barcode: string; books: { title: string } } };
type Card = { user_id: string; users: { first_name: string; last_name: string; username: string } };
type Alert = { log_id: number; details: string; created_at: string };
type ReadingState = { seats: Seat[]; active: Active | null; books: Book[]; checked_in: boolean; waiting: boolean; staff: boolean; alerts: Alert[] };

export function KioskReading() {
  const { profile, refresh } = useGame();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [barcode, setBarcode] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [staff, setStaff] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mutation = useRef(false);
  const scanner = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const result = await replacementApi().rpc('kiosk_reading_state');
    if (result.error) throw result.error;
    const state = result.data as ReadingState;
    setSeats(state.seats); setActive(state.active); setBooks(state.books);
    setCheckedIn(state.checked_in); setWaiting(state.waiting);
    setStaff(state.staff); setAlerts(state.alerts); setLoaded(true);
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

  const run = async (action: () => Promise<void>) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); await load(); await refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { mutation.current = false; setBusy(false); scanner.current?.focus(); }
  };
  const call = async (name: string, args?: Record<string, unknown>) => {
    const result = await replacementApi().rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  };
  const available = seats.filter(seat => seat.seat_status === 'AVAILABLE');
  const chosen = seats.find(seat => seat.seat_id === selected);
  const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.borrow_date).getTime()) / 1000)) : 0;
  const input = 'tb-input mt-2 w-full rounded-lg px-3 py-3';
  const button = 'tb-button-primary tb-cut-sm min-h-12 px-5 py-3 disabled:opacity-50';

  return <section className="tb-surface tb-cut-lg space-y-5 border border-gold/35 p-5 sm:p-7" aria-label="Kiosk reading session">
    <div><p className="tb-eyebrow">In-library kiosk</p><h2 className="mt-1 font-display text-2xl font-800">Choose a seat & scan your book</h2>
      <p className="mt-2 text-sm text-umber/70">The map refreshes every 3 seconds. Your seat is secured when the first book scan succeeds.</p></div>
    {error && <p role="alert" className="rounded border border-rust/40 bg-rust/10 p-3">{error}</p>}
    {message && <p role="status" className="rounded border border-gold/40 p-3">{message}</p>}
    {!loaded && <p role="status">Loading seat and session information...</p>}
    {staff ? <>
      <h3 className="font-display text-lg font-800">Librarian check-in approval</h3>
      <p className="text-sm">Scan a library card, verify the reader's identity at the counter, then approve entry.</p>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        setCard(null);
        const result = await replacementApi().from('librarycard').select('user_id,users(first_name,last_name,username)').eq('librarycard_rfid', barcode.trim()).eq('is_active', true).is('deactivated_at', null).single();
        if (result.error) throw result.error;
        setCard(result.data as unknown as Card);
      }); }}>
        <label>Library card RFID<input className={input} value={barcode} onChange={event => { setBarcode(event.target.value); setCard(null); }} required maxLength={100} disabled={busy} /></label>
        <button className={`${button} mt-3`} disabled={busy || !loaded}>Look up reader</button>
      </form>
      {card && <div className="rounded border border-gold/35 p-4"><p>{card.users.first_name} {card.users.last_name} (@{card.users.username})</p>
        <button className={`${button} mt-3`} disabled={busy} onClick={() => void run(async () => {
          await call('approve_kiosk_checkin', { p_rfid: barcode.trim() }); setCard(null); setBarcode(''); setMessage('Identity verified. Reader check-in approved for 12 hours or until checkout.');
        })}>Identity verified — approve check-in</button></div>}
      <h3 className="font-display text-lg font-800">Recent inventory alerts</h3>
      {alerts.length ? alerts.map(alert => <p key={alert.log_id} className="border-l-4 border-rust pl-3 text-sm">{new Date(alert.created_at).toLocaleString()} — {alert.details}</p>) : <p>No inventory discrepancies reported.</p>}
    </> : <>
      {!checkedIn && loaded && <p className="rounded bg-parch/40 p-3">Please have a librarian approve your check-in before scanning a book.</p>}
      {active && <div className="rounded border border-gold/40 p-4"><p className="font-800">Session #{active.session_id} · Seat {seats.find(seat => seat.seat_id === active.seat_id)?.seat_number}</p>
        <p className="mt-2 font-mono text-2xl" aria-label="Elapsed reading time">{Math.floor(elapsed / 3600)}:{String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</p>
        <ul className="mt-3 list-disc pl-5">{books.map(book => <li key={book.copy_id}>{book.book_copies.books.title} · {book.book_copies.barcode}</li>)}</ul>
        <p className="mt-2 text-sm">Scan another book to add it without restarting your timer.</p></div>}
      <div className="flex flex-wrap gap-3 text-sm"><span>Available</span><span className="text-umber/50">Occupied / unavailable (disabled)</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{seats.map(seat => <button type="button" key={seat.seat_id} aria-pressed={selected === seat.seat_id}
        disabled={busy || !loaded || seat.seat_status !== 'AVAILABLE'} onClick={() => setSelected(seat.seat_id)}
        className={`min-h-24 rounded-lg border-2 p-3 text-left disabled:opacity-40 ${selected === seat.seat_id ? 'border-rust bg-parch/60' : 'border-gold/30'}`}>
        <strong className="block">Seat {seat.seat_number}</strong><span className="block text-xs">{seat.seat_area}</span><span className="text-xs">{seat.seat_id === active?.seat_id ? 'Your seat' : seat.seat_status}</span>
      </button>)}</div>
      {loaded && seats.length === 0 && <p>No seats have been configured. Ask library staff for help.</p>}
      {loaded && !active && seats.length > 0 && available.length === 0 && <div className="space-y-3"><p>All seats are currently occupied.</p><button className={button} disabled={busy || waiting} onClick={() => void run(async () => {
        await call('kiosk_join_waitlist'); setMessage('You joined the waitlist. Keep this page open for a seat availability notice.');
      })}>{waiting ? 'You are on the waitlist' : 'Join seat waitlist'}</button></div>}
      {waiting && available.length > 0 && <p role="status" className="rounded bg-parch/50 p-4">A seat is now available! Select one and scan your book. Seats are assigned when the scan succeeds.</p>}
      {chosen?.seat_status === 'AVAILABLE' && <p role="status">Selected: Seat {chosen.seat_number} · {chosen.seat_area}</p>}
      {active && <button className={button} disabled={busy || !loaded || chosen?.seat_status !== 'AVAILABLE'} onClick={() => void run(async () => {
        await call('kiosk_change_seat', { p_seat_id: selected }); setSelected(null); setMessage('Seat changed. Your previous seat is now available.');
      })}>Move to selected seat</button>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await call('kiosk_scan_book', { p_barcode: barcode.trim(), p_seat_id: active ? null : selected }) as { error?: string; title: string };
        if (result.error) throw new Error(result.error);
        setBarcode(''); setSelected(null); setMessage(`${result.title} ${active ? 'added to your session' : 'scanned. Your reading session has started'}.`);
      }); }}>
        <label className="block font-700">Book ISBN or copy barcode<input ref={scanner} className={input} value={barcode} onChange={event => setBarcode(event.target.value)} autoComplete="off" required maxLength={100} placeholder="Scan here, then press Enter" disabled={busy || !loaded || !checkedIn} /></label>
        <p className="mt-2 text-xs text-umber/65">USB barcode scanners can type into this field and submit with Enter. You can also enter a barcode manually for testing.</p>
        <button className={`${button} mt-4`} disabled={busy || !loaded || !checkedIn || !barcode.trim() || (!active && chosen?.seat_status !== 'AVAILABLE') || active?.session_status === 'CHECKOUT PENDING'}>{busy ? 'Saving...' : active ? 'Scan & add book' : 'Scan & start session'}</button>
      </form>
    </>}
  </section>;
}
