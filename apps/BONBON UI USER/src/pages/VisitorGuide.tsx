import { ArmchairIcon, InfoIcon } from 'lucide-react';
import { SectionHeading } from '../components/OrnatePanel';

const SEATS = Array.from({ length: 20 }, (_, index) => ({
  id: `${String.fromCharCode(65 + Math.floor(index / 5))}${index % 5 + 1}`,
  taken: [1, 4, 7, 11, 15, 18].includes(index),
}));

export function VisitorGuide() {
  const available = SEATS.filter((seat) => !seat.taken).length;
  return (
    <div className="space-y-6">
      <SectionHeading title="Reading hall seats" meta={`${available} seats open`} />
      <section className="tb-surface tb-cut-lg p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl"><p className="tb-eyebrow">Quiet reading hall</p><h1 className="mt-2 font-display text-2xl font-900 text-umber sm:text-3xl">Find a comfortable reading spot</h1><p className="mt-3 text-sm font-600 leading-6 text-umber/65">Preview the 20-seat Tankobonbon reading hall before you arrive. Live occupancy will appear here when the RFID system is connected.</p></div>
          <span className="rounded-full border border-gold/35 bg-parch/25 px-3 py-2 text-[10px] font-800 uppercase tracking-[.12em] text-rust">Demo preview</span>
        </div>

        <div className="mt-6 rounded-xl border border-gold/25 bg-parch/15 p-3 sm:p-6">
          <div className="mx-auto max-w-[680px]">
            <div className="mb-4 rounded-lg border border-gold/25 bg-cream/75 px-4 py-2.5 text-center text-[10px] font-800 uppercase tracking-[.16em] text-umber/55">Windows and reading lamps</div>
            <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-4 sm:grid-cols-5 sm:gap-3" aria-label="Seat map preview">
              {SEATS.map((seat) => <div key={seat.id} aria-label={`Seat ${seat.id}: ${seat.taken ? 'taken' : 'open'}`} className={`tb-seat flex min-h-[76px] flex-col items-center justify-center rounded-lg border p-2 sm:min-h-[92px] ${seat.taken ? 'is-taken border-umber bg-umber text-sand' : 'border-gold/40 bg-cream text-umber'}`}><ArmchairIcon aria-hidden="true" className={`h-5 w-5 sm:h-6 sm:w-6 ${seat.taken ? 'text-sand/65' : 'text-gold'}`} /><strong className="mt-1.5 font-display text-xs font-900 sm:text-sm">{seat.id}</strong><span className={`mt-0.5 text-[8px] font-800 uppercase tracking-[.08em] ${seat.taken ? 'text-sand/60' : 'text-emerald-700'}`}>{seat.taken ? 'Taken' : 'Open'}</span></div>)}
            </div>
            <div className="mt-4 rounded-lg border border-gold/25 bg-cream/75 px-4 py-2.5 text-center text-[10px] font-800 uppercase tracking-[.16em] text-umber/55">Archive stacks</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3"><SeatSummary label="Open now" value={available} /><SeatSummary label="Taken" value={SEATS.length - available} /><SeatSummary label="Capacity" value={SEATS.length} /></div>
        <p className="mt-5 flex items-start gap-2 border-t border-gold/25 pt-4 text-xs font-700 leading-5 text-umber/55"><InfoIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />Seat selection is view-only. Ask library staff about reservations.</p>
      </section>
    </div>
  );
}

function SeatSummary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-gold/25 bg-cream/70 px-2 py-3 text-center sm:px-4 sm:text-left"><span className="text-[8px] font-800 uppercase tracking-[.1em] text-umber/50 sm:text-[10px]">{label}</span><strong className="mt-1 block font-display text-xl font-900 text-umber sm:text-2xl">{value}</strong></div>;
}
