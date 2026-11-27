import assert from 'node:assert/strict';
import test from 'node:test';
import { completedHistory, dateGroups, filterHistory, groupHistoryByBook, readingDuration } from '../src/lib/reading-journal.ts';

const log = (id: number, returnedAt: string | null, minutes: number | null = 2, startedAt = '2026-11-27T00:00:00Z') => ({
  reading_log_id: id, book_id: id % 2 ? 10 : 20, started_at: startedAt, returned_at: returnedAt, total_reading_minutes: minutes,
});

test('keeps repeated sessions and groups by actual local completion date', () => {
  const logs = completedHistory([
    log(1, '2026-11-26T15:00:00Z'),
    log(2, '2026-11-27T02:00:00Z'),
    log(3, '2026-11-27T03:00:00Z'),
    log(4, null),
  ]);
  assert.deepEqual(logs.map(item => item.reading_log_id), [3, 2, 1]);
  assert.equal(dateGroups(logs).flatMap(group => group.logs).length, 3);
});

test('formats short, zero, long, and missing durations honestly', () => {
  assert.equal(readingDuration(log(1, '2026-11-27T00:00:30Z', 0)), 'Under 1 min');
  assert.equal(readingDuration(log(2, '2026-11-27T00:00:00Z', 0)), '0 min recorded');
  assert.equal(readingDuration(log(3, '2026-11-27T02:00:00Z', 80)), '1 hr 20 min');
  assert.equal(readingDuration(log(4, '2026-11-27T02:00:00Z', null)), 'Time unavailable');
});

test('date filter uses the given clock without changing records', () => {
  const logs = completedHistory([log(1, '2026-11-01T12:00:00Z'), log(2, '2026-11-27T12:00:00Z')]);
  assert.deepEqual(filterHistory(logs, 'week', new Date('2026-11-28T12:00:00Z')).map(item => item.reading_log_id), [2]);
  assert.equal(logs.length, 2);
});

test('book view groups repeated sessions by book ID and keeps volumes separate', () => {
  const logs = completedHistory([log(1, '2026-11-27T12:00:00Z'), log(2, '2026-11-27T13:00:00Z'), log(3, '2026-11-27T14:00:00Z')]);
  const groups = groupHistoryByBook(logs);
  assert.deepEqual(groups.map(group => [group.bookId, group.logs.length]), [[10, 2], [20, 1]]);
});
