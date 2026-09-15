import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { ArrowLeftIcon, CheckCircle2Icon, LockKeyholeIcon, XIcon } from 'lucide-react';

type AccountMode = 'login' | 'preregister';

export function AccountDialog({ mode, onClose }: { mode: AccountMode | null; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSubmitted(false);
    if (!mode) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [mode, onClose]);

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
              <div className="px-6 py-12 text-center"><CheckCircle2Icon className="mx-auto h-12 w-12 text-gold" /><h3 className="mt-4 font-display text-2xl font-900 text-umber">Request recorded locally</h3><p className="mx-auto mt-2 max-w-sm font-body text-sm leading-6 text-umber/65">The database connection is not active yet. Your form is ready for Supabase integration by the backend team.</p><button type="button" onClick={onClose} className="tb-cut-sm mt-7 border border-rust bg-rust px-6 py-3 font-display text-xs font-800 uppercase tracking-[0.14em] text-cream">Return to archive</button></div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-5 px-6 py-6">
                {mode === 'preregister' && <div className="border border-gold/35 bg-parch/35 p-4 font-body text-sm leading-6 text-umber/75"><strong className="text-umber">Physical card activation:</strong> pre-register here, then visit the Tankobonbon location with valid ID. Staff will create and link your physical library card.</div>}
                {mode === 'preregister' && <Field label="Full name" name="fullName" placeholder="Your name" />}
                <Field label={mode === 'login' ? 'Physical card / member ID' : 'Email address'} name="identity" type={mode === 'login' ? 'text' : 'email'} placeholder={mode === 'login' ? 'e.g. TB-000124' : 'you@example.com'} />
                {mode === 'preregister' && <Field label="Contact number (optional)" name="phone" placeholder="09xx xxx xxxx" required={false} />}
                <Field label="Password" name="password" type="password" placeholder="Enter your password" />
                {mode === 'preregister' && <label className="flex gap-2 font-body text-xs leading-5 text-umber/70"><input type="checkbox" required className="mt-1 accent-rust" />I understand that account activation happens in person after my physical card is issued.</label>}
                <button type="submit" className="tb-cut-sm flex w-full items-center justify-center gap-2 bg-rust px-5 py-3 font-display text-sm font-800 uppercase tracking-[0.12em] text-cream transition hover:bg-umber"><LockKeyholeIcon className="h-4 w-4" />{mode === 'login' ? 'Continue to archive' : 'Save pre-registration'}</button>
                <button type="button" onClick={onClose} className="mx-auto flex items-center gap-1 font-body text-xs font-700 text-umber/55 hover:text-rust"><ArrowLeftIcon className="h-3 w-3" />Back</button>
              </form>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}

function Field({ label, name, type = 'text', placeholder, required = true }: { label: string; name: string; type?: string; placeholder: string; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block font-body text-xs font-800 uppercase tracking-[0.14em] text-umber/70">{label}</span><input name={name} type={type} placeholder={placeholder} required={required} className="tb-cut-sm h-11 w-full border border-gold/50 bg-parch/20 px-3 font-body text-sm text-umber outline-none transition placeholder:text-umber/35 focus:border-rust focus:ring-2 focus:ring-gold/20" /></label>;
}
