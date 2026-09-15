import React from 'react';
import { BookOpenIcon, CoinsIcon, FlameIcon, HourglassIcon } from 'lucide-react';
import { OrnatePanel } from './OrnatePanel';
import { useGame } from '../contexts/GameContext';

export function StatStrip() {
  const { streak, coins, borrowed } = useGame();

  const stats = [
  {
    id: 'read',
    value: `${47 + borrowed.filter((item) => item.progress === 100).length}`,
    label: 'Volumes cleared',
    note: '+3 this week',
    Icon: BookOpenIcon
  },
  {
    id: 'hours',
    value: '128h',
    label: 'Hours logged',
    note: 'Top 10% of readers',
    Icon: HourglassIcon
  },
  {
    id: 'coins',
    value: coins.toLocaleString(),
    label: 'Bonbon coins',
    note: 'Spend at the vault',
    Icon: CoinsIcon
  },
  {
    id: 'streak',
    value: `${streak}`,
    label: 'Day streak',
    note: 'Keep the lantern lit',
    Icon: FlameIcon
  }];


  return (
    <section
      aria-label="Your reading stats"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      
      {stats.map(({ id, value, label, note, Icon }) =>
      <OrnatePanel key={id} corners={false} className="tb-cut-sm">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="flex h-11 w-11 shrink-0 rotate-45 items-center justify-center border border-gold bg-parch/50">
              <Icon aria-hidden="true" className="h-5 w-5 -rotate-45 text-rust" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[24px] font-900 leading-none text-umber">
                {value}
              </p>
              <p className="mt-1 font-body text-[10px] font-800 uppercase tracking-[0.22em] text-gold">
                {label}
              </p>
              <p className="mt-1 truncate font-body text-[12px] font-600 text-umber/60">
                {note}
              </p>
            </div>
          </div>
        </OrnatePanel>
      )}
    </section>);

}