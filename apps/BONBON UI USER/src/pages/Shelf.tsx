import { BookOpenIcon, HistoryIcon, UserRoundIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGame } from '../contexts/GameContext';
import { GuestPrompt } from '../components/GuestPrompt';
import { OrnatePanel, SectionHeading } from '../components/OrnatePanel';

export function Shelf() {
  const { session, profile, logs, volumeById, giveBack, busy, saveProfile } = useGame();
  if (!session) return <div className="space-y-6"><SectionHeading title="My shelf" meta="Reading activity" /><GuestPrompt title="Keep your reading adventure together" detail="Sign in to view active reading sessions, your history, membership details, and earned library points." /></div>;

  const active = logs.filter((log) => !log.returned_at);
  const history = logs.filter((log) => log.returned_at).slice().reverse();
  const input = 'tb-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm font-600';

  return (
    <div className="space-y-8">
      <SectionHeading title="My shelf" meta="In-library reading" />
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="tb-eyebrow">Current reading</p><h2 className="mt-1 font-display text-xl font-900 text-umber sm:text-2xl">Active sessions</h2></div><p className="text-xs font-700 text-umber/55">{active.length} in progress</p></div>
        {active.length === 0 ? (
          <div className="tb-state tb-cut-sm"><BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" /><h3 className="mt-3 font-display text-lg font-800 text-umber">Your shelf is clear</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-umber/60">Choose an available book from the catalog when you are ready to begin an in-library reading session.</p></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">{active.map((log) => { const volume = volumeById(String(log.book_id)); return <OrnatePanel key={log.reading_log_id} as="article" className="tb-cut-sm"><div className="p-5"><p className="tb-eyebrow">Reading now</p><h3 className="mt-1 font-display text-xl font-800 text-umber">{volume?.title ?? `Book #${log.book_id}`}</h3><p className="mt-2 text-xs font-600 text-umber/55">Started {new Date(log.started_at).toLocaleString()}</p><p className="mt-4 border-t border-gold/25 pt-4 text-sm leading-6 text-umber/65">Finish your session when the book is ready for the return cart.</p><button type="button" disabled={busy} onClick={() => void giveBack(String(log.book_id))} className="tb-button-primary tb-cut-sm mt-4 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">Finish reading</button></div></OrnatePanel>; })}</div>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center gap-2"><HistoryIcon aria-hidden="true" className="h-5 w-5 text-gold" /><h2 className="font-display text-xl font-800 text-umber">Reading history</h2></div>
          <OrnatePanel as="section" className="tb-cut-sm"><div className="divide-y divide-gold/20">{history.length ? history.map((log) => <div key={log.reading_log_id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><h3 className="truncate font-display text-sm font-700 text-umber sm:text-base">{volumeById(String(log.book_id))?.title ?? `Book #${log.book_id}`}</h3><p className="mt-1 text-xs font-600 text-umber/55">Completed {new Date(log.returned_at ?? '').toLocaleDateString()}</p></div><span className="shrink-0 rounded-full bg-parch/30 px-2.5 py-1 text-xs font-800 text-rust">{log.total_reading_minutes ?? 0} min</span></div>) : <div className="px-5 py-10 text-center text-sm text-umber/55">Completed sessions will appear here.</div>}</div></OrnatePanel>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2"><UserRoundIcon aria-hidden="true" className="h-5 w-5 text-gold" /><h2 className="font-display text-xl font-800 text-umber">Your profile</h2></div>
          {profile ? (
            <OrnatePanel as="section" className="tb-cut-sm"><form key={profile.user_id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void saveProfile({ first_name: String(form.get('first_name')).trim(), last_name: String(form.get('last_name')).trim(), birthday: String(form.get('birthday')) || null, bio: String(form.get('bio')).trim() || null }); }} className="p-5"><p className="text-sm leading-6 text-umber/60">Keep your details current. Your birthday is used only when staff review age-restricted access.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="First name"><input className={input} name="first_name" required defaultValue={profile.first_name} /></Field><Field label="Last name"><input className={input} name="last_name" required defaultValue={profile.last_name} /></Field><Field label="Birthday"><input className={input} type="date" name="birthday" max={new Date().toISOString().slice(0, 10)} defaultValue={profile.birthday ?? ''} /></Field><Field label="About you"><textarea className={`${input} min-h-24 resize-y`} name="bio" maxLength={180} defaultValue={profile.bio ?? ''} /></Field></div><button disabled={busy} className="tb-button-primary tb-cut-sm mt-5 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">{busy ? 'Saving…' : 'Save profile'}</button></form></OrnatePanel>
          ) : (
            <OrnatePanel as="section" className="tb-cut-sm"><p className="p-5 text-sm leading-6 text-umber/60">Your member profile is still being prepared. Refresh in a moment or ask library staff for help.</p></OrnatePanel>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-800 text-umber/70">{label}{children}</label>;
}
