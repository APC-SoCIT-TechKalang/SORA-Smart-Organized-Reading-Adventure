import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Commission, SectionId, Toast, Volume } from '../types/library';
import { database, errorMessage, readRows, setupMessage, supabase } from '../lib/supabase';
import { volumes as demoVolumes } from '../data/manga';

export interface Profile { user_id: string; first_name: string; last_name: string; birthday: string | null; bio: string | null; }
export interface ReadingLog { reading_log_id: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null; }
interface BookRow { book_id: number; title: string; author: string | null; volume_number: string | null; description: string | null; cover_image_url: string | null; isbn: string | null; publisher: string | null; original_title: string | null; book_genres: { genre: string }[]; book_copies: { status: string }[]; }
interface Quest { quest_id: number; name: string; description: string; quest_type: string; points_reward: number; badge_name: string | null; }
interface QuestProgress { quest_id: number; status: string; }
interface Progress { total_points: number; current_streak_days: number; membership_ranks: { name: string } | null; }
interface LibraryState {
  volumes: Volume[]; commissions: Commission[]; profile: Profile | null; logs: ReadingLog[];
  rank: string; coins: number; streak: number; claimed: string[]; enrolled: string[];
}
const empty: LibraryState = { volumes: [], commissions: [], profile: null, logs: [], rank: 'F', coins: 0, streak: 0, claimed: [], enrolled: [] };

