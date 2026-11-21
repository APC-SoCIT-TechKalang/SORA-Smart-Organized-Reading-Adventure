import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { InfoIcon, SparklesIcon, TrophyIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

const ICONS = {
  reward: SparklesIcon,
  info: InfoIcon,
  level: TrophyIcon
};

export function ToastStack() {
  const { toasts, dismissToast } = useGame();

  useEffect(() => {
    const timers = toasts.map((toast) => window.setTimeout(() => dismissToast(toast.id), 3500));
    return () => timers.forEach(window.clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-20 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="tb-cut-sm pointer-events-auto flex items-center gap-3 border border-gold bg-cream px-4 py-3 shadow-plate">
              
              <span
                className={`flex h-9 w-9 shrink-0 rotate-45 items-center justify-center border border-gold ${
                toast.kind === 'level' ? 'bg-rust' : 'bg-sun'}`
                }>
                
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 -rotate-45 ${
                  toast.kind === 'level' ? 'text-sand' : 'text-umber'}`
                  } />
                
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[13px] font-700 uppercase tracking-[0.12em] text-umber">
                  {toast.title}
                </span>
                <span className="block truncate font-body text-[12px] font-600 text-umber/65">
                  {toast.detail}
                </span>
              </span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="text-umber/40 transition-colors duration-150 ease-out hover:text-rust">
                
                <XIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </motion.div>);

        })}
      </AnimatePresence>
    </div>);

}
