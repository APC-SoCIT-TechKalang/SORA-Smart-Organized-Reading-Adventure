import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircleIcon, SendIcon, XIcon } from 'lucide-react';
import type { BonMessage, SectionId } from '../types/library';
import { useGame } from '../contexts/GameContext';


// Pixel-art BON cutout with a transparent background.
const BON_ART = "/bon-pixel.png";
const BON_BLINK = "/bon-blink.png";
const BON_EXCITED_FRAMES = ["/bon-excited-1.png", "/bon-excited-2.png"];
// Use the same BON artwork for the chat profile so the pet and chat identity
// always stay visually consistent.
const BON_AVATAR = BON_ART;

const EASE = [0.23, 1, 0.32, 1] as const;

interface Suggestion {
  label: string;
  reply: string;
  go?: SectionId;
}

const SUGGESTIONS: Suggestion[] = [
{
  label: 'What should I read next?',
  reply:
  'Opening the library catalog. Choose a title to see its details.',
  go: 'catalog'
},
{
  label: 'Any rewards ready?',
  reply:
  'Opening your quest board. Completed quests show any points you can claim.',
  go: 'commissions'
},
{
  label: 'What is due soon?',
  reply: 'Your shortest fuse is on the shelf — let us take a look.',
  go: 'shelf'
}];


interface BonChatbotProps {
  /** When true BON leans out on her own; otherwise she stays tucked behind the edge. */
  autoPeek?: boolean;
}

