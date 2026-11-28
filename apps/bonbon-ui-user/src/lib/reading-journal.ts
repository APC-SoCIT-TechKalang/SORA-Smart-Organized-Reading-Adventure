import type { ReadingLog } from '../contexts/GameContext';

export type JournalRange = 'all' | 'week' | 'month' | 'this-month';

export function completedHistory(logs: ReadingLog[]): ReadingLog[] {
  return logs.filter(log => Boolean(log.returned_at))
    .slice().sort((a, b) => (Date.parse(b.returned_at ?? '') || 0) - (Date.parse(a.returned_at ?? '') || 0) || b.reading_log_id - a.reading_log_id);
}

export function localDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateGroups(logs: ReadingLog[]): { date: string; logs: ReadingLog[] }[] {
  const groups: { date: string; logs: ReadingLog[] }[] = [];
  for (const log of logs) {
    const date = localDateKey(log.returned_at ?? '');
    const last = groups.at(-1);
    if (last?.date === date) last.logs.push(log);
    else groups.push({ date, logs: [log] });
  }
  return groups;
}

export function groupHistoryByBook(logs: ReadingLog[]): { bookId: number; logs: ReadingLog[] }[] {
  const groups = new Map<number, ReadingLog[]>();
  for (const log of logs) {
    const entries = groups.get(log.book_id);
    if (entries) entries.push(log);
    else groups.set(log.book_id, [log]);
  }
  return [...groups.entries()].map(([bookId, entries]) => ({ bookId, logs: entries }));
}

export function filterHistory(logs: ReadingLog[], range: JournalRange, now = new Date()): ReadingLog[] {
  if (range === 'all') return logs;
  const start = new Date(now);
  if (range === 'this-month') start.setFullYear(now.getFullYear(), now.getMonth(), 1);
  else start.setDate(now.getDate() - (range === 'week' ? 7 : 30));
  start.setHours(0, 0, 0, 0);
  return logs.filter(log => Date.parse(log.returned_at ?? '') >= start.getTime());
}

export function readingDuration(log: ReadingLog): string {
  const minutes = log.total_reading_minutes;
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return 'Time unavailable';
  if (minutes === 0) {
    const elapsed = Date.parse(log.returned_at ?? '') - Date.parse(log.started_at);
    return elapsed > 0 && elapsed < 60_000 ? 'Under 1 min' : '0 min recorded';
  }
  const whole = Math.floor(minutes);
  if (whole < 1) return 'Under 1 min';
  if (whole < 60) return `${whole} min`;
  return `${Math.floor(whole / 60)} hr${whole >= 120 ? 's' : ''}${whole % 60 ? ` ${whole % 60} min` : ''}`;
}
