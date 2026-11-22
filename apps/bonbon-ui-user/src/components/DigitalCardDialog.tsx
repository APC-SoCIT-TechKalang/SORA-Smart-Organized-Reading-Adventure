import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, CreditCardIcon, RadioIcon, XIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

interface DigitalCardDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DigitalCardDialog({ open, onClose }: DigitalCardDialogProps) {
  const { session, profile, rank } = useGame();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!open || !userId || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, userId]);

  if (!open || !session) return null;

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : session.user.email || 'Reader';

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="digital-card-title"
      aria-describedby="digital-card-description"
      onCancel={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-gold/40 bg-cream p-0 text-umber shadow-[0_24px_80px_rgba(67,39,20,.38)] backdrop:bg-umber/75 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="tb-eyebrow">Tankobonbon account</p>
            <h2 id="digital-card-title" className="mt-2 font-display text-2xl font-900">My digital card</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close digital card" className="tb-button-secondary flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <XIcon aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="relative mt-6 overflow-hidden rounded-2xl border border-gold/60 bg-umber p-5 text-cream shadow-lg sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-sun/20" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border border-sun/20" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BookOpenIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-sun" />
                <div>
                  <p className="font-display text-sm font-800 uppercase tracking-wider sm:text-base">Tankobonbon</p>
                  <p className="mt-1 text-[10px] font-700 uppercase tracking-[.16em] text-sun">Digital reader card</p>
                </div>
              </div>
              <span className="rounded-full border border-sun/40 px-2.5 py-1 text-[10px] font-800 uppercase tracking-wider text-sun">Draft</span>
            </div>

            <div className="my-7 flex items-center justify-between gap-4">
              <CreditCardIcon aria-hidden="true" className="h-10 w-10 text-sun/80" strokeWidth={1} />
              <RadioIcon aria-hidden="true" className="h-8 w-8 text-sun/60" strokeWidth={1.5} />
            </div>

            <p className="text-[10px] font-700 uppercase tracking-[.18em] text-sun">Reader</p>
            <p className="mt-1 break-words font-display text-xl font-800 sm:text-2xl">{fullName}</p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-sun/25 pt-4 text-xs">
              <span className="text-cream/80">{profile ? `Reader rank ${rank}` : 'Reader account'}</span>
              <span className="font-700 text-sun">NFC not connected</span>
            </div>
          </div>
        </div>

        <p id="digital-card-description" className="mt-5 text-sm leading-6 text-umber/75">This is a preview of your digital reader card. Tap-to-login is being prepared; this card cannot sign you into the kiosk yet.</p>

        <dl className="mt-5 divide-y divide-gold/20 rounded-xl border border-gold/25 bg-parch/15 px-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-umber/65">Card status</dt><dd className="font-800">Not issued</dd></div>
          <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-umber/65">Kiosk tap login</dt><dd className="font-800">Not connected</dd></div>
        </dl>
        <button type="button" disabled className="tb-button-secondary tb-cut-sm mt-5 min-h-12 w-full justify-center px-4 py-3 text-sm opacity-60">
          <RadioIcon aria-hidden="true" className="h-4 w-4" />NFC login coming soon
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
