'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import {
  FilterSheet,
  EMPTY_COURT_FILTER_STATE,
  countActiveFilters,
  narrowCourts,
  toggleFilterValue,
  type CourtFilterOption,
  type CourtFilterState,
} from '@/components/filters';
import { MapFilterBar } from './MapFilterBar';
import { MapCourtList } from './MapCourtList';
import { CourtMap } from './CourtMap';
import { MapLocateControl } from './MapLocateControl';
import { useGeolocation } from './useGeolocation';
import { findNearestPoint } from './geo-distance';
import type { MapFocusRequest } from './CourtMapInner';
import { courtToMarker, pinStateToMarkerState, type MapMarkerState } from './map-markers';

// MapExplorer — the ONE `'use client'` boundary on the Map screen.
//
// It holds the interactive state (a single `CourtFilterState` — search text plus every
// selected chip — and the sheet's open/closed flag) and derives the
// visible set in memory FROM THE PROPS it was handed. Feature 76 added ONE thing to that:
// the search text can be SEEDED from `?q=` via the `initialQuery` prop (see below), which
// is how a country card on /collections lands here pre-filtered. It is an initial value
// only — this component is still the single owner of the live filter state, and every
// other behaviour on this screen (chips, sheet, reset, geolocation focus) is untouched.
// It does NOT call a
// repository and does NOT import @tennis/mock-data — the server page
// (app/map/page.tsx) is the single data boundary and passes the full, unfiltered
// `courts` + `pins` arrays in as props.
//
// REAL MAP (Feature 74; engine migrated to Google Maps in Feature 88 — see
// docs/MAP_PROVIDER_DECISION.md §0): the abstract StylizedMapCanvas is gone. The visible
// courts are plotted on a real map (CourtMap) at their APPROXIMATE geo — markers
// are positioned from `court.approxLat`/`approxLng` only (via `courtToMarker`). The
// `pins` prop is still used, but ONLY for its authoritative open/locked/featured
// `state` (joined by slug); pins carry no geo we plot. Filtered courts and filtered
// markers come from the SAME `visibleCourts` set, so list rows and map markers can
// never drift apart.
//
// COORDINATE SAFETY: exact `lat`/`lng` are not part of these DTOs and never reach the
// client. The map layer only ever sees the always-public approximate points.
//
// NEAREST-COURT AUTO-FOCUS: on the first visit to /map this component asks the browser for
// the visitor's position ONCE and, if granted, flies the map to the nearest court at zoom
// ~17. It is orchestrated HERE (not inside the Leaflet layer) because this is where the
// court set already lives — the nearest court is computed in memory from the markers the
// map is already showing, so no backend endpoint, no extra fetch, and no new court field.
// The user's coordinates stay in memory for this session only (see useGeolocation).

/** Target zoom for the nearest-court focus — clamped to the map's real range downstream. */
const NEAREST_COURT_ZOOM = 17;

// FILTERING (Feature 73): the old single-select `FILTER_PREDICATE` / `matchesQuery`
// pair is gone. Narrowing now runs through `narrowCourts`, which is derived from the
// same per-dimension descriptors as `toCourtQuery` in
// `components/filters/court-filter-state.ts` — one definition of what each chip means,
// so the in-memory predicate and the eventual wire query cannot drift apart. It stays
// in memory over the already-fetched array (see the file header).

export interface MapExplorerProps {
  /** Full published set — the source the client narrows over (never re-fetched). */
  courts: CourtSummaryDTO[];
  /** Pin positions + state, one per court. Used ONLY for `state`, keyed by `slug`. */
  pins: MapPinDTO[];
  /**
   * Free-text query to START with (Feature 76). Supplied by `app/map/page.tsx` from
   * `?q=`, which is how the Collections screen's "By Country" strip arrives here
   * (`/map?q=<country name>`). Defaults to `''` — the previous always-empty behaviour, so
   * every other entry point to /map is unchanged.
   *
   * SEED ONLY, NOT A CONTROLLED VALUE: it is the initial value of the `q` field inside
   * this component's own filter state, and nothing here writes it back to the URL or
   * re-reads it. MapExplorer stays the single owner of the live filter state — typing in
   * the search box, toggling a chip, or hitting "reset" all behave exactly as before, and
   * reset clears back to EMPTY (not back to the seed), because reset means "show
   * everything".
   */
  initialQuery?: string;
}

