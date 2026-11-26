// Run the admin app on 3000 and the demo-configured reader app on 5174.
// Supabase requests are mocked in isolated browser contexts; no live writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../work/kiosk-validation/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const env = readFileSync(new URL('../apps/admin-dashboard/.env.local', import.meta.url), 'utf8');
const adminUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert.ok(adminUrl, 'Admin URL must be configured locally');
const readerId = '00000000-0000-4000-8000-000000000001';
let checkedIn = false, approvals = 0;
const profile = { id: readerId, first_name: 'Test', last_name: 'Reader', username: 'testreader', birthdate: '2000-01-01', is_active: true, user_role: 'Reader', membership_status: 'ACTIVE', membership_expires_at: '2099-01-01T00:00:00Z', membership_type: 'Guild Member', membership_rank: 'F', remaining_minutes: 120 };

async function createPage(staff) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const user = { id: staff ? '00000000-0000-4000-8000-000000000003' : readerId, email: staff ? 'staff@example.test' : 'reader@example.test', app_metadata: { sora_user_id: readerId }, user_metadata: {} };
  const url = staff ? adminUrl : 'https://demo.supabase.co';
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.mock`;
  await context.addInitScript(({ key, user, token }) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, user, token });
  await context.route(`${new URL(url).origin}/**`, async route => {
    const request = route.request(); const target = new URL(request.url()); const table = target.pathname.split('/').at(-1);
    let data = [];
    if (target.pathname.includes('/auth/')) data = user;
    else if (table === 'is_librarian') data = staff;
    else if (table === 'current_user_id') data = readerId;
    else if (table === 'points_balance') data = 0;
    else if (table === 'users') data = staff ? [profile] : profile;
    else if (table === 'librarycard') data = target.searchParams.get('librarycard_rfid') === 'eq.CARD1' || target.searchParams.get('user_id') === `eq.${readerId}` ? { librarycard_rfid: 'CARD1', users: profile } : null;
    else if (table === 'approve_kiosk_checkin') {
      assert.ok(staff, 'Approval must originate in admin context');
      assert.equal(request.postDataJSON().p_rfid, 'CARD1');
      checkedIn = true; approvals++; data = readerId;
    } else if (table === 'kiosk_reading_state') data = { active: null, seats: [{ seat_id: 1, seat_number: 1, seat_area: 'Lounge', seat_status: 'AVAILABLE' }], books: [], checked_in: checkedIn, waiting: false, staff: false, alerts: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return context.newPage();
}

try {
  const reader = await createPage(false);
  await reader.goto('http://127.0.0.1:5174/?reading=1');
  await reader.getByText(/Please have a librarian approve/).waitFor();
  assert.ok(await reader.getByLabel('Book ISBN or copy barcode').isDisabled());
  const admin = await createPage(true);
  await admin.goto(process.env.TEST_ADMIN_URL || 'http://localhost:3000');
  await admin.getByRole('button', { name: 'Open navigation menu' }).click();
  await admin.getByRole('button', { name: 'Readers', exact: true }).click();
  const form = admin.getByRole('region', { name: 'Reader check-in' });
  assert.equal(await form.getByLabel('Library card RFID').count(), 0);
  await admin.keyboard.type('UNKNOWN', { delay: 5 });
  await admin.keyboard.press('Enter');
  await form.getByRole('alert').filter({ hasText: 'No active library card found' }).waitFor();
  await admin.keyboard.type('CARD1', { delay: 5 });
  await admin.keyboard.press('Enter');
  await form.getByRole('status').filter({ hasText: 'Check-in approved for Test Reader' }).waitFor();
  await reader.waitForFunction(() => !document.querySelector('input[placeholder="Scan here, then press Enter"]').disabled);
  assert.equal(approvals, 1);
  assert.equal(await reader.getByRole('button', { name: 'Approve check-in' }).count(), 0);
  await form.screenshot({ path: 'work/admin-checkin.png' });
  console.log('PASS: card scan approves check-in in the admin session; reader receives approval automatically');
} finally { await browser.close(); }
