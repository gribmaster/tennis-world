// Courts domain — repository INTERFACE.
//
// This is the contract every court data source must satisfy (Architecture Plan
// Decision #7 / Phase 1 §1.1). UI components and pages depend ONLY on this
// interface, never on a concrete implementation — a factory decides which
// implementation is wired in (mock now, HTTP in Phase 2), so the live-data swap is
// a configuration change, not a UI rewrite.
//
// All method signatures are typed against `@tennis/contracts` DTOs so the data
// shape is defined exactly once and reused by both the mock and the future HTTP
// repository (no DTO is ever invented twice).

import type {
  CourtDTO,
  CourtSummaryDTO,
  ExactLocationDTO,
  MapPinDTO,
} from '@tennis/contracts';
import type { BBox, CourtFilter } from './court.types';

export interface CourtRepository {
  /** List court summaries, optionally filtered. No filter ⇒ full published set. */
  list(filter?: CourtFilter): Promise<CourtSummaryDTO[]>;

  /** Full court detail by slug, or `null` if no court matches. */
  getBySlug(slug: string): Promise<CourtDTO | null>;

  /** Free-text search over name/country/region/setting. */
  search(query: string): Promise<CourtSummaryDTO[]>;

  /**
   * Map pins for the stylized canvas. `bbox`/`zoom` are accepted for interface
   * stability with the eventual `/v1/courts/map` endpoint; the mock ignores `bbox`
   * (no-PostGIS, Risk #1) and uses `zoom` only to pick the hierarchy tier.
   */
  getMapPins(bbox?: BBox, zoom?: number): Promise<MapPinDTO[]>;

  /** Related courts for the detail page's "related" carousel. */
  getRelated(courtId: string, limit?: number): Promise<CourtSummaryDTO[]>;

  /**
   * The exact-coordinate unlock for an ENTITLED viewer (Feature 64) — the web side of
   * the protected `GET /v1/me/courts/:slug/exact-location` endpoint (Feature 63). This
   * is the ONLY method that ever yields exact `lat`/`lng`; `getBySlug`/`list`/`getMapPins`/
   * `getRelated` stay structurally coord-free.
   *
   * Returns the `ExactLocationDTO` (with the server-built `directionsUrl`) when the viewer
   * is entitled, or `null` for every "not unlocked" outcome — logged out (401), authed but
   * not entitled (403), or no such published court (404). Collapsing those three to `null`
   * keeps the caller a single "unlocked ⇔ non-null" check; the court page has already
   * resolved court EXISTENCE via the public `getBySlug`, so a 404 here is just "no unlock
   * for you", never the page's not-found signal. Any OTHER failure propagates.
   */
  getExactLocation(slug: string): Promise<ExactLocationDTO | null>;
}
