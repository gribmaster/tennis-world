// Map feature — public surface.
//
// Small, feature-local components composed by the Map page
// (apps/web/src/app/map/page.tsx). Only MapExplorer is a `'use client'` boundary;
// the rest are presentational. None of them fetch data or import a repository /
// @tennis/mock-data — the page supplies the full court + pin arrays via props and
// MapExplorer narrows them in memory.
export { MapExplorer } from './MapExplorer';
export type { MapExplorerProps } from './MapExplorer';

export { MapFilterBar, MAP_FILTERS } from './MapFilterBar';
export type { MapFilterBarProps, MapFilter } from './MapFilterBar';

// Real Leaflet map (Feature 74) — the SSR-safe wrapper + its marker model. This is
// the map surface used by /map, the Saved Wishlist Map, and Court Detail. It plots
// approxLat/approxLng only (never exact lat/lng — see map-markers / LeafletMapInner).
export { LeafletMap } from './LeafletMap';
export type { LeafletMapProps } from './LeafletMap';
export { courtToMarker } from './map-markers';
export type { MapMarker, MapMarkerState } from './map-markers';
export { getMapTileConfig } from './map-config';
export type { MapTileConfig } from './map-config';

export { MapCourtList } from './MapCourtList';
export type { MapCourtListProps } from './MapCourtList';

export { MapCourtRow } from './MapCourtRow';
export type { MapCourtRowProps } from './MapCourtRow';
