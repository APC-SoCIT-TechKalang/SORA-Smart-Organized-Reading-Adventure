"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, LayoutDashboard, LogOut, RefreshCw, Trophy, Users, Wallet } from 'lucide-react';
import { database, errorMessage, readRows } from '../../lib/supabase';

interface Book { book_id: number; title: string; author: string | null; isbn: string | null; acquisition_status: string; }
interface Copy { copy_id: number; book_id: number; identifier_value: string; status: string; shelf_id: number | null; }
interface Reader { user_id: string; first_name: string; last_name: string; birthday: string | null; is_active: boolean; }
interface Membership { membership_id: number; user_id: string; membership_number: string; status: string; remaining_minutes: number | null; expires_at: string | null; }
interface Plan { membership_type_id: number; name: string; entry_type: string; }
interface Visit { visit_id: number; user_id: string | null; checked_in_at: string; scheduled_end_at: string | null; status: string; }
interface Log { reading_log_id: number; book_id: number; total_reading_minutes: number | null; started_at: string; returned_at: string | null; }
interface Quest { quest_id: number; name: string; description: string; points_reward: number; status: string; }
interface Enrollment { quest_progress_id: number; quest_id: number; user_id: string; status: string; }
interface Shelf { shelf_id: number; name: string; }
interface State { books: Book[]; copies: Copy[]; readers: Reader[]; memberships: Membership[]; plans: Plan[]; visits: Visit[]; logs: Log[]; quests: Quest[]; enrollments: Enrollment[]; shelves: Shelf[]; }
const empty: State = { books: [], copies: [], readers: [], memberships: [], plans: [], visits: [], logs: [], quests: [], enrollments: [], shelves: [] };
const nav = [[LayoutDashboard, 'Overview'], [BookOpen, 'Book Management'], [Trophy, 'Challenges'], [Users, 'Readers'], [Wallet, 'Top-up terminal']] as const;
const inputClass = 'mt-1 w-full rounded-lg border border-[#d7c7b5] bg-white px-3 py-2 text-sm text-[#392414]';
const buttonClass = 'rounded-lg bg-[#a83d12] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';

