/** Each record is a book reading period, not proof that a book was finished. */
export interface StatsSession {
  id: number;
  bookId: number;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  sessionId?: number;
}

export interface StatsBook { id: number; title: string; genre: string; }
export type StatsPeriod = '30' | '90' | 'all';
export const statsTimeZone = 'Asia/Manila';
const dayMs = 86_400_000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: statsTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function readingDay(date: Date) { return dayFormat.format(date); }
function dayNumber(day: string) { return Date.parse(`${day}T00:00:00Z`) / dayMs; }

export function readingStatsInput(logs: { reading_log_id: number; session_id?: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null }[], volumes: { id: string; title: string; genre: string }[]) {
  return {
    sessions: logs.map(log => ({ id: log.reading_log_id, sessionId: log.session_id, bookId: log.book_id,
      startedAt: log.started_at, endedAt: log.returned_at, minutes: log.total_reading_minutes })),
    books: volumes.map(book => ({ id: Number(book.id), title: book.title, genre: book.genre })),
  };
}

// Merge recorded book-time intervals within each visit. Two books held together
// must not double the reader's elapsed time. Legacy records have separate IDs.
function readingIntervals(records: (StatsSession & { endedAt: string })[]) {
  const visits = new Map<string, [number, number][]>();
  for (const record of records) {
    if (!Number.isFinite(record.minutes) || (record.minutes ?? 0) <= 0) continue;
    const end = Date.parse(record.endedAt);
    const start = Math.max(Date.parse(record.startedAt), end - (record.minutes ?? 0) * 60_000);
    const key = record.sessionId === undefined ? `record:${record.id}` : `visit:${record.sessionId}`;
    const intervals = visits.get(key) ?? [];
    intervals.push([start, end]);
    visits.set(key, intervals);
  }
  return [...visits.values()].flatMap(intervals => {
    const merged: [number, number][] = [];
    intervals.sort((a, b) => a[0] - b[0]);
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    return merged;
  });
}

export function summarizeReading(sessions: StatsSession[], books: StatsBook[], period: StatsPeriod, now = new Date()) {
  const today = readingDay(now);
  const todayNumber = dayNumber(today);
  const start = period === 'all' ? -Infinity : todayNumber - Number(period) + 1;
  const completed = sessions.filter((session): session is StatsSession & { endedAt: string } => {
    if (!session.endedAt) return false;
    const end = new Date(session.endedAt);
    const began = Date.parse(session.startedAt);
    if (!Number.isFinite(end.getTime()) || !Number.isFinite(began) || end.getTime() < began || end > now) return false;
    return dayNumber(readingDay(end)) >= start;
  });
  const catalog = new Map(books.map(book => [book.id, book]));
  const uniqueBooks = new Set(completed.map(session => session.bookId).filter(id => id > 0));
  const minutes = (session: StatsSession) => Number.isFinite(session.minutes) ? Math.max(0, session.minutes ?? 0) : 0;
  const intervals = readingIntervals(completed);
  const totalMinutes = Math.floor(intervals.reduce((sum, [start, end]) => sum + end - start, 0) / 60_000);
  const activeDays = new Set(completed.map(session => readingDay(new Date(session.endedAt))));
  const genres = new Map<string, number>();
  uniqueBooks.forEach(id => {
    const genre = catalog.get(id)?.genre || 'Uncategorized';
    genres.set(genre, (genres.get(genre) ?? 0) + 1);
  });
  const activity = Array.from({ length: 14 }, (_, index) => {
    const day = new Date((todayNumber - 13 + index) * dayMs).toISOString().slice(0, 10);
    const start = Date.parse(`${day}T00:00:00+08:00`);
    const total = intervals.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, start + dayMs) - Math.max(from, start)), 0);
    return { day, minutes: Math.floor(total / 60_000) };
  });
  return {
    completed: completed.length, titles: uniqueBooks.size, totalMinutes, activeDays: activeDays.size,
    averageMinutes: completed.length ? Math.round(completed.reduce((sum, session) => sum + minutes(session), 0) / completed.length) : 0,
    active: sessions.filter(session => !session.endedAt && Number.isFinite(Date.parse(session.startedAt)) && Date.parse(session.startedAt) <= now.getTime()).length,
    genres: [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), activity,
    recent: completed.slice().sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 5),
  };
}
