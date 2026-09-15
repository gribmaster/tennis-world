import type { CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { courtDisplay } from '@/components/court/court-display';

// Marker model for the real Leaflet map (Feature 74).
//
// COORDINATE SAFETY: a `MapMarker` carries ONLY approximate geo (`lat`/`lng` here are
// populated exclusively from the always-public `approxLat`/`approxLng`) plus display
// fields. Exact court coordinates never flow into this model — the entitled exact
// marker is built separately from the protected exact-location endpoint's response by
// the caller (Court Detail), and even then only the single point is plotted.
//
// The field names `lat`/`lng` on MapMarker are the map layer's OWN neutral vocabulary
// (Leaflet speaks lat/lng); they are NOT the DTO's exact `lat`/`lng`. Public callers
// MUST fill them from `approxLat`/`approxLng` (see `courtToMarker`).

/** Visual treatment for a marker (drives the custom divIcon color/halo). */
export type MapMarkerState = 'open' | 'locked' | 'featured' | 'exact';

export interface MapMarker {
  /** Stable key (court id). */
  readonly id: string;
  /** Slug — used for navigate-on-click links to `/courts/{slug}`. */
  readonly slug: string;
  /**
   * The marker's accessible title/tooltip. This is `courtDisplay(court,
   * viewerIsEntitled).name` — the MASKED display name (e.g. "Premium Court") for a
   * locked court when the viewer is not entitled, or the real name when they are
   * (Task 26). Not necessarily the court's real name.
   */
  readonly name: string;
  /** Latitude — ALWAYS the approximate value (`approxLat`) for public maps. */
  readonly lat: number;
  /** Longitude — ALWAYS the approximate value (`approxLng`) for public maps. */
  readonly lng: number;
  /** Visual state → marker color/halo. */
  readonly state: MapMarkerState;
  /**
   * The court's public hero photo (Task 20) — drawn as the marker's photo pin instead of
   * a plain colored dot. Optional so a caller built before this field existed (or a stale
   * fixture) still renders: `markerContent()` falls back to the shared placeholder image.
   */
  readonly heroImageUrl?: string;
}

/**
 * open/locked/featured for a public court, mirroring the pin-state precedence used by
 * the API's `toMapPinDTO` (locked > featured > open). Kept here so a court can be
 * turned into a marker without a separate pins fetch.
 */
function courtState(court: Pick<CourtSummaryDTO, 'isLocked' | 'isFeatured'>): MapMarkerState {
  if (court.isLocked) return 'locked';
  if (court.isFeatured) return 'featured';
  return 'open';
}

/**
 * Build a marker for a public court, positioned from its APPROXIMATE geo. This is the
 * single conversion the public map surfaces (/map, Wishlist, locked Court Detail) use
 * — so "markers come from approxLat/approxLng, never exact lat/lng" is enforced in one
 * place. An optional `stateBySlug` (from the map-pins read) lets the /map explorer
 * reuse the API's authoritative pin state; otherwise it's derived from the court flags.
 *
 * `viewerIsEntitled` (Task 26, default `false`) is forwarded to `courtDisplay` so the
 * marker's name is unmasked for a viewer this page has determined carries an active
 * membership — the same entitlement-aware presentation every other court surface applies.
 */
export function courtToMarker(
  court: CourtSummaryDTO,
  stateBySlug?: Map<string, MapMarkerState>,
  viewerIsEntitled = false,
): MapMarker {
  return {
    id: court.id,
    slug: court.slug,
    name: courtDisplay(court, viewerIsEntitled).name,
    lat: court.approxLat,
    lng: court.approxLng,
    state: stateBySlug?.get(court.slug) ?? courtState(court),
    heroImageUrl: court.heroImageUrl,
  };
}

/** Map a `MapPinDTO.state` to a marker state (identity for the three public states). */
export function pinStateToMarkerState(state: MapPinDTO['state']): MapMarkerState {
  return state;
}
