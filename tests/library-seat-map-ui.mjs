// Demo Vite on 5174. All Supabase responses are mocked; no live data is changed.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../work/kiosk-validation/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const layout = [
  ...Array(4).fill('Desk Area'), ...Array(6).fill('Center Seating'),
  ...Array(2).fill('L Pods A'), ...Array(3).fill('L Pods B'), ...Array(2).fill('U Pods A'), ...Array(3).fill('U Pods B'),
];
const holds = new Map(), sessions = new Map();
const heldBy = seat => [...holds].find(([,hold]) => hold.seat_id === seat && new Date(hold.expires_at).getTime() > Date.now())?.[0];
const occupied = seat => seat === 20 || heldBy(seat) || [...sessions.values()].some(session => session.seat_id === seat);
const seats = () => layout.map((seat_area, i) => ({ seat_id: i+1, seat_number: i+1, seat_area, seat_status: occupied(i+1) ? 'OCCUPIED' : 'AVAILABLE' }));

async function reader(id) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1300 } });
  const user = { id, email: `${id}@example.test`, app_metadata: { sora_user_id: id }, user_metadata: {} };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock`;
  await context.addInitScript(({ user, token }) => localStorage.setItem('sb-demo-auth-token', JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { user, token });
  await context.route('https://demo.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1);
    let data = [], status = 200;
    if (url.pathname.includes('/auth/')) data = user;
    else if (table === 'is_librarian') data = false;
    else if (table === 'current_user_id') data = id;
    else if (table === 'points_balance') data = 0;
    else if (table === 'users') data = { id, first_name: 'Test', last_name: 'Reader', birthdate: '2000-01-01', is_active: true, membership_rank: 'F', membership_type: 'Guild Member', membership_status: 'ACTIVE', membership_expires_at: '2099-01-01T00:00:00Z', remaining_minutes: 120 };
    else if (table === 'books') data = [{ book_id: 1, title: 'A Reading Adventure', authors: { author_firstname: 'A', author_lastname: 'Writer' }, book_copies: [] }];
    else if (table === 'book_copies') data = [{ copy_id: 1, book_id: 1 }];
    else if (table === 'sessions') data = sessions.has(id) ? [sessions.get(id)] : [];
    else if (table === 'kiosk_reading_state') data = {
      seats: seats(), active: sessions.get(id) || null, checked_in: true, waiting: false, staff: false,
      reservation: holds.has(id) && new Date(holds.get(id).expires_at).getTime() > Date.now() ? holds.get(id) : null,
      books: sessions.has(id) ? [{ copy_id: 1, book_copies: { barcode: 'COPY1', books: { title: 'A Reading Adventure' } } }] : [],
    };
    else if (table === 'kiosk_reserve_seat') {
      const seat = request.postDataJSON().p_seat_id;
      if (occupied(seat) && heldBy(seat) !== id) { data = { message: 'That seat is no longer available. Choose another seat' }; status = 409; }
      else { holds.set(id, { seat_id: seat, expires_at: new Date(Date.now()+300000).toISOString() }); data = holds.get(id); }
    } else if (table === 'kiosk_cancel_seat') { holds.delete(id); data = null; }
    else if (table === 'kiosk_scan_book') {
      const seat = request.postDataJSON().p_seat_id;
      assert.equal(heldBy(seat), id);
      sessions.set(id, { session_id: 1, seat_id: seat, copy_id: 1, borrow_date: new Date().toISOString(), session_status: 'READING' });
      holds.delete(id); data = { session_id: 1, title: 'A Reading Adventure' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?reading=1');
  await page.getByRole('button', { name: 'Seat 1 Desk Area Available', exact: true }).waitFor();
  return page;
}

try {
  const a = await reader('00000000-0000-4000-8000-000000000001');
  const b = await reader('00000000-0000-4000-8000-000000000002');
  const map = a.getByRole('region', { name: 'Library seating layout' });
  assert.equal(await map.getByRole('button', { name: /^Seat / }).count(), 20);
  assert.ok(await map.getByRole('button', { name: 'Seat 20 U Pods B Unavailable', exact: true }).isDisabled());
  await a.getByRole('button', { name: 'Seat 5 Center Seating Available', exact: true }).click();
  await a.getByRole('button', { name: 'Confirm seat 5', exact: true }).click();
  await a.getByText('Your seat: 5', { exact: true }).waitFor();
  await b.getByRole('button', { name: 'Seat 5 Center Seating Unavailable', exact: true }).waitFor({ timeout: 10000 });
  assert.ok(await b.getByRole('button', { name: 'Seat 5 Center Seating Unavailable', exact: true }).isDisabled());
  assert.equal(sessions.size, 0);
  await map.screenshot({ path: 'work/library-seat-map-desktop.png' });
  await a.reload(); await a.getByText('Your seat: 5', { exact: true }).waitFor();
  await a.getByRole('button', { name: 'Release seat', exact: true }).click();
  await b.getByRole('button', { name: 'Seat 5 Center Seating Available', exact: true }).waitFor({ timeout: 10000 });
  await b.getByRole('button', { name: 'Seat 5 Center Seating Available', exact: true }).click();
  await b.getByRole('button', { name: 'Confirm seat 5', exact: true }).click();
  await b.getByText('Your seat: 5', { exact: true }).waitFor();
  for (const hold of holds.values()) hold.expires_at = new Date(Date.now()-1000).toISOString();
  await a.getByRole('button', { name: 'Seat 5 Center Seating Available', exact: true }).waitFor({ timeout: 10000 });
  await a.getByRole('button', { name: 'Seat 1 Desk Area Available', exact: true }).click();
  await a.getByRole('button', { name: 'Confirm seat 1', exact: true }).click();
  await a.getByText('Your seat: 1', { exact: true }).waitFor();
  await a.getByLabel('Book ISBN or copy barcode').fill('COPY1');
  await a.getByRole('button', { name: 'Scan & start session', exact: true }).click();
  await a.getByText(/Session #1/).waitFor();
  assert.equal(holds.has('00000000-0000-4000-8000-000000000001'), false);
  await b.getByRole('button', { name: 'Seat 1 Desk Area Unavailable', exact: true }).waitFor({ timeout: 10000 });
  await a.setViewportSize({ width: 390, height: 844 });
  assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await a.getByRole('region', { name: 'Library seating layout' }).screenshot({ path: 'work/library-seat-map-mobile.png' });
  await a.getByLabel('Scrollable library floor plan').evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await a.getByRole('region', { name: 'Library seating layout' }).screenshot({ path: 'work/library-seat-map-mobile-wing.png' });
  console.log('PASS: 20-seat floor plan, two-reader availability, persistent holds, release, expiry, scan conversion and mobile scrolling');
} finally { await browser.close(); }
