import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, QrCodeIcon, RotateCcwIcon, ShieldCheckIcon, XIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useGame } from '../contexts/GameContext';
import { createKioskQrPayload } from '../lib/kioskQr';

interface DigitalCardDialogProps {
  open: boolean;
  onClose: () => void;
}

type CardCredential = { qrPayload: string; error: string };
const emptyCredential: CardCredential = { qrPayload: '', error: '' };
type WakeLockSentinel = { release: () => Promise<void> };

export function DigitalCardDialog({ open, onClose }: DigitalCardDialogProps) {
  const { session, profile, rank, readerAccess } = useGame();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [credential, setCredential] = useState<CardCredential>(emptyCredential);
  const [loadingCard, setLoadingCard] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    if (!open || !userId || readerAccess !== 'active' || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, userId, readerAccess]);

  useEffect(() => {
    if (!open || !session || !profile || readerAccess !== 'active') return;
    let current = true;
    setFlipped(false);
    setCredential(emptyCredential);
    setLoadingCard(true);

    const loadCard = () => {
      try {
        if (current) setCredential({ qrPayload: createKioskQrPayload(session.user.id), error: '' });
      } catch (cause) {
        if (current) setCredential({ qrPayload: '', error: cause instanceof Error ? cause.message : 'Your QR login card could not be loaded.' });
      } finally {
        if (current) setLoadingCard(false);
      }
    };

    loadCard();
    return () => { current = false; };
  }, [open, profile, readerAccess, session]);

  useEffect(() => {
    if (!open || !flipped) return;
    let active = true;
    let wakeLock: WakeLockSentinel | null = null;
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    }).wakeLock;

    const keepScreenAwake = async () => {
      if (!wakeLockApi || document.visibilityState !== 'visible') return;
      try {
        const lock = await wakeLockApi.request('screen');
        if (active) wakeLock = lock;
        else await lock.release();
      } catch {
        // Wake Lock is optional and may be unavailable or denied by the browser.
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLock) void keepScreenAwake();
    };

    void keepScreenAwake();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) void wakeLock.release();
    };
  }, [flipped, open]);

  if (!open || !session || readerAccess !== 'active') return null;

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : session.user.email || 'Reader';
  const active = Boolean(credential.qrPayload);
  const flip = () => setFlipped(value => !value);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="digital-card-title"
      aria-describedby="digital-card-description"
      onCancel={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-[28px] border border-gold/40 bg-[#fffaf0] p-0 text-umber shadow-[0_30px_100px_rgba(46,25,12,.48)] backdrop:bg-umber/80 backdrop:backdrop-blur-md"
    >
      <div className="p-4 sm:p-7">
        <header className="flex items-start justify-between gap-4 px-1 sm:px-2">
          <div>
            <p className="tb-eyebrow">Tankobonbon account</p>
            <h2 id="digital-card-title" className="mt-2 font-display text-2xl font-900 sm:text-3xl">My digital card</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close digital card" className="tb-button-secondary flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <XIcon aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="digital-card-stage mt-5">
          <div
            className={`digital-card-flipper ${flipped ? 'is-flipped' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${flipped ? 'Show the front' : 'Show the QR code on the back'} of your digital reader card`}
            onClick={flip}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                flip();
              }
            }}
          >
            <article className="digital-card-face digital-card-front" aria-hidden={flipped}>
              <img src="/digital-card-front-art-v1.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,25,12,.58)_0%,rgba(43,25,12,.06)_39%,rgba(43,25,12,.12)_57%,rgba(43,25,12,.82)_100%)]" />
              <div className="relative z-10 flex h-full flex-col p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-[#402615]/75 px-3 py-2 shadow-lg backdrop-blur-md">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#f9d219]/40 bg-[#f9d219]/10 text-[#f9d219] sm:h-9 sm:w-9">
                      <BookOpenIcon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-xs font-900 uppercase tracking-[.08em] text-[#fff9eb] sm:text-sm">Tankobonbon</p>
                      <p className="mt-0.5 text-[7px] font-800 uppercase tracking-[.18em] text-[#f9d219] sm:text-[9px]">Digital reader card</p>
                    </div>
                  </div>
                  <span className={`rounded-full border bg-[#402615]/75 px-2.5 py-1 text-[8px] font-900 uppercase tracking-[.14em] shadow-lg backdrop-blur-md sm:text-[9px] ${active ? 'border-emerald-300/55 text-emerald-200' : 'border-[#f9d219]/45 text-[#f9d219]'}`}>
                    {loadingCard ? 'Linking' : active ? 'Active' : 'Unavailable'}
                  </span>
                </div>

                <div className="mt-3 sm:mt-4">
                  <EmvChip />
                </div>

                <div className="mt-auto rounded-xl border border-white/20 bg-[#402615]/80 p-3 shadow-xl backdrop-blur-md sm:p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[7px] font-800 uppercase tracking-[.2em] text-[#f9d219] sm:text-[8px]">Reader</p>
                      <p className="mt-0.5 break-words font-display text-base font-900 uppercase tracking-[.02em] text-white sm:text-xl">{fullName}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[7px] font-800 uppercase tracking-[.1em] text-[#f9d219] sm:text-[9px]">
                      <ShieldCheckIcon aria-hidden="true" className="h-4 w-4" /> Verified member
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#f3d793]/25 pt-2">
                    <span className="text-[7px] font-700 uppercase tracking-[.16em] text-[#f3d793]/70 sm:text-[8px]">Reader rank</span>
                    <strong className="font-display text-sm text-[#fff9eb] sm:text-base">{rank}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="digital-card-face digital-card-back" aria-hidden={!flipped}>
              <div aria-hidden="true" className="digital-card-back-pattern" />
              <div className="digital-card-back-layout relative z-10 grid h-full grid-cols-[minmax(120px,.72fr)_1.28fr] gap-2.5 p-3 sm:grid-cols-[minmax(170px,.76fr)_1.24fr] sm:gap-4 sm:p-5">
                <div className="digital-card-qr-panel flex min-w-0 flex-col rounded-xl border border-[#c4800c]/25 bg-white p-2 shadow-inner sm:p-3">
                  <div className="grid min-h-0 flex-1 place-items-center rounded-lg bg-white p-1.5 sm:p-2">
                    {credential.qrPayload ? (
                      <QRCodeSVG value={credential.qrPayload} level="H" marginSize={0} bgColor="#ffffff" fgColor="#321b0d" className="digital-card-qr h-auto w-full max-w-[155px]" title="Tankobonbon kiosk login QR code" />
                    ) : (
                      <div className="text-center text-[#543822]/55">
                        <QrCodeIcon aria-hidden="true" className="mx-auto h-12 w-12" />
                        <p className="mt-2 text-[9px] font-800 uppercase tracking-wider">{loadingCard ? 'Loading card' : 'QR unavailable'}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 border-t border-[#c4800c]/20 pt-1.5 text-center">
                    <p className="font-display text-[8px] font-900 uppercase tracking-[.12em] text-[#543822] sm:text-[9px]">Tankobonbon</p>
                    <p className="mt-0.5 text-[6px] font-800 uppercase tracking-[.12em] text-[#a33c12] sm:text-[7px]">Scan to log in</p>
                    <p className="mt-1 text-[6px] leading-2.5 text-[#543822]/65 sm:text-[7px] sm:leading-3">Open the kiosk, choose <strong>Scan digital card</strong>, then hold this QR code inside the frame.</p>
                  </div>
                </div>
                <div className="digital-card-back-details flex min-w-0 flex-col rounded-xl border border-white/70 bg-[#fffdf8]/95 p-2.5 text-[#543822] shadow-sm sm:p-3.5">
                  <div className="flex items-center gap-2 border-b border-[#c4800c]/25 pb-2">
                    <ShieldCheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#a33c12]" />
                    <p className="text-[9px] font-900 uppercase tracking-[.13em] sm:text-[11px]">Digital library card</p>
                  </div>
                  {credential.error ? (
                    <p role="alert" className="mt-3 text-[10px] leading-4 text-[#a33c12] sm:text-xs">{credential.error}</p>
                  ) : (
                    <ul className="mt-2.5 list-disc space-y-1 pl-4 text-[8px] leading-3.5 text-[#543822]/85 sm:mt-3 sm:space-y-1.5 sm:pl-5 sm:text-[10px] sm:leading-4">
                      <li>This card is for the registered member only and is non-transferable.</li>
                      <li>The library card itself does not expire. Topped-up credits are non-refundable and expire according to current library rules. A fee may be charged for a replacement or reprint.</li>
                      <li>Present this card when using the library.</li>
                      <li>Visit the library to return or report this card if lost.</li>
                      <li>For more information about the library card, see the Guidebook on our website.</li>
                    </ul>
                  )}
                  <div className="mt-auto border-t border-[#c4800c]/25 pt-2 text-[8px] leading-3.5 text-[#543822]/75 sm:pt-2.5 sm:text-[9px] sm:leading-4">
                    <p className="font-800">tankobonbon.com · library@tankobonbon.com</p>
                    <p>2F, Leftmost Unit, Infront of Salawag Brgy. Hall,<br />Molino-Paliparan Rd., Brgy. Salawag,<br />Dasmariñas City, Cavite, Philippines</p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        <button type="button" onClick={flip} className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-[#c4800c]/35 bg-white/70 px-4 py-2 text-xs font-800 text-[#543822] shadow-sm transition hover:-translate-y-0.5 hover:bg-white">
          <RotateCcwIcon aria-hidden="true" className="h-4 w-4" />
          {flipped ? 'View card front' : 'Flip to scan QR code'}
        </button>

        <p id="digital-card-description" className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-umber/70">
          {active ? 'Your active digital reader card can sign you in at the library kiosk. Flip the card and scan its QR code.' : loadingCard ? 'Securely linking your active library card…' : 'Your digital card is visible, but QR login needs an active library card issued by staff.'}
        </p>

        <div className="mt-4 grid gap-2 rounded-xl border border-gold/25 bg-white/55 p-3 text-xs sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"><span className="text-umber/60">Card status</span><strong>{active ? 'Active' : loadingCard ? 'Checking' : 'Action needed'}</strong></div>
          <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"><span className="text-umber/60">Kiosk login</span><strong className={active ? 'text-emerald-700' : ''}>{active ? 'QR ready' : 'Unavailable'}</strong></div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

function EmvChip() {
  return <div aria-label="Digital card chip" className="relative h-10 w-14 overflow-hidden rounded-lg border border-[#ffe66a]/70 bg-[linear-gradient(135deg,#f9d219,#c4800c_48%,#f3d793)] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_4px_12px_rgba(0,0,0,.18)]">
    <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#7c521d]/45" />
    <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#7c521d]/45" />
    <span className="absolute left-1/2 top-1/2 h-4 w-6 -translate-x-1/2 -translate-y-1/2 rounded border border-[#7c521d]/55" />
  </div>;
}
