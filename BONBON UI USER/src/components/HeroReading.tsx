import { useGame } from '../contexts/GameContext';
import { OrnatePanel } from './OrnatePanel';
export function HeroReading() {
  const { borrowed, volumeById, setSection } = useGame();
  const book = borrowed[0] ? volumeById(borrowed[0].volumeId) : undefined;
  return <OrnatePanel as="section" className="tb-cut"><div className="p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-gold">Your reading adventure</p>
    <h1 className="mt-3 font-display text-3xl font-900 text-umber">{book ? book.title : 'Find your next story'}</h1>
    <p className="mt-3 text-sm text-umber/70">{book ? 'Your reading time is recorded automatically. Finish the session from My Shelf and place the book on the return cart.' : 'Browse the collection. With an active membership, ask staff to check you in, then start reading an available book.'}</p>
    <button onClick={() => setSection(book ? 'shelf' : 'catalog')} className="mt-6 bg-rust px-6 py-3 text-sm font-bold text-cream">{book ? 'Continue to My Shelf' : 'Explore the catalog'}</button>
  </div></OrnatePanel>;
}

