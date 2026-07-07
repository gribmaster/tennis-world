// Map tile provider configuration (Feature 74).
//
// The real Leaflet map surface (LeafletMap) reads its tile source ENTIRELY from
// environment, so the provider can be swapped per-environment WITHOUT a code change:
//   • local / dev  → OpenStreetMap tiles (free, no key) — the default below.
//   • production   → a proper provider with a custom style + key (e.g. MapTiler),
//                    set via env so no production key is ever committed.
//
// Env vars (all `NEXT_PUBLIC_` so they inline into the browser bundle — tile URLs
// and attribution are inherently public, and Leaflet fetches tiles client-side):
//   NEXT_PUBLIC_MAP_PROVIDER      — free-form label for the active provider (e.g.
//                                   `osm`, `maptiler`). Informational; used for the
//                                   docs/debug + to pick a sane default attribution.
//   NEXT_PUBLIC_MAP_TILE_URL      — Leaflet XYZ tile template. `{s}` subdomains,
//                                   `{z}/{x}/{y}` tile coords. A provider key, if any,
//                                   is baked into THIS url (…?key=YOUR_KEY) — never
//                                   hardcoded here.
//   NEXT_PUBLIC_MAP_ATTRIBUTION   — attribution HTML shown in the map corner.
//
// See docs/MAP_PROVIDER_DECISION.md and apps/web/.env.example for the full matrix
// (OSM dev default + the optional MapTiler production block).
//
// COORDINATE SAFETY: this module carries NO court data and NO coordinate — it only
// describes where TILE IMAGES come from. Court markers are positioned by the caller
// from the always-public `approxLat`/`approxLng`; exact `lat`/`lng` never touch the
// map layer (they stay behind the protected exact-location endpoint).

/** OpenStreetMap defaults — free, keyless, correct for local/dev only (see docs). */
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export interface MapTileConfig {
  /** Active provider label (informational): `osm`, `maptiler`, … */
  readonly provider: string;
  /** Leaflet XYZ tile template URL (may embed a provider key from env). */
  readonly tileUrl: string;
  /** Attribution HTML for the map corner. */
  readonly attribution: string;
}

/**
 * Resolve the tile configuration from `NEXT_PUBLIC_MAP_*` env, falling back to the
 * keyless OpenStreetMap dev defaults. Called at render time by LeafletMap; safe to
 * call on server or client (it only reads env + returns a plain object).
 */
export function getMapTileConfig(): MapTileConfig {
  const provider = process.env.NEXT_PUBLIC_MAP_PROVIDER?.trim() || 'osm';
  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || OSM_TILE_URL;
  const attribution =
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim() || OSM_ATTRIBUTION;
  return { provider, tileUrl, attribution };
}
