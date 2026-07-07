'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { LeafletMapInnerProps } from './LeafletMapInner';

// LeafletMap — the SSR-safe entry point to the real map (Feature 74).
//
// Leaflet reads `window`/`document` at import time, so the actual implementation
// (LeafletMapInner) is loaded via `next/dynamic({ ssr: false })`. This wrapper is a
// `'use client'` boundary (Next 15 only allows `ssr:false` dynamic imports inside
// client components) and is the ONLY thing pages/features import.
//
// It renders a quiet placeholder while the map chunk + tiles load, so there is never
// an empty abstract block (the old StylizedMapCanvas failure mode). Sizing/border are
// the caller's concern via `className` (the map fills its frame).
//
// COORDINATE SAFETY: this wrapper only forwards props; it never sees coordinates
// beyond the approximate marker points the caller already prepared (see map-markers).

const LeafletMapInner = dynamic(
  () => import('./LeafletMapInner').then((m) => m.LeafletMapInner),
  {
    ssr: false,
    loading: () => <MapLoading />,
  },
);

/** Restrained loading state — a soft tonal panel, never an empty white box. */
function MapLoading(): ReactNode {
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#eef0ea] to-[#d9dcd2]"
    >
      <span className="serif text-xs uppercase tracking-[0.32em] text-stone/70">
        Loading map…
      </span>
    </div>
  );
}

export interface LeafletMapProps extends LeafletMapInnerProps {
  /** Frame classes (sizing/border/rounding) for the outer map container. */
  className?: string;
}

export function LeafletMap({ className, ...inner }: LeafletMapProps) {
  return (
    <div className={['tw-map-frame relative overflow-hidden', className].filter(Boolean).join(' ')}>
      <LeafletMapInner {...inner} />
    </div>
  );
}
