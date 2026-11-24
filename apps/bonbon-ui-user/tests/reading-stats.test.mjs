import assert from 'node:assert/strict';
import { readingDay, readingStatsInput, summarizeReading } from '../src/lib/reading-stats.ts';

const now = new Date('2026-11-22T12:00:00+08:00');
const books = [{ id: 1, title: 'One', genre: 'Fantasy' }, { id: 2, title: 'Two', genre: 'Adventure' }];
const log = (id, bookId, endedAt, minutes = 30, startedAt = '2026-01-01T00:00:00Z') => ({ id, bookId, startedAt, endedAt, minutes });
const sessions = [
  log(1, 1, '2026-11-21T18:00:00Z'), // Nov 22 in Manila
  log(2, 1, '2026-11-21T19:00:00Z', 60),
  log(3, 2, '2026-10-23T16:00:00Z', 45), // Oct 24: first day of 30-day window
  log(4, 2, '2026-10-23T15:59:59Z', 90), // Oct 23: excluded
  log(5, 1, null),
  log(6, 1, 'invalid'),
  log(7, 1, '2026-11-23T00:00:00Z'), // Future
  log(8, 1, '2026-11-22T00:00:00Z', 50, '2026-11-22T01:00:00Z'), // Reversed
];
const stats = summarizeReading(sessions, books, '30', now);
assert.equal(readingDay(new Date('2026-11-21T18:00:00Z')), '2026-11-22');
assert.equal(stats.completed, 3);
assert.equal(stats.titles, 2, 'Repeated sessions must not inflate titles');
assert.equal(stats.totalMinutes, 135);
assert.equal(stats.activeDays, 2);
assert.equal(stats.active, 1);
assert.equal(stats.averageMinutes, 45);
assert.deepEqual(stats.genres, [['Adventure', 1], ['Fantasy', 1]]);
assert.equal(stats.activity.at(-1).minutes, 90);
assert.deepEqual(stats.recent.map(item => item.id), [2, 1, 3]);
assert.equal(summarizeReading(sessions, books, '90', now).completed, 4);
assert.equal(summarizeReading(sessions, books, 'all', now).completed, 4);
assert.equal(summarizeReading([log(1, 99, '2026-11-22T00:00:00Z', -5)], books, 'all', now).totalMinutes, 0);
assert.deepEqual(summarizeReading([], books, 'all', now).genres, []);
assert.equal(summarizeReading([], books, 'all', now).averageMinutes, 0);
console.log('PASS: reading stats date boundaries, title deduplication, periods, invalid sessions, active sessions, and empty history');

const live = readingStatsInput([
  { reading_log_id: -1, session_id: 10, book_id: 1, started_at: '2026-11-22T08:00:00+08:00', returned_at: '2026-11-22T09:00:00+08:00', total_reading_minutes: 60 },
  { reading_log_id: -2, session_id: 10, book_id: 2, started_at: '2026-11-22T08:30:00+08:00', returned_at: '2026-11-22T09:30:00+08:00', total_reading_minutes: 60 },
  { reading_log_id: -3, session_id: 11, book_id: 1, started_at: '2026-11-22T10:00:00+08:00', returned_at: '2026-11-22T10:15:00+08:00', total_reading_minutes: 15 },
  { reading_log_id: -4, session_id: 12, book_id: 1, started_at: '2026-11-22T11:00:00+08:00', returned_at: null, total_reading_minutes: null },
], books.map(book => ({ ...book, id: String(book.id) })));
const liveStats = summarizeReading(live.sessions, live.books, '30', now);
assert.equal(liveStats.totalMinutes, 105, 'Overlapping books from one visit count once, with separate visits preserved');
assert.equal(liveStats.completed, 3, 'Each returned book creates one completed reading record');
assert.equal(liveStats.titles, 2);
assert.equal(liveStats.active, 1, 'An unreturned book contributes no completed time');
assert.equal(liveStats.averageMinutes, 45, 'Per-book average uses the recorded book durations');
assert.equal(liveStats.activity.at(-1).minutes, 105);
assert.equal(live.sessions[0].sessionId, 10);
assert.equal(live.books[0].title, 'One');

const overnight = [
  { id: 1, sessionId: 20, bookId: 1, startedAt: '2026-11-21T23:30:00+08:00', endedAt: '2026-11-22T00:30:00+08:00', minutes: 60 },
  { id: 2, sessionId: 20, bookId: 2, startedAt: '2026-11-22T00:00:00+08:00', endedAt: '2026-11-22T01:00:00+08:00', minutes: 60 },
];
const overnightStats = summarizeReading(overnight, books, '30', now);
assert.equal(overnightStats.totalMinutes, 90);
assert.equal(overnightStats.activity.at(-2).minutes, 30);
assert.equal(overnightStats.activity.at(-1).minutes, 60);
console.log('PASS: live history mapping, multiple books per visit, ongoing books, repeat titles, per-book averages, and Manila midnight activity');
