import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ArrowLeftIcon, LockKeyholeIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

export function AccountDialog({ mode, onClose }: { mode: 'login' | null; onClose: () => void }) {
  const { signIn } = useGame();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('identity')).trim();
    const password = String(form.get('password'));
    const nextErrors: { email?: string; password?: string } = {};
    if (!email) nextErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Please enter a valid email address.';
    if (!password) nextErrors.password = 'Password is required.';
    setFieldErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  }

  useEffect(() => {
    setError('');
    setFieldErrors({});
    if (!mode) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [mode, onClose]);

  return createPortal(<AnimatePresence>{mode && <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/70 backdrop-blur-md sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <motion.section role="dialog" aria-modal="true" aria-labelledby="account-title" className="relative max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border-2 border-gold bg-cream pb-[env(safe-area-inset-bottom)] shadow-[0_24px_80px_rgba(67,39,20,0.38)] sm:tb-cut-lg sm:max-h-[calc(100dvh-2rem)] sm:rounded-none sm:pb-0" initial={{ y: 24, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold/40 bg-umber px-4 py-4 text-cream sm:px-6 sm:py-5"><div><p className="font-body text-[10px] font-800 uppercase tracking-[0.28em] text-sun">Tankobonbon account</p><h2 id="account-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[0.06em]">Welcome back</h2></div><button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button></div>
      <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <Field label="Email address" name="identity" type="email" placeholder="you@example.com" autoFocus error={fieldErrors.email} onInput={() => setFieldErrors(current => ({ ...current, email: undefined }))} />
        <Field label="Password" name="password" type="password" placeholder="Enter your password" error={fieldErrors.password} onInput={() => setFieldErrors(current => ({ ...current, password: undefined }))} />
        <p className="text-xs leading-5 text-umber/55">Accounts are created by library staff.</p>
        {error && <p role="alert" className="tb-cut-sm border border-rust/35 bg-rust/10 px-3 py-2.5 text-sm leading-5 text-rust">{error}</p>}
        <button disabled={busy} type="submit" className="tb-cut-sm flex w-full items-center justify-center gap-2 bg-rust px-5 py-3 font-display text-sm font-800 uppercase tracking-[0.12em] text-cream transition hover:bg-umber disabled:cursor-wait disabled:opacity-70"><LockKeyholeIcon className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" onClick={onClose} className="mx-auto flex items-center gap-1 font-body text-xs font-700 text-umber/55 hover:text-rust"><ArrowLeftIcon className="h-3 w-3" />Back</button>
      </form>
    </motion.section>
  </motion.div>}</AnimatePresence>, document.body);
}

function Field({ label, name, type = 'text', placeholder, autoFocus = false, error, onInput }: { label: string; name: string; type?: string; placeholder: string; autoFocus?: boolean; error?: string; onInput?: () => void }) {
  const errorId = `${name}-error`;
  return <label className="block"><span className="mb-1.5 block text-xs font-800 text-umber/70">{label}</span><input name={name} type={type} autoFocus={autoFocus} onInput={onInput} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} placeholder={placeholder} required className={`tb-input tb-cut-sm h-11 w-full px-3 text-sm placeholder:text-umber/35 ${error ? 'border-rust bg-rust/5' : ''}`} />{error && <span id={errorId} className="mt-1.5 block text-xs font-700 text-rust">{error}</span>}</label>;
}
