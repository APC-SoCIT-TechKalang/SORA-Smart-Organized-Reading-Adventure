import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Volume } from '../types/library';

export interface ParallaxCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  color: string;
  ink: string;
  author?: string;
  genre?: string;
  rating?: number;
  volume: Volume;
}

interface ParallaxCarouselProps {
  items: ParallaxCarouselItem[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onOpen: (item: ParallaxCarouselItem) => void;
}

export function ParallaxCarousel({ items, activeIndex, onActiveChange, onOpen }: ParallaxCarouselProps) {
  const [pointer, setPointer] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const current = items[activeIndex];
  const next = items[(activeIndex + 1) % items.length] ?? current;

  const move = (amount: number) => onActiveChange(Math.max(0, Math.min(items.length - 1, activeIndex + amount)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) return null;

  function handleCardClick(item: ParallaxCarouselItem, index: number) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (index === activeIndex) {
      onOpen(item);
      return;
    }
    onActiveChange(index);
  }

  return <div
    className="parallax-carousel"
    tabIndex={0}
    aria-label="New arrivals book carousel"
    onMouseMove={(event) => {
      const box = event.currentTarget.getBoundingClientRect();
      setPointer((event.clientX - box.left) / box.width - 0.5);
    }}
    onMouseLeave={() => setPointer(0)}
    onPointerDown={(event) => {
      dragStart.current = event.clientX;
    }}
    onPointerUp={(event) => {
      if (dragStart.current !== null && Math.abs(event.clientX - dragStart.current) > 35) {
        suppressClick.current = true;
        move(event.clientX < dragStart.current ? 1 : -1);
        window.setTimeout(() => { suppressClick.current = false; }, 0);
      }
      dragStart.current = null;
    }}
    onWheel={(event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) move(event.deltaY + event.deltaX > 0 ? 1 : -1);
    }}>
    <div className="parallax-stage" style={{ '--accent': current.color, '--accent-next': next.color } as React.CSSProperties}>
      <div aria-hidden="true" className="parallax-gradient parallax-gradient-one" />
      <div aria-hidden="true" className="parallax-gradient parallax-gradient-two" />
      <div aria-hidden="true" className="parallax-aura" />
      <div className="parallax-track">
        {items.map((item, index) => {
          const distance = index - activeIndex;
          const visible = Math.abs(distance) <= 2;
          return <button
            key={item.id}
            type="button"
            className={`parallax-card ${distance === 0 ? 'is-active' : ''} ${visible ? 'is-visible' : 'is-hidden'} ${hovered === index ? 'is-hovered' : ''}`}
            style={{ '--offset': distance, '--abs-offset': Math.abs(distance), '--pointer': pointer, '--cover': item.color } as React.CSSProperties}
            onPointerEnter={() => setHovered(index)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            onClick={() => handleCardClick(item, index)}
            aria-current={distance === 0 ? 'true' : undefined}
            aria-label={distance === 0 ? `Open details for ${item.title}` : `Select ${item.title}`}>
            <span className="parallax-image">
              <motion.img layoutId={`volume-cover-${item.id}`} src={item.image} alt={`${item.title} book cover`} transition={{ type: 'spring', stiffness: 330, damping: 30 }} onError={(event) => { event.currentTarget.src = '/book-placeholder.svg'; }} />
              <span className="parallax-frame" />
              <span className="parallax-volume-badge">{item.volume.volume}</span>
            </span>
          </button>;
        })}
      </div>
      <div className="parallax-caption">
        <span className="parallax-caption-number">{String(activeIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
        <span className="min-w-0"><strong>{current.title}</strong><small>{current.author ?? 'New volume'} · {current.genre ?? 'Manga'}{current.rating ? ` · ★ ${current.rating}` : ''}</small></span>
      </div>
      <p className="parallax-instruction">Click a side book to focus it. Click the centered book to view its details.</p>
    </div>
  </div>;
}
