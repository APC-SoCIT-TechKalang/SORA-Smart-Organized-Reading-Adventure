import test from 'node:test';
import assert from 'node:assert/strict';
import { findReturnCopyByBarcode, isRecentlyReturned, returnedAgo, selectReturnCopies, selectShelvableReturnCopies } from '../components/admin/return-cart.ts';
import type { Copy } from '../components/admin/dashboard-data.ts';

const now = Date.parse('2026-11-27T04:00:00Z');
const copy = (copy_id: number, ageHours: number | null, shelf_location: string | null, status = 'RETURN_CART'): Copy => ({
  copy_id, book_id: copy_id, copy_number: 1, identifier_value: `978000000000${copy_id}`,
  status, shelf_location, shelf_id: null, condition_notes: null,
  returned_to_cart_at: ageHours === null ? null : new Date(now - ageHours * 3_600_000).toISOString(),
});

test('return tabs count only pending copies and use a rolling 24-hour window', () => {
  const copies = [copy(1, 0.25, 'Shelf A1'), copy(2, 23.99, 'Shelf A1'), copy(3, 24, 'Shelf A2'), copy(4, null, null), copy(5, 1, 'Shelf A2', 'IN_SHELF')];
  assert.deepEqual(selectReturnCopies(copies, 'all', '', now).map(item => item.copy_id), [1, 2, 3, 4]);
  assert.deepEqual(selectReturnCopies(copies, 'recent', '', now).map(item => item.copy_id), [1, 2]);
  assert.equal(isRecentlyReturned(copy(3, 24, 'Shelf A2'), now), false);
  assert.equal(isRecentlyReturned(copy(4, null, null), now), false);
});

test('shelf filtering and newest-first ordering preserve distinct copies', () => {
  const copies = [copy(1, 5, 'Shelf A1'), copy(2, 1, 'Shelf A1'), copy(3, 2, 'Shelf A2'), copy(4, null, null)];
  assert.deepEqual(selectReturnCopies(copies, 'recent', 'Shelf A1', now).map(item => item.copy_id), [2, 1]);
  assert.deepEqual(selectReturnCopies(copies, 'all', 'Unassigned', now).map(item => item.copy_id), [4]);
  assert.deepEqual(selectReturnCopies(copies, 'recent', 'Unassigned', now), []);
});

test('barcode finding ignores the active filter and excludes shelved copies', () => {
  const copies = [copy(1, 2, 'Shelf A1'), copy(2, 30, 'Shelf A2'), copy(3, 1, 'Shelf A3', 'IN_SHELF')];
  assert.equal(findReturnCopyByBarcode(copies, ' 9780000000002\n')?.copy_id, 2);
  assert.equal(findReturnCopyByBarcode(copies, '9780000000003'), undefined);
  assert.equal(findReturnCopyByBarcode(copies, ''), undefined);
});

test('relative times never invent a missing or future return timestamp', () => {
  assert.equal(returnedAgo(new Date(now - 5 * 60_000).toISOString(), now), 'Returned 5 minutes ago');
  assert.equal(returnedAgo(new Date(now - 25 * 3_600_000).toISOString(), now), 'Returned yesterday');
  assert.equal(returnedAgo(new Date(now - 3 * 24 * 3_600_000).toISOString(), now), 'Returned 3 days ago');
  assert.equal(returnedAgo(null, now), 'Return time unavailable');
  assert.equal(returnedAgo(new Date(now + 60_000).toISOString(), now), 'Return time unavailable');
});

test('return all includes the full cart, skips copies without a shelf, and groups by shelf', () => {
  const copies = [copy(1, 30, 'Shelf A10'), copy(2, 1, null), copy(3, 2, 'Shelf A2'), copy(4, 1, 'Shelf A2', 'IN_SHELF')];
  assert.deepEqual(selectShelvableReturnCopies(copies).map(item => item.copy_id), [3, 1]);
});
