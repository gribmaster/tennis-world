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
// filter MODEL now lives in the shared, feature-agnostic `@/components/filters`
// (`CourtFilterState` + the `FilterSheet` Home reuses); what remains here is the map
// screen's own quick-filter subset — a curated fast path over that same model.
export { MapFilterBar, MAP_QUICK_FILTERS } from './MapFilterBar';
export type { MapFilterBarProps } from './MapFilterBar';

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

export { MapCourtList } from './MapCourtList';
export type { MapCourtListProps } from './MapCourtList';

export { MapCourtRow } from './MapCourtRow';
export type { MapCourtRowProps } from './MapCourtRow';
