'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { PendingLink } from '@/components/navigation';
import { PaywallTrigger } from '@/features/paywall';
import {
  FilterSheet,
  EMPTY_COURT_FILTER_STATE,
  countActiveFilters,
  narrowCourts,
  type CourtFilterState,
} from '@/components/filters';
import { MapSearchBar } from './MapSearchBar';
import { MapPreviewPanel } from './MapPreviewPanel';
import { MapExpandedModal } from './MapExpandedModal';
import { MapCourtGrid } from './MapCourtGrid';
import {
  courtToMarker,
  pinStateToMarkerState,
  type MapMarkerState,
} from './map-markers';

// MapExplorer — the ONE `'use client'` boundary on the Courts screen (`/map`).
//
// TASK_57 (v3): the screen stopped being "full-height map + list panel" and became a
// CARD SCREEN with a small map attached — heading + search, a grid of the shared
// `CourtCard` (TASK_56) as the main content, a small map PREVIEW panel that opens a
// full-size modal on click, and a status line. See docs/TASK_57_V3_COURTS_SCREEN.md.
//
// It holds the interactive state (a single `CourtFilterState`, the sheet's open/closed
// flag, and whether the expanded map modal is open) and derives the visible set in
// memory FROM THE PROPS it was handed — it does NOT call a repository and does NOT
// import @tennis/mock-data. The whole filter state can still be SEEDED from the URL via
// `initialFilters` (Feature 76/Task 54) — unchanged by this task.
//
// GUEST MAP GATE (`REDESIGN_V3_PLAN.md` decision 3): a signed-out visitor never gets a
// live map anywhere on this screen — not in the preview panel, not in a modal (the
// modal cannot even open without a map to show). This is a UX gate, not a security
// boundary: `courts.list()` is a public endpoint and approximate geo already reaches a
// guest's page payload; see MapPreviewPanel's own header.
//
// SAVED STATE IS LIFTED HERE (not read fresh from the `savedCourtIds` prop by each
// card): the court grid is filtered client-side, so cards unmount/remount as the user
// types or toggles a filter. Seeding `initialSaved` straight from the prop on every
// mount would show a bookmarked-then-filtered-away-then-back court as unsaved again.
// `savedIds` + `handleSavedChange` fix that — the save button still owns its own
// mutation/optimistic-flip/rollback; this only remembers which ids are saved so a
// remount sees the truth.
//
// GEOLOCATION LIVES IN THE MODAL, NOT HERE (TASK_57): the nearest-court auto-focus used
// to run on this component's mount. On a card screen with no map on screen yet, that
// prompt had no visible reason, so it now runs once per `MapExpandedModal` MOUNT
// instead — see that file's header. This component does not import `useGeolocation`.

export interface MapExplorerProps {
  /** Full published set — the source the client narrows over (never re-fetched). */
  courts: CourtSummaryDTO[];
  /** Pin positions + state, one per court. Used ONLY for `state`, keyed by `slug`. */
  pins: MapPinDTO[];
  /**
   * The filter state to START with (Task 54; previously `initialQuery`, `q`-only).
   * Supplied by `app/map/page.tsx` from the URL — see `parseCourtFilterSearchParams`.
   * SEED ONLY, NOT A CONTROLLED VALUE: this component stays the single owner of the
   * live filter state; reset clears back to EMPTY (not back to the seed).
   */
  initialFilters?: CourtFilterState;
  /**
   * Whether this viewer carries an active (non-free) membership (Task 26). Resolved
   * server-side, once, in `app/map/page.tsx` — unmasks locked-court names/locations.
   */
  viewerIsEntitled?: boolean;
  /** Whether this viewer has an active session (TASK_57). Guests never get a map. */
  signedIn: boolean;
  /** Ids of the courts this viewer has already saved — seeds every card's save button. */
  savedCourtIds: string[];
}

type ViewerStatus = 'guest' | 'free' | 'entitled';

function viewerStatus(signedIn: boolean, viewerIsEntitled: boolean): ViewerStatus {
  if (!signedIn) return 'guest';
  return viewerIsEntitled ? 'entitled' : 'free';
}

