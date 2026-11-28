import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingTimeLabel, sessionCharges } from '../src/lib/session-history.ts';

test('historical time distinguishes missing snapshots, zero, unlimited, and ongoing sessions', () => {
  const ended = { return_date: '2026-11-29T00:00:00Z' };
  assert.equal(remainingTimeLabel(ended), 'Not recorded');
  assert.equal(remainingTimeLabel({ ...ended, remaining_minutes_after: 0 }), '0 min');
  assert.equal(remainingTimeLabel({ ...ended, remaining_minutes_after: 125 }), '2h 5m');
  assert.equal(remainingTimeLabel({ ...ended, unlimited_time_after: true }), 'Unlimited');
  assert.equal(remainingTimeLabel({ return_date: null, remaining_minutes_after: 100 }), 'Available after session ends');
});

test('only positive unpaid charges are unsettled, including other-only charges', () => {
  const session = { return_date: null, food_charge: '0.00', other_charge: '75.50', food_other_charges_payment: 'UNPAID' };
  assert.equal(sessionCharges(session).unsettled, true);
  assert.equal(sessionCharges(session).total, 75.5);
  assert.equal(sessionCharges({ ...session, food_other_charges_payment: 'PAID' }).unsettled, false);
  assert.equal(sessionCharges({ ...session, other_charge: 0 }).label, 'No charges');
  assert.equal(sessionCharges({ return_date: null }).label, 'Not recorded');
  assert.equal(sessionCharges({ ...session, food_other_charges_payment: null }).label, 'Payment status unavailable');
});
