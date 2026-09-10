'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { CourtMapInnerProps } from './CourtMapInner';

// CourtMap — the SSR-safe entry point to the real map (Feature 88; renamed from
// LeafletMap when the engine moved to Google Maps — see docs/MAP_PROVIDER_DECISION.md §0).
//
// The Google Maps JS API touches `window`/`document`, so the actual implementation
// (CourtMapInner) is loaded via `next/dynamic({ ssr: false })`, exactly as the Leaflet
// engine was. This wrapper is a `'use client'` boundary (Next 15 only allows `ssr:false`
// dynamic imports inside client components) and is the ONLY thing pages/features import.
//
// It renders a quiet placeholder while the map chunk + the Google Maps JS API load, so
// there is never an empty abstract block (the old StylizedMapCanvas failure mode). Sizing/
// border are the caller's concern via `className` (the map fills its frame).
//
// COORDINATE SAFETY: this wrapper only forwards props; it never sees coordinates beyond
// the approximate (or, for the one entitled marker, exact) marker points the caller
// already prepared (see map-markers).

const CourtMapInner = dynamic(() => import('./CourtMapInner').then((m) => m.CourtMapInner), {
  ssr: false,
  loading: () => <MapLoading />,
});

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

export interface CourtMapProps extends CourtMapInnerProps {
  /** Frame classes (sizing/border/rounding) for the outer map container. */
  className?: string;
}

export function CourtMap({ className, ...inner }: CourtMapProps) {
  return (
    <div className={['tw-map-frame relative overflow-hidden', className].filter(Boolean).join(' ')}>
      <CourtMapInner {...inner} />
    </div>
  );
}
