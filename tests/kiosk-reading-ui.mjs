// Mocked API UI checks. Start Vite on 5174 with the demo environment in docs/kiosk-reading.md.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../work/kiosk-validation/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const id = '00000000-0000-4000-8000-000000000001';
const user = { id, email: 'reader@example.test', app_metadata: { sora_user_id: id }, user_metadata: {} };
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock`;
let active = null, copies = [], waiting = false, full = false, checkedIn = true, role = 'Reader', emptySeats = false, stateError = false, reservation = null, minutes = 120;
const seats = () => emptySeats ? [] : [1,2].map(n => ({ seat_id: n, seat_number: n, seat_area: 'Lounge', seat_status: full || active?.seat_id === n || reservation?.seat_id === n ? 'OCCUPIED' : 'AVAILABLE' }));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-demo-auth-token', JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { user, token });
  await page.route('https://demo.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const table = url.pathname.split('/').at(-1);
    if (table === 'kiosk_reading_state' && stateError) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Seat data could not be loaded' }) });
      return;
    }
    let data = [];
    if (url.pathname.endsWith('/auth/v1/token')) data = { access_token: token, refresh_token: 'mock', expires_in: 3600, token_type: 'bearer', user };
    else if (url.pathname.includes('/auth/')) data = user;
    else if (table === 'current_user_id') data = id;
    else if (table === 'points_balance') data = 0;
    else if (table === 'is_librarian') data = role === 'Librarian';
    else if (table === 'reader_quest_dashboard') data = { rank: 'F', membership_tier: 'Guild Member', points: 0, last_updated: new Date().toISOString(), next_rank: null, quests: [] };
    else if (table === 'reader_book_activity') data = [];
    else if (table === 'books') data = [{ book_id: 1, title: 'Test Manga', authors: { author_firstname: 'A', author_lastname: 'Writer' }, book_copies: [] }];
    else if (table === 'users') data = { id, first_name: 'Test', last_name: 'Reader', birthdate: '2000-01-01', is_active: true, user_role: role, membership_rank: 'F', membership_type: 'Guild Member', membership_status: 'ACTIVE', membership_expires_at: '2099-01-01T00:00:00Z', remaining_minutes: minutes };
    else if (table === 'seats') data = seats();
    else if (table === 'sessions') data = url.searchParams.get('select')?.includes('seat_id') ? active : active ? [active] : [];
    else if (table === 'book_copies') data = [{ copy_id: 1, book_id: 1 }];
    else if (table === 'kiosk_reading_state') data = {
      active, reservation, seats: seats(), checked_in: checkedIn, waiting, staff: role === 'Librarian', alerts: [],
      books: copies.map((barcode,i) => ({ copy_id: i+1, book_copies: { barcode, books: { title: `Test Manga ${i+1}` } } })),
    };
    else if (table === 'kiosk_scan_book') {
      const body = request.postDataJSON();
      if (body.p_barcode === 'TAKEN') data = { error: 'Book is unavailable. Staff have been alerted.' };
      else { if (!active) active = { session_id: 1, seat_id: body.p_seat_id, borrow_date: new Date(Date.now()-60000).toISOString(), session_status: 'READING' }; reservation = null; copies.push(body.p_barcode); data = { session_id: 1, title: 'Test Manga' }; }
    } else if (table === 'kiosk_change_seat') { active.seat_id = request.postDataJSON().p_seat_id; data = null; }
    else if (table === 'kiosk_reserve_seat') { reservation = { seat_id: request.postDataJSON().p_seat_id, expires_at: new Date(Date.now()+300000).toISOString() }; data = reservation; }
    else if (table === 'kiosk_cancel_seat') { reservation = null; data = null; }
    else if (table === 'kiosk_join_waitlist') { waiting = true; data = null; }
    else if (table === 'librarycard') data = { user_id: id, users: { first_name: 'Test', last_name: 'Reader', username: 'reader' } };
    else if (table === 'approve_kiosk_checkin') data = id;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('button', { name: /View Seats/ }).click();
  const panel = page.getByRole('region', { name: 'Kiosk reading session' });
  try { await panel.waitFor({ timeout: 5000 }); }
  catch (error) {
    console.log('Navigation DOM:', await page.locator('#main').innerText());
    await page.screenshot({ path: 'work/kiosk-navigation-failure.png' });
    throw error;
  }
  for (const name of [/Browse Books/, /View Quests/, /Archive Reading hall/]) {
    await page.getByRole('button', { name }).click();
    await page.getByRole('button', { name: /View Seats/ }).click();
    await panel.getByRole('button', { name: /Seat 1 Lounge/ }).waitFor({ timeout: 5000 });
  }
  console.log('PASS: sidebar navigation renders Seats from Archive, Catalog and Quests');
  // An embedded/background browser can suspend animation frames. Navigation
  // must still mount a visible page without waiting for an exit animation.
  await page.getByRole('button', { name: /Browse Books/ }).click();
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.getByRole('button', { name: /View Seats/ }).click();
  await panel.getByRole('button', { name: /Seat 1 Lounge/ }).waitFor({ timeout: 5000 });
  assert.ok(await panel.evaluate(element => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.opacity === '0' || style.visibility === 'hidden') return false;
    }
    return true;
  }), 'Seat content stays visible when animation frames are suspended');
  emptySeats = true;
  await page.goto('http://127.0.0.1:5174/?reading=1');
  await panel.getByText('The layout is ready. Library staff need to load the 20 seat records before booking opens.').waitFor();
  assert.equal(await panel.getByRole('button', { name: /Not configured/ }).count(), 20);
  emptySeats = false; stateError = true;
  await page.reload();
  await panel.getByRole('alert').filter({ hasText: 'Seat data could not be loaded' }).waitFor();
  stateError = false;
  await page.reload();
  await panel.getByRole('button', { name: /Seat 1 Lounge/ }).waitFor();
  console.log('PASS: suspended animations, empty seats and API errors do not leave a blank page');
  await panel.getByRole('button', { name: /Seat 1 Lounge/ }).click();
  await panel.getByRole('button', { name: 'Confirm seat 1', exact: true }).click();
  await panel.getByText('Your seat: 1').waitFor();
  await panel.getByLabel('Book ISBN or copy barcode').fill('COPY1');
  minutes = 0;
  await panel.getByRole('alert').filter({ hasText: 'You have 0 reading minutes' }).waitFor({ timeout: 10000 });
  assert.ok(await panel.getByRole('button', { name: 'Scan & start session' }).isDisabled());
  minutes = 60;
  await panel.getByText('60 minutes remaining', { exact: true }).waitFor({ timeout: 10000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Scan & start session').disabled);
  console.log('PASS: zero-minute balance explains the block; admin top-up automatically enables scanning');
  await panel.getByRole('button', { name: 'Scan & start session' }).click();
  await panel.getByText(/Session #1/).waitFor();
  const liveBalance = panel.getByLabel('Reading time balance').locator('strong');
  const firstCountdown = await liveBalance.textContent();
  assert.match(firstCountdown ?? '', /^\d{2}:\d{2}:\d{2} remaining$/, 'Active sessions show a live countdown');
  await page.waitForTimeout(1100);
  assert.notEqual(await liveBalance.textContent(), firstCountdown, 'Active countdown advances in real time');
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
  const alert = panel.getByRole('alert').filter({ hasText: 'Book is unavailable' });
  await page.waitForFunction(element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }, await alert.elementHandle());
  console.log('PASS: select seat, start, add book, preserve timer, change seat, show scan error');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: 'work/kiosk-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile horizontal overflow');
  active = null; copies = []; full = true;
  await page.goto('http://127.0.0.1:5174/?reading=1');
  await panel.getByRole('button', { name: 'Join seat waitlist' }).click();
  await panel.getByRole('button', { name: 'You are on the waitlist' }).waitFor();
  full = false;
  await panel.getByText(/A seat is now available!/).waitFor({ timeout: 10000 });
  console.log('PASS: waitlist joins and receives availability notice through automatic refresh');
  checkedIn = false; await page.reload();
  await panel.getByText(/Please have a librarian approve/).waitFor();
  assert.ok(await panel.getByLabel('Book ISBN or copy barcode').isDisabled());
  assert.equal(await page.getByLabel('Library card RFID').count(), 0);
  checkedIn = true;
  await panel.getByLabel('Book ISBN or copy barcode').waitFor();
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Scan here, then press Enter"]').disabled);
  console.log('PASS: reader has no staff controls and automatically receives admin-approved check-in');
  role = 'Librarian'; await page.reload();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Library card RFID').count(), 0);
  console.log('PASS: restored librarian session is signed out of the reader app');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill('staff@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('Test-Password123!');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Librarian accounts must sign in through the admin dashboard' }).waitFor();
  console.log('PASS: librarian credentials are rejected with an admin dashboard instruction');
} finally { await browser.close(); }
