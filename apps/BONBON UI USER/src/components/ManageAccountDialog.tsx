import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { CheckCircle2Icon, KeyRoundIcon, LogOutIcon, UserRoundIcon, XIcon } from 'lucide-react';
import { database, errorMessage } from '../lib/supabase';
import { useGame } from '../contexts/GameContext';

interface ManageAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageAccountDialog({ open, onClose }: ManageAccountDialogProps) {
  const { session, profile, rank, coins, saveProfile, signOut, busy } = useGame();
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setPasswordMessage('');
      setPasswordError('');
      setProfileMessage('');
      setProfileError('');
    }
  }, [open]);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextPassword = String(form.get('newPassword'));
    const confirmPassword = String(form.get('confirmPassword'));
    setPasswordMessage('');
    setPasswordError('');
    if (nextPassword.length < 8) {
      setPasswordError('Use at least 8 characters for your new password.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await database().auth.updateUser({ password: nextPassword });
      if (error) throw error;
      event.currentTarget.reset();
      setPasswordMessage('Password updated successfully.');
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileMessage('');
    setProfileError('');
    setProfileBusy(true);
    try {
      const saved = await saveProfile({
        first_name: String(form.get('firstName')).trim(),
        last_name: String(form.get('lastName')).trim(),
        birthday: String(form.get('birthday')) || null,
        bio: String(form.get('bio')).trim() || null,
      });
      if (!saved) throw new Error('Your profile could not be saved.');
      setProfileMessage('Profile details saved.');
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setProfileBusy(false);
    }
  }

  if (!open || !session) return null;
  const inputClass = 'tb-input tb-cut-sm mt-1.5 h-10 w-full px-3 text-sm placeholder:text-umber/35';

  return createPortal(
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/75 backdrop-blur-md sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <motion.section role="dialog" aria-modal="true" aria-labelledby="manage-account-title" className="relative max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border-2 border-gold bg-cream pb-[env(safe-area-inset-bottom)] shadow-[0_24px_80px_rgba(67,39,20,.38)] sm:tb-cut-lg sm:max-h-[min(850px,calc(100vh-2rem))] sm:rounded-none sm:pb-0" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gold/40 bg-umber px-4 py-4 text-cream sm:px-6 sm:py-5">
            <div><p className="font-body text-[10px] font-800 uppercase tracking-[.28em] text-sun">Tankobonbon account</p><h2 id="manage-account-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[.06em]">Manage account</h2><p className="mt-1 text-xs text-sand/70">Keep your archive identity and access details up to date.</p></div>
            <button type="button" aria-label="Close manage account" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[.85fr_1.15fr]">
            <aside className="space-y-4">
              <div className="tb-cut-sm border border-gold/40 bg-parch/25 p-5">
                <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-umber font-display text-lg font-900 text-sun">{(profile?.first_name || session.user.email || 'R').slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="font-display text-lg font-800 text-umber">{profile?.first_name || 'Reader'} {profile?.last_name || ''}</p><p className="truncate text-xs font-600 text-umber/55">{session.user.email}</p></div></div>
                <div className="mt-5 grid grid-cols-2 gap-2"><AccountStat label="Rank" value={rank} /><AccountStat label="Points" value={String(coins)} /></div>
              </div>
              <div className="border border-gold/25 bg-cream/70 p-4 text-xs leading-5 text-umber/60"><p className="flex items-center gap-2 font-800 uppercase tracking-[.12em] text-gold"><CheckCircle2Icon className="h-4 w-4" />Account security</p><p className="mt-2">Your sign-in is protected by the Tankobonbon account system. Update your password regularly and keep your email accessible.</p></div>
              <button type="button" disabled={busy} onClick={() => void signOut()} className="tb-button-secondary tb-cut-sm w-full px-4 py-2.5 font-display text-xs uppercase tracking-[.11em] text-rust"><LogOutIcon className="h-4 w-4" />Sign out</button>
            </aside>

            <div className="space-y-5">
              <form onSubmit={updateProfile} className="tb-ornate-panel tb-cut-sm p-5">
                <div className="flex items-center gap-2"><UserRoundIcon className="h-4 w-4 text-gold" /><h3 className="font-display text-base font-800 uppercase tracking-[.08em] text-umber">Profile details</h3></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="First name"><input className={inputClass} name="firstName" required defaultValue={profile?.first_name ?? ''} /></Field><Field label="Last name"><input className={inputClass} name="lastName" required defaultValue={profile?.last_name ?? ''} /></Field><Field label="Birthday"><input className={inputClass} type="date" name="birthday" max={new Date().toISOString().slice(0, 10)} defaultValue={profile?.birthday ?? ''} /></Field><Field label="About you"><textarea className={`${inputClass} min-h-20 resize-y py-2`} name="bio" maxLength={180} defaultValue={profile?.bio ?? ''} /></Field></div>
                {profileError && <p role="alert" className="mt-3 text-xs font-700 text-rust">{profileError}</p>}{profileMessage && <p className="mt-3 text-xs font-700 text-emerald-700">{profileMessage}</p>}
                <button type="submit" disabled={profileBusy || busy} className="tb-button-primary tb-cut-sm mt-4 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">{profileBusy ? 'Saving…' : 'Save profile'}</button>
              </form>

              <form onSubmit={updatePassword} className="tb-ornate-panel tb-cut-sm p-5"><div className="flex items-center gap-2"><KeyRoundIcon className="h-4 w-4 text-gold" /><h3 className="font-display text-base font-800 uppercase tracking-[.08em] text-umber">Change password</h3></div><p className="mt-2 text-xs leading-5 text-umber/55">Choose a new password with at least 8 characters.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="New password"><input className={inputClass} type="password" name="newPassword" minLength={8} required autoComplete="new-password" /></Field><Field label="Confirm password"><input className={inputClass} type="password" name="confirmPassword" minLength={8} required autoComplete="new-password" /></Field></div>{passwordError && <p role="alert" className="mt-3 text-xs font-700 text-rust">{passwordError}</p>}{passwordMessage && <p className="mt-3 text-xs font-700 text-emerald-700">{passwordMessage}</p>}<button type="submit" disabled={passwordBusy} className="tb-button-secondary tb-cut-sm mt-4 px-4 py-2.5 font-display text-xs uppercase tracking-[.1em]">{passwordBusy ? 'Updating…' : 'Update password'}</button></form>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-800 text-umber/70">{label}{children}</label>;
}

function AccountStat({ label, value }: { label: string; value: string }) {
  return <div className="border border-gold/25 bg-cream/70 px-3 py-2"><span className="block text-[9px] font-800 uppercase tracking-[.14em] text-gold">{label}</span><strong className="mt-0.5 block font-display text-lg font-900 text-umber">{value}</strong></div>;
}
