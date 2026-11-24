import { useGame } from '../contexts/GameContext';
import { readingStatsInput, summarizeReading, type StatsPeriod } from './reading-stats';

export function useReadingStats(period: StatsPeriod) {
  const { logs, volumes, readerAccess } = useGame();
  const { sessions, books } = readingStatsInput(readerAccess === 'active' ? logs : [], volumes);
  const now = new Date();
  return { stats: summarizeReading(sessions, books, period, now), books, now };
}
