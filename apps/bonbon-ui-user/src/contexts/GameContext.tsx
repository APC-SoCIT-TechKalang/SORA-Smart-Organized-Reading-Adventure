import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '@supabase/supabase-js';
import type { Commission, SectionId, Toast, Volume } from '../types/library';
import { database, errorMessage, readRows, setupMessage, supabase } from '../lib/supabase';
import { volumes as demoVolumes } from '../data/manga';
import { bookToVolume, questToCommission, type BookRow, type QuestRow } from '../lib/library-mappers';
import { loadReplacementLibrary, replacementApi, requireReaderAccount, usesReplacementSchema } from '../lib/replacement-library';
import { useReaderAccess } from '../lib/use-reader-access';

export interface Profile { user_id: string; first_name: string; last_name: string; birthday: string | null; bio: string | null; }
export interface ReadingLog { reading_log_id: number; session_id?: number; copy_id?: number; book_id: number; started_at: string; returned_at: string | null; total_reading_minutes: number | null; }
interface QuestProgress { quest_id: number; status: string; }
interface Progress { total_points: number; current_streak_days: number; membership_ranks: { name: string } | null; }
interface LibraryState {
  volumes: Volume[]; commissions: Commission[]; profile: Profile | null; logs: ReadingLog[];
  rank: string; coins: number; streak: number; claimed: string[]; enrolled: string[];
  questUpdatedAt: string | null; nextRank: { name: string; pointsRequired: number } | null;
  rewards: { reward_id:number; reward_name:string; points_cost:number; stock_quantity:number; is_available:boolean }[];
}
const empty: LibraryState = { volumes: [], commissions: [], profile: null, logs: [], rank: 'F', coins: 0, streak: 0, claimed: [], enrolled: [], questUpdatedAt: null, nextRank: null, rewards: [] };

function initialSection(): SectionId {
  if (new URLSearchParams(window.location.search).has('reading')) return 'shelf';
  return 'archive';
}

