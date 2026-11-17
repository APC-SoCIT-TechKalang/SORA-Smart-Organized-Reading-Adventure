import { Armchair, Check, DoorOpen, Leaf, LockKeyhole, MoveRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import './library-seat-map.css';

export type LibrarySeat = { seat_id: number; seat_number: number; seat_area: string; seat_status: string };
type Zone = 'desk' | 'center' | 'l-a' | 'l-b' | 'u-a' | 'u-b';
const areas: Record<Zone, { name: string; numbers: number[] }> = {
  desk: { name: 'Desk Area', numbers: [1, 2, 3, 4] },
  center: { name: 'Center Seating', numbers: [5, 6, 7, 8, 9, 10] },
  'l-a': { name: 'L Pods A', numbers: [11, 12] },
  'l-b': { name: 'L Pods B', numbers: [13, 14, 15] },
  'u-a': { name: 'U Pods A', numbers: [16, 17] },
  'u-b': { name: 'U Pods B', numbers: [18, 19, 20] },
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const zoneFor = (seat: LibrarySeat) => (Object.keys(areas) as Zone[]).find(zone => normalize(areas[zone].name) === normalize(seat.seat_area));

export function LibrarySeatMap({ seats, selectedId, ownSeatId, heldSeatId, disabled, onSelect }: {
  seats: LibrarySeat[]; selectedId: number | null; ownSeatId?: number; heldSeatId?: number;
  disabled: boolean; onSelect: (id: number) => void;
}) {
  const preview = seats.length === 0;
  const renderSeat = (seat: LibrarySeat, index: number, inactive = false) => {
    const own = seat.seat_id === ownSeatId || seat.seat_id === heldSeatId;
    const selected = seat.seat_id === selectedId;
    const available = seat.seat_status === 'AVAILABLE';
    const status = inactive ? 'Not configured' : own ? 'Your seat' : available ? selected ? 'Selected' : 'Available' : 'Unavailable';
    return <button key={seat.seat_id} type="button" style={{ '--seat-index': index } as CSSProperties}
      aria-label={`Seat ${seat.seat_number} ${seat.seat_area} ${status}`} aria-pressed={selected || own}
      title={`Seat ${seat.seat_number} · ${seat.seat_area} · ${status}`}
      disabled={disabled || inactive || (!available && !own)}
      onClick={() => onSelect(seat.seat_id)}
      className={`library-seat ${inactive ? 'is-unconfigured' : own ? 'is-own' : selected ? 'is-selected' : available ? 'is-available' : 'is-occupied'}`}>
      <Armchair aria-hidden="true" size={28} strokeWidth={1.5} />
      <span>{String(seat.seat_number).padStart(2, '0')}</span>
      {own ? <Check aria-hidden="true" className="seat-corner" size={11} /> : !available && !inactive ? <LockKeyhole aria-hidden="true" className="seat-corner" size={10} /> : null}
    </button>;
  };
  const zoneSeats = (zone: Zone) => {
    const assigned = seats.filter(seat => zoneFor(seat) === zone).sort((a, b) => a.seat_number - b.seat_number);
    return preview ? areas[zone].numbers.map((number, index) => renderSeat({ seat_id: -number, seat_number: number, seat_area: areas[zone].name, seat_status: 'UNCONFIGURED' }, index, true)) : assigned.map((seat, index) => renderSeat(seat, index));
  };
  const extra = seats.filter(seat => !zoneFor(seat));
  return <section className="library-map-shell" aria-label="Library seating layout">
    <div className="library-map-topline"><div><span className="library-map-kicker">Find your reading spot</span><h3>Reading lounge</h3></div>
      <span className="library-live"><span />{preview ? 'Map preview' : `${seats.filter(seat => seat.seat_status === 'AVAILABLE').length} of ${seats.length} available`}</span></div>
    <div className="library-map-legend" aria-label="Seat status legend"><span><i className="legend-available" />Available</span><span><i className="legend-selected" />Selected</span><span><i className="legend-own" />Your seat</span><span><i className="legend-occupied" />Unavailable</span></div>
    <p className="library-map-scroll-hint">Scroll sideways to explore the whole lounge <MoveRight size={13} aria-hidden="true" /></p>
    <div className="library-map-scroll" tabIndex={0} aria-label="Scrollable library floor plan">
      <div className="library-floor-plan">
        <div className="library-main-room">
          <div className="library-service-strip"><span>Restroom</span><span>Pantry & service area</span><span>Restroom</span></div>
          <div className="library-room-label">Main reading hall</div>
          <div className="library-zone library-desk"><p>Desk Area</p><div className="library-desk-bar" />{zoneSeats('desk')}</div>
          <div className="library-zone library-center"><p>Center Seating</p><div className="library-center-rug"><Leaf size={32} aria-hidden="true" /><span>Shared lounge</span></div><div className="library-center-seats">{zoneSeats('center')}</div></div>
          <div className="library-zone library-l-b"><p>L Pods B</p><div className="library-pod-stack">{zoneSeats('l-b')}</div></div>
          <div className="library-book-island"><span /><span /><span /><span /><span /><small>Book shelves</small></div>
          <div className="library-reception"><span>Reception</span><small>Check-in counter</small></div>
          <div className="library-zone library-l-a"><p>L Pods A</p><div className="library-bottom-seats">{zoneSeats('l-a')}</div></div>
          <div className="library-entry"><DoorOpen size={18} aria-hidden="true" /> Entrance</div>
        </div>
        <div className="library-connecting-path"><span>Walkway</span><MoveRight size={24} aria-hidden="true" /></div>
        <div className="library-pod-wing"><div className="library-wing-label">Quiet pod wing</div><div className="library-stairs"><span>Stairs</span></div>
          <div className="library-zone library-u-b"><p>U Pods B</p><div className="library-pod-stack">{zoneSeats('u-b')}</div></div>
          <div className="library-zone library-u-a"><p>U Pods A</p><div className="library-bottom-seats">{zoneSeats('u-a')}</div></div>
        </div>
      </div>
    </div>
    {extra.length > 0 && <div className="library-extra-seats"><p>Other configured seating</p><div>{extra.map((seat, index) => renderSeat(seat, index))}</div></div>}
    <div className="library-map-footnote"><Leaf size={14} aria-hidden="true" /><span>Pick an available seat, then confirm your choice. Each pod icon represents one reader's seat.</span></div>
  </section>;
}
