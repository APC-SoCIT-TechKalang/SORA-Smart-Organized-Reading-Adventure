import React from 'react';

interface OrnatePanelProps {
  children: React.ReactNode;
  className?: string;
  /** Renders the gold lozenges at the panel corners. */
  corners?: boolean;
  as?: 'div' | 'section' | 'aside' | 'article';
}

export function OrnatePanel({
  children,
  className = '',
  corners = true,
  as: Tag = 'div'
}: OrnatePanelProps) {
  return (
    <Tag
      className={`tb-ornate-panel relative border border-gold/45 bg-cream shadow-plate ${className}`}>
      
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[3px] border border-parch/70" />
      
      {corners ? <PanelCorners /> : null}
      <div className="relative">{children}</div>
    </Tag>);

}

function PanelCorners() {
  return (
    <span aria-hidden="true">
      <Lozenge className="-left-[5px] -top-[5px]" />
      <Lozenge className="-right-[5px] -top-[5px]" />
      <Lozenge className="-bottom-[5px] -left-[5px]" />
      <Lozenge className="-bottom-[5px] -right-[5px]" />
    </span>);

}

function Lozenge({ className }: {className: string;}) {
  return (
    <span
      className={`absolute h-[9px] w-[9px] rotate-45 border border-gold bg-sun ${className}`} />);


}

interface SectionHeadingProps {
  title: string;
  meta?: string;
  className?: string;
  level?: 2 | 3;
}

export function SectionHeading({
  title,
  meta,
  className = '',
  level = 2
}: SectionHeadingProps) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <div className={`tb-section-heading flex items-end gap-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-[10px] w-[10px] rotate-45 border border-umber bg-rust" />
        
        <Tag className="font-display text-[clamp(1.05rem,2vw,1.35rem)] font-700 uppercase leading-none tracking-[0.12em] text-umber">
          {title}
        </Tag>
      </div>
      <span aria-hidden="true" className="tb-rule mb-[6px] flex-1" />
      {meta ?
      <span className="mb-[2px] font-body text-[11px] font-700 uppercase tracking-[0.22em] text-gold">
          {meta}
        </span> :
      null}
    </div>);

}
