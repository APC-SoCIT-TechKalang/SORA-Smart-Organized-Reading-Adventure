/** Draft metrics use completed sessions, not book completion or page progress. */
export interface StatsSession {
  id: number;
  bookId: number;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export interface StatsBook { id: number; title: string; genre: string; }
export type StatsPeriod = '30' | '90' | 'all';
export const statsTimeZone = 'Asia/Manila';
const dayMs = 86_400_000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: statsTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function readingDay(date: Date) { return dayFormat.format(date); }
function dayNumber(day: string) { return Date.parse(`${day}T00:00:00Z`) / dayMs; }

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
  const uniqueBooks = new Set(completed.map(session => session.bookId));
  const minutes = (session: StatsSession) => Number.isFinite(session.minutes) ? Math.max(0, session.minutes ?? 0) : 0;
  const totalMinutes = completed.reduce((sum, session) => sum + minutes(session), 0);
  const activeDays = new Set(completed.map(session => readingDay(new Date(session.endedAt))));
  const genres = new Map<string, number>();
  uniqueBooks.forEach(id => {
    const genre = catalog.get(id)?.genre || 'Uncategorized';
    genres.set(genre, (genres.get(genre) ?? 0) + 1);
  });
  const activity = Array.from({ length: 14 }, (_, index) => {
    const day = new Date((todayNumber - 13 + index) * dayMs).toISOString().slice(0, 10);
    return { day, minutes: completed.filter(session => readingDay(new Date(session.endedAt)) === day).reduce((sum, session) => sum + minutes(session), 0) };
  });
  return {
    completed: completed.length, titles: uniqueBooks.size, totalMinutes, activeDays: activeDays.size,
    averageMinutes: completed.length ? Math.round(totalMinutes / completed.length) : 0,
    active: sessions.filter(session => !session.endedAt && Number.isFinite(Date.parse(session.startedAt)) && Date.parse(session.startedAt) <= now.getTime()).length,
    genres: [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), activity,
    recent: completed.slice().sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 5),
  };
}
