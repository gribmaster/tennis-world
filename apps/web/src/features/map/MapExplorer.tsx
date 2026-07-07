'use client';

import { useMemo, useState } from 'react';
import type { CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { MapFilterBar, MAP_FILTERS, type MapFilter } from './MapFilterBar';
import { MapCourtList } from './MapCourtList';
import { LeafletMap } from './LeafletMap';
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
        <div className="map-canvas-wrap">
          <LeafletMap markers={visibleMarkers} navigateOnClick className="h-full w-full" />
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
