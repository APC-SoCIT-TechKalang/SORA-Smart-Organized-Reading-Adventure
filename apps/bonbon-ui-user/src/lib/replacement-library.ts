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

interface ReplacementQuest {
  quest_id: number;
  quest_name: string;
  quest_description: string;
  points_reward: number;
  time_limit_days: number | null;
}

interface ReplacementEnrollment {
  quest_id: number;
  quest_status: string;
  points_awarded: number;
}

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
  };
  if (!session) return base;

  const account = await api().rpc('current_user_id');
  if (account.error) throw account.error;
  if (account.data == null) throw new Error('This sign-in has not been linked to a library account yet. Ask staff for help.');
  const userId = String(account.data);
  const [user, quests, enrollments, balance, activity] = await Promise.all([
    api().from('users').select('id,first_name,last_name,birthdate,is_active,membership_rank').eq('id', userId).single(),
    readAll<ReplacementQuest>('quests', 'quest_id,quest_name,quest_description,points_reward,time_limit_days', 'quest_id'),
    readAll<ReplacementEnrollment>('user_quests', 'quest_id,quest_status,points_awarded', 'user_quest_id'),
    api().rpc('points_balance'),
    api().rpc('reader_book_activity'),
  ]);
  if (user.error) throw user.error;
  if (balance.error) throw balance.error;
  if (activity.error) throw activity.error;
  const profile = user.data as ReplacementUser;
  if (!profile.is_active) throw new Error('This reader account has been deactivated. Ask library staff for help.');
  return {
    ...base,
    profile: { user_id: profile.id, first_name: profile.first_name,
      last_name: profile.last_name, birthday: profile.birthdate, bio: null },
    logs: (activity.data as ReplacementReadingActivity[]).map(item => ({
      reading_log_id: -((item.session_id * 1000000) + item.copy_id),
      ...item,
    })),
    rank: profile.membership_rank ?? 'F',
    coins: Number(balance.data ?? 0),
    claimed: enrollments.filter(item => item.points_awarded > 0).map(item => String(item.quest_id)),
    enrolled: enrollments.map(item => String(item.quest_id)),
    commissions: quests.map(quest => ({
      id: String(quest.quest_id), name: quest.quest_name,
      detail: quest.quest_description,
      track: quest.time_limit_days === 7 ? 'weekly' : 'daily',
      seal: 'Quest', coins: quest.points_reward, xp: 0, participants: 0,
      progress: enrollments.some(item => item.quest_id === quest.quest_id && item.quest_status === 'COMPLETED') ? 100 : 0,
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
