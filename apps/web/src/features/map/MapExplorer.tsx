'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { MapFilterBar, MAP_FILTERS, type MapFilter } from './MapFilterBar';
import { MapCourtList } from './MapCourtList';
import { LeafletMap } from './LeafletMap';
import { MapLocateControl } from './MapLocateControl';
import { useGeolocation } from './useGeolocation';
import { findNearestPoint } from './geo-distance';
import type { MapFocusRequest } from './LeafletMapInner';
import { courtToMarker, pinStateToMarkerState, type MapMarkerState } from './map-markers';

// MapExplorer — the ONE `'use client'` boundary on the Map screen.
//
// It holds the interactive state (`query` + `activeFilter`) and derives the
// visible set in memory FROM THE PROPS it was handed. It does NOT call a
// repository and does NOT import @tennis/mock-data — the server page
// (app/map/page.tsx) is the single data boundary and passes the full, unfiltered
// `courts` + `pins` arrays in as props.
//
// REAL MAP (Feature 74): the abstract StylizedMapCanvas is gone. The visible courts
// are plotted on a real Leaflet map (LeafletMap) at their APPROXIMATE geo — markers
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

/** Chip → predicate over a `CourtSummaryDTO`, mirroring `CourtFilter` semantics. */
const FILTER_PREDICATE: Record<MapFilter, (court: CourtSummaryDTO) => boolean> = {
  All: () => true,
  Resorts: (c) => c.access === 'Resort',
  Clubs: (c) => c.access === 'Club',
  Private: (c) => c.access === 'Private',
  Indoor: (c) => c.indoorOutdoor === 'Indoor',
  Scenic: (c) => c.isScenic,
};

/** Free-text match over name/country/region/setting (mirrors the mock repo). */
function matchesQuery(court: CourtSummaryDTO, q: string): boolean {
  return (
    court.name.toLowerCase().includes(q) ||
    court.country.toLowerCase().includes(q) ||
    court.region.toLowerCase().includes(q) ||
    court.setting.toLowerCase().includes(q)
  );
}

export interface MapExplorerProps {
  /** Full published set — the source the client narrows over (never re-fetched). */
  courts: CourtSummaryDTO[];
  /** Pin positions + state, one per court. Used ONLY for `state`, keyed by `slug`. */
  pins: MapPinDTO[];
}

export function MapExplorer({ courts, pins }: MapExplorerProps) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MapFilter>('All');

  // Derive the visible courts once, in memory, from the chip predicate AND the
  // (case-insensitive) query — exactly as the prototype's `filtered` memo does.
  const visibleCourts = useMemo(() => {
    const predicate = FILTER_PREDICATE[activeFilter] ?? FILTER_PREDICATE.All;
    const q = query.trim().toLowerCase();
    return courts.filter((court) => predicate(court) && (!q || matchesQuery(court, q)));
  }, [courts, activeFilter, query]);

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

  const handleReset = () => {
    setQuery('');
    setActiveFilter('All');
  };

  return (
    <div>
      <MapFilterBar
        query={query}
        activeFilter={activeFilter}
        onQueryChange={setQuery}
        onFilterChange={setActiveFilter}
      />

      <div className="map-layout">
        {/* `.map-canvas-wrap` is already `position: relative`, so the locate control can
            overlay the map without changing the canvas dimensions in any way. */}
        <div className="map-canvas-wrap">
          <LeafletMap
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
          activeFilter={activeFilter}
          hasQuery={query.trim().length > 0}
          onReset={handleReset}
        />
      </div>
    </div>
  );
}

// Re-exported so the page/tests can reference the chip vocabulary if needed.
export { MAP_FILTERS };
export type { MapFilter };
