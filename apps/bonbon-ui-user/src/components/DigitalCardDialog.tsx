import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpenIcon, QrCodeIcon, RotateCcwIcon, ShieldCheckIcon, SparklesIcon, XIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useGame } from '../contexts/GameContext';
import { database } from '../lib/supabase';
import { createKioskQrPayload } from '../lib/kioskQr';
import { usesReplacementSchema } from '../lib/replacement-library';

interface DigitalCardDialogProps {
  open: boolean;
  onClose: () => void;
}

type CardCredential = { qrPayload: string; error: string };
const emptyCredential: CardCredential = { qrPayload: '', error: '' };

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

    const loadCard = async () => {
      try {
        const result = usesReplacementSchema
          ? await database().schema('sora_v2').from('librarycard')
              .select('librarycard_rfid')
              .eq('user_id', profile.user_id)
              .eq('is_active', true)
              .is('deactivated_at', null)
              .not('librarycard_rfid', 'is', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : await database().from('library_cards')
              .select('rfid_uid')
              .eq('user_id', session.user.id)
              .eq('status', 'ACTIVE')
              .is('deactivated_at', null)
              .not('rfid_uid', 'is', null)
              .order('issued_at', { ascending: false })
              .limit(1)
              .maybeSingle();
        if (result.error) throw result.error;
        const row = result.data as { librarycard_rfid?: string | null; rfid_uid?: string | null } | null;
        const cardId = row?.librarycard_rfid ?? row?.rfid_uid;
        if (!cardId) throw new Error('No active library card is linked to this account. Ask library staff to issue one.');
        if (current) setCredential({ qrPayload: createKioskQrPayload(cardId), error: '' });
      } catch (cause) {
        if (current) setCredential({ qrPayload: '', error: cause instanceof Error ? cause.message : 'Your QR login card could not be loaded.' });
      } finally {
        if (current) setLoadingCard(false);
      }
    };

    void loadCard();
    return () => { current = false; };
  }, [open, profile, readerAccess, session]);

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
              <CardDecor />
              <div className="relative z-10 flex h-full flex-col p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#f9d219]/35 bg-[#f9d219]/10 text-[#f9d219]">
                      <BookOpenIcon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-sm font-900 uppercase tracking-[.08em] text-[#fff9eb] sm:text-base">Tankobonbon</p>
                      <p className="mt-1 text-[8px] font-800 uppercase tracking-[.2em] text-[#f9d219] sm:text-[10px]">Digital reader card</p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-900 uppercase tracking-[.14em] ${active ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-200' : 'border-[#f9d219]/35 text-[#f9d219]'}`}>
                    {loadingCard ? 'Linking' : active ? 'Active' : 'Unavailable'}
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between sm:mt-7">
                  <EmvChip />
                  <div className="flex items-center gap-2 text-[#f3d793]/75">
                    <QrCodeIcon aria-hidden="true" className="h-6 w-6" strokeWidth={1.6} />
                    <span className="hidden text-[9px] font-800 uppercase tracking-[.18em] sm:inline">Scan to login</span>
                  </div>
                </div>

                <div className="mt-auto pt-5">
                  <p className="text-[9px] font-800 uppercase tracking-[.22em] text-[#f9d219]">Reader</p>
                  <p className="mt-1 break-words font-display text-xl font-900 uppercase tracking-[.02em] text-white sm:text-2xl">{fullName}</p>
                  <div className="mt-4 flex items-end justify-between gap-4 border-t border-[#f3d793]/25 pt-3 text-xs">
                    <div>
                      <span className="block text-[8px] font-700 uppercase tracking-[.18em] text-[#f3d793]/60">Reader rank</span>
                      <strong className="mt-0.5 block font-display text-base text-[#fff9eb]">{rank}</strong>
                    </div>
                    <span className="flex items-center gap-1.5 text-[9px] font-800 uppercase tracking-[.12em] text-[#f9d219] sm:text-[10px]">
                      <ShieldCheckIcon aria-hidden="true" className="h-4 w-4" /> Verified member
                    </span>
                  </div>
                </div>
              </div>
            </article>

            <article className="digital-card-face digital-card-back" aria-hidden={!flipped}>
              <div aria-hidden="true" className="digital-card-back-pattern" />
              <div className="relative z-10 grid h-full grid-cols-[minmax(118px,.8fr)_1.2fr] gap-3 p-4 sm:grid-cols-[minmax(160px,.8fr)_1.2fr] sm:gap-5 sm:p-6">
                <div className="flex min-w-0 flex-col rounded-xl border border-[#c4800c]/30 bg-white/85 p-3 shadow-inner">
                  <div className="grid flex-1 place-items-center rounded-lg bg-white p-2">
                    {credential.qrPayload ? (
                      <QRCodeSVG value={credential.qrPayload} level="H" marginSize={0} bgColor="#ffffff" fgColor="#543822" className="h-auto w-full max-w-[180px]" title="Tankobonbon kiosk login QR code" />
                    ) : (
                      <div className="text-center text-[#543822]/55">
                        <QrCodeIcon aria-hidden="true" className="mx-auto h-12 w-12" />
                        <p className="mt-2 text-[9px] font-800 uppercase tracking-wider">{loadingCard ? 'Loading card' : 'QR unavailable'}</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-center font-display text-[10px] font-900 uppercase tracking-[.14em] text-[#543822]">Tankobonbon</p>
                </div>
                <div className="flex min-w-0 flex-col rounded-xl border border-white/70 bg-[#fffdf8]/90 p-3 text-[#543822] shadow-sm sm:p-4">
                  <div className="flex items-center gap-2 border-b border-[#c4800c]/25 pb-2">
                    <ShieldCheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#a33c12]" />
                    <p className="text-[9px] font-900 uppercase tracking-[.14em]">Scan-to-login card</p>
                  </div>
                  {credential.error ? (
                    <p role="alert" className="mt-3 text-[10px] leading-4 text-[#a33c12] sm:text-xs">{credential.error}</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5 text-[9px] leading-3.5 text-[#543822]/80 sm:text-[11px] sm:leading-4">
                      <li>Open the Tankobonbon kiosk.</li>
                      <li>Choose <strong>Scan digital card</strong>.</li>
                      <li>Hold this QR code inside the camera frame.</li>
                    </ul>
                  )}
                  <div className="mt-auto border-t border-[#c4800c]/20 pt-2">
                    <p className="text-[8px] leading-3 text-[#543822]/55 sm:text-[9px]">For the registered member only. Do not share screenshots of this code.</p>
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

function CardDecor() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
    <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[#f9d219]/20" />
    <div className="absolute -bottom-32 right-5 h-80 w-80 rounded-full border border-[#f3d793]/15" />
    <div className="absolute left-[34%] top-[-70%] h-[190%] w-px rotate-[32deg] bg-gradient-to-b from-transparent via-[#f9d219]/25 to-transparent" />
    <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />
    <SparklesIcon className="absolute bottom-5 right-5 h-16 w-16 text-[#f9d219]/[.035]" />
  </div>;
}

function EmvChip() {
  return <div aria-label="Digital card chip" className="relative h-10 w-14 overflow-hidden rounded-lg border border-[#ffe66a]/70 bg-[linear-gradient(135deg,#f9d219,#c4800c_48%,#f3d793)] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_4px_12px_rgba(0,0,0,.18)]">
    <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#7c521d]/45" />
    <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#7c521d]/45" />
    <span className="absolute left-1/2 top-1/2 h-4 w-6 -translate-x-1/2 -translate-y-1/2 rounded border border-[#7c521d]/55" />
  </div>;
}
