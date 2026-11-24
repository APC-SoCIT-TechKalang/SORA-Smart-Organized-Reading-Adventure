import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3Icon, CreditCardIcon, XIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useGame } from '../contexts/GameContext';

interface MyProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenReadingStats: () => void;
  onOpenDigitalCard: () => void;
}

export function MyProfileDialog({ open, onClose, onOpenReadingStats, onOpenDigitalCard }: MyProfileDialogProps) {
  const { session, profile, rank, coins } = useGame();
  const displayName = profile?.first_name || session?.user.user_metadata?.first_name || 'Reader';
  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : displayName;

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

  return createPortal(
    <AnimatePresence>
      {open && <motion.div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={event => event.target === event.currentTarget && onClose()}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-profile-title"
          className="relative w-full max-w-lg rounded-t-2xl border-2 border-gold bg-cream shadow-[0_24px_80px_rgba(67,39,20,.38)] sm:tb-cut-lg sm:rounded-none"
          initial={{ y: 24, scale: .97 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 18, scale: .97 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <header className="flex items-start justify-between border-b border-gold/40 bg-umber px-5 py-5 text-cream sm:px-6">
            <div>
              <p className="font-body text-[10px] font-800 uppercase tracking-[.28em] text-sun">Tankobonbon account</p>
              <h2 id="my-profile-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[.06em]">My profile</h2>
            </div>
            <button type="button" aria-label="Close my profile" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button>
          </header>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-xl border border-gold/30 bg-white/60 p-4">
              <p className="font-display text-lg font-900 text-umber">{fullName}</p>
              <p className="mt-1 truncate text-sm text-umber/60">{session?.user.email}</p>
              <p className="mt-3 text-xs font-800 text-rust">Rank {rank} · {coins} library points</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileAction icon={BarChart3Icon} label="Reading stats" description="See your reading adventure" onClick={onOpenReadingStats} />
              <ProfileAction icon={CreditCardIcon} label="Digital card" description="Show your library card" onClick={onOpenDigitalCard} />
            </div>
          </div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>,
    document.body,
  );
}

function ProfileAction({ icon: Icon, label, description, onClick }: { icon: typeof BarChart3Icon; label: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-24 flex-col items-start justify-between rounded-xl border border-gold/30 bg-white/65 p-4 text-left transition hover:-translate-y-0.5 hover:border-rust/50 hover:bg-parch/35">
    <Icon aria-hidden="true" className="h-5 w-5 text-rust" />
    <span><span className="block text-sm font-900 text-umber">{label}</span><span className="mt-1 block text-xs text-umber/60">{description}</span></span>
  </button>;
}
