import type { Session } from '@supabase/supabase-js';
import type { Commission, Volume } from '../types/library';
import { database } from './supabase';

export const usesReplacementSchema = import.meta.env.VITE_SORA_SCHEMA === 'sora_v2';

interface ReplacementBook {
  book_id: number;
  title: string;
  original_title: string | null;
  isbn: string | null;
  volume_number: number | null;
  publisher: string | null;
  book_description: string | null;
  coverimage_url: string | null;
  book_genre: string | null;
  authors: { author_firstname: string; author_lastname: string } | null;
  book_copies?: { copy_id: number; copy_status: string; shelf_location: string | null }[];
}

interface ReplacementUser {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string;
  is_active: boolean;
  membership_rank: string | null;
}

interface ReplacementReadingActivity {
  session_id: number; copy_id: number; book_id: number;
  started_at: string; returned_at: string | null; total_reading_minutes: number | null;
}

interface QuestDashboardItem {
  quest_id: number; name: string; description: string; difficulty: 'Easy' | 'Medium' | 'Hard';
  objective_type: 'BOOKS_READ' | 'READING_MINUTES'; current_value: number; target_value: number;
  points: number; status: 'IN PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  deadline_at: string | null; target_genre: string | null; source: 'AI' | 'TEMPLATE' | 'MANUAL';
}
interface QuestDashboard { rank: string; membership_tier: string | null; points: number; last_updated: string; next_rank: { name: string; points_required: number } | null; quests: QuestDashboardItem[]; }

export interface ReplacementLibraryData {
  volumes: Volume[];
  profile: { user_id: string; first_name: string; last_name: string; birthday: string | null; bio: null } | null;
  logs: { reading_log_id: number; session_id?: number; copy_id?: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null }[];
  rank: string;
  coins: number;
  streak: 0;
  claimed: string[];
  enrolled: string[];
  commissions: Commission[];
  questUpdatedAt: string | null;
  nextRank: { name: string; pointsRequired: number } | null;
}

const api = () => database().schema('sora_v2');

async function readAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await api().from(table).select(columns).order(order).range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data as unknown as T[]));
    if (data.length < 500) return result;
  }
}

function toVolume(book: ReplacementBook, signedIn: boolean): Volume {
  return {
    physicalCopies: signedIn ? (book.book_copies ?? []).map(copy => ({ copyId: copy.copy_id, status: copy.copy_status, shelfLocation: copy.shelf_location })) : undefined,
    id: String(book.book_id),
    title: book.title,
    author: book.authors ? `${book.authors.author_firstname} ${book.authors.author_lastname}`.trim() : 'Unknown author',
    genre: book.book_genre || 'General',
    volume: book.volume_number ?? 0,
    chapters: 0,
    rating: 0,
    rarity: 3,
    copies: signedIn ? (book.book_copies ?? []).filter(copy => copy.copy_status === 'In-Shelf').length : -1,
    synopsis: book.book_description ?? 'No description recorded.',
    plate: [book.title.toUpperCase()],
    plateColor: '#59351e',
    plateInk: '#fff9ef',
    coverImage: book.coverimage_url ?? undefined,
    isbn: book.isbn,
    publisher: book.publisher,
    originalTitle: book.original_title,
  };
}

export async function loadReplacementLibrary(session: Session | null): Promise<ReplacementLibraryData> {
  const books = await readAll<ReplacementBook>(
    'books',
    'book_id,title,original_title,isbn,volume_number,publisher,book_description,coverimage_url,book_genre,authors(author_firstname,author_lastname)'
      + (session ? ',book_copies(copy_id,copy_status,shelf_location)' : ''),
    'book_id',
  );
  const base: ReplacementLibraryData = {
    volumes: books.map(book => toVolume(book, !!session)),
    profile: null, logs: [], rank: 'F', coins: 0, streak: 0,
    claimed: [], enrolled: [], commissions: [],
    questUpdatedAt: null, nextRank: null,
  };
  if (!session) return base;

  const account = await api().rpc('current_user_id');
  if (account.error) throw account.error;
  if (account.data == null) throw new Error('This sign-in has not been linked to a library account yet. Ask staff for help.');
  const userId = String(account.data);
  try {
    await fetch('/api/quest-cycle', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
  } catch { /* The database dashboard still assigns the safe template fallback. */ }
  const [user, dashboard, activity] = await Promise.all([
    api().from('users').select('id,first_name,last_name,birthdate,is_active,membership_rank').eq('id', userId).single(),
    api().rpc('reader_quest_dashboard'),
    api().rpc('reader_book_activity'),
  ]);
  if (user.error) throw user.error;
  if (dashboard.error) throw dashboard.error;
  if (activity.error) throw activity.error;
  const profile = user.data as ReplacementUser;
  const questDashboard = dashboard.data as QuestDashboard;
  if (!profile.is_active) throw new Error('This reader account has been deactivated. Ask library staff for help.');
  return {
    ...base,
    profile: { user_id: profile.id, first_name: profile.first_name,
      last_name: profile.last_name, birthday: profile.birthdate, bio: null },
    logs: (activity.data as ReplacementReadingActivity[]).map(item => ({
      reading_log_id: -((item.session_id * 1000000) + item.copy_id),
      ...item,
    })),
    rank: questDashboard.rank ?? 'Novice Reader',
    coins: Number(questDashboard.points ?? 0),
    questUpdatedAt: questDashboard.last_updated,
    nextRank: questDashboard.next_rank ? { name: questDashboard.next_rank.name, pointsRequired: questDashboard.next_rank.points_required } : null,
    claimed: questDashboard.quests.filter(item => item.status === 'COMPLETED').map(item => String(item.quest_id)),
    enrolled: questDashboard.quests.map(item => String(item.quest_id)),
    commissions: questDashboard.quests.map(quest => ({
      id: String(quest.quest_id), name: quest.name, detail: quest.description,
      track: 'weekly', seal: quest.difficulty, coins: quest.points, xp: 0, participants: 0,
      progress: Math.min(100, Math.round((quest.current_value / Math.max(1, quest.target_value)) * 100)),
      difficulty: quest.difficulty, status: quest.status, currentValue: quest.current_value,
      targetValue: quest.target_value, objectiveType: quest.objective_type,
      deadlineAt: quest.deadline_at, targetGenre: quest.target_genre, source: quest.source,
    })),
  };
}

export function replacementApi() { return api(); }

export async function requireReaderAccount() {
  if (!usesReplacementSchema) return;
  const { data, error } = await api().rpc('is_librarian');
  if (error) throw error;
  if (data === true) {
    await database().auth.signOut({ scope: 'local' });
    throw new Error('Librarian accounts must sign in through the admin dashboard. Use a reader account here.');
  }
}