export function MapExplorer({ courts, pins, initialQuery = '' }: MapExplorerProps) {
  // ONE state object for every dimension the user can narrow by (chips + free text),
  // shaped one-to-one against the API's query params. The sheet's open/closed flag is
  // separate: it is view state, not filter state.
  //
  // Lazy initializer so the seed is read ONCE on mount and never on a re-render; `q` is
  // the only field it can set, so every chip dimension still starts empty.
  const [filters, setFilters] = useState<CourtFilterState>(() =>
    initialQuery ? { ...EMPTY_COURT_FILTER_STATE, q: initialQuery } : EMPTY_COURT_FILTER_STATE,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  // Derive the visible courts once, in memory: OR within each dimension, AND across
  // dimensions, plus the case-insensitive free-text query.
  const visibleCourts = useMemo(() => narrowCourts(courts, filters), [courts, filters]);

  // Authoritative pin state (open/locked/featured) keyed by slug — from the API's
  // `/courts/map` read, so the marker color matches the pin state the backend
  // computed. Falls back to the court flags inside `courtToMarker` if a pin is absent.
  const stateBySlug = useMemo(() => {
    const map = new Map<string, MapMarkerState>();
    for (const pin of pins) map.set(pin.slug, pinStateToMarkerState(pin.state));
    return map;
  }, [pins]);

  // Markers come from the SAME filtered set as the list — plotted at approximate geo.
  const visibleMarkers = useMemo(
    () => visibleCourts.map((court) => courtToMarker(court, stateBySlug)),
    [visibleCourts, stateBySlug],
  );

  // ── Nearest-court auto-focus ───────────────────────────────────────────────────────
  // ONE geolocation implementation, mounted once here and shared by the automatic initial
  // focus and the manual locate control (which receives its pending/error/handler as props).
  const { pending: locating, error: locateError, locate } = useGeolocation();

  const [focus, setFocus] = useState<MapFocusRequest | null>(null);
  const focusTokenRef = useRef(0);
  // Ensures the automatic request happens AT MOST ONCE per mount — the guard that makes
  // React Strict Mode's double-invoked effect harmless (and it never re-runs on a filter
  // change or an ordinary re-render).
  const autoFocusStartedRef = useRef(false);
  // Set as soon as the visitor pans/zooms the map themselves.
  const userTookControlRef = useRef(false);
  // Latest visible markers, read at resolve time WITHOUT making them an effect dependency
  // (depending on them would re-arm the automatic request whenever a filter changed).
  const markersRef = useRef(visibleMarkers);
  useEffect(() => {
    markersRef.current = visibleMarkers;
  }, [visibleMarkers]);

  const handleUserInteraction = useCallback(() => {
    userTookControlRef.current = true;
  }, []);

  const focusNearestCourt = useCallback(
    async ({ automatic }: { automatic: boolean }): Promise<void> => {
      const coords = await locate();
      // Denied / unavailable / timed out / unsupported: the error is already surfaced on
      // the control. Leave the map exactly as it is — default position and zoom intact.
      if (!coords) return;

      // The user panned or zoomed while we were waiting: they own the viewport now, so the
      // AUTOMATIC recentre stands down. An explicit click on the control still works.
      if (automatic && userTookControlRef.current) return;

      // Nearest by great-circle distance over the courts already on the map — courts with
      // invalid coordinates are skipped, and `null` (nothing valid to focus) leaves the
      // default viewport untouched.
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
    // Fire-and-forget: `locate()` never rejects, and `focusNearestCourt` handles every
    // failure path internally, so there is no unhandled rejection to guard against.
    void focusNearestCourt({ automatic: true });
  }, [focusNearestCourt]);

  const handleLocateClick = useCallback(() => {
    void focusNearestCourt({ automatic: false });
  }, [focusNearestCourt]);

  // ── Filter handlers (all purely local UI — no navigation, no repository call) ──────
  const handleQueryChange = useCallback((q: string) => {
    setFilters((prev) => ({ ...prev, q }));
  }, []);

  const handleToggleOption = useCallback((option: CourtFilterOption) => {
    setFilters((prev) => toggleFilterValue(prev, option.key, option.value));
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

  return (
    <div>
      <MapFilterBar
        state={filters}
        activeCount={activeCount}
        onQueryChange={handleQueryChange}
        onToggleOption={handleToggleOption}
        onOpenSheet={() => setSheetOpen(true)}
      />

      {/* The SHARED sheet (components/filters) — Home reuses this same component
          unmodified in Feature 74. Draft-then-apply lives inside it: nothing here
          changes until "Show results" fires `onApply`. */}
      <FilterSheet
        open={sheetOpen}
        state={filters}
        onApply={handleApplyFilters}
        onClose={handleCloseSheet}
      />

      <div className="map-layout">
        {/* `.map-canvas-wrap` is already `position: relative`, so the locate control can
            overlay the map without changing the canvas dimensions in any way. */}
        <div className="map-canvas-wrap">
          <CourtMap
            markers={visibleMarkers}
            navigateOnClick
            className="h-full w-full"
            focus={focus}
            onUserInteraction={handleUserInteraction}
          />
          <MapLocateControl
            pending={locating}
            error={locateError}
            onLocate={handleLocateClick}
          />
        </div>

        <MapCourtList
          courts={visibleCourts}
          filters={filters}
          activeCount={activeCount}
          onReset={handleReset}
        />
      </div>
    </div>
  );
}
