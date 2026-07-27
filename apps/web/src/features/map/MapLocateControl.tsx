'use client';

import { InlineSpinner } from '@/components/ui';
import type { GeolocationError } from './useGeolocation';

// MapLocateControl — the small "find the court nearest me" control on the Map screen.
//
// PRESENTATIONAL & controlled: it owns no geolocation logic and no state. The pending
// flag, the last error, and the click handler all come from MapExplorer, which holds the
// single `useGeolocation()` instance — so this button and the automatic initial focus run
// the exact same code path (no second permission request, no forked behaviour).
//
// PENDING RULES (CLAUDE.md §4). This is not a `Button`, so it uses the same triad the
// other non-`Button` async controls use (cf. CourtSaveButton): local pending +
// `disabled={pending}` + `aria-busy={pending}` + `<InlineSpinner label="…" />`. The spinner
// swaps 1:1 with the crosshair glyph inside a fixed 36×36 box, so the control does not
// reflow while busy, and the indicator appears ONLY on this element — the map, its zoom
// control, the filter chips, and every list row stay fully interactive. There is no
// full-page or full-map blocking overlay: the map stays visible and usable throughout.

/** Crosshair/target glyph — the conventional "locate" affordance, in the app's line style. */
function LocateGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 1.8v3.2M12 19v3.2M22.2 12H19M5 12H1.8" />
    </svg>
  );
}

export interface MapLocateControlProps {
  /** True while the shared geolocation request is open. */
  pending: boolean;
  /** Last geolocation failure, or null. Rendered as a small, non-blocking note. */
  error: GeolocationError | null;
  /** Re-run the shared locate → nearest-court → focus flow. */
  onLocate: () => void;
}

export function MapLocateControl({ pending, error, onLocate }: MapLocateControlProps) {
  return (
    // Overlaid on the map canvas at top-RIGHT: Leaflet's zoom control sits top-left and the
    // attribution bottom-right, so nothing is covered. `z-[1000]` clears Leaflet's control
    // panes (max 800). The wrapper is `pointer-events-none` so the empty space beside the
    // button never intercepts a map drag.
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onLocate}
        disabled={pending}
        aria-busy={pending}
        aria-disabled={pending || undefined}
        aria-label="Find the court nearest me"
        title="Find the court nearest me"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-bone text-graphite shadow-[0_1px_4px_rgba(15,15,15,0.08)] transition-colors hover:bg-white hover:text-ink disabled:cursor-default"
      >
        {pending ? <InlineSpinner label="Finding the nearest court…" /> : <LocateGlyph />}
      </button>

      {/* Calm, non-blocking note — this repo has no toast system, so the message is scoped
          to the control itself. It never covers the map or blocks interaction. */}
      {error ? (
        <p
          role="status"
          className="pointer-events-none max-w-[220px] rounded-md border border-hairline bg-bone/95 px-2.5 py-1.5 text-[11px] leading-snug text-stone"
        >
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