function useLibraryState() {
  const [state, setState] = useState<LibraryState>(empty);
  const [session, setSession] = useState<Session | null>(null);
  const [section, setSection] = useState<SectionId>('archive');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const generation = useRef(0);
  const mutation = useRef(false);
  const authEventVersion = useRef(0);
  const applySession = useCallback((next: Session | null) => {
    generation.current++;
    setState(empty);
    setSession(next);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); setError(setupMessage); return; }
    const client = supabase;
    let active = true;
    const restoreSession = async () => {
      const versionAtStart = authEventVersion.current;
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) { setError(errorMessage(error)); setLoading(false); return; }
      if (data.session) {
        const { error: userError } = await client.auth.getUser();
        if (!active) return;
        if (userError) {
          await client.auth.signOut({ scope: 'local' });
          if (versionAtStart === authEventVersion.current) applySession(null);
          setLoading(false);
          return;
        }
      }
      // Never let a slower initial read overwrite a newer auth event.
      if (versionAtStart === authEventVersion.current) applySession(data.session);
    };
    void restoreSession();
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      authEventVersion.current++;
      applySession(next);
    });
    return () => { active = false; data.subscription.unsubscribe(); generation.current++; };
  }, [applySession]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const current = ++generation.current;
    setLoading(true);
    try {
      const books = await readRows<BookRow>('books', 'book_id,title,author,volume_number,description,cover_image_url,isbn,publisher,original_title,book_genres(genre),book_copies(status)', 'book_id');
      // Keep the browse experience useful for visitors while the live catalog is
      // empty or still being seeded. Signed-in actions continue to use Supabase.
      const catalog = books.length || session ? books.map(book => ({
        id: String(book.book_id), title: book.title || 'Untitled book', author: book.author ?? 'Unknown author',
        volume: Number(book.volume_number) || 0, genre: (Array.isArray(book.book_genres) ? book.book_genres : []).map(g => g.genre).filter(Boolean).join(', ') || 'Uncategorized',
        synopsis: book.description ?? 'No description recorded.', copies: session ? book.book_copies.filter(c => c.status === 'IN_SHELF').length : -1,
        rating: 0, rarity: 3 as const, chapters: 0, plate: [(book.title || 'Untitled book').toUpperCase()], plateColor: '#59351e', plateInk: '#fff9ef',
        coverImage: book.cover_image_url ?? undefined, isbn: book.isbn, publisher: book.publisher, originalTitle: book.original_title,
      })) : demoVolumes;
      let next: LibraryState = { ...empty, volumes: catalog };
      if (session) {
        const results = await Promise.all([
          supabase.from('profiles').select('user_id,first_name,last_name,birthday,bio').eq('user_id', session.user.id).maybeSingle(),
          supabase.from('reader_progress').select('total_points,current_streak_days,membership_ranks(name)').eq('user_id', session.user.id).maybeSingle(),
          readRows<ReadingLog>('reading_logs', 'reading_log_id,book_id,started_at,returned_at,total_reading_minutes', 'reading_log_id'),
          readRows<Quest>('quests', 'quest_id,name,description,quest_type,points_reward,badge_name', 'quest_id'),
          readRows<QuestProgress>('quest_progress', 'quest_id,status', 'quest_progress_id'),
          readRows<{ reason_type: string; reference_id: string }>('points_ledger', 'reason_type,reference_id', 'ledger_id'),
        ]);
        if (results[0].error) throw results[0].error;
        if (results[1].error) throw results[1].error;
        const progress = results[1].data as unknown as Progress | null;
        next = { ...next, profile: results[0].data, logs: results[2],
          rank: progress?.membership_ranks?.name ?? 'F', coins: progress?.total_points ?? 0, streak: progress?.current_streak_days ?? 0,
          claimed: results[5].filter(p => p.reason_type === 'QUEST_REWARD').map(p => p.reference_id),
          enrolled: results[4].map(p => String(p.quest_id)),
          commissions: results[3].map(q => ({ id: String(q.quest_id), name: q.name, detail: q.description,
            track: q.quest_type === 'WEEKLY' ? 'weekly' : q.quest_type === 'EVENT' ? 'seasonal' : 'daily',
            seal: q.badge_name ?? 'Quest', coins: q.points_reward, xp: 0, participants: 0,
            progress: results[4].some(p => p.quest_id === q.quest_id && p.status === 'COMPLETED') ? 100 : 0 })) };
      }
      if (current === generation.current) { setState(next); setError(''); }
    } catch (err) {
      if (current === generation.current) {
        if (!session) setState({ ...empty, volumes: demoVolumes });
        setError(errorMessage(err));
      }
    }
    finally { if (current === generation.current) setLoading(false); }
  }, [session]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); generation.current++; };
  }, [refresh]);

  const message = (title: string, detail: string) => {
    setToasts(items => [...items.slice(-2), { id: crypto.randomUUID(), title, detail, kind: 'info' }]);
  };
  async function run(action: () => PromiseLike<{ error: unknown }>, success: string) {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true);
    try { const result = await action(); if (result.error) throw result.error; await refresh(); message(success, 'Saved to your library account.'); return true; }
    catch (err) { message('Action could not be completed', errorMessage(err)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  async function signIn(email: string, password: string) {
    if (mutation.current) return { ok: false as const, error: 'A sign-in request is already in progress.' };
    mutation.current = true; setBusy(true);
    try {
      const { data, error } = await database().auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Unable to create a login session. Please try again.');
      // Update the shared state here as well as through onAuthStateChange. This
      // makes the UI deterministic even if the auth event is delivered later.
      applySession(data.session);
      message('Logged in successfully.', 'Your account is ready.');
      return { ok: true as const };
    } catch (err) {
      const detail = errorMessage(err);
      message('Sign in failed', detail);
      return { ok: false as const, error: detail };
    } finally { mutation.current = false; setBusy(false); }
  }
  async function signOut() {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true);
    try {
      const { error } = await database().auth.signOut({ scope: 'local' });
      if (error) throw error;
      applySession(null);
      setSection('archive');
      message('Logged out successfully.', 'You have been signed out of your library account.');
      return true;
    } catch (err) { message('Action could not be completed', errorMessage(err)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  const dismissToast = useCallback((id: string) => {
    setToasts(items => items.filter(toast => toast.id !== id));
  }, []);
  const borrowed = state.logs.filter(log => !log.returned_at).map(log => ({ volumeId: String(log.book_id), dueInDays: 0, progress: 0 }));
  return {
    ...state, session, section, setSection, loading, error, busy, refresh, borrowed, toasts,
    xp: 0, xpPercent: 0, lanterns: Math.max(0, 3 - borrowed.length), maxLanterns: 3,
    joinedEvents: [] as string[], joinedClubs: [] as string[],
    volumeById: (id: string) => state.volumes.find(v => v.id === id),
    isBorrowed: (id: string) => borrowed.some(v => v.volumeId === id),
    borrow: (id: string) => run(() => database().rpc('start_reading', { p_book_id: Number(id) }), 'Reading started'),
    giveBack: (id: string) => {
      const log = state.logs.find(l => String(l.book_id) === id && !l.returned_at);
      return log ? run(() => database().rpc('finish_reading', { p_log_id: log.reading_log_id }), 'Reading finished — place the book on the return cart') : Promise.resolve(false);
    },
    logSession: (_id: string) => { message('Reading time is recorded automatically', 'Finish reading and return the book to complete your session.'); },
    claim: (q: Commission) => run(() => database().rpc('claim_quest', { p_quest_id: Number(q.id) }), 'Quest points claimed'),
    joinQuest: (id: string) => run(() => database().rpc('join_quest', { p_quest_id: Number(id) }), 'Quest joined'),
    toggleEvent: (_id: string, _name: string, _xp: number) => message('Event registration unavailable', 'Ask library staff about current events.'),
    toggleClub: (_id: string, _name: string) => message('Club registration unavailable', 'Ask library staff about current clubs.'),
    dismissToast,
    signIn,
    signOut,
    saveProfile: (profile: Pick<Profile, 'first_name' | 'last_name' | 'birthday' | 'bio'>) => run(() => {
      if (!session) throw new Error('Sign in first');
      return database().from('profiles').update(profile).eq('user_id', session.user.id).select().single();
    }, 'Profile updated'),
  };
}
const GameContext = createContext<ReturnType<typeof useLibraryState> | null>(null);
export function GameProvider({ children }: { children: ReactNode }) {
  const value = useLibraryState();
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside GameProvider');
  return value;
}