export function BonChatbot({ autoPeek = true }: BonChatbotProps) {
  const { section, setSection, borrowed, rank, coins, volumeById } = useGame();
  const [peeking, setPeeking] = useState(autoPeek);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [excitedFrame, setExcitedFrame] = useState(0);
  const showBonSparkles = false;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<BonMessage[]>([
  {
    id: 'bon-hello',
    from: 'bon',
    text: 'Hi! I am BON, keeper of the Tankobonbon archive. Ask me anything, or press 1–5 to jump between halls.'
  }]
  );
  const logRef = useRef<HTMLDivElement>(null);
  const hoverIntentTimer = useRef<number | null>(null);

  // Lock body scroll while the mobile sheet is open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!autoPeek) {
      setPeeking(false);
      return;
    }
    const timer = window.setTimeout(() => setPeeking(true), 900);
    return () => window.clearTimeout(timer);
  }, [autoPeek]);

  useEffect(() => {
    const openChat = () => { setPeeking(true); setOpen(true); };
    window.addEventListener('tankobonbon:open-chat', openChat);
    return () => window.removeEventListener('tankobonbon:open-chat', openChat);
  }, []);

  // BON blinks occasionally while idle, then switches to a two-frame excited
  // loop while hovered or keyboard-focused.
  useEffect(() => {
    if (hovered) {
      setBlinking(false);
      return;
    }

    let blinkTimer: number;
    let closeTimer: number;

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        setBlinking(true);
        closeTimer = window.setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 180);
      }, 3800);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(closeTimer);
    };
  }, [hovered]);

  useEffect(() => {
    if (!hovered) {
      setExcitedFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setExcitedFrame((frame) => (frame + 1) % BON_EXCITED_FRAMES.length);
    }, 420);

    return () => window.clearInterval(timer);
  }, [hovered]);

  function beginHover() {
    if (hoverIntentTimer.current !== null) {
      window.clearTimeout(hoverIntentTimer.current);
    }
    hoverIntentTimer.current = window.setTimeout(() => setHovered(true), 180);
  }

  function endHover() {
    if (hoverIntentTimer.current !== null) {
      window.clearTimeout(hoverIntentTimer.current);
      hoverIntentTimer.current = null;
    }
    setHovered(false);
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, open]);

  function reply(text: string, response: string, go?: SectionId) {
    setMessages((current) => [
    ...current,
    { id: `u-${Date.now()}`, from: 'user', text },
    { id: `b-${Date.now()}`, from: 'bon', text: response }]
    );
    setDraft('');
    if (go) {
      window.setTimeout(() => setSection(go), 320);
    }
  }

  function answer(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const match = SUGGESTIONS.find(
      (item) => item.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) {
      reply(trimmed, match.reply, match.go);
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower.includes('due') || lower.includes('shelf')) {
      const soonest = [...borrowed].sort((a, b) => a.dueInDays - b.dueInDays)[0];
      const volume = soonest ? volumeById(soonest.volumeId) : undefined;
      reply(
        trimmed,
        volume ?
        `${volume.title} is on your in-library reading shelf. Return it before checking out.` :
        'Your shelf is empty right now — choose a book from the catalog after checking in.',
        'shelf'
      );
      return;
    }
    if (lower.includes('rank') || lower.includes('coin')) {
      reply(
        trimmed,
        `You are Archivist Rank ${rank} with ${coins.toLocaleString()} library points.`
      );
      return;
    }
    reply(
      trimmed,
      `Let me search the stacks for that. Meanwhile you are in the ${section} hall — I can pull up your quests or your shelf if that helps.`
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] right-0 z-50 flex items-end justify-end sm:bottom-0 sm:z-40">
      <AnimatePresence>
        {open ?
        <motion.div
          key="panel"
          initial={{ opacity: 0, x: 60, y: 24 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 60, y: 24 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="bon-chat-panel pointer-events-auto fixed inset-0 flex h-[100dvh] w-full origin-bottom flex-col overflow-hidden border-t-2 border-gold shadow-plate sm:inset-x-auto sm:bottom-0 sm:left-auto sm:right-4 sm:top-auto sm:mb-4 sm:h-auto sm:max-h-[70dvh] sm:w-[350px] sm:rounded-t-2xl sm:border sm:border-gold md:right-2 md:mb-6 md:w-[380px] md:rounded-2xl"
          role="dialog"
          aria-label="Chat with BON">
          
            <div className="bon-chat-header flex items-center gap-3 border-b border-gold/40 bg-umber px-4 py-3">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[14px] border-2 border-sun bg-sand p-0.5 shadow-[0_2px_0_rgba(84,56,34,0.2)]">
                <img
                src={BON_AVATAR}
                alt="BON profile"
                className="h-full w-full scale-[3.2] object-cover object-[50%_17%]" />
              
                <span
                aria-hidden="true"
                className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-umber bg-emerald-400 shadow-[0_0_0_1px_rgba(255,221,116,0.6)]" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[13px] font-700 uppercase tracking-[0.16em] text-sand">
                  BON
                </span>
                <span className="block font-body text-[11px] font-600 text-sand/70">
                  Archive guide · online
                </span>
              </span>
              <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sand/70 transition-all duration-150 ease-out hover:bg-sand/10 hover:text-sun"
              aria-label="Close chat with BON">
              
                <XIcon aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div
            ref={logRef}
            className="bon-chat-log tb-scroll min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-4">
            
              <div className="flex items-center gap-2 pb-1">
                <span className="font-body text-[9px] font-800 uppercase tracking-[0.2em] text-rust/65">
                  Live archive
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-gold/30" />
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
              </div>

              {messages.map((message) =>
            <p
              key={message.id}
              className={`max-w-[86%] px-3.5 py-2.5 font-body text-[13px] font-600 leading-relaxed shadow-sm sm:text-sm ${
              message.from === 'bon' ?
              'tb-cut-sm rounded-2xl rounded-tl-sm border border-gold/45 bg-parch/40 text-umber' :
              'ml-auto rounded-2xl rounded-br-sm border border-gold bg-rust text-sand'}`
              }>
              
                  {message.text}
                </p>
            )}
            </div>

            <div className="bon-chat-suggestions tb-scroll flex gap-2 overflow-x-auto border-t border-gold/25 px-4 pb-1 pt-3 sm:flex-wrap">
              {SUGGESTIONS.map((suggestion) =>
            <button
              key={suggestion.label}
              type="button"
              onClick={() => answer(suggestion.label)}
              className="shrink-0 whitespace-nowrap rounded-full border border-gold/50 bg-parch/20 px-3 py-1.5 font-body text-[11px] font-700 text-umber/75 transition-all duration-150 ease-out hover:-translate-y-px hover:border-gold hover:bg-parch/60 hover:text-umber">
              
                  {suggestion.label}
                </button>
            )}
            </div>

            <form
            className="bon-chat-composer flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              answer(draft);
            }}>
            
              <label className="sr-only" htmlFor="bon-input">
                Message BON
              </label>
              <input
              id="bon-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask BON…"
              className="tb-cut-sm h-11 min-w-0 flex-1 border border-gold/50 bg-parch/20 px-4 font-body text-[16px] font-600 text-umber outline-none transition-colors duration-150 placeholder:text-umber/45 focus:border-gold focus:bg-parch/40" />
            
              <button
              type="submit"
              className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold bg-rust text-sand shadow-[0_3px_0_rgba(84,56,34,0.2)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-umber active:translate-y-0 active:scale-95"
              aria-label="Send message">
              
                <SendIcon aria-hidden="true" className="h-4 w-4 transition-transform duration-150 ease-out group-hover:-rotate-12" />
              </button>
            </form>
          </motion.div> :
        null}
        </AnimatePresence>

        <div className="pointer-events-none relative flex items-end">
          <AnimatePresence>
            {showBonSparkles && hovered && peeking && !open ?
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="absolute bottom-[129px] right-[75px] h-[138px] w-[138px]">
              <motion.span
                animate={{ y: [4, -6, 4], rotate: [0, 12, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute left-1 top-3 text-[18px] text-rust">
                ✦
              </motion.span>
              <motion.span
                animate={{ y: [-3, 5, -3], rotate: [0, -14, 0], opacity: [0.25, 0.85, 0.25] }}
                transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                className="absolute right-1 top-9 text-[13px] text-gold">
                ✦
              </motion.span>
              <motion.span
                animate={{ scale: [0.75, 1.05, 0.75], opacity: [0.2, 0.8, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.45 }}
                className="absolute bottom-2 left-7 text-[11px] text-rust/80">
                ✧
              </motion.span>
            </motion.div> :
            null}
          </AnimatePresence>

          <AnimatePresence>
            {peeking && !open ?
            <motion.button
              key="bubble"
              type="button"
              onClick={() => setOpen(true)}
              initial={{ opacity: 0, x: 12, scale: 0.96 }}
            animate={hovered ?
            { opacity: 1, x: 0, y: [0, -2, 0], scale: [1, 1.015, 1] } :
            { opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.96 }}
            transition={hovered ?
            { y: { duration: 1.45, repeat: Infinity, ease: 'easeInOut' }, scale: { duration: 1.45, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.2, ease: EASE, delay: 0.18 }, x: { duration: 0.2, ease: EASE, delay: 0.18 } } :
            { duration: 0.2, ease: EASE, delay: 0.18 }}
            className="bon-dialogue-trigger pointer-events-auto absolute bottom-[69px] right-2 hidden w-[116px] min-w-[116px] items-center justify-center gap-1.5 whitespace-nowrap border border-gold/90 bg-cream/95 px-2 py-2 shadow-[0_8px_18px_rgba(84,56,34,0.16)] min-[390px]:flex sm:bottom-[151px] sm:right-[9px] sm:w-[130px] sm:min-w-[130px] md:bottom-[156px]">
            
              <MessageCircleIcon aria-hidden="true" className="h-4 w-4 text-rust" />
              <span className="font-display text-[13px] font-700 uppercase tracking-[0.11em] text-umber">Ask BON</span>
              <span
              aria-hidden="true"
              className="absolute -bottom-[5px] left-1/2 h-[9px] w-[9px] rotate-45 border-b border-r border-gold bg-cream" />
            
            </motion.button> :
          null}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => peeking ? setOpen((value) => !value) : setPeeking(true)}
          onHoverStart={beginHover}
          onHoverEnd={endHover}
          onFocus={beginHover}
          onBlur={endHover}
          aria-label={peeking ? 'Chat with BON' : 'Call BON out'}
          initial={{ x: 200 }}
          animate={
          peeking ?
          hovered ?
          { x: 0, y: [0, -2, -6, -2, 0], rotate: [0, -1, 1, -0.5, 0], scale: [1, 1.01, 1.02, 1.01, 1], filter: ['brightness(1)', 'brightness(1.025)', 'brightness(1)'] } :
          { x: 0, y: [0, -5, 0], rotate: [0, -1.2, 0], scale: 1 } :
          { x: 200, y: 0, rotate: 0 }
          }
          transition={{
            x: { duration: 0.3, ease: EASE },
            y: { duration: hovered ? 1.45 : 3.2, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: hovered ? 1.45 : 3.2, repeat: Infinity, ease: 'easeInOut' },
            scale: { duration: hovered ? 1.45 : 0.3, repeat: hovered ? Infinity : 0, ease: 'easeInOut' },
            filter: { duration: hovered ? 1.45 : 0.3, repeat: hovered ? Infinity : 0, ease: 'easeInOut' }
          }}
          whileTap={{ scale: 0.96 }}
          className={`pointer-events-auto relative h-[72px] w-[72px] rounded-full drop-shadow-[0_3px_6px_rgba(84,56,34,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust sm:h-[142px] sm:w-[142px] md:h-[146px] md:w-[146px] ${open ? 'hidden lg:block' : 'block'}`}>
          
          <img
            src={hovered ? BON_EXCITED_FRAMES[excitedFrame] : blinking ? BON_BLINK : BON_ART}
            alt="BON, the Tankobonbon archive guide, waving hello"
            draggable={false}
            className="absolute bottom-0 left-1/2 h-[72px] w-auto max-w-none -translate-x-1/2 select-none sm:h-[142px] md:h-[146px]" />
          
        </motion.button>
      </div>
    </div>);

}
