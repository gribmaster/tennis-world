'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

// HScrollArrows — desktop-only left/right controls for a horizontal `overflow-x-auto`
// strip (Task 32). Wraps the caller's own scrollable element in a `position: relative`
// box and overlays two round arrow buttons at its edges, reusing the exact 36×36
// `rounded-full border-[1.5px] border-ink/20` circle + arrow-glyph language already
// established by HomeMapPreviewBand/HomePaywallBand — with a `bg-paper` fill added so the
// circle stays legible sitting over photography (the `paper` token is reserved for media
// overlays for exactly this reason; those two precedents never sit over an image so they
// had no need of one).
//
// API — render prop, not forwardRef: this component owns `canScrollLeft`/`canScrollRight`
// state that must re-render on every `scroll` event, so the ref it hands out has to be
// attached to the exact element that state is computed from. A render prop keeps that one
// ref as the single source of truth without this component injecting an extra wrapping
// element around the list itself — the only element it adds is the `position: relative`
// box, which carries no padding/margin/overflow of its own, so a caller's `-mr-[...]`
// edge-bleed trick on its own `<ul>` still cancels the same ancestor gutter as before.
//
// Desktop-only: `hidden md:flex` lives on the BUTTONS, not the wrapper, so the scroll
// container and its content render identically at every width — only the arrow controls
// disappear below the 768px `md:` breakpoint, where touch swipe is already the scroll
// affordance.

const SCROLL_EPSILON = 4;

function ArrowGlyph({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={flipped ? 'scale-x-[-1]' : undefined}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const ARROW_BUTTON_CLASS =
  'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center ' +
  'rounded-full border-[1.5px] border-ink/20 bg-paper text-ink shadow-[0_1px_6px_rgba(15,15,15,0.15)] ' +
  'transition-opacity hover:opacity-80 md:flex';

export interface HScrollArrowsProps {
  /** Render prop — attach the returned ref to the caller's own scrollable element. */
  children: (scrollRef: RefObject<HTMLUListElement | null>) => ReactNode;
  className?: string;
}

export function HScrollArrows({ children, className }: HScrollArrowsProps) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > SCROLL_EPSILON);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - SCROLL_EPSILON);
  }, []);

  // Register the scroll/resize listeners once.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // Recompute after every commit (mount, and whenever the caller's list content changes,
  // e.g. a Home filter narrowing the strip) — cheap, and catches content-width changes
  // that don't otherwise fire a scroll or resize event.
  useEffect(() => {
    updateScrollState();
  });

  const scrollByDirection = useCallback((direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }, []);

  return (
    <div className={['relative', className ?? ''].filter(Boolean).join(' ')}>
      {children(scrollRef)}

      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scrollByDirection(-1)}
          aria-label="Scroll left"
          className={`${ARROW_BUTTON_CLASS} left-2`}
        >
          <ArrowGlyph flipped />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scrollByDirection(1)}
          aria-label="Scroll right"
          className={`${ARROW_BUTTON_CLASS} right-2`}
        >
          <ArrowGlyph />
        </button>
      ) : null}
    </div>
  );
}