const STATUS_TEXT: Record<ViewerStatus, string> = {
  guest: 'Sign in to save courts & view the map',
  free: 'Free Access — Upgrade for every court',
  entitled: 'Full Map Access — Unlocked',
};

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/** The 18px ink circle holding the status glyph — shared by the card and the pill. */
function StatusGlyphBadge({ status }: { status: ViewerStatus }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-pill bg-ink text-bone">
      {status === 'guest' ? (
        <LockGlyph className="h-[9px] w-[9px]" />
      ) : (
        <CheckGlyph className="h-[10px] w-[10px]" />
      )}
    </span>
  );
}

/** Desktop status card, directly under the map panel (same sticky wrapper). */
function StatusCard({ status }: { status: ViewerStatus }) {
  return (
    <div className="mt-4 hidden items-center gap-2.5 rounded-[12px] bg-paper px-[18px] py-3.5 shadow-[0_2px_12px_rgba(15,15,15,0.06)] md:flex">
      <StatusGlyphBadge status={status} />
      <span className="text-[13px] font-medium text-ink">{STATUS_TEXT[status]}</span>
    </div>
  );
}

/** Mobile status pill — floats at the bottom of the card list while scrolling. */
function StatusPill({ status }: { status: ViewerStatus }) {
  return (
    <div className="glass-surface sticky bottom-[18px] mx-4 mt-[22px] flex items-center justify-center gap-2 rounded-pill px-5 py-[13px] shadow-[0_16px_40px_rgba(15,15,15,0.18),0_2px_10px_rgba(15,15,15,0.08)] md:hidden">
      <StatusGlyphBadge status={status} />
      <span className="text-[12px] font-medium text-ink">{STATUS_TEXT[status]}</span>
    </div>
  );
}

/** The link line under the <h1> — content and destination depend on viewer status. */
function HeadingLink({ status }: { status: ViewerStatus }) {
  if (status === 'guest') {
    return (
      <PendingLink
        href="/signin?redirectTo=/map"
        className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink underline md:text-[14px]"
      >
        <LockGlyph className="h-[10px] w-[10px] md:h-[11px] md:w-[11px]" />
        Sign in to unlock the map →
      </PendingLink>
    );
  }
  if (status === 'free') {
    return (
      <PaywallTrigger
        source="map-heading"
        className="mt-2 inline-flex items-center text-[13px] text-ink underline md:text-[14px]"
      >
        Unlock full map access →
      </PaywallTrigger>
    );
  }
  return <span className="mt-2 block text-[13px] text-stone md:text-[14px]">All courts unlocked</span>;
}

