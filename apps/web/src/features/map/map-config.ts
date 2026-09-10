// Google Maps configuration (Feature 88; see docs/MAP_PROVIDER_DECISION.md §0).
//
// The real map surface (CourtMap) reads its Google Maps JS API key and Map ID ENTIRELY
// from environment, so each deployment target (local/staging/production) can use its own
// restricted key and Map ID with no code change.
//
// Env vars (both NEXT_PUBLIC_ — a Maps JS API key is public by construction; it ships in
// the browser bundle and is protected by restricting it in Google Cloud Console by HTTP
// referrer + API, not by secrecy. See apps/web/.env.example):
//   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — the Maps JavaScript API key.
//   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID  — the Map ID created in Cloud Console with a style
//                                     attached. REQUIRED under variant B (decided,
//                                     Feature 88 §1): `AdvancedMarkerElement` does not
//                                     render without one, and setting `mapId` makes a
//                                     JSON `styles` option inert — the two are mutually
//                                     exclusive, so this repo carries no `styles` array.
//                                     The style itself lives in Cloud Console, not here.
//
// COORDINATE SAFETY: this module carries NO court data and NO coordinate — it only names
// which Google Maps project/style to load. Court markers are positioned by the caller from
// the always-public approxLat/approxLng; exact lat/lng never touch this module (they stay
// behind the protected exact-location endpoint).

export interface GoogleMapsConfig {
  /** Maps JavaScript API key. Empty when unset — callers must not attempt to load. */
  readonly apiKey: string;
  /** Map ID (variant B — required for AdvancedMarkerElement). Empty when unset. */
  readonly mapId: string;
}

/**
 * Resolve the Google Maps configuration from `NEXT_PUBLIC_GOOGLE_MAPS_*` env. Safe to call
 * on server or client (it only reads env + returns a plain object); the actual Maps JS API
 * is loaded only by the client-only CourtMapInner.
 */
export function getGoogleMapsConfig(): GoogleMapsConfig {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() ?? '';
  return { apiKey, mapId };
}
