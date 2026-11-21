import { MAIN_HALL_SHELVES, shelfMessage, type LocatedCopy } from '../lib/shelf-location';

export function ShelfLocation({ copies }: { copies?: LocatedCopy[] }) {
  const available = new Set((copies ?? []).filter(copy => ['In-Shelf', 'In Shelf', 'IN_SHELF'].includes(copy.status)).map(copy => copy.shelfLocation));
  return <div className="book-record-row"><dt>Shelf Location</dt><dd>
    {!copies ? 'Sign in to view shelf location.' : !copies.length ? 'Shelf location data missing — Please ask library staff for assistance.' :
      <ul className="space-y-2">{[...copies].sort((a, b) => a.copyId - b.copyId).map(copy => <li key={copy.copyId}>{copies.length > 1 && <strong>Copy {copy.copyId}: </strong>}{shelfMessage(copy)}</li>)}</ul>}
    {MAIN_HALL_SHELVES.some(shelf => available.has(shelf)) && <div className="mt-3 rounded-lg border border-[#B59A6A]/50 bg-[#FAF6EE] p-3 text-[#4A321F]" role="img" aria-label={`Main Reading Hall: ${[...available].filter(Boolean).join(', ')} below Center Seating, above Reception and Entrance. Shelves numbered left to right.`}>
      <p className="text-center text-[10px] uppercase tracking-wider">Main Reading Hall · Center Seating</p>
      <div className="my-3 grid grid-cols-5 gap-1">{MAIN_HALL_SHELVES.map((shelf, index) => <span key={shelf} className={`rounded-sm border border-[#B59A6A] py-2 text-center text-[10px] font-bold ${available.has(shelf) ? 'bg-[#4A321F] text-[#FAF6EE]' : 'bg-[#EEE3CE]'}`}>A{index + 1}</span>)}</div>
      <div className="flex justify-between border-t border-[#B59A6A]/50 pt-2 text-[10px]"><span>Reception / Check-in</span><span>Entrance ↑</span></div>
    </div>}
  </dd></div>;
}
