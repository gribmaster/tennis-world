'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtMap } from './CourtMap';
import { MapLocateControl } from './MapLocateControl';
import { MapCourtPreview } from './MapCourtPreview';
import { useGeolocation } from './useGeolocation';
import { findNearestPoint } from './geo-distance';
import type { MapFocusRequest } from './CourtMapInner';
import type { MapMarker } from './map-markers';

// MapExpandedModal — the full-size interactive map (TASK_57). `MapExplorer` renders
// this component ONLY while open — a conditional render, never `hidden` — so the
// Google Maps script load and the browser's geolocation prompt both happen ONLY when
// a signed-in visitor actually opens it. The Courts screen's small preview panel
// (`MapPreviewPanel`) never triggers either.
//
// NEAREST-COURT AUTO-FOCUS moved here from `MapExplorer` (TASK_57). On the old
// "full-height map" layout, asking for the visitor's position on page load made sense
// — the map was the whole screen. On the v3 card screen that prompt would fire for a
// map the visitor hasn't even opened yet. So it now runs once per MODAL MOUNT instead
// of once per page load; the same ref guards (`autoFocusStartedRef`, etc.) make that
// safe under Strict Mode's double-invoked effect exactly as they did in MapExplorer.
// `scripts/verify-map-autofocus.ts` greps for this logic — it was RE-POINTED at this
// file, not deleted.
//
// Everything else below (the interactive CourtMap, pin click → Court Detail on
// desktop / MapCourtPreview on mobile, the manual locate control) is moved here
// unchanged from MapExplorer — these are exactly the pieces that only make sense once
// the map is actually open full-size.
//
// A11Y — follows FilterSheet's own implementation (role="dialog", focus trap, Esc
// closes, focus moves to the close control on open and is restored to the opener on
// close, background scroll locked while open), duplicated rather than extracted into a
// shared hook per the brief: this dialog has no draft-then-apply and exposes a visible
// ✕ control positioned per breakpoint, so the two are similar but not identical.
//
// Opening/closing is local state only, owned by MapExplorer — no navigation, no
// Pending* primitive.

/** Target zoom for the nearest-court focus — clamped to the map's real range downstream. */
const NEAREST_COURT_ZOOM = 12;

/** Selector for everything focusable inside the dialog (used by the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export interface MapExpandedModalProps {
  /** The same filtered marker set the preview panel/grid already show. */
  markers: MapMarker[];
  /** The same filtered court set — used only for the mobile pin-tap preview's "nearby" list. */
  visibleCourts: CourtSummaryDTO[];
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  onClose: () => void;
}

export function MapExpandedModal({
  markers,
  visibleCourts,
  viewerIsEntitled = false,
  onClose,
}: MapExpandedModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ── Mobile pin-tap preview (Task 27/Feature 86) — moved here with the rest of the
  // interactive map. Desktop never sets this (see handleMarkerClick below). ──────────
  const [selectedCourt, setSelectedCourt] = useState<CourtSummaryDTO | null>(null);

  const handleMarkerClick = useCallback(
    (marker: MapMarker) => {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        router.push(`/courts/${marker.slug}`);
        return;
      }
      const court = visibleCourts.find((c) => c.slug === marker.slug) ?? null;
      setSelectedCourt(court);
    },
    [router, visibleCourts],
  );

  const handleClosePreview = useCallback(() => setSelectedCourt(null), []);

  // A filter change behind the modal (or the underlying court set changing) can drop
  // the previewed court out of the visible set — close rather than show a stale court.
  useEffect(() => {
    setSelectedCourt((prev) =>
      prev && !visibleCourts.some((c) => c.slug === prev.slug) ? null : prev,
    );
  }, [visibleCourts]);

  // ── Nearest-court auto-focus (moved from MapExplorer — see file header) ────────────
  const { pending: locating, error: locateError, locate } = useGeolocation();

  const [focus, setFocus] = useState<MapFocusRequest | null>(null);
  const focusTokenRef = useRef(0);
  // Ensures the automatic request happens AT MOST ONCE per MODAL MOUNT.
  const autoFocusStartedRef = useRef(false);
  const userTookControlRef = useRef(false);
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const handleUserInteraction = useCallback(() => {
    userTookControlRef.current = true;
  }, []);

  const focusNearestCourt = useCallback(
    async ({ automatic }: { automatic: boolean }): Promise<void> => {
      const coords = await locate();
      if (!coords) return;
      if (automatic && userTookControlRef.current) return;

      const nearest = findNearestPoint(markersRef.current, coords);
      if (!nearest) return;

      focusTokenRef.current += 1;
      setFocus({
        lat: nearest.lat,
        lng: nearest.lng,
        zoom: NEAREST_COURT_ZOOM,
        token: focusTokenRef.current,
      });
    },
    [locate],
  );

  useEffect(() => {
    if (autoFocusStartedRef.current) return;
    autoFocusStartedRef.current = true;
    void focusNearestCourt({ automatic: true });
  }, [focusNearestCourt]);

  const handleLocateClick = useCallback(() => {
    void focusNearestCourt({ automatic: false });
  }, [focusNearestCourt]);

  // ── A11y: Esc closes, focus trap, focus move-in/restore, background scroll lock ────
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/60 md:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Map"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative h-full w-full overflow-hidden bg-bone outline-none md:h-[82%] md:w-[82%] md:max-w-[1040px] md:rounded-[20px] md:bg-paper md:shadow-[0_40px_100px_rgba(0,0,0,0.4)]"
      >
        <CourtMap
          markers={markers}
          onMarkerClick={handleMarkerClick}
          className="h-full w-full"
          focus={focus}
          onUserInteraction={handleUserInteraction}
        />

        {/* Pushed below the close button (right-3 top-16, not the default top-3) so the
            two never collide — see MapLocateControl's own `className` prop doc. */}
        <MapLocateControl
          pending={locating}
          error={locateError}
          onLocate={handleLocateClick}
          className="top-16"
        />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] z-[1000] flex h-9 w-9 items-center justify-center rounded-pill bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,0.15)] backdrop-blur-[8px] md:right-[18px] md:top-[18px] md:h-[38px] md:w-[38px] md:border md:border-[rgba(184,184,182,0.4)] md:bg-paper md:shadow-none md:backdrop-blur-none"
        >
          <CloseGlyph />
        </button>

        {selectedCourt ? (
          <MapCourtPreview
            key={selectedCourt.slug}
            court={selectedCourt}
            visibleCourts={visibleCourts}
            viewerIsEntitled={viewerIsEntitled}
            onClose={handleClosePreview}
            onSelectCourt={setSelectedCourt}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
