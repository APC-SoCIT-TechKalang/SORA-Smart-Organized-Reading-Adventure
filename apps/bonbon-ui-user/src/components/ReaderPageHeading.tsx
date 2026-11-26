import type { ReactNode } from 'react';
import { ArmchairIcon, BookMarkedIcon, LibraryBigIcon, ScrollTextIcon } from 'lucide-react';
import { ReaderAtmosphere } from './ReaderAtmosphere';

const icons = { catalog: LibraryBigIcon, shelf: ScrollTextIcon, seats: ArmchairIcon, journal: BookMarkedIcon };

export function ReaderPageHeading({ kind, title, detail, children }: {
  kind: keyof typeof icons;
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  const Icon = icons[kind];

  return (
    <header className={`reader-page-heading reader-page-heading--${kind}`}>
      <ReaderAtmosphere />
      <div className="reader-page-heading-copy">
        <span className="reader-page-emblem"><Icon aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1>{title}</h1>
          {detail && <p>{detail}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}
