// Geographic distance helpers for the map's nearest-court auto-focus.
//
// PURE MODULE — no React, no DOM, no Leaflet, no `'use client'`. That is deliberate:
// it keeps the nearest-court rule (the one piece of real logic in this feature) directly
// executable by the verify harness (scripts/verify-map-autofocus.ts imports THIS file and
// runs it against fixtures), rather than only assertable as source text.
//
// The distance is a proper great-circle (haversine) computation over real latitude/
// longitude — NOT a string/region/city/bounding-box comparison, which would be wrong
// across meridians and at high latitudes.
//
// COORDINATE SAFETY (unchanged invariant): the points this module compares are the
// always-public approximate court points (`approxLat`/`approxLng`, carried by `MapMarker`)
// plus the user's own browser position. Exact court `lat`/`lng` never reach the client and
// never enter this module. The user's coordinates are passed in as arguments and are never
// stored, persisted, or transmitted by anything here — see useGeolocation.

/** A latitude/longitude pair in degrees. */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Mean Earth radius (IUGG), kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Whether a coordinate pair is usable for a distance calculation: finite (rules out
 * `NaN`/`Infinity`, and `null`/`undefined` that slipped past the DTO's `number` type) and
 * inside the real geographic range. Courts failing this are IGNORED by `findNearestPoint`
 * rather than producing a garbage distance.
 *
 * Note this is a purely geographic test — `0,0` is a legitimate (if unlikely) point and is
 * NOT special-cased, so no real court can be silently dropped by a sentinel heuristic.
 */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Great-circle distance between two points in kilometres (haversine formula).
 *
 * Returns `Number.POSITIVE_INFINITY` when either point is not a valid coordinate, so a
 * bad row can never win a `<` comparison in `findNearestPoint`.
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  if (!isValidLatLng(a?.lat, a?.lng) || !isValidLatLng(b?.lat, b?.lng)) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The point in `points` closest to `origin`, or `null` when there is nothing valid to
 * choose from (empty list, or every candidate has invalid coordinates).
 *
 * TIE-BREAK: the comparison is strict `<`, so when two candidates are the same distance
 * away the FIRST one in the incoming array wins — a stable result driven by the existing
 * dataset order, never by re-sorting.
 */
export function findNearestPoint<T extends GeoPoint>(
  points: readonly T[],
  origin: GeoPoint,
): T | null {
  if (!isValidLatLng(origin?.lat, origin?.lng)) return null;

  let nearest: T | null = null;
  let nearestKm = Number.POSITIVE_INFINITY;

  for (const point of points) {
    // Skip courts without usable coordinates entirely — no distance is computed for them.
    if (!isValidLatLng(point?.lat, point?.lng)) continue;

    const km = haversineDistanceKm(origin, point);
    if (km < nearestKm) {
      nearestKm = km;
      nearest = point;
    }
  }

  return nearest;
}
