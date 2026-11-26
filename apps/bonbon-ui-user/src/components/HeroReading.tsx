import { ArrowRightIcon, BookmarkIcon, BookOpenIcon, CompassIcon, SparklesIcon } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { ReaderAtmosphere } from './ReaderAtmosphere';
import type { Volume } from '../types/library';

const scoreBook = (volume: Volume) => (volume.rating * 100) + (Math.max(0, volume.copies) * 12) + (volume.rarity * 4) + (volume.coverImage ? 6 : 0);

export function HeroReading() {
  const { borrowed, volumeById, volumes, setSection, session, profile } = useGame();
  const activeBook = borrowed[0] ? volumeById(borrowed[0].volumeId) : undefined;
  const book = activeBook ?? [...volumes].sort((a, b) => scoreBook(b) - scoreBook(a) || a.title.localeCompare(b.title))[0];
  const progress = Math.max(0, Math.min(100, borrowed[0]?.progress ?? 0));
  const firstName = profile?.first_name?.trim();
  const openBook = () => setSection(activeBook ? 'shelf' : 'catalog');
  const openShelf = () => session ? setSection('shelf') : window.dispatchEvent(new Event('tankobonbon:open-auth'));

  return (
    <section className="reader-archive" aria-labelledby="reader-archive-title">
      <ReaderAtmosphere />
      <div className="reader-archive-copy">
        <p className="reader-kicker"><CompassIcon aria-hidden="true" /> The Archive</p>
        <h1 id="reader-archive-title">{activeBook ? <>Continue your<br /><em>current chapter.</em></> : <>Your next chapter<br /><em>awaits.</em></>}</h1>
        <p className="reader-archive-description">{activeBook
          ? 'Open My Shelf to see your current reading session.'
          : firstName ? `Good to see you, ${firstName}. Find a story for your next library visit.` : 'Discover a new story and start your reading adventure at Tankobonbon.'}</p>
        {activeBook && <div className="reader-archive-progress">
          <div><span>Reading progress</span><strong>{progress}%</strong></div>
          <progress max={100} value={progress} aria-label="Reading progress" />
        </div>}
        <div className="reader-archive-actions">
          <button type="button" onClick={openBook} className="reader-gold-button">
            {activeBook ? <BookOpenIcon aria-hidden="true" /> : <CompassIcon aria-hidden="true" />}
            {activeBook ? 'Continue reading' : 'Explore the collection'} <ArrowRightIcon aria-hidden="true" />
          </button>
          {!activeBook && <button type="button" onClick={openShelf} className="reader-ghost-button"><BookmarkIcon aria-hidden="true" /> My shelf</button>}
        </div>
      </div>
      {book && <button type="button" onClick={openBook} className="reader-archive-pick">
        <img src={book.coverImage ?? '/book-placeholder.svg'} alt="" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
        <span className="reader-archive-pick-copy">
          <span className="reader-kicker"><SparklesIcon aria-hidden="true" /> {activeBook ? 'Currently reading' : 'Reader’s pick'}</span>
          <strong>{book.title}</strong>
          <span>{book.author}</span>
          {!activeBook && <span className="reader-availability">{book.copies < 0 ? 'Sign in to see availability' : book.copies > 0 ? `${book.copies} ${book.copies === 1 ? 'copy' : 'copies'} available` : 'Check with staff'}</span>}
        </span>
        <ArrowRightIcon className="reader-pick-arrow" aria-hidden="true" />
      </button>}
    </section>
  );
}
