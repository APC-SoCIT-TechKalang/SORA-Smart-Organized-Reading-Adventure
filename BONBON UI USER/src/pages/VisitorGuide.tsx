import { ArmchairIcon, InfoIcon, UsersIcon } from 'lucide-react';
import { OrnatePanel, SectionHeading } from '../components/OrnatePanel';

type Seat = { id: string; taken: boolean };

const INITIAL_SEATS: Seat[] = Array.from({ length: 24 }, (_, index) => ({
  id: `${String.fromCharCode(65 + Math.floor(index / 6))}${index % 6 + 1}`,
  taken: [1, 4, 7, 8, 13, 17, 20, 22].includes(index),
}));

export function VisitorGuide() {
  const seats = INITIAL_SEATS;
  const openSeats = seats.filter((seat) => !seat.taken).length;

  return <div className="space-y-8">
    <SectionHeading title="View Available Seats" meta={`${openSeats} seats open`} />

    <OrnatePanel as="section" className="tb-cut">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-body text-[10px] font-800 uppercase tracking-[0.26em] text-gold">Quiet Reading Hall</p>
            <h1 className="mt-1 font-display text-[25px] font-900 uppercase text-umber">Study seat availability</h1>
            <p className="mt-2 max-w-xl font-body text-[13px] font-600 leading-relaxed text-umber/60">View each chair's current status. This is a visual placeholder until live occupancy data is connected.</p>
          </div>
          <div className="flex items-center gap-3 font-body text-[11px] font-800 uppercase tracking-[0.12em]">
            <span className="flex items-center gap-1.5 text-umber/60"><span className="h-3 w-3 border border-gold bg-cream" />Available</span>
            <span className="flex items-center gap-1.5 text-umber/60"><span className="h-3 w-3 border border-umber bg-umber" />Taken</span>
          </div>
        </div>

        <div className="mt-7 overflow-x-auto rounded-sm border border-gold/35 bg-parch/15 p-4 sm:p-7">
          <div className="mx-auto min-w-[500px] max-w-[720px]">
            <div className="mb-6 h-10 border border-gold/35 bg-cream/70 text-center font-display text-[12px] font-700 uppercase leading-10 tracking-[0.2em] text-umber/60">Windows & reading lamps</div>
            <div className="grid grid-cols-6 gap-3 sm:gap-5" aria-label="Quiet Reading Hall seat map">
              {seats.map((seat) => <div key={seat.id} aria-label={`Seat ${seat.id}: ${seat.taken ? 'Taken' : 'Available'}`} className={`tb-cut-sm relative flex min-h-24 flex-col items-center justify-center border p-2 ${seat.taken ? 'border-umber bg-umber text-sand opacity-75' : 'border-gold/55 bg-cream text-umber'}`}>
                  <ArmchairIcon aria-hidden="true" className={`h-6 w-6 ${seat.taken ? 'text-sand/65' : 'text-gold'}`} />
                  <span className="mt-2 font-display text-[13px] font-900">{seat.id}</span>
                  <span className="mt-1 font-body text-[9px] font-800 uppercase tracking-[0.1em]">{seat.taken ? 'Taken' : 'Available'}</span>
                </div>)}
            </div>
            <div className="mt-6 h-9 border border-gold/35 bg-cream/70 text-center font-display text-[11px] font-700 uppercase leading-9 tracking-[0.18em] text-umber/60">Archive stacks</div>
          </div>
        </div>

        <p className="mt-5 flex items-center gap-2 border-t border-gold/30 pt-5 font-body text-[12px] font-700 text-umber/60"><InfoIcon aria-hidden="true" className="h-4 w-4 text-gold" />Seat availability is view-only for now.</p>
      </div>
    </OrnatePanel>

    <div className="grid gap-4 sm:grid-cols-3">
      <SeatStat label="Available now" value={`${openSeats}`} detail="Quiet Reading Hall" />
      <SeatStat label="Taken" value={`${seats.length - openSeats}`} detail="Currently occupied" />
      <SeatStat label="Capacity" value={`${seats.length}`} detail="Individual study seats" />
    </div>
  </div>;
}

function SeatStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="tb-cut-sm flex items-center gap-4 border border-gold/40 bg-parch/15 p-4"><span className="flex h-10 w-10 items-center justify-center border border-gold/50 bg-cream text-gold"><UsersIcon aria-hidden="true" className="h-5 w-5" /></span><span><span className="block font-body text-[10px] font-800 uppercase tracking-[0.17em] text-gold">{label}</span><strong className="mt-1 block font-display text-[22px] font-900 text-umber">{value}</strong><span className="block font-body text-[11px] font-600 text-umber/55">{detail}</span></span></div>;
}
