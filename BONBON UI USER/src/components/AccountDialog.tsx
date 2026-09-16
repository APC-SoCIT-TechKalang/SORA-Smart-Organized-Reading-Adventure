import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ArrowLeftIcon, CheckCircle2Icon, LockKeyholeIcon, XIcon } from 'lucide-react';
import { database, errorMessage } from '../lib/supabase';
import { useGame } from '../contexts/GameContext';

type AccountMode = 'login' | 'preregister';

export function AccountDialog({ mode, onClose }: { mode: AccountMode | null; onClose: () => void }) {
  const { signIn, session } = useGame();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('identity')).trim();
    const password = String(form.get('password'));
    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email) nextFieldErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextFieldErrors.email = 'Please enter a valid email address.';
    if (!password) nextFieldErrors.password = 'Password is required.';
    else if (mode === 'preregister' && password.length < 8) nextFieldErrors.password = 'Use at least 8 characters for your password.';
    setFieldErrors(nextFieldErrors);
    setError('');
    if (Object.keys(nextFieldErrors).length) return;
    setBusy(true);
    try {
      const credentials = { email, password };
      if (mode === 'login') {
        const result = await signIn(credentials.email, credentials.password);
        if (!result.ok) { setError(result.error); return; }
        onClose();
        return;
      } else {
        const { data, error } = await database().auth.signUp({ ...credentials, options: {
          emailRedirectTo: window.location.origin,
          data: { first_name: String(form.get('firstName')).trim(), last_name: String(form.get('lastName')).trim() },
        } });
        if (error) throw error;
        setSuccess(data.session ? 'Account created. Save your birthday in My Shelf, then visit staff to activate your membership and physical card.' : 'Check your email to confirm your registration. After confirmation, sign in, save your birthday in My Shelf, and visit staff for membership activation.');
      }
      setSubmitted(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setSubmitted(false);
    setError('');
    setSuccess('');
    setFieldErrors({});
    if (!mode) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [mode, onClose]);

  useEffect(() => {
    if (mode === 'login' && session) onClose();
  }, [mode, onClose, session]);

  return createPortal(
    <AnimatePresence>
      {mode && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-umber/70 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="account-title" className="tb-cut-lg relative w-full max-w-lg overflow-hidden border-2 border-gold bg-cream shadow-[0_24px_80px_rgba(67,39,20,0.38)]" initial={{ y: 24, scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
            <div className="flex items-center justify-between border-b border-gold/40 bg-umber px-6 py-5 text-cream">
              <div><p className="font-body text-[10px] font-800 uppercase tracking-[0.28em] text-sun">Tankobonbon account</p><h2 id="account-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[0.06em]">{mode === 'login' ? 'Welcome back' : 'Pre-register'}</h2></div>
              <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button>
            </div>
            {submitted ? (
              <div className="px-6 py-12 text-center"><CheckCircle2Icon className="mx-auto h-12 w-12 text-gold" /><h3 className="mt-4 font-display text-2xl font-900 text-umber">Account update</h3><p className="mx-auto mt-2 max-w-sm font-body text-sm leading-6 text-umber/65">{success}</p><button type="button" onClick={onClose} className="tb-cut-sm mt-7 border border-rust bg-rust px-6 py-3 font-display text-xs font-800 uppercase tracking-[0.14em] text-cream">Return to archive</button></div>
            ) : (
              <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-5 px-6 py-6">
                {mode === 'preregister' && <div className="border border-gold/35 bg-parch/35 p-4 font-body text-sm leading-6 text-umber/75"><strong className="text-umber">Physical card activation:</strong> pre-register here, then visit the Tankobonbon location with valid ID. Staff will create and link your physical library card.</div>}
                {mode === 'preregister' && <><Field label="First name" name="firstName" placeholder="First name" /><Field label="Last name" name="lastName" placeholder="Last name" /></>}
                <Field label="Email address" name="identity" type="email" placeholder="you@example.com" autoFocus error={fieldErrors.email} onInput={() => setFieldErrors((current) => ({ ...current, email: undefined }))} />
                
                <Field label="Password" name="password" type="password" placeholder="Enter your password" error={fieldErrors.password} onInput={() => setFieldErrors((current) => ({ ...current, password: undefined }))} />
                {mode === 'preregister' && <label className="flex gap-2 font-body text-xs leading-5 text-umber/70"><input type="checkbox" required className="mt-1 accent-rust" />I understand that account activation happens in person after my physical card is issued.</label>}
                {error && <p role="alert" className="tb-cut-sm border border-rust/35 bg-rust/10 px-3 py-2.5 text-sm leading-5 text-rust">{error}</p>}<button disabled={busy} type="submit" className="tb-cut-sm flex w-full items-center justify-center gap-2 bg-rust px-5 py-3 font-display text-sm font-800 uppercase tracking-[0.12em] text-cream transition hover:bg-umber disabled:cursor-wait disabled:opacity-70"><LockKeyholeIcon className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />{busy ? (mode === 'login' ? 'Signing in…' : 'Saving…') : mode === 'login' ? 'Sign in' : 'Save pre-registration'}</button>
                <button type="button" onClick={onClose} className="mx-auto flex items-center gap-1 font-body text-xs font-700 text-umber/55 hover:text-rust"><ArrowLeftIcon className="h-3 w-3" />Back</button>
              </form>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}

function Field({ label, name, type = 'text', placeholder, required = true, autoFocus = false, error, onInput }: { label: string; name: string; type?: string; placeholder: string; required?: boolean; autoFocus?: boolean; error?: string; onInput?: () => void }) {
  const errorId = `${name}-error`;
  return <label className="block"><span className="mb-1.5 block text-xs font-800 text-umber/70">{label}</span><input name={name} type={type} autoFocus={autoFocus} onInput={onInput} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} minLength={type === 'password' ? 8 : undefined} placeholder={placeholder} required={required} className={`tb-input tb-cut-sm h-11 w-full px-3 text-sm placeholder:text-umber/35 ${error ? 'border-rust bg-rust/5' : ''}`} />{error && <span id={errorId} className="mt-1.5 block text-xs font-700 text-rust">{error}</span>}</label>;
}