function useLibraryState() {
  const [state, setState] = useState<LibraryState>(empty);
  const [session, setSession] = useState<Session | null>(null);
  const readerAccess = useReaderAccess(session);
  const [section, setSection] = useState<SectionId>(initialSection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const generation = useRef(0);
  const mutation = useRef(false);
  const authEventVersion = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  // True once library data for the current account has been shown. Later
  // refreshes then run in the background without flipping `loading`.
  const loaded = useRef(false);
  const applySession = useCallback((next: Session | null) => {
    const previousUserId = sessionRef.current?.user.id ?? null;
    const nextUserId = next?.user.id ?? null;
    sessionRef.current = next;
    // Supabase emits SIGNED_IN again when a hidden tab becomes visible and can
    // emit TOKEN_REFRESHED for the same user. Those are credential updates,
    // not account changes, so keep the already-rendered library state intact.
    if (previousUserId !== nextUserId) {
      generation.current++;
      loaded.current = false;
      setState(empty);
    }
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
        try { await requireReaderAccount(); }
        catch (cause) {
          if (active) { applySession(null); setError(errorMessage(cause)); setLoading(false); }
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
    const currentSession = sessionRef.current;
    const current = ++generation.current;
    if (!loaded.current) setLoading(true);
    try {
      if (usesReplacementSchema) {
        const next = await loadReplacementLibrary(currentSession);
        if (current === generation.current) { loaded.current = true; setState(next); setError(''); }
        return;
      }
      const books = await readRows<BookRow>('books', 'book_id,title,author,volume_number,description,cover_image_url,isbn,publisher,original_title,book_genres(genre),book_copies(status)', 'book_id');
      // Keep the browse experience useful for visitors while the live catalog is
      // empty or still being seeded. Signed-in actions continue to use Supabase.
      const catalog = books.length || currentSession ? books.map(book => bookToVolume(book, !!currentSession)) : demoVolumes;
      let next: LibraryState = { ...empty, volumes: catalog };
      if (currentSession) {
        const results = await Promise.all([
          supabase.from('profiles').select('user_id,first_name,last_name,birthday,bio').eq('user_id', currentSession.user.id).maybeSingle(),
          supabase.from('reader_progress').select('total_points,current_streak_days,membership_ranks(name)').eq('user_id', currentSession.user.id).maybeSingle(),
          readRows<ReadingLog>('reading_logs', 'reading_log_id,book_id,started_at,returned_at,total_reading_minutes', 'reading_log_id'),
          readRows<QuestRow>('quests', 'quest_id,name,description,quest_type,points_reward,badge_name', 'quest_id'),
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
          commissions: results[3].map(q => questToCommission(q, results[4].some(p => p.quest_id === q.quest_id && p.status === 'COMPLETED'))) };
      }
      if (current === generation.current) { loaded.current = true; setState(next); setError(''); }
    } catch (err) {
      if (current === generation.current) {
        // A background refresh failure must not erase or replace data that was
        // already loaded. Demo books are only an initial guest fallback.
        if (!currentSession && !usesReplacementSchema) setState(previous => previous.volumes.length ? previous : { ...empty, volumes: demoVolumes });
        setError(errorMessage(err));
      }
    }
    finally { if (current === generation.current) setLoading(false); }
  }, []);

  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    void refresh();
    // Background refreshes are non-destructive (same-user auth events and
    // failed fetches keep current data), so it is safe to pick up changes when
    // the reader returns to the tab. Skip polling while the tab is hidden.
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); generation.current++; };
  }, [refresh, sessionUserId]);

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
      await requireReaderAccount();
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
      const kioskSession = Boolean(window.sessionStorage.getItem('sora.kiosk.session-started-at'));
      const { error } = await database().auth.signOut({ scope: 'local' });
      if (error) throw error;
      applySession(null);
      window.sessionStorage.removeItem('sora.kiosk.session-started-at');
      window.sessionStorage.removeItem('sora.kiosk.account');
      if (kioskSession) window.location.replace('/kiosk');
      else {
        setSection('archive');
        message('Logged out successfully.', 'You have been signed out of your library account.');
      }
      return true;
    } catch (err) { message('Action could not be completed', errorMessage(err)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  const dismissToast = useCallback((id: string) => {
    setToasts(items => items.filter(toast => toast.id !== id));
  }, []);
  const borrowed = state.logs.filter(log => !log.returned_at).map(log => ({ volumeId: String(log.book_id), dueInDays: 0, progress: 0 }));
  return {
    ...state, session, readerAccess, section, setSection, loading, error, busy, refresh, borrowed, toasts,
    xp: 0, xpPercent: 0, lanterns: Math.max(0, 3 - borrowed.length), maxLanterns: 3,
    joinedEvents: [] as string[], joinedClubs: [] as string[],
    volumeById: (id: string) => state.volumes.find(v => v.id === id),
    isBorrowed: (id: string) => borrowed.some(v => v.volumeId === id),
    borrow: (id: string) => {
      if (borrowed.length >= 3) {
        message('Three-book limit reached', 'Finish or return a book before starting another one.');
        return Promise.resolve(false);
      }
      if (usesReplacementSchema) {
        setSection('guide');
        message('Choose a seat and scan your book', 'Use View Seats to start a session or add up to three books.');
        return Promise.resolve(false);
      }
      return run(() => database().rpc('start_reading', { p_book_id: Number(id) }), 'Reading started');
    },
    giveBack: (logId: number, barcode?: string) => {
      const log = state.logs.find(l => l.reading_log_id === logId && !l.returned_at);
      return log ? run(() => usesReplacementSchema
        ? replacementApi().rpc('kiosk_return_book', {
          p_session_id: log.session_id, p_copy_id: log.copy_id, p_barcode: barcode?.trim(),
        })
        : database().rpc('finish_reading', { p_log_id: log.reading_log_id }),
        usesReplacementSchema ? 'Book returned — your reading session remains active' : 'Reading finished') : Promise.resolve(false);
    },
    logSession: (_id: string) => { message('Reading time is recorded automatically', 'Finish reading and return the book to complete your session.'); },
    claim: (q: Commission) => run(() => (usesReplacementSchema ? replacementApi() : database()).rpc('claim_quest', { p_quest_id: Number(q.id) }), 'Quest points claimed'),
    joinQuest: (id: string) => run(() => (usesReplacementSchema ? replacementApi() : database()).rpc('join_quest', { p_quest_id: Number(id) }), 'Quest joined'),
    redeemReward: (rewardId: number) => usesReplacementSchema ? run(() => replacementApi().rpc('reader_redeem_reward', { p_reward_id: rewardId }), 'Reward redemption requested') : Promise.resolve(false),
    toggleEvent: (_id: string, _name: string, _xp: number) => message('Event registration unavailable', 'Ask library staff about current events.'),
    toggleClub: (_id: string, _name: string) => message('Club registration unavailable', 'Ask library staff about current clubs.'),
    dismissToast,
    signIn,
    signOut,
    saveProfile: (profile: Pick<Profile, 'first_name' | 'last_name' | 'birthday' | 'bio'>) => run(() => {
      if (!session) throw new Error('Sign in first');
      if (usesReplacementSchema) {
        if (!profile.birthday) throw new Error('Birthday is required.');
        return replacementApi().from('users').update({
          first_name: profile.first_name, last_name: profile.last_name, birthdate: profile.birthday,
        }).eq('id', state.profile?.user_id).select('id,first_name,last_name,birthdate').single();
      }
      return database().from('profiles').update(profile).eq('user_id', session.user.id).select().single();
    }, 'Profile updated'),
  };
}
const GameContext = createContext<ReturnType<typeof useLibraryState> | null>(null);
export function GameProvider({ children }: { children: ReactNode }) {
  const value = useLibraryState();
  return <GameContext.Provider value={value}>{children}<KioskInactivityWarning /></GameContext.Provider>;
}
export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside GameProvider');
  return value;
}

