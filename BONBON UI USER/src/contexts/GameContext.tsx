import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState } from
'react';
import type {
  BorrowedVolume,
  Commission,
  SectionId,
  Toast } from
'../types/library';
import { volumeById } from '../data/manga';

const XP_PER_RANK = 500;

interface GameState {
  rank: number;
  xp: number;
  xpPercent: number;
  coins: number;
  lanterns: number;
  maxLanterns: number;
  streak: number;
  section: SectionId;
  borrowed: BorrowedVolume[];
  claimed: string[];
  joinedEvents: string[];
  joinedClubs: string[];
  toasts: Toast[];
  setSection: (section: SectionId) => void;
  isBorrowed: (volumeId: string) => boolean;
  borrow: (volumeId: string) => void;
  giveBack: (volumeId: string) => void;
  logSession: (volumeId: string) => void;
  claim: (commission: Commission) => void;
  toggleEvent: (id: string, name: string, xp: number) => void;
  toggleClub: (id: string, name: string) => void;
  dismissToast: (id: string) => void;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: {children: React.ReactNode;}) {
  const [rank, setRank] = useState(32);
  const [xp, setXp] = useState(240);
  const [coins, setCoins] = useState(1280);
  const [lanterns, setLanterns] = useState(6);
  const [streak] = useState(7);
  const [section, setSection] = useState<SectionId>('archive');
  const [claimed, setClaimed] = useState<string[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<string[]>(['e1']);
  const [joinedClubs, setJoinedClubs] = useState<string[]>(['c1']);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [borrowed, setBorrowed] = useState<BorrowedVolume[]>([
  { volumeId: 'one-piece', dueInDays: 4, progress: 82 },
  { volumeId: 'frieren', dueInDays: 9, progress: 34 },
  { volumeId: 'dungeon-meshi', dueInDays: 2, progress: 61 }]
  );

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const grant = useCallback(
    (gainedXp: number, gainedCoins: number) => {
      setCoins((current) => current + gainedCoins);
      setXp((current) => {
        const total = current + gainedXp;
        if (total >= XP_PER_RANK) {
          setRank((value) => {
            const next = value + Math.floor(total / XP_PER_RANK);
            pushToast({
              kind: 'level',
              title: `Archivist Rank ${next}`,
              detail: 'New shelf permissions unlocked in the vault.'
            });
            return next;
          });
          return total % XP_PER_RANK;
        }
        return total;
      });
    },
    [pushToast]
  );

  const isBorrowed = useCallback(
    (volumeId: string) => borrowed.some((item) => item.volumeId === volumeId),
    [borrowed]
  );

  const borrow = useCallback(
    (volumeId: string) => {
      const volume = volumeById(volumeId);
      if (!volume) return;
      if (borrowed.some((item) => item.volumeId === volumeId)) {
        pushToast({
          kind: 'info',
          title: 'Already on your shelf',
          detail: `${volume.title} Vol. ${volume.volume} is checked out to you.`
        });
        return;
      }
      if (volume.copies === 0) {
        pushToast({
          kind: 'info',
          title: 'All copies on loan',
          detail: `You are now queued for ${volume.title} Vol. ${volume.volume}.`
        });
        return;
      }
      setBorrowed((current) => [
      ...current,
      { volumeId, dueInDays: 14, progress: 0 }]
      );
      grant(50, 30);
      pushToast({
        kind: 'reward',
        title: `${volume.title} borrowed`,
        detail: 'Due in 14 days · +50 XP · +30 coins'
      });
    },
    [borrowed, grant, pushToast]
  );

  const giveBack = useCallback(
    (volumeId: string) => {
      const volume = volumeById(volumeId);
      setBorrowed((current) =>
      current.filter((item) => item.volumeId !== volumeId)
      );
      grant(80, 45);
      pushToast({
        kind: 'reward',
        title: `${volume?.title ?? 'Volume'} returned`,
        detail: 'Shelf space restored · +80 XP · +45 coins'
      });
    },
    [grant, pushToast]
  );

  const logSession = useCallback(
    (volumeId: string) => {
      if (lanterns === 0) {
        pushToast({
          kind: 'info',
          title: 'Out of lantern oil',
          detail: 'Reading lanterns refill at the daily reset.'
        });
        return;
      }
      const volume = volumeById(volumeId);
      setLanterns((current) => Math.max(0, current - 1));
      setBorrowed((current) =>
      current.map((item) =>
      item.volumeId === volumeId ?
      { ...item, progress: Math.min(100, item.progress + 9) } :
      item
      )
      );
      grant(35, 15);
      pushToast({
        kind: 'reward',
        title: 'Session logged',
        detail: `${volume?.title ?? 'Volume'} +9% · +35 XP · −1 lantern`
      });
    },
    [grant, lanterns, pushToast]
  );

  const claim = useCallback(
    (commission: Commission) => {
      if (claimed.includes(commission.id) || commission.progress < 100) return;
      setClaimed((current) => [...current, commission.id]);
      grant(commission.xp, commission.coins);
      pushToast({
        kind: 'reward',
        title: `${commission.seal} earned`,
        detail: `+${commission.xp} XP · +${commission.coins} coins`
      });
    },
    [claimed, grant, pushToast]
  );

  const toggleEvent = useCallback(
    (id: string, name: string, eventXp: number) => {
      setJoinedEvents((current) => {
        if (current.includes(id)) {
          pushToast({ kind: 'info', title: 'Left the party', detail: name });
          return current.filter((item) => item !== id);
        }
        grant(eventXp / 4, 0);
        pushToast({
          kind: 'reward',
          title: 'Signed up',
          detail: `${name} · reserve bonus +${Math.round(eventXp / 4)} XP`
        });
        return [...current, id];
      });
    },
    [grant, pushToast]
  );

  const toggleClub = useCallback(
    (id: string, name: string) => {
      setJoinedClubs((current) =>
      current.includes(id) ?
      current.filter((item) => item !== id) :
      [...current, id]
      );
      pushToast({ kind: 'info', title: 'Club updated', detail: name });
    },
    [pushToast]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo<GameState>(
    () => ({
      rank,
      xp,
      xpPercent: Math.round(xp / XP_PER_RANK * 100),
      coins,
      lanterns,
      maxLanterns: 8,
      streak,
      section,
      borrowed,
      claimed,
      joinedEvents,
      joinedClubs,
      toasts,
      setSection,
      isBorrowed,
      borrow,
      giveBack,
      logSession,
      claim,
      toggleEvent,
      toggleClub,
      dismissToast
    }),
    [
    rank,
    xp,
    coins,
    lanterns,
    streak,
    section,
    borrowed,
    claimed,
    joinedEvents,
    joinedClubs,
    toasts,
    isBorrowed,
    borrow,
    giveBack,
    logSession,
    claim,
    toggleEvent,
    toggleClub,
    dismissToast]

  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameState {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used inside GameProvider');
  }
  return context;
}