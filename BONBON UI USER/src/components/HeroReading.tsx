import { BookmarkIcon, BookOpenIcon, CheckCircle2Icon, ChevronRightIcon, LibraryBigIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';

export function HeroReading() {
  const { borrowed, volumeById, volumes, setSection, session } = useGame();
  const activeBook = borrowed[0] ? volumeById(borrowed[0].volumeId) : undefined;
  const book = activeBook ?? volumes[0];
  const isReading = Boolean(activeBook);
  const progress = isReading ? 12 : 0;
  const title = book?.title ?? 'Your next story starts here';
  const titleWithoutVolume = title.replace(/\s+VOL\.?\s*\d+$/i, '');
  const openAccount = () => session ? setSection('shelf') : window.dispatchEvent(new Event('tankobonbon:open-auth'));

  return (
    <section className="archive-feature tb-cut-lg tb-hero relative overflow-hidden border border-[#d39a32] bg-[#fffdf8] shadow-[0_12px_30px_rgba(84,56,34,.08)]">
      <div aria-hidden="true" className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(196,128,12,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(196,128,12,.06)_1px,transparent_1px)] [background-size:26px_26px]" />
      <div aria-hidden="true" className="tb-hero-aurora" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-one" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-two" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-three" />
      <div aria-hidden="true" className="tb-hero-sheen" />
      <div aria-hidden="true" className="tb-hero-sparkles">{Array.from({ length: 10 }, (_, i) => <span key={i} style={{ '--i': i } as React.CSSProperties}>✦</span>)}</div>
      <div className="relative grid items-center gap-7 p-6 sm:p-7 md:grid-cols-[minmax(0,1fr)_195px] lg:p-8 xl:grid-cols-[minmax(0,1fr)_215px]">
        <div className="min-w-0">
          <span className="tb-eyebrow tb-hero-eyebrow inline-flex items-center gap-2 border border-gold/35 bg-parch/30 px-3 py-1.5"><span aria-hidden="true" className="h-2 w-2 rotate-45 bg-rust" />{isReading ? 'Currently reading' : 'Featured from the archive'}</span>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(2.1rem,3.6vw,3.3rem)] font-900 uppercase leading-[.98] tracking-[-.018em]">
            <span className="tb-hero-title block bg-[linear-gradient(100deg,#543822_20%,#a83d12_45%,#c4800c_55%,#543822_80%)] bg-clip-text text-transparent [background-size:220%_100%]">{titleWithoutVolume}</span>
            {book && <span className="tb-hero-title mt-0.5 block bg-[linear-gradient(100deg,#a83d12_20%,#c4800c_50%,#a83d12_80%)] bg-clip-text text-transparent [background-size:220%_100%] [animation-delay:.15s]">VOL. {book.volume}</span>}
          </h1>
          {book ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-600 text-umber/65"><span>{book.author}</span><span aria-hidden="true" className="text-gold">•</span><span>{book.genre}</span><span aria-hidden="true" className="text-gold">•</span><span>Volume {book.volume}</span></p>
          ) : (
            <p className="mt-4 max-w-xl text-sm font-600 leading-6 text-umber/65">Browse the collection, begin an in-library session, and keep your reading journey in one place.</p>
          )}

          <div className="mt-6 max-w-xl">
            <div className="flex items-center justify-between gap-3"><span className="tb-eyebrow">{isReading ? 'Reading EXP' : 'Volume EXP'}</span><strong className="font-display text-sm font-900 text-umber">{progress}%</strong></div>
            <div className="tb-exp-shell tb-exp-glow mt-2" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="tb-exp-fill block h-full transition-all duration-700" style={{ width: `${progress}%` }} /></div>
            <p className="mt-2 text-xs font-600 leading-5 text-umber/55">{isReading ? 'Your time is recorded automatically while you read in the library.' : 'Start a book to track reading time, quests, and library points.'}</p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setSection(isReading ? 'shelf' : 'catalog')} className="tb-button-primary tb-cut-sm tb-hero-cta relative overflow-hidden px-5 py-2.5 font-display text-xs uppercase tracking-[0.11em]">{isReading ? <BookOpenIcon aria-hidden="true" className="h-4 w-4" /> : <LibraryBigIcon aria-hidden="true" className="h-4 w-4" />}{isReading ? 'Read a session' : 'Read a session'}<ChevronRightIcon aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" onClick={openAccount} className="tb-button-secondary tb-cut-sm px-5 py-2.5 font-display text-xs uppercase tracking-[0.11em]"><BookmarkIcon aria-hidden="true" className="h-4 w-4 text-gold" />{session ? 'My shelf' : 'My shelf'}</button>
            {isReading && <span className="inline-flex items-center gap-1.5 text-xs font-800 text-rust"><CheckCircle2Icon aria-hidden="true" className="h-4 w-4 text-gold" />Session active</span>}
          </div>
        </div>

        <div className="tb-hero-book mx-auto w-[170px] sm:w-[190px] md:w-full">
          <div className="relative rotate-[1.5deg] border-[3px] border-gold bg-umber p-1.5 shadow-[12px_16px_0_rgba(84,56,34,.11)] transition-transform duration-300 hover:rotate-0 hover:-translate-y-1">
            <div aria-hidden="true" className="tb-hero-halo" />
            <div className="relative aspect-[3/4] overflow-hidden border border-sun/60 bg-parch">
              {book?.coverImage ? <img src={book.coverImage} alt={`${book.title} cover`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col justify-end p-5" style={{ backgroundColor: book?.plateColor ?? '#59351e', color: book?.plateInk ?? '#fff9ef' }}><span className="font-display text-2xl font-900 uppercase leading-none">{book?.plate.map((line) => <span key={line} className="block">{line}</span>) ?? 'Tankobonbon'}</span></div>}
              <span aria-hidden="true" className="pointer-events-none absolute inset-2 border border-sun/45" />
              <span aria-hidden="true" className="tb-hero-cover-shine" />
            </div>
            <span className="absolute -right-3 -top-3 flex h-10 w-10 rotate-45 items-center justify-center border border-umber bg-sun shadow-sm"><span className="-rotate-45 font-display text-xs font-900 text-umber">{book?.volume ?? 'S'}</span></span>
            <span aria-hidden="true" className="tb-hero-book-sparkle">✦</span>
          </div>
          <p className="mt-4 text-center text-[9px] font-800 uppercase tracking-[0.2em] text-gold">{isReading ? 'On your shelf' : 'Library feature'}</p>
        </div>
      </div>
    </section>
  );
}
