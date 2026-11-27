import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteTimeTopUp } from '../components/admin/top-up-pricing.ts';

test('three hours keeps the requested minutes and charges the selected hourly rate', () => {
  assert.deepEqual(quoteTimeTopUp('3', '', 50), { minutes: 180, amount: 150 });
  assert.deepEqual(quoteTimeTopUp('3', '', 30), { minutes: 180, amount: 90 });
});

test('partial hours are billed to the nearest centavo', () => {
  assert.deepEqual(quoteTimeTopUp('1', '30', 50), { minutes: 90, amount: 75 });
  assert.deepEqual(quoteTimeTopUp('', '1', 50), { minutes: 1, amount: 0.83 });
});

test('invalid durations and charges cannot be submitted', () => {
  for (const [hours, minutes] of [['', ''], ['0', '0'], ['1', '60'], ['-1', '0'], ['1.5', '0'], ['2001', '0']]) {
    assert.equal(quoteTimeTopUp(hours, minutes, 50), null);
  }
});
