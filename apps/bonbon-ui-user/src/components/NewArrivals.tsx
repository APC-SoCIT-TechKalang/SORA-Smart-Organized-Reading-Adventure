import { useRef, type KeyboardEvent, type TouchEvent } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, BookmarkIcon, CheckIcon, StarIcon } from 'lucide-react';
import type { Volume } from '../types/library';
import { ReaderAtmosphere } from './ReaderAtmosphere';
import './new-arrivals.css';

export const arrivalCover = (volume: Volume) => volume.coverImage || '/book-placeholder.svg';

interface NewArrivalsProps {
  books: Volume[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onOpen: (book: Volume) => void;
}

export function NewArrivals({ books, activeIndex, onSelect, onOpen }: NewArrivalsProps) {
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const book = books[activeIndex];
  if (!book) return null;

  const cover = arrivalCover(book);
  const synopsis = book.synopsis.trim();
  const availability = book.copies < 0 ? 'Sign in for availability'
    : book.copies === 0 ? 'Ask staff for availability'
      : `${book.copies} ${book.copies === 1 ? 'copy' : 'copies'} available`;

  function move(direction: number) {
    onSelect(Math.max(0, Math.min(books.length - 1, activeIndex + direction)));
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  function finishSwipe(event: TouchEvent<HTMLDivElement>) {
    const origin = touchOrigin.current;
    touchOrigin.current = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch) return;
    const distance = touch.clientX - origin.x;
    if (Math.abs(distance) > 50 && Math.abs(distance) > Math.abs(touch.clientY - origin.y) * 1.5) {
      event.preventDefault();
      move(distance < 0 ? 1 : -1);
    }
  }

  return (
    <div className="reader-arrivals" onKeyDown={navigate}>
      <div className="reader-arrival-stage">
        <div className="reader-arrival-copy">
          <div className="reader-arrival-story" aria-live="polite" aria-atomic="true">
            <div key={book.id} className="reader-arrival-reveal">
              <p className="reader-kicker"><BookmarkIcon aria-hidden="true" /> In the spotlight</p>
              <h3 title={book.title}>{book.title}</h3>
              <p className="reader-arrival-author">{book.author || '\u00a0'}</p>
              <p className="reader-arrival-synopsis">{synopsis && synopsis !== 'No description recorded.' ? synopsis : '\u00a0'}</p>
              <div className="reader-arrival-meta">
                {book.genre && <span className="reader-arrival-genre">{book.genre}</span>}
                {book.rating > 0 && <span><StarIcon aria-hidden="true" /> {book.rating} reader rating</span>}
                <span className={book.copies > 0 ? 'is-available' : undefined}>{book.copies > 0 && <CheckIcon aria-hidden="true" />}{availability}</span>
              </div>
            </div>
          </div>
          <button type="button" className="reader-gold-button reader-arrival-action" onClick={() => onOpen(book)}>
            <BookOpenIcon aria-hidden="true" /> View book details <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>

        <div className="reader-arrival-display" onTouchStart={event => {
          if (event.touches.length !== 1) {
            touchOrigin.current = null;
            return;
          }
          const touch = event.touches[0];
          touchOrigin.current = { x: touch.clientX, y: touch.clientY };
        }} onTouchEnd={finishSwipe} onTouchCancel={() => { touchOrigin.current = null; }}>
          {book.coverImage && <img key={book.id} className="reader-arrival-color" src={cover} alt="" aria-hidden="true" loading="lazy" />}
          <ReaderAtmosphere />
          <div className="reader-arrival-arch" aria-hidden="true" />
          <button type="button" className="reader-arrival-cover" aria-label={`Open details for ${book.title}`} onClick={() => onOpen(book)}>
            <img key={book.id} className="reader-arrival-reveal" src={cover} alt="" loading="lazy" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
          </button>
        </div>
      </div>

      {books.length > 1 && <div className="reader-arrival-shelf">
        <div className="reader-arrival-shelf-head">
          <h3>Browse new arrivals</h3>
          <div className="reader-arrival-controls">
            <span>{activeIndex + 1} of {books.length}</span>
            <button type="button" onClick={() => move(-1)} disabled={activeIndex === 0} aria-label="Previous new arrival"><ArrowLeftIcon aria-hidden="true" /></button>
            <button type="button" onClick={() => move(1)} disabled={activeIndex === books.length - 1} aria-label="Next new arrival"><ArrowRightIcon aria-hidden="true" /></button>
          </div>
        </div>
        <ul className="reader-arrival-lineup">
          {books.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-current={index === activeIndex || undefined} aria-label={`Feature ${item.title}`} title={item.title} onClick={() => onSelect(index)}>
                <img src={arrivalCover(item)} alt="" loading="lazy" onError={event => { event.currentTarget.src = '/book-placeholder.svg'; }} />
                <span>{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>}
    </div>
  );
}
