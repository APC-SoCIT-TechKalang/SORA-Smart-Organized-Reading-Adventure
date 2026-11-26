// Start admin with the dummy NEXT_PUBLIC_SUPABASE_URL below and any dummy
// publishable key. All account and card requests are mocked; no live writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../work/card-mobile-check/node_modules/playwright/index.mjs');
const origin = process.env.TEST_SUPABASE_URL || 'https://rfid-test.supabase.co';
const url = process.env.TEST_ADMIN_URL || 'http://127.0.0.1:3001';
const readerId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const blankCardReaderId = '00000000-0000-4000-8000-000000000004';
const previousCardReaderId = '00000000-0000-4000-8000-000000000005';
const users = [
  { id: readerId, first_name: 'Jared Christian', last_name: 'Gatchalian', is_active: true },
  { id: otherId, first_name: 'Saimon', last_name: 'Lumod', is_active: true },
  { id: '00000000-0000-4000-8000-000000000003', first_name: 'Inactive', last_name: 'Reader', is_active: false },
  { id: blankCardReaderId, first_name: 'Unassigned', last_name: 'Reader', is_active: true },
  { id: previousCardReaderId, first_name: 'Previous', last_name: 'Reader', is_active: true },
].map(user => ({ ...user, user_role: 'Reader', birthdate: '2000-01-01', membership_type: 'Wanderer', membership_status: 'INACTIVE', membership_rank: 'F', remaining_minutes: 600, membership_expires_at: '2099-01-01T00:00:00Z' }));
let cards = [
  { librarycard_id: 'card-two', user_id: otherId, librarycard_rfid: '0099887766', is_active: true, deactivated_at: null },
  { librarycard_id: 'blank-card', user_id: blankCardReaderId, librarycard_rfid: null, is_active: true, deactivated_at: null },
  { librarycard_id: 'previous-card', user_id: previousCardReaderId, librarycard_rfid: '00770077', is_active: true, deactivated_at: '2026-01-01T00:00:00Z' },
  { librarycard_id: 'inactive-card', user_id: previousCardReaderId, librarycard_rfid: '00660066', is_active: false, deactivated_at: null },
];
const assignments = [];
const activations = [];
let rejectAssignment = false;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const user = { id: '00000000-0000-4000-8000-000000000099', email: 'staff@example.test', app_metadata: {}, user_metadata: {} };
const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.mock`;
await context.addInitScript(({ origin, user, token }) => {
  localStorage.setItem(`sb-${new URL(origin).hostname.split('.')[0]}-auth-token`, JSON.stringify({ access_token: token, refresh_token: 'mock', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }));
  window.__printCalls = 0;
  const originalOpen = window.open.bind(window);
  window.open = (...args) => {
    if (window.__blockPrint) return null;
    const popup = originalOpen(...args);
    if (popup) popup.print = () => { window.__printCalls++; };
    return popup;
  };
}, { origin, user, token });
await context.route(`${origin}/**`, async route => {
  const request = route.request();
  const target = new URL(request.url());
  const table = target.pathname.split('/').at(-1);
  let data = [];
  if (target.pathname.includes('/auth/')) data = user;
  else if (table === 'is_librarian') data = true;
  else if (table === 'users') data = users;
  else if (table === 'librarycard') data = cards;
  else if (table === 'admin_activate_membership') {
    const args = request.postDataJSON();
    activations.push(args);
    const reader = users.find(item => item.id === args.p_user_id);
    Object.assign(reader, { membership_status: 'ACTIVE', membership_type: args.p_membership_type, membership_expires_at: args.p_expires_at });
    data = args.p_user_id;
  }
  else if (table === 'admin_assign_library_card') {
    const args = request.postDataJSON();
    assignments.push(args);
    if (rejectAssignment) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'RFID card is already assigned to another reader' }) });
      return;
    }
    cards = cards.map(card => card.user_id === args.p_user_id ? { ...card, is_active: false, deactivated_at: new Date().toISOString() } : card);
    cards.push({ librarycard_id: `card-${assignments.length}`, user_id: args.p_user_id, librarycard_rfid: args.p_rfid, is_active: true, deactivated_at: null });
    data = `card-${assignments.length}`;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'content-range': '0-0/0' } });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const dialog = page.getByRole('dialog');
const scan = async payload => { await page.keyboard.type(payload, { delay: 2 }); await page.keyboard.press('Enter'); };
try {
  await mkdir('outputs', { recursive: true });
  await page.goto(url);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('button', { name: 'Readers', exact: true }).click();
  await page.getByRole('button', { name: 'Close navigation menu' }).click();
  const activationForm = page.getByRole('form', { name: 'Activate reader account' });
  assert.equal(await activationForm.getByLabel('Physical RFID UID').count(), 0);
  const originalCards = structuredClone(cards);
  // Activation succeeds both with an existing card and before a physical card is linked.
  for (const id of [otherId, readerId]) {
    await activationForm.getByLabel('Reader awaiting activation').selectOption(id);
    await activationForm.getByLabel('Membership plan').selectOption({ label: 'Wanderer' });
    await activationForm.getByLabel('Membership expiry').fill('2099-12-31T18:00');
    const expectedExpiry = await page.evaluate(() => new Date('2099-12-31T18:00').toISOString());
    await activationForm.getByRole('button', { name: 'Activate reader', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Reader membership activated' }).waitFor();
    await page.waitForFunction(() => document.querySelector('form[aria-label="Activate reader account"] select').value === '');
    assert.deepEqual(activations.at(-1), { p_user_id: id, p_membership_type: 'Wanderer', p_membership_rank: 'F', p_remaining_minutes: 0, p_expires_at: expectedExpiry });
    assert.deepEqual(cards, originalCards);
    assert.equal(assignments.length, 0);
  }
  assert.equal(activations.length, 2);
  await activationForm.screenshot({ path: 'outputs/reader-activation-without-rfid.png' });
  await page.getByRole('button', { name: 'Link RFID UID', exact: true }).click();
  assert.equal(await dialog.getByRole('option', { name: /Inactive/ }).count(), 0);
  assert.equal(await dialog.locator(`option[value="${otherId}"]`).count(), 0);
  assert.equal(await dialog.locator(`option[value="${blankCardReaderId}"]`).count(), 1);
  assert.equal(await dialog.locator(`option[value="${previousCardReaderId}"]`).count(), 1);
  await scan('0000111122'); // Scanning before a reader is selected does nothing.
  assert.equal(assignments.length, 0);
  await dialog.getByLabel('Reader name').selectOption(readerId);
  await dialog.getByText(/Waiting for Jared/).waitFor();
  await page.screenshot({ path: 'outputs/reader-card-link-desktop.png', fullPage: true });
  await scan('tankobonbon:kiosk-user:' + readerId);
  await dialog.getByRole('alert').filter({ hasText: /Digital ID/ }).waitFor();
  await scan('0099887766');
  await dialog.getByRole('alert').filter({ hasText: /already assigned/ }).waitFor();
  assert.equal(assignments.length, 0);
  await dialog.getByRole('button', { name: 'Cancel waiting' }).click();
  await scan('0000111122');
  assert.equal(assignments.length, 0);
  await dialog.getByLabel('Reader name').selectOption(readerId);
  await scan('00:11:22:33:44');
  await dialog.getByText('Card linked to Jared Christian Gatchalian', { exact: true }).waitFor();
  assert.deepEqual(assignments, [{ p_user_id: readerId, p_rfid: '0011223344' }]);
  assert.equal(await dialog.locator(`option[value="${readerId}"]`).count(), 0);
  assert.equal(await dialog.getByLabel('Reader name').inputValue(), '');
  await scan('55667788'); // Success stops listening until another reader is chosen.
  assert.equal(assignments.length, 1);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('heading', { name: 'Print and link RFID cards' }).evaluate(node => { node.tabIndex = -1; node.focus(); });
  await scan('55667788'); // Closing removes the subscription too.
  assert.equal(assignments.length, 1);

  await page.getByRole('button', { name: 'Print RFID card', exact: true }).click();
  // Linked readers remain available for printing.
  assert.equal(await dialog.locator(`option[value="${otherId}"]`).count(), 1);
  assert.equal(await dialog.locator(`option[value="${readerId}"]`).count(), 1);
  await page.evaluate(() => { window.__blockPrint = true; });
  await dialog.getByLabel('Reader name').selectOption(readerId);
  await dialog.getByRole('alert').filter({ hasText: /Allow pop-ups/ }).waitFor();
  await page.evaluate(() => { window.__blockPrint = false; });
  const popupEvent = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Print again' }).click();
  const popup = await popupEvent;
  await popup.getByRole('heading', { name: 'Jared Christian Gatchalian' }).waitFor();
  assert.equal(await page.evaluate(() => window.__printCalls), 1);
  const printText = await popup.locator('body').innerText();
  assert.ok(printText.includes('RFID UID: 0011223344'));
  assert.equal(printText.includes('Reader ID:'), false);
  assert.equal(printText.includes('Wanderer'), false);
  assert.equal(await popup.locator('.card').count(), 2);
  assert.equal(await popup.getByAltText('Kiosk login QR code').count(), 1);
  assert.equal(await popup.getByRole('button', { name: 'Activate reader' }).count(), 0);
  await popup.emulateMedia({ media: 'print' });
  const bounds = await popup.locator('.card').boundingBox();
  assert.ok(Math.abs(bounds.width - 85.6 * 96 / 25.4) < 1);
  assert.ok(Math.abs(bounds.height - 53.98 * 96 / 25.4) < 1);
  await popup.screenshot({ path: 'outputs/reader-rfid-card-print.png' });
  // A separate proof document avoids the production afterprint window cleanup.
  const proof = await context.newPage();
  await proof.setContent(await popup.content());
  await proof.pdf({ path: 'outputs/reader-rfid-card-print.pdf', preferCSSPageSize: true });
  await proof.close();
  await popup.close();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // A server rejection remains visible and permits another tap.
  await page.getByRole('button', { name: 'Link RFID UID', exact: true }).click();
  assert.equal(await dialog.locator(`option[value="${readerId}"]`).count(), 0);
  await dialog.getByLabel('Reader name').selectOption(blankCardReaderId);
  rejectAssignment = true;
  await scan('00000077');
  await dialog.getByRole('alert').filter({ hasText: /already assigned/ }).waitFor();
  assert.equal(assignments.length, 2);
  await page.waitForFunction(() => !document.querySelector('dialog[open] select').disabled);
  rejectAssignment = false;
  await scan('00000088');
  await dialog.getByText('Card linked to Unassigned Reader', { exact: true }).waitFor();
  assert.equal(assignments.at(-1).p_rfid, '00000088');
  assert.equal(await dialog.locator(`option[value="${blankCardReaderId}"]`).count(), 0);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await page.getByRole('button', { name: 'Link RFID UID', exact: true }).click();
    await dialog.getByLabel('Reader name').selectOption(previousCardReaderId);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    const size = await dialog.boundingBox();
    assert.ok(size.x >= 0 && size.x + size.width <= width + 1);
    assert.equal(await dialog.evaluate(node => node.scrollWidth > node.clientWidth), false);
    await page.screenshot({ path: `outputs/reader-card-link-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  }
  await page.getByRole('button', { name: 'Link RFID UID', exact: true }).click();
  await dialog.getByLabel('Reader name').selectOption(previousCardReaderId);
  await scan('00000100');
  await dialog.getByText('Card linked to Previous Reader', { exact: true }).waitFor();
  await dialog.getByText('All active readers already have a linked RFID card.', { exact: true }).waitFor();
  assert.ok(await dialog.getByLabel('Reader name').isDisabled());
  assert.equal(await dialog.getByRole('option').count(), 1);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Link RFID UID', exact: true }).click();
  await dialog.getByText('All active readers already have a linked RFID card.', { exact: true }).waitFor();
  await dialog.screenshot({ path: 'outputs/reader-card-no-unlinked-readers.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: linked readers excluded from linking and retained for printing; saved readers removed immediately; blank/inactive cards eligible; empty state; activation, scanner, retry and mobile regressions.');
} catch (cause) {
  await page.screenshot({ path: 'outputs/reader-card-test-failure.png', fullPage: true });
  console.error(await page.locator('body').innerText());
  console.error(errors);
  throw cause;
} finally {
  await browser.close();
}
