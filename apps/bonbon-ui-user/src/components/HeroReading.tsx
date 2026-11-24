import type { CSSProperties } from 'react';
import { BookmarkIcon, BookOpenIcon, CheckCircle2Icon, ChevronRightIcon, CompassIcon, SparklesIcon, StarIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import type { Volume } from '../types/library';

const scoreBook = (volume: Volume) => (volume.rating * 100) + (Math.max(0, volume.copies) * 12) + (volume.rarity * 4) + (volume.coverImage ? 6 : 0);
const genreLabels = (value: string) => value.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean).slice(0, 2);

export function HeroReading() {
  const { borrowed, volumeById, volumes, setSection, session, profile } = useGame();
  const activeBook = borrowed[0] ? volumeById(borrowed[0].volumeId) : undefined;
  const recommendation = [...volumes].sort((a, b) => scoreBook(b) - scoreBook(a) || a.title.localeCompare(b.title))[0];
  const book = activeBook ?? recommendation;
  const isReading = Boolean(activeBook);
  const progress = isReading ? Math.max(0, Math.min(100, borrowed[0]?.progress ?? 0)) : 0;
  const firstName = profile?.first_name?.trim();
  const openShelf = () => session ? setSection('shelf') : window.dispatchEvent(new Event('tankobonbon:open-auth'));

  return (
    <section className="tb-hero relative isolate overflow-hidden rounded-[28px] border border-gold/40 bg-[linear-gradient(135deg,#fffdf8_0%,#fff7e7_55%,#f3d793_100%)] shadow-[0_24px_60px_rgba(84,56,34,.13)]">
      <div aria-hidden="true" className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(196,128,12,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(196,128,12,.055)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div aria-hidden="true" className="tb-hero-aurora" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-one" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-two" />
      <div aria-hidden="true" className="tb-hero-orb tb-hero-orb-three" />
      <div aria-hidden="true" className="tb-hero-sheen" />
      <div aria-hidden="true" className="tb-hero-sparkles">
        {Array.from({ length: 10 }, (_, index) => <span key={index} style={{ '--i': index } as CSSProperties}>✦</span>)}
      </div>
      <div className="relative grid min-h-[480px] lg:min-h-[570px] lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,.88fr)]">
        <div className="flex flex-col p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/60 px-3 py-1.5 text-[9px] font-900 uppercase tracking-[.2em] text-gold backdrop-blur"><SparklesIcon className="h-3.5 w-3.5" />{isReading ? 'Your active chapter' : 'Curated for your next visit'}</span>
            {session && <span className="text-[10px] font-800 uppercase tracking-[.14em] text-umber/45">Reader dashboard</span>}
          </div>

          <div className="my-auto py-5 sm:py-6">
            <p className="text-xs font-800 uppercase tracking-[.18em] text-rust">{isReading ? 'Continue your journey' : firstName ? `Your shelf awaits, ${firstName}` : 'Welcome to Tankobonbon'}</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-900 leading-[.98] tracking-[-.035em] text-umber sm:text-[2.8rem] lg:text-[3rem]">{isReading ? 'Pick up where you left off.' : 'A remarkable story is waiting for you.'}</h1>
            <p className="mt-3 max-w-xl text-sm font-600 leading-6 text-umber/60">{isReading ? 'Your reading session is ready on My Shelf. Time spent in the library is recorded automatically.' : 'Discover a reader-worthy selection from the collection, check live availability, and begin your next in-library session.'}</p>

            {book && <div className="mt-5 border-l-2 border-gold pl-4 sm:pl-5">
              <p className="text-[9px] font-900 uppercase tracking-[.18em] text-gold">{isReading ? 'Currently reading' : 'Today’s recommendation'}</p>
              <h2 className="mt-1 line-clamp-2 font-display text-xl font-900 text-umber sm:text-2xl">{book.title}{book.volume > 0 && !/vol\.?\s*\d+/i.test(book.title) ? ` · Vol. ${book.volume}` : ''}</h2>
              <p className="mt-1 text-xs font-700 text-umber/55">{book.author}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {genreLabels(book.genre).map(label => <span key={label} className="rounded-full border border-gold/25 bg-white/65 px-2.5 py-1 text-[9px] font-800 text-umber/65">{label}</span>)}
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-900 ${book.copies > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rust/10 text-rust'}`}>{book.copies > 0 ? `${book.copies} ${book.copies === 1 ? 'copy' : 'copies'} available` : 'Check with staff'}</span>
              </div>
            </div>}

            {isReading && <div className="mt-4 max-w-xl rounded-xl border border-gold/20 bg-white/55 p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-900 uppercase tracking-[.16em] text-gold">Session progress</span><strong className="font-display text-sm text-umber">{progress}%</strong></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gold/15" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="block h-full rounded-full bg-[linear-gradient(90deg,#953410,#f9d219)] transition-all" style={{ width: `${progress}%` }} /></div>
            </div>}

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSection(isReading ? 'shelf' : 'catalog')} className="tb-hero-cta tb-button-primary tb-cut-sm relative min-h-11 overflow-hidden px-5 font-display text-xs uppercase tracking-[.1em]">{isReading ? <BookOpenIcon className="h-4 w-4" /> : <CompassIcon className="h-4 w-4" />}{isReading ? 'Continue reading' : 'Explore the collection'}<ChevronRightIcon className="h-4 w-4" /></button>
              <button type="button" onClick={openShelf} className="tb-button-secondary tb-cut-sm min-h-11 px-5 font-display text-xs uppercase tracking-[.1em]"><BookmarkIcon className="h-4 w-4 text-gold" />My shelf</button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-gold/20 pt-3 text-[10px] font-700 text-umber/45"><CheckCircle2Icon className="h-4 w-4 text-gold" />Live availability is shown for signed-in readers.</div>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden bg-[#543822] p-6 text-cream sm:p-8 lg:min-h-full">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(249,210,25,.28),transparent_38%),repeating-linear-gradient(135deg,transparent_0,transparent_28px,rgba(243,215,147,.035)_28px,rgba(243,215,147,.035)_29px)]" />
          <div className="relative w-full max-w-[250px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[9px] font-900 uppercase tracking-[.2em] text-sun">{isReading ? 'On your shelf' : 'Reader’s pick'}</span>
              <span className="flex items-center gap-1 text-[10px] font-800 text-sand"><StarIcon className="h-3.5 w-3.5 fill-sun text-sun" />{book?.rating || 'Featured'}</span>
            </div>
            <button type="button" onClick={() => setSection(isReading ? 'shelf' : 'catalog')} className="tb-reading-cover group block w-full text-left">
              <span className="relative block aspect-[3/4] overflow-hidden rounded-[22px] border border-sand/35 bg-cream p-2 shadow-[0_28px_60px_rgba(20,10,3,.45)] transition duration-500 group-hover:-translate-y-2 group-hover:rotate-[-1deg]">
                <span className="relative flex h-full overflow-hidden rounded-[15px]" style={{ backgroundColor: book?.plateColor ?? '#953410' }}>
                  {book?.coverImage ? <img src={book.coverImage} alt={`${book.title} book cover`} className="h-full w-full bg-cream object-contain" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} /> : <span className="mt-auto p-6 font-display text-2xl font-900 uppercase leading-none" style={{ color: book?.plateInk ?? '#f3d793' }}>{book?.plate.map(line => <span key={line} className="block">{line}</span>) ?? 'Tankobonbon'}</span>}
                  <span aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-xl border border-current opacity-20" style={{ color: book?.plateInk ?? '#f3d793' }} />
                </span>
              </span>
            </button>
            <div className="mt-4 text-center"><p className="line-clamp-1 font-display text-base font-800 text-white">{book?.title ?? 'The collection awaits'}</p><p className="mt-1 text-[9px] font-800 uppercase tracking-[.18em] text-sand/55">Tap the cover to explore</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}
