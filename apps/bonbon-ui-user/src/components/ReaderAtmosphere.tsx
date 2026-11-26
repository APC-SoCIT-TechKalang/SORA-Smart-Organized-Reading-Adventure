import type { CSSProperties } from 'react';
import './reader-atmosphere.css';

const motes = [
  [8, 78, 2, 13], [20, 46, 2, 16], [42, 68, 3, 19], [54, 35, 2, 14],
  [66, 76, 4, 18], [74, 57, 2, 12], [86, 73, 3, 16], [94, 48, 2, 20],
];

export function ReaderAtmosphere() {
  return (
    <div aria-hidden="true" className="reader-atmosphere">
      <div className="reader-atmosphere-glow" />
      {motes.map(([x, y, size, duration], index) => (
        <span className="reader-atmosphere-mote" key={x} style={{
          '--mote-x': `${x}%`,
          '--mote-y': `${y}%`,
          '--mote-size': `${size}px`,
          '--mote-duration': `${duration}s`,
          '--mote-delay': `-${index * 2.7}s`,
        } as CSSProperties} />
      ))}
    </div>
  );
}
