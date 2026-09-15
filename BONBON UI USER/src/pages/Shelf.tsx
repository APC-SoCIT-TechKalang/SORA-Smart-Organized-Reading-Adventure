import { useGame } from '../contexts/GameContext';
import { SectionHeading } from '../components/OrnatePanel';
export function Shelf() {
  const { session, profile, logs, volumeById, giveBack, busy, saveProfile } = useGame();
  if (!session) return <p>Sign in to view your reading shelf and profile.</p>;
  const input = 'mt-1 w-full border border-gold/40 bg-cream p-2 text-sm';
  return <div className="space-y-8"><SectionHeading title="My Shelf" meta="In-library reading"/>
    <p className="text-sm text-umber/70">Reading time is recorded automatically. Return books to the cart before staff check you out.</p>
    {!logs.some(l => !l.returned_at) && <p>You have no active reading sessions.</p>}
    {logs.filter(l => !l.returned_at).map(log => <div key={log.reading_log_id} className="flex flex-wrap items-center justify-between gap-4 border border-gold/40 p-5"><div><h3 className="font-display text-xl">{volumeById(String(log.book_id))?.title ?? 'Book #' + log.book_id}</h3><p className="text-sm text-umber/60">Started {new Date(log.started_at).toLocaleString()}</p></div><button disabled={busy} onClick={() => void giveBack(String(log.book_id))} className="bg-rust px-4 py-2 text-cream disabled:opacity-50">Finish &amp; return to cart</button></div>)}
    <section><h2 className="font-display text-xl">Reading history</h2><ul className="mt-4 space-y-2">{logs.filter(l => l.returned_at).reverse().map(log => <li key={log.reading_log_id} className="border-b border-gold/30 py-3 text-sm">{volumeById(String(log.book_id))?.title ?? 'Book #' + log.book_id} · {log.total_reading_minutes ?? 0} minutes · {new Date(log.returned_at!).toLocaleDateString()}</li>)}</ul></section>
    {profile && <form key={profile.user_id} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void saveProfile({ first_name: String(form.get('first_name')).trim(), last_name: String(form.get('last_name')).trim(), birthday: String(form.get('birthday')) || null, bio: String(form.get('bio')).trim() || null }); }} className="border border-gold/40 p-5">
      <h2 className="font-display text-xl">Your profile</h2><p className="mt-2 text-sm text-umber/60">Save your birthday before staff activate an age-restricted membership.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label>First name<input className={input} name="first_name" required defaultValue={profile.first_name}/></label><label>Last name<input className={input} name="last_name" required defaultValue={profile.last_name}/></label><label>Birthday<input className={input} type="date" name="birthday" max={new Date().toISOString().slice(0,10)} defaultValue={profile.birthday ?? ''}/></label><label>Bio<textarea className={input} name="bio" maxLength={180} defaultValue={profile.bio ?? ''}/></label></div>
      <button disabled={busy} className="mt-4 bg-rust px-4 py-2 text-cream disabled:opacity-50">Save profile</button>
    </form>}
  </div>;
}