export function MapExplorer({
  courts,
  pins,
  initialFilters,
  viewerIsEntitled = false,
  signedIn,
  savedCourtIds,
}: MapExplorerProps) {
  // ONE state object for every dimension the user can narrow by (chips + free text).
  // Lazy initializer so the seed is read ONCE on mount and never on a re-render.
  const [filters, setFilters] = useState<CourtFilterState>(
    () => initialFilters ?? EMPTY_COURT_FILTER_STATE,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // Lifted save state — see the file header on why this can't just be each card's own
  // `initialSaved` read straight from the prop.
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(savedCourtIds));
  const handleSavedChange = useCallback((courtId: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(courtId);
      else next.delete(courtId);
      return next;
    });
  }, []);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  // Derive the visible courts once, in memory: OR within each dimension, AND across
  // dimensions, plus the case-insensitive free-text query.
  const visibleCourts = useMemo(() => narrowCourts(courts, filters), [courts, filters]);

  // Authoritative pin state (open/locked/featured) keyed by slug.
  const stateBySlug = useMemo(() => {
    const map = new Map<string, MapMarkerState>();
    for (const pin of pins) map.set(pin.slug, pinStateToMarkerState(pin.state));
    return map;
  }, [pins]);

  // Markers come from the SAME filtered set as the grid — plotted at approximate geo.
  const visibleMarkers = useMemo(
    () => visibleCourts.map((court) => courtToMarker(court, stateBySlug, viewerIsEntitled)),
    [visibleCourts, stateBySlug, viewerIsEntitled],
  );

  // ── Filter handlers (all purely local UI — no navigation, no repository call) ──────
  const handleQueryChange = useCallback((q: string) => {
    setFilters((prev) => ({ ...prev, q }));
  }, []);

  const handleApplyFilters = useCallback((next: CourtFilterState) => {
    setFilters(next);
    setSheetOpen(false);
  }, []);

  const handleCloseSheet = useCallback(() => setSheetOpen(false), []);

  /** Empty-state / "reset" escape hatch: clears every chip AND the search text. */
  const handleReset = useCallback(() => {
    setFilters(EMPTY_COURT_FILTER_STATE);
  }, []);

  // TASK_58 cleanup carried over from TASK_57: MapExpandedModal's focus/scroll-lock
  // effect depends on `[onClose]`. A fresh arrow function here on every render would
  // re-run that effect whenever MapExplorer re-renders while the modal is open,
  // breaking focus restoration on close. useCallback keeps the same function identity
  // across renders so the effect only runs once per modal mount.
  const handleCloseMap = useCallback(() => setMapOpen(false), []);

  const status = viewerStatus(signedIn, viewerIsEntitled);
  const count = visibleCourts.length;

  return (
    <>
      <PageContainer className="pt-8 pb-[72px] md:pt-11">
        <div className="grid grid-cols-[1fr_148px] items-start gap-x-[14px] md:grid-cols-[1fr_380px] md:gap-x-8">
          {/* Row: search (mobile: spans both cols, first; desktop: col 2, bottom-aligned) */}
          <div className="col-span-2 row-start-1 pt-4 md:col-span-1 md:col-start-2 md:row-start-1 md:self-end md:pt-0">
            <MapSearchBar
              query={filters.q}
              onQueryChange={handleQueryChange}
              onOpenSheet={() => setSheetOpen(true)}
              activeCount={activeCount}
              sheetOpen={sheetOpen}
            />
          </div>

          {/* Heading + link line (mobile: col 1, row 2; desktop: col 1, row 1, bottom-aligned) */}
          <div className="col-start-1 row-start-2 pt-[22px] md:row-start-1 md:self-end md:pt-0">
            <h1 className="serif text-[30px] font-normal leading-[1.08] text-ink md:text-[44px] md:leading-[1.1]">
              {status === 'guest' ? 'Sign in to view the map' : `${count} ${count === 1 ? 'Court' : 'Courts'}`}
            </h1>
            <HeadingLink status={status} />
          </div>

          {/* Map slot (mobile: col 2, same row as heading; desktop: col 2, row 2, sticky) */}
          <div className="col-start-2 row-start-2 md:self-start md:sticky md:top-[calc(var(--nav-offset)+16px)]">
            <MapPreviewPanel
              signedIn={signedIn}
              markers={visibleMarkers}
              onOpen={() => setMapOpen(true)}
              className="h-[140px] w-[148px] shadow-[0_2px_14px_rgba(15,15,15,0.12)] md:h-[460px] md:w-[380px] md:shadow-[0_4px_20px_rgba(15,15,15,0.12)]"
            />
            <StatusCard status={status} />
          </div>

          {/* Card list + mobile status pill (mobile: spans both cols; desktop: col 1, row 2) */}
          <div className="col-span-2 row-start-3 pt-[22px] md:col-span-1 md:col-start-1 md:row-start-2 md:pt-0">
            <MapCourtGrid
              courts={visibleCourts}
              filters={filters}
              activeCount={activeCount}
              onReset={handleReset}
              viewerIsEntitled={viewerIsEntitled}
              signedIn={signedIn}
              savedIds={savedIds}
              onSavedChange={handleSavedChange}
            />
            <StatusPill status={status} />
          </div>
        </div>
      </PageContainer>

      {/* The SHARED sheet (components/filters) — Draft-then-apply lives inside it:
          nothing here changes until "Show results" fires `onApply`. */}
      <FilterSheet
        open={sheetOpen}
        state={filters}
        onApply={handleApplyFilters}
        onClose={handleCloseSheet}
      />

      {mapOpen ? (
        <MapExpandedModal
          markers={visibleMarkers}
          visibleCourts={visibleCourts}
          viewerIsEntitled={viewerIsEntitled}
          onClose={handleCloseMap}
        />
      ) : null}
    </>
  );
}
