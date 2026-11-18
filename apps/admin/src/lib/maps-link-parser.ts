// ─────────────────────────────────────────────────────────────────────────────
// Pure, offline Google Maps link parser (TASK_74 §"Exact location"). No
// network calls, no geocoding — it only extracts `lat,lng` from the handful
// of URL shapes Google Maps actually produces:
//   - viewport centre:  .../@LAT,LNG,15z
//   - place pin:        ...!3dLAT!4dLNG...
//   - search/query:     ...?q=LAT,LNG  or  ...?ll=LAT,LNG
//
// RULE (documented per Testing §1): when a URL contains BOTH a place pin and
// a viewport centre, the place pin wins. The `!3d!4d` pair is the actual
// pinned point a user placed; the `@lat,lng` pair is only where Google
// happened to center the map viewport, which can legitimately differ from the
// pin (e.g. after panning). `?q=`/`?ll=` queries are checked before the
// viewport centre too, since they're also an intentional point, not a pan
// position — but a place pin still wins over a query if both are present.
//
// Short links (`goo.gl`, `maps.app.goo.gl`) carry no coordinates in the URL
// itself (they resolve server-side), so they always report "unreadable".
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedMapCoordinates {
  lat: number;
  lng: number;
}

const SHORT_LINK_HOSTS = ['goo.gl', 'maps.app.goo.gl'];

const PLACE_PIN_PATTERN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const QUERY_PARAM_PATTERN = /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/;
const VIEWPORT_CENTER_PATTERN = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/;

export function parseCoordinatesFromMapLink(url: string): ParsedMapCoordinates | null {
  if (typeof url !== 'string' || url.trim().length === 0) return null;

  const hostname = safeHostname(url);
  if (hostname && SHORT_LINK_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    return null;
  }

  const placePin = url.match(PLACE_PIN_PATTERN);
  if (placePin) {
    const coords = toCoordinates(placePin[1]!, placePin[2]!);
    if (coords) return coords;
  }

  const queryParam = url.match(QUERY_PARAM_PATTERN);
  if (queryParam) {
    const coords = toCoordinates(queryParam[1]!, queryParam[2]!);
    if (coords) return coords;
  }

  const viewportCenter = url.match(VIEWPORT_CENTER_PATTERN);
  if (viewportCenter) {
    const coords = toCoordinates(viewportCenter[1]!, viewportCenter[2]!);
    if (coords) return coords;
  }

  return null;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function toCoordinates(latRaw: string, lngRaw: string): ParsedMapCoordinates | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export const MAPS_LINK_UNREADABLE_MESSAGE =
  "Couldn't read coordinates from this link — open it in the browser and copy the numbers from the address bar.";
