import type { ReactNode } from 'react';
import { useGame } from '../contexts/GameContext';

export function ReadingStatsData({ children }: { children: ReactNode }) {
  const { readerAccess, loading, error, refresh } = useGame();
  if (readerAccess !== 'active') return <p role="status" className="p-5 text-sm text-umber/70">Reading stats require an activated reader membership.</p>;
  if (loading) return <p role="status" className="p-5 text-sm text-umber/70">Loading your reading history…</p>;
  if (error) return <div role="alert" className="rounded-xl border border-rust/30 bg-cream p-5 text-sm text-umber/75">
    <p>Your reading history could not be refreshed. Please try again.</p>
    <button type="button" onClick={() => void refresh()} className="tb-button-secondary tb-cut-sm mt-3 min-h-11 px-4 py-2">Retry reading history</button>
  </div>;
  return <>{children}</>;
}
