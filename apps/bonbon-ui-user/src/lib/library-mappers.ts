import type { Commission, Volume } from '../types/library';

export interface BookRow {
  book_id: number;
  title: string;
  author: string | null;
  volume_number: string | null;
  description: string | null;
  cover_image_url: string | null;
  isbn: string | null;
  publisher: string | null;
  original_title: string | null;
  book_genres: { genre: string }[];
  book_copies: { status: string }[];
}

export interface QuestRow {
  quest_id: number;
  name: string;
  description: string;
  quest_type: string;
  points_reward: number;
  badge_name: string | null;
}

export function bookToVolume(book: BookRow, showAvailability: boolean): Volume {
  return {
    id: String(book.book_id),
    title: book.title || 'Untitled book',
    author: book.author ?? 'Unknown author',
    volume: Number(book.volume_number) || 0,
    genre: (Array.isArray(book.book_genres) ? book.book_genres : []).map(genre => genre.genre).filter(Boolean).join(', ') || 'Uncategorized',
    synopsis: book.description ?? 'No description recorded.',
    copies: showAvailability ? book.book_copies.filter(copy => copy.status === 'IN_SHELF').length : -1,
    rating: 0,
    rarity: 3,
    chapters: 0,
    plate: [(book.title || 'Untitled book').toUpperCase()],
    plateColor: '#59351e',
    plateInk: '#fff9ef',
    coverImage: book.cover_image_url ?? undefined,
    isbn: book.isbn,
    publisher: book.publisher,
    originalTitle: book.original_title,
  };
}

export function questToCommission(quest: QuestRow, completed: boolean): Commission {
  return {
    id: String(quest.quest_id),
    name: quest.name,
    detail: quest.description,
    track: quest.quest_type === 'WEEKLY' ? 'weekly' : quest.quest_type === 'EVENT' ? 'seasonal' : 'daily',
    seal: quest.badge_name ?? 'Quest',
    coins: quest.points_reward,
    xp: 0,
    participants: 0,
    progress: completed ? 100 : 0,
  };
}
