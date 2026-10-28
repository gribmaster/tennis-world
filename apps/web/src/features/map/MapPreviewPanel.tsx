'use client';

import { CourtMap } from './CourtMap';
import type { MapMarker } from './map-markers';

// MapPreviewPanel — the small map preview box on the Courts screen (TASK_57). There is
// exactly ONE `<CourtMap>` instance on the page at a time while this panel is closed,
// and no Google Maps load at all for a guest (billing + coordinate-safety posture from
// Feature 88 §6.1 — see `CourtDetailLocationPreview`'s own header comment). That rules
// out mounting a mobile map AND a desktop map and hiding one with CSS: this is the ONE
// element, sized by the parent slot per breakpoint (148×140 mobile, 380×460 desktop) —
// it simply fills whatever box it is given.
//
// Three states:
//   1. GUEST — no `CourtMap`, no coordinates anywhere in its DOM. A static tonal
//      gradient (the same recipe `CourtMap`'s own `MapLoading` placeholder uses) behind
//      a frosted lock overlay. Not clickable (the prototype's `.lock-overlay` is
//      `cursor: default`) — there is nothing behind it to open.
//   2. SIGNED IN (free or entitled) — a non-interactive, live `CourtMap` fitted to the
//      visible markers, with a transparent full-size button laid over it that opens the
//      expanded map modal. Premium courts stay masked on the markers themselves for a
//      free viewer (`courtToMarker` already handles that) — this panel does not
//      additionally gate on entitlement.
//   3. Nothing else — no "N pins" overlay, no expand icon; not in v3.

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export interface MapPreviewPanelProps {
  /** Whether this viewer has an active session. Guests never get a live map. */
  signedIn: boolean;
  /** The same filtered marker set the court grid renders (so the preview never drifts). */
  markers: MapMarker[];
  /** Opens the expanded map modal. Ignored (no button rendered) for a guest. */
  onOpen: () => void;
  className?: string;
}

export function MapPreviewPanel({ signedIn, markers, onOpen, className }: MapPreviewPanelProps) {
  return (
    <div
      className={['relative overflow-hidden rounded-[16px]', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {!signedIn ? (
        <div className="relative h-full w-full cursor-default">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-[#eef0ea] to-[#d9dcd2]"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-bone/70 text-stone backdrop-blur-[16px]">
            <LockGlyph className="h-5 w-5 md:h-[22px] md:w-[22px]" />
            <span className="md:hidden text-[10px]">Sign in to unlock</span>
            <span className="hidden text-[12px] md:inline">Sign in to unlock the map</span>
          </div>
        </div>
      ) : (
        <>
          <CourtMap markers={markers} interactive={false} className="h-full w-full" />
          <button
            type="button"
            onClick={onOpen}
            aria-label="Open map"
            aria-haspopup="dialog"
            className="absolute inset-0 cursor-pointer"
          />
        </>
      )}
    </div>
  );
}