const WARNING_AFTER_MS = 30_000;
const WARNING_COUNTDOWN_SECONDS = 60;
const LOGOUT_AFTER_MS = WARNING_AFTER_MS + WARNING_COUNTDOWN_SECONDS * 1_000;
const KIOSK_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll'] as const;

function KioskInactivityWarning() {
  const { session, signOut } = useGame();
  const kioskSession = Boolean(session && window.sessionStorage.getItem('sora.kiosk.session-started-at'));
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_COUNTDOWN_SECONDS);
  const lastActivity = useRef(Date.now());
  const loggingOut = useRef(false);

  useEffect(() => {
    if (!kioskSession) return;
    lastActivity.current = Date.now();
    loggingOut.current = false;

    const onActivity = () => {
      if (loggingOut.current) return;
      lastActivity.current = Date.now();
      setVisible(false);
      setSecondsLeft(WARNING_COUNTDOWN_SECONDS);
    };
    const checkInactivity = () => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= LOGOUT_AFTER_MS && !loggingOut.current) {
        loggingOut.current = true;
        void signOutRef.current().then(signedOut => {
          if (!signedOut) { loggingOut.current = false; onActivity(); }
        });
        return;
      }
      if (idleFor >= WARNING_AFTER_MS) {
        setVisible(true);
        setSecondsLeft(Math.ceil((LOGOUT_AFTER_MS - idleFor) / 1000));
      }
    };

    KIOSK_ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, onActivity));
    const interval = window.setInterval(checkInactivity, 250);
    return () => {
      window.clearInterval(interval);
      KIOSK_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, onActivity));
    };
  }, [kioskSession, session?.user.id]);

  if (!kioskSession || !visible) return null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  return createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-umber/75 p-2 backdrop-blur-sm sm:p-4" role="presentation">
    <section role="alertdialog" aria-modal="true" aria-labelledby="kiosk-idle-title" aria-describedby="kiosk-idle-description" className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-gold/40 bg-cream p-4 text-center text-umber shadow-[0_24px_70px_rgba(46,25,12,.4)] sm:max-h-[calc(100dvh-2rem)] sm:p-8">
      <h2 id="kiosk-idle-title" className="font-display text-2xl font-900">Are you still there?</h2>
      <p id="kiosk-idle-description" className="mt-3 text-sm leading-6 text-umber/70">For your privacy, this kiosk will sign you out in <strong aria-live="off">{minutes}:{seconds}</strong> if you remain inactive.</p>
      <button type="button" onClick={() => { lastActivity.current = Date.now(); setVisible(false); setSecondsLeft(WARNING_COUNTDOWN_SECONDS); }} className="tb-button-primary tb-cut-sm mt-6 min-h-12 px-6">Yes, I'm still here</button>
    </section>
  </div>, document.body);
}
