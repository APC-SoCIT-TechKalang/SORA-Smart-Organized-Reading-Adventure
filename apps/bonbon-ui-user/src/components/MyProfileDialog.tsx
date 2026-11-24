import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpenIcon, CalendarDaysIcon, Clock3Icon, CreditCardIcon, HistoryIcon, XIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useGame } from '../contexts/GameContext';
import { summarizeReading, type StatsBook, type StatsPeriod, type StatsSession } from '../lib/reading-stats';
import { OrnatePanel } from './OrnatePanel';

interface MyProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenReadingStats: () => void;
  onOpenDigitalCard: () => void;
}

const books: StatsBook[] = [];
const sessions: StatsSession[] = [];
const duration = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function MyProfileDialog({ open, onClose, onOpenReadingStats, onOpenDigitalCard }: MyProfileDialogProps) {
  const { session, profile, rank } = useGame();
  const [period, setPeriod] = useState<StatsPeriod>('30');
  const [now] = useState(() => new Date());
  const displayName = profile?.first_name || session?.user.user_metadata?.first_name || 'Reader';
  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : displayName;
  const stats = summarizeReading(sessions, books, period, now);
  const cards = [
    { label: 'Reading time', value: duration(stats.totalMinutes), icon: Clock3Icon, detail: 'From completed sessions' },
    { label: 'Sessions completed', value: stats.completed, icon: HistoryIcon, detail: 'Every visit adds a chapter' },
    { label: 'Titles explored', value: stats.titles, icon: BookOpenIcon, detail: 'Unique titles across sessions' },
    { label: 'Days spent reading', value: stats.activeDays, icon: CalendarDaysIcon, detail: 'A little reading goes a long way' },
  ];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [open, onClose]);

  return createPortal(<AnimatePresence>{open && <motion.div className="fixed inset-0 z-[100] flex items-end justify-center bg-umber/75 p-0 backdrop-blur-md sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <motion.section role="dialog" aria-modal="true" aria-labelledby="my-profile-title" className="relative max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border-2 border-gold bg-cream shadow-[0_24px_80px_rgba(67,39,20,.38)] sm:tb-cut-lg sm:max-h-[min(900px,calc(100vh-2rem))] sm:rounded-none" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <header className="sticky top-0 z-20 flex items-start justify-between border-b border-gold/40 bg-umber px-5 py-5 text-cream sm:px-7"><div><p className="font-body text-[10px] font-800 uppercase tracking-[.28em] text-sun">Tankobonbon account</p><h2 id="my-profile-title" className="mt-1 font-display text-2xl font-900 uppercase tracking-[.06em]">My profile</h2></div><button type="button" aria-label="Close my profile" onClick={onClose} className="rounded-full p-2 text-sun transition hover:bg-cream/10"><XIcon /></button></header>
      <div className="space-y-8 p-4 sm:p-7">
        <section aria-labelledby="profile-card-title" className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="tb-eyebrow">Your library identity</p><h3 id="profile-card-title" className="mt-1 font-display text-2xl font-900">Digital library card</h3></div><button type="button" onClick={onOpenDigitalCard} className="tb-button-secondary tb-cut-sm min-h-10 px-3 text-xs">Open full card</button></div>
          <article className="relative mx-auto aspect-[1.62/1] w-full max-w-2xl overflow-hidden rounded-2xl border border-gold/40 shadow-[0_18px_36px_rgba(64,43,29,.2)]"><img src="/digital-card-front-art-v1.png" alt="" className="absolute inset-0 h-full w-full object-cover" /><div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,25,12,.58)_0%,rgba(43,25,12,.06)_39%,rgba(43,25,12,.12)_57%,rgba(43,25,12,.82)_100%)]" /><div className="relative z-10 flex h-full flex-col justify-between p-4 text-white sm:p-6"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg border border-[#f9d219]/40 bg-[#f9d219]/10"><BookOpenIcon className="h-5 w-5 text-[#f9d219]" /></span><div><p className="font-display text-sm font-900 uppercase tracking-[.08em]">Tankobonbon</p><p className="text-[8px] font-800 uppercase tracking-[.18em] text-[#f9d219]">Digital reader card</p></div></div><div className="rounded-xl border border-white/20 bg-[#402615]/80 p-3 backdrop-blur-md sm:p-4"><p className="text-[8px] font-800 uppercase tracking-[.2em] text-[#f9d219]">Reader</p><p className="mt-1 break-words font-display text-base font-900 uppercase sm:text-xl">{fullName}</p><div className="mt-2 flex justify-between border-t border-[#f3d793]/25 pt-2 text-xs"><span className="text-[#f3d793]/70">Reader rank</span><strong>{rank}</strong></div></div></div></article>
          <div className="rounded-xl border border-gold/25 bg-white/60 p-4 text-sm text-umber/70"><CreditCardIcon className="mb-2 h-5 w-5 text-rust" /><p>Your digital library card is ready. Open the full card to flip it and scan the kiosk QR code.</p></div>
        </section>
        <section aria-labelledby="profile-stats-title" className="border-t border-gold/25 pt-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="tb-eyebrow">Your reading adventure</p><h3 id="profile-stats-title" className="mt-1 font-display text-2xl font-900">My reading journal</h3><p className="mt-2 text-sm text-umber/65">See where your library visits have taken you.</p></div><div className="flex items-end gap-3"><label className="flex flex-col gap-2 text-xs font-800 uppercase tracking-wider">Time period<select className="tb-input min-h-11 rounded-lg px-3 py-2 text-sm normal-case tracking-normal" value={period} onChange={event => setPeriod(event.target.value as StatsPeriod)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label><button type="button" onClick={onOpenReadingStats} className="tb-button-secondary tb-cut-sm min-h-11 px-3 text-xs">Open full stats</button></div></div>
          <section aria-label="Personal reading statistics" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon, detail }) => <OrnatePanel key={label} className="tb-cut-sm"><div className="p-4"><Icon aria-hidden="true" className="mb-3 h-5 w-5 text-rust" /><p className="text-xs font-800 text-umber/65">{label}</p><p className="mt-2 break-words font-display text-2xl font-900">{value}</p><p className="mt-2 text-xs leading-5 text-umber/60">{detail}</p></div></OrnatePanel>)}</section>
          {stats.completed === 0 && <section className="tb-state tb-cut-sm mt-5"><BookOpenIcon aria-hidden="true" className="mx-auto h-8 w-8 text-gold" /><h4 className="mt-3 font-display text-xl font-800">Reading stats are being prepared</h4><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-umber/65">Your reading activity will appear here once your history is connected.</p></section>}
        </section>
      </div>
    </motion.section>
  </motion.div>}</AnimatePresence>, document.body);
}
