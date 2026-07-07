// Courts domain — feature-local supporting types.
//
// IMPORTANT (data-driven discipline, Architecture Plan §5): the wire/data SHAPES
// (CourtDTO, CourtSummaryDTO, MapPinDTO) are owned by `@tennis/contracts` and are
// NOT redefined here — they are re-exported from this feature's index.ts for
// convenience. This file holds only the *query* types that describe how the
// repository is called (filters, bbox, pagination), which are a web/repository
// concern rather than a transport DTO.
//
// These shapes are deliberately aligned with the eventual public API query params
// (Architecture Plan §4: `GET /v1/courts?country=&region=&collection=&surface=...`)
// so the Phase-2 HTTP repository implements the same interface with no signature
// changes — only a different backing call.

import type { AccessType, IndoorOutdoor, Surface } from '@tennis/contracts';

/**
 * Filter accepted by `CourtRepository.list()`. Every field is optional; an empty
 * filter (or no filter) returns the full published set. Mirrors the discovery
 * endpoint's query params so the mock and the future HTTP repo share one shape.
 */
export interface CourtFilter {
  country?: string;
  region?: string;
  /** Collection slug — restricts to courts that are members of that collection. */
  collection?: string;
  surface?: Surface;
  access?: AccessType;
  indoorOutdoor?: IndoorOutdoor;
  scenic?: boolean;
  featured?: boolean;
  /** Free-text search over name/country/region/setting. */
  q?: string;
  /** Cap on the number of results (e.g. Home's "featured, limit 6"). */
  limit?: number;
}

/**
 * Geographic bounding box for the map endpoint. Accepted by `getMapPins()` for
 * interface stability with the eventual `GET /v1/courts/map?bbox=` endpoint, but
 * NOT used to filter in the Phase-1 mock (no-PostGIS decision, Risk #1) — the mock
 * groups by country/region and uses `zoom` only to pick the hierarchy tier.
 */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}
