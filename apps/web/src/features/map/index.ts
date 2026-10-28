// Map feature — public surface.
//
// Small, feature-local components composed by the Map page
// (apps/web/src/app/map/page.tsx). Only MapExplorer is a `'use client'` boundary;
// the rest are presentational. None of them fetch data or import a repository /
// @tennis/mock-data — the page supplies the full court + pin arrays via props and
// MapExplorer narrows them in memory.
export { MapExplorer } from './MapExplorer';
export type { MapExplorerProps } from './MapExplorer';

// Feature 73: the single-select `MAP_FILTERS` / `MapFilter` vocabulary is gone. The
// filter MODEL lives in the shared, feature-agnostic `@/components/filters`
// (`CourtFilterState` + the `FilterSheet` Home reuses). TASK_57 removed the map
// screen's old quick-filter chip row entirely — `MapSearchBar`'s filter button opens
// the same shared sheet on both mobile and desktop.
export { MapSearchBar } from './MapSearchBar';
export type { MapSearchBarProps } from './MapSearchBar';

// Real Google Maps engine (Feature 88; migrated off Leaflet — see
// docs/MAP_PROVIDER_DECISION.md §0) — the SSR-safe wrapper + its marker model. This is
// the map surface used by /map, the Saved Wishlist Map, and the unlocked Court Detail
// preview. It plots approxLat/approxLng only (never exact lat/lng — see map-markers /
// CourtMapInner).
export { CourtMap } from './CourtMap';
export type { CourtMapProps } from './CourtMap';
export type { MapFocusRequest } from './CourtMapInner';

// Nearest-court auto-focus (map screen only): the pure distance helpers, the single
// geolocation hook both entry points share, and the small overlaid locate control.
// The user's coordinates are used in memory only — never stored or transmitted.
export { haversineDistanceKm, findNearestPoint, isValidLatLng } from './geo-distance';
export type { GeoPoint } from './geo-distance';
export { useGeolocation } from './useGeolocation';
export type { GeolocationError, GeolocationErrorKind, UseGeolocationResult } from './useGeolocation';
export { MapLocateControl } from './MapLocateControl';
export type { MapLocateControlProps } from './MapLocateControl';
export { courtToMarker } from './map-markers';
export type { MapMarker, MapMarkerState } from './map-markers';
export { getGoogleMapsConfig } from './map-config';
export type { GoogleMapsConfig } from './map-config';

// TASK_57 (v3): the Courts screen's main content — a straight grid of the shared
// `CourtCard` (TASK_56), replacing `MapCourtList`/`MapCourtRow`/the mobile
// `LegacyCourtCard` strip.
export { MapCourtGrid } from './MapCourtGrid';
export type { MapCourtGridProps } from './MapCourtGrid';

// TASK_57: the small always-on map preview panel (guest lock placeholder / signed-in
// non-interactive map) and the full-size interactive modal it opens.
export { MapPreviewPanel } from './MapPreviewPanel';
export type { MapPreviewPanelProps } from './MapPreviewPanel';
export { MapExpandedModal } from './MapExpandedModal';
export type { MapExpandedModalProps } from './MapExpandedModal';

// Mobile pin-tap preview (Task 27/Feature 86) — the compact card MapExpandedModal docks
// over the canvas when a marker is tapped on a small viewport.
export { MapCourtPreview } from './MapCourtPreview';
export type { MapCourtPreviewProps } from './MapCourtPreview';
