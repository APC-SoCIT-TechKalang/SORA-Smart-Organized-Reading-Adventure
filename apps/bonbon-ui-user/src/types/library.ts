export type Rarity = 3 | 4 | 5;

export type QuestTrack = 'daily' | 'weekly' | 'seasonal';

export interface Volume {
  physicalCopies?: import('../lib/shelf-location').LocatedCopy[];
  coverImage?: string;
  isbn?: string | null;
  publisher?: string | null;
  originalTitle?: string | null;
  id: string;
  title: string;
  author: string;
  genre: string;
  volume: number;
  chapters: number;
  rating: number;
  rarity: Rarity;
  copies: number;
  synopsis: string;
  /** Two-line stacked title used on the cover plate. */
  plate: string[];
  plateColor: string;
  plateInk: string;
}

export interface Commission {
  id: string;
  track: QuestTrack;
  name: string;
  detail: string;
  seal: string;
  xp: number;
  coins: number;
  progress: number;
  participants: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  status?: 'IN PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  currentValue?: number;
  targetValue?: number;
  objectiveType?: 'BOOKS_READ' | 'READING_MINUTES';
  deadlineAt?: string | null;
  targetGenre?: string | null;
  source?: 'AI' | 'TEMPLATE' | 'MANUAL';
}

export interface NavItem {
  id: SectionId;
  label: string;
  hint: string;
  shortcut: string;
}

export type SectionId = 'archive' | 'catalog' | 'shelf' | 'commissions' | 'guide';

export interface BorrowedVolume {
  volumeId: string;
  dueInDays: number;
  progress: number;
}

export interface BookClub {
  id: string;
  name: string;
  reading: string;
  members: number;
  meets: string;
}

export interface BonMessage {
  id: string;
  from: 'bon' | 'user';
  text: string;
  recommendations?: Array<{ volumeId: string; reason: string }>;
  widgets?: BonWidget[];
}

export type BonWidget =
  | { type: 'progress'; completed: number; streak: number; reading: number; quests: number }
  | { type: 'rank'; rank: string; points: number; nextRank?: string; pointsToNext?: number }
  | { type: 'reading'; items: Array<{ volumeId: string; title: string; minutes: number; status: string }> }
  | { type: 'quests'; items: Array<{ id: string; name: string; detail: string; points: number; status: string; progress?: number }> }
  | { type: 'rewards'; items: Array<{ id: string; name: string; points: number; status: string; eligible: boolean }> };

export interface Toast {
  id: string;
  title: string;
  detail: string;
  kind: 'reward' | 'info' | 'level';
}