export function LiveDashboard() {
  const [state, setState] = useState<State>(empty);
  const [active, setActive] = useState<string>('Overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Book | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    try {
      const allowed = await database().rpc('has_role', { required_role: 'admin' });
      if (allowed.error) throw allowed.error;
      if (!allowed.data) throw new Error('Staff access is no longer available. Sign out and contact your administrator.');
      const [books, copies, readers, memberships, plans, visits, logs, quests, enrollments, shelves] = await Promise.all([
        readRows<Book>('books', 'book_id,title,author,isbn,acquisition_status', 'book_id'),
        readRows<Copy>('book_copies', 'copy_id,book_id,identifier_value,status,shelf_id', 'copy_id'),
        readRows<Reader>('profiles', 'user_id,first_name,last_name,birthday,is_active', 'user_id'),
        readRows<Membership>('memberships', 'membership_id,user_id,membership_number,status,remaining_minutes,expires_at', 'membership_id'),
        readRows<Plan>('membership_types', 'membership_type_id,name,entry_type', 'membership_type_id'),
        readRows<Visit>('visits', 'visit_id,user_id,checked_in_at,scheduled_end_at,status', 'visit_id'),
        readRows<Log>('reading_logs', 'reading_log_id,book_id,total_reading_minutes,started_at,returned_at', 'reading_log_id'),
        readRows<Quest>('quests', 'quest_id,name,description,points_reward,status', 'quest_id'),
        readRows<Enrollment>('quest_progress', 'quest_progress_id,quest_id,user_id,status', 'quest_progress_id'),
        readRows<Shelf>('shelves', 'shelf_id,name', 'shelf_id'),
      ]);
      if (version === generation.current) { setState({ books, copies, readers, memberships, plans, visits, logs, quests, enrollments, shelves }); setError(''); }
    } catch (err) { if (version === generation.current) setError(errorMessage(err)); }
    finally { if (version === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { clearInterval(timer); generation.current++; };
  }, [refresh]);
  async function run(action: () => PromiseLike<{ error: unknown }>, success: string) {
    if (mutation.current) return false;
    mutation.current = true; setBusy(true); setNotice('');
    try { const result = await action(); if (result.error) throw result.error; await refresh(); setNotice(success); return true; }
    catch (err) { setNotice(errorMessage(err)); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  const rpc = (name: string, args: Record<string, unknown>, message: string) => run(() => database().rpc(name, args), message);
  const name = (id: string | null) => { const r = state.readers.find(r => r.user_id === id); return r ? r.first_name + ' ' + r.last_name : id ?? 'Walk-in'; };
  const bookTitle = (id: number) => state.books.find(b => b.book_id === id)?.title ?? 'Book #' + id;
  const readerOptions = state.readers.filter(r => r.is_active).map(r => [r.user_id, name(r.user_id) + ' · ' + r.user_id.slice(0,8)] as [string,string]);
  const bookOptions = state.books.map(b => [String(b.book_id), b.title + ' · #' + b.book_id] as [string,string]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const todayLogs = state.logs.filter(l => new Date(l.started_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today);

  return <main className="min-h-screen bg-[#f7f5f1] text-[#392414]"><div className="flex min-h-screen">
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-[#59351e] px-2 py-5 text-[#fff9ef] sm:w-60 sm:px-4">
      <div className="mb-8 flex items-center gap-3 px-2"><BookOpen/><span className="hidden font-serif text-lg sm:block">Tankobonbon<small className="block text-xs text-[#d7bda4]">Library staff</small></span></div>
      <nav className="space-y-2">{nav.map(([Icon, label]) => <button key={label} title={label} onClick={() => setActive(label)} className={'flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ' + (active === label ? 'bg-[#fff9ef] text-[#59351e]' : 'hover:bg-white/10')}><Icon size={18}/><span className="hidden sm:inline">{label}</span></button>)}</nav>
      <button disabled={busy} onClick={() => void run(() => database().auth.signOut(), 'Signed out')} className="mt-auto flex items-center gap-3 p-3 text-sm"><LogOut size={18}/><span className="hidden sm:inline">Sign out</span></button>
    </aside>
    <section className="min-w-0 flex-1"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8dfd3] bg-[#fffdf9] px-6 py-5"><div><p className="text-xs text-[#835d40]">S.O.R.A. / Admin terminal</p><p className="mt-1 text-xs">{new Date().toLocaleDateString()} · {loading ? 'Refreshing…' : 'Refreshes every 30 seconds'}</p></div><button disabled={loading} onClick={() => void refresh()} className="flex items-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={16}/>Refresh</button></header>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8"><h1 className="font-serif text-3xl">{active === 'Overview' ? 'Reading Room Today' : active}</h1>
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-[#d5b995] bg-[#fff0c9] p-4">{notice}</p>}
      <fieldset disabled={busy || !!error || loading} className="min-w-0 space-y-6 disabled:opacity-70">
      {active === 'Overview' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Titles', state.books.length], ['Active visits', state.visits.filter(v => v.status === 'ACTIVE').length], ['Reading starts today', todayLogs.length], ['Return cart', state.copies.filter(c => c.status === 'RETURN_CART').length]].map(([label,value]) => <div key={label} className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-6"><p className="text-xs uppercase tracking-wider text-[#835d40]">{label}</p><strong className="mt-3 block font-serif text-4xl">{value}</strong></div>)}</div>
        <Panel title="Reading activity"><p className="text-sm">{state.logs.filter(l => l.returned_at).length} completed sessions · {state.logs.reduce((sum,l) => sum + (l.total_reading_minutes ?? 0), 0)} recorded minutes</p><Table headers={['Title','Sessions']} rows={state.books.map(b => ({ id: b.book_id, title: b.title, count: state.logs.filter(l => l.book_id === b.book_id).length })).filter(b => b.count).sort((a,b) => b.count-a.count).slice(0,10).map(b => [b.title, b.count])}/></Panel>
        <Panel title="Return cart — inspect before shelving"><Table headers={['Copy','Title','Action']} rows={state.copies.filter(c => c.status === 'RETURN_CART').map(c => [c.identifier_value, bookTitle(c.book_id), <button key={c.copy_id} className={buttonClass} onClick={() => void rpc('admin_shelve', { p_copy_id: c.copy_id }, 'Copy returned to shelf')}>Shelve</button>])}/></Panel>
      </>}
      {active === 'Book Management' && <>
        <label className="block text-sm">Search catalog<input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, author or ISBN"/></label>
        <Panel title="Catalog"><Table headers={['Title','Author','Status','Copies','']} rows={state.books.filter(b => [b.title,b.author,b.isbn].join(' ').toLowerCase().includes(query.toLowerCase())).map(b => [b.title,b.author ?? '—',b.acquisition_status,state.copies.filter(c => c.book_id === b.book_id).length,<button key={b.book_id} className="text-[#a83d12] underline" onClick={() => setEditing(b)}>Edit</button>])}/></Panel>
        <Panel title={editing ? 'Edit ' + editing.title : 'Add a title'}><DataForm key={editing?.book_id ?? 'new'} submit={async form => {
          const values = { title: value(form,'title'), author: value(form,'author') || null, isbn: value(form,'isbn') || null, acquisition_status: value(form,'status') };
          const saved = await run(() => editing ? database().from('books').update(values).eq('book_id',editing.book_id).select().single() : database().from('books').insert(values).select().single(), 'Book saved');
          if (saved) setEditing(null); return saved;
        }}><Field name="title" label="Title" initial={editing?.title}/><Field name="author" label="Author" required={false} initial={editing?.author ?? ''}/><Field name="isbn" label="ISBN" required={false} initial={editing?.isbn ?? ''}/><Select name="status" label="Catalog status" initial={editing?.acquisition_status ?? 'IN_LIBRARY'} options={['IN_LIBRARY','RESTRICTED','WAITLISTED','INCOMING','ELECTION_WINNER','NOT_IN_DATABASE'].map(s => [s,s])}/><Submit label="Save title"/>{editing && <button type="button" className="text-sm underline" onClick={() => setEditing(null)}>Cancel edit</button>}</DataForm></Panel>
        <Panel title="Register a physical copy"><DataForm submit={form => run(() => database().from('book_copies').insert({ book_id: Number(value(form,'book')), identifier_value: value(form,'identifier'), identifier_type: 'BARCODE', shelf_id: Number(value(form,'shelf')) }), 'Physical copy registered')}><Select name="book" label="Title" options={bookOptions}/><Field name="identifier" label="Unique barcode / identifier"/><Select name="shelf" label="Shelf" options={state.shelves.map(s => [String(s.shelf_id),s.name])}/><Submit label="Add copy"/></DataForm></Panel>
      </>}
      {active === 'Readers' && <>
        <Panel title="Registered readers"><Table headers={['Name','Profile ID','Birthday','Active']} rows={state.readers.map(r => [name(r.user_id), r.user_id, r.birthday ?? 'Not provided', r.is_active ? 'Yes' : 'No'])}/></Panel>
        <Panel title="Activate membership and physical card"><p className="mb-4 text-sm text-[#835d40]">Verify identity and birthday in person. Hourly plans start with zero minutes; record a top-up before check-in.</p><DataForm submit={form => rpc('admin_activate_member', { p_user_id: value(form,'reader'), p_type_id: Number(value(form,'plan')), p_number: value(form,'number'), p_rfid: value(form,'rfid'), p_expires_at: new Date(value(form,'expiry')).toISOString() }, 'Membership and card activated')}><Select name="reader" label="Reader" options={readerOptions}/><Select name="plan" label="Plan" options={state.plans.filter(p => p.entry_type !== 'WALK_IN').map(p => [String(p.membership_type_id),p.name])}/><Field name="number" label="Unique membership number"/><Field name="rfid" label="Physical card UID"/><Field name="expiry" label="Expires at (local time)" type="datetime-local"/><Submit label="Activate membership"/></DataForm></Panel>
        <Panel title="Check in a member"><DataForm submit={form => rpc('admin_check_in', { p_user_id: value(form,'reader') }, 'Reader checked in')}><Select name="reader" label="Reader" options={readerOptions}/><Submit label="Check in"/></DataForm></Panel>
        <Panel title="Active visits"><Table headers={['Reader','Started','Scheduled end','Action']} rows={state.visits.filter(v => v.status === 'ACTIVE').map(v => [name(v.user_id),new Date(v.checked_in_at).toLocaleString(),v.scheduled_end_at ? new Date(v.scheduled_end_at).toLocaleString() : 'No time limit',<button key={v.visit_id} className={buttonClass} onClick={() => void rpc('admin_check_out', { p_visit_id: v.visit_id }, 'Visit completed; books moved to return cart')}>Check out</button>])}/></Panel>
      </>}
      {active === 'Challenges' && <>
        <Panel title="Quests"><Table headers={['Quest','Points','Status','Action']} rows={state.quests.map(q => [q.name,q.points_reward,q.status,<button key={q.quest_id} className="text-[#a83d12] underline" onClick={() => void run(() => database().from('quests').update({ status: q.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }).eq('quest_id',q.quest_id).select().single(),'Quest status updated')}>{q.status === 'ACTIVE' ? 'Archive' : 'Activate'}</button>])}/></Panel>
        <Panel title="Create a quest"><DataForm submit={form => run(() => database().from('quests').insert({ name: value(form,'name'), description: value(form,'description'), quest_type: value(form,'type'), requirement_type: 'STAFF_VERIFIED', points_reward: Number(value(form,'points')), status: 'ACTIVE' }), 'Quest created')}><Field name="name" label="Quest name"/><Field name="description" label="Requirements to verify"/><Select name="type" label="Type" options={['MAIN','SIDE','COLLECTION','WEEKLY','EVENT'].map(s => [s,s])}/><Field name="points" label="Points reward" type="number" min={0}/><Submit label="Create quest"/></DataForm></Panel>
        <Panel title="Verify quest completion"><p className="mb-4 text-sm">Confirm the reader has met the requirements before approving. Readers can then claim the reward once.</p><Table headers={['Reader','Quest','Status','Action']} rows={state.enrollments.map(p => [name(p.user_id),state.quests.find(q => q.quest_id === p.quest_id)?.name ?? p.quest_id,p.status,['ACTIVE','PENDING'].includes(p.status) ? <button key={p.quest_progress_id} className={buttonClass} onClick={() => void rpc('admin_complete_quest', { p_progress_id: p.quest_progress_id }, 'Completion verified')}>Verify completion</button> : '—'])}/></Panel>
      </>}
      {active === 'Top-up terminal' && <>
        <Panel title="Membership time balances"><Table headers={['Reader','Membership','Minutes','Status','Expiry']} rows={state.memberships.map(m => [name(m.user_id),m.membership_number,m.remaining_minutes ?? 'Unlimited',m.status,m.expires_at ? new Date(m.expires_at).toLocaleString() : 'No expiry'])}/></Panel>
        <Panel title="Record time credit"><p className="mb-4 text-sm text-[#835d40]">Use after processing payment through your existing counter procedure. This form records minutes and an audit reference; it does not charge money. Balances are settled when a visit is checked out.</p><DataForm submit={form => rpc('admin_top_up', { p_membership_id: Number(value(form,'membership')), p_minutes: Number(value(form,'minutes')), p_reason: value(form,'reason') }, 'Minutes credited and audit record saved')}><Select name="membership" label="Hourly membership" options={state.memberships.filter(m => m.status === 'ACTIVE' && m.remaining_minutes !== null).map(m => [String(m.membership_id),m.membership_number + ' · ' + name(m.user_id)])}/><Field name="minutes" label="Minutes to add" type="number" min={1}/><Field name="reason" label="Receipt / reference"/><Submit label="Record top-up"/></DataForm></Panel>
      </>}
      </fieldset></div>
    </section></div></main>;
}

function value(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-[#e8dfd3] bg-[#fffdf9] p-5 shadow-sm"><h2 className="mb-4 font-serif text-xl">{title}</h2>{children}</section>; }
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <div className="overflow-x-auto">{!rows.length ? <p className="py-4 text-sm text-[#835d40]">No records yet.</p> : <table className="w-full text-left text-sm"><thead><tr>{headers.map((h,i) => <th key={i} className="border-b border-[#e8dfd3] px-3 py-3 text-xs text-[#835d40]">{h}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j} className="border-b border-[#eee5dc] px-3 py-3">{cell}</td>)}</tr>)}</tbody></table>}</div>; }
function DataForm({ children, submit }: { children: ReactNode; submit: (form: FormData) => Promise<boolean> }) {
  const [error,setError] = useState('');
  return <form className="grid items-end gap-4 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; setError(''); try { if (await submit(new FormData(form))) form.reset(); } catch (err) { setError(errorMessage(err)); } }}>{children}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form>;
}
function Field({ name, label, type = 'text', required = true, initial, min }: { name: string; label: string; type?: string; required?: boolean; initial?: string; min?: number }) { return <label className="text-sm">{label}<input className={inputClass} name={name} type={type} required={required} defaultValue={initial} min={min} step={type === 'number' ? 1 : undefined}/></label>; }
function Select({ name, label, options, initial = '' }: { name: string; label: string; options: [string,string][]; initial?: string }) { return <label className="text-sm">{label}<select className={inputClass} name={name} required defaultValue={initial}><option value="" disabled>Select…</option>{options.map(([id,text]) => <option key={id} value={id}>{text}</option>)}</select></label>; }
function Submit({ label }: { label: string }) { return <button type="submit" className={buttonClass}>{label}</button>; }
