// Mocked API UI checks. Start Vite on 5174 with the demo environment in docs/kiosk-reading.md.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../work/kiosk-validation/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const id = '00000000-0000-4000-8000-000000000001';
const user = { id, email: 'reader@example.test', app_metadata: { sora_user_id: id }, user_metadata: {} };
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock`;
let active = null, copies = [], waiting = false, full = false, checkedIn = true, role = 'Reader';
const seats = () => [1,2].map(n => ({ seat_id: n, seat_number: n, seat_area: 'Lounge', seat_status: full || active?.seat_id === n ? 'OCCUPIED' : 'AVAILABLE' }));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-demo-auth-token', JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { user, token });
  await page.route('https://demo.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const table = url.pathname.split('/').at(-1);
    let data = [];
    if (url.pathname.includes('/auth/')) data = user;
    else if (table === 'current_user_id') data = id;
    else if (table === 'points_balance') data = 0;
    else if (table === 'books') data = [{ book_id: 1, title: 'Test Manga', authors: { author_firstname: 'A', author_lastname: 'Writer' }, book_copies: [] }];
    else if (table === 'users') data = { id, first_name: 'Test', last_name: 'Reader', birthdate: '2000-01-01', is_active: true, user_role: role, membership_rank: 'F' };
    else if (table === 'seats') data = seats();
    else if (table === 'sessions') data = url.searchParams.get('select')?.includes('seat_id') ? active : active ? [active] : [];
    else if (table === 'book_copies') data = [{ copy_id: 1, book_id: 1 }];
    else if (table === 'kiosk_reading_state') data = {
      active, seats: seats(), checked_in: checkedIn, waiting, staff: role === 'Librarian', alerts: [],
      books: copies.map((barcode,i) => ({ copy_id: i+1, book_copies: { barcode, books: { title: `Test Manga ${i+1}` } } })),
    };
    else if (table === 'kiosk_scan_book') {
      const body = request.postDataJSON();
      if (body.p_barcode === 'TAKEN') data = { error: 'Book is unavailable. Staff have been alerted.' };
      else { if (!active) active = { session_id: 1, seat_id: body.p_seat_id, borrow_date: new Date(Date.now()-60000).toISOString(), session_status: 'READING' }; copies.push(body.p_barcode); data = { session_id: 1, title: 'Test Manga' }; }
    } else if (table === 'kiosk_change_seat') { active.seat_id = request.postDataJSON().p_seat_id; data = null; }
    else if (table === 'kiosk_join_waitlist') { waiting = true; data = null; }
    else if (table === 'librarycard') data = { user_id: id, users: { first_name: 'Test', last_name: 'Reader', username: 'reader' } };
    else if (table === 'approve_kiosk_checkin') data = id;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://127.0.0.1:5174/?reading=1');
  const panel = page.getByRole('region', { name: 'Kiosk reading session' });
  await panel.getByRole('button', { name: /Seat 1 Lounge/ }).click();
  await panel.getByLabel('Book ISBN or copy barcode').fill('COPY1');
  await panel.getByRole('button', { name: 'Scan & start session' }).click();
  await panel.getByText(/Session #1/).waitFor();
  const started = active.borrow_date;
  await panel.getByLabel('Book ISBN or copy barcode').fill('COPY2');
  await panel.getByRole('button', { name: 'Scan & add book' }).click();
  await panel.getByText('Test Manga 2 · COPY2').waitFor();
  assert.equal(active.borrow_date, started);
  await panel.getByRole('button', { name: /Seat 2 Lounge/ }).click();
  await panel.getByRole('button', { name: 'Move to selected seat' }).click();
  await panel.getByText('Seat changed. Your previous seat is now available.').waitFor();
  await panel.getByLabel('Book ISBN or copy barcode').fill('TAKEN');
  await panel.getByRole('button', { name: 'Scan & add book' }).click();
  await panel.getByRole('alert').filter({ hasText: 'Book is unavailable' }).waitFor();
  console.log('PASS: select seat, start, add book, preserve timer, change seat, show scan error');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: 'work/kiosk-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
  active = null; copies = []; full = true;
  await page.reload();
  await panel.getByRole('button', { name: 'Join seat waitlist' }).click();
  await panel.getByRole('button', { name: 'You are on the waitlist' }).waitFor();
  full = false;
  await panel.getByText(/A seat is now available!/).waitFor({ timeout: 10000 });
  console.log('PASS: waitlist joins and receives availability notice through automatic refresh');
  checkedIn = false; await page.reload();
  await panel.getByText(/Please have a librarian approve/).waitFor();
  assert.ok(await panel.getByLabel('Book ISBN or copy barcode').isDisabled());
  role = 'Librarian'; await page.reload();
  await panel.getByLabel('Library card RFID').fill('CARD1');
  await panel.getByRole('button', { name: 'Look up reader' }).click();
  await panel.getByRole('button', { name: /Identity verified/ }).click();
  await panel.getByText(/Reader check-in approved/).waitFor();
  console.log('PASS: missing check-in blocks scanning; librarian can look up reader and approve');
} finally { await browser.close(); }
