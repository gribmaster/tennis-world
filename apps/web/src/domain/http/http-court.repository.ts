// Courts domain — HTTP repository implementation (Phase 2, `api` data source).
//
// Implements the SAME `CourtRepository` interface as `MockCourtRepository`, but
// backed by the public API instead of in-memory mock data. The factory
// (`src/domain/index.ts`) wires this in when `NEXT_PUBLIC_DATA_SOURCE=api`; the UI
// is unchanged — it still calls `repositories.courts.*` and gets the same DTOs.
//
// All transport goes through the shared http-client (no direct `fetch` here). The
// API already masks exact lat/lng server-side (the public selects never read
// `Court.lat`/`lng`), so no coordinate field is ever added on this side.
//
// RESPONSE TYPING (prompt task 2 — "validate with contracts if practical"):
// responses are returned via type assertion to the contract DTOs rather than
// re-validated with zod at runtime. The API is the single source of truth and
// already produces contract-shaped, server-validated payloads; running the zod
// schemas on every list here would add runtime cost without real safety benefit
// for this internal first-party API. The DTO TYPES (compile-time) still come from
// `@tennis/contracts`, so any drift in the method shapes is caught by `tsc`.
//
// ── getRelated id→slug strategy (prompt task 2, Option B) ────────────────────────
// The web interface is `getRelated(courtId, limit)` (it keys off court **id**),
// but the API endpoint is `GET /v1/courts/:slug/related` (it keys off **slug**).
// In the seeded data `id !== slug` (e.g. id `tremezzo` vs slug
// `grand-hotel-tremezzo`), so Option A (assume id === slug) is NOT valid.
//
// We therefore resolve id → slug before calling the endpoint. The court detail
// page calls `getRelated(court.id)` immediately AFTER `getBySlug(slug)` resolves
// the full court, so the slug is already known to the caller — but the interface
// only hands us the id, so this repository must map it itself. We do that with a
// single cheap `list()` call (the published summary set, ~12 rows) and find the
// matching `id`. This keeps the public interface unchanged (Option C — adding an
// id-keyed API route — is avoided) and adds at most one small request.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CourtDTO,
  CourtSummaryDTO,
  ExactLocationDTO,
  MapPinDTO,
} from '@tennis/contracts';
import type { CourtRepository } from '../courts/court.repository';
import type { BBox, CourtFilter } from '../courts/court.types';
import {
  AuthRequiredError,
  buildQuery,
  getJson,
  getJsonOrNull,
  HttpError,
  type HttpAuthOptions,
} from './http-client';

export class HttpCourtRepository implements CourtRepository {
  /**
   * AUTH (Feature 64): the PUBLIC reads (list/getBySlug/search/getMapPins/getRelated)
   * need no identity and IGNORE this. The single PROTECTED read — `getExactLocation`,
   * backing `GET /v1/me/courts/:slug/exact-location` — forwards it so the AuthGuard can
   * authenticate the viewer (server component → `{cookie}`, browser island →
   * `{auth:'include'}`, script → `{bearerToken}`). Defaults to `{}` so the existing
   * public wiring (`new HttpCourtRepository()`) is unchanged.
   */
  constructor(private readonly auth: HttpAuthOptions = {}) {}

  /** GET /v1/courts?country=&region=&collection=&surface=&access=&indoorOutdoor=&scenic=&featured=&q=&limit= */
  async list(filter: CourtFilter = {}): Promise<CourtSummaryDTO[]> {
    const query = buildQuery({
      country: filter.country,
      region: filter.region,
      collection: filter.collection,
      surface: filter.surface,
      access: filter.access,
      indoorOutdoor: filter.indoorOutdoor,
      scenic: filter.scenic,
      featured: filter.featured,
      q: filter.q,
      limit: filter.limit,
    });
    return getJson<CourtSummaryDTO[]>(`/courts${query}`);
  }

  /** GET /v1/courts/:slug — 404 maps to `null` (interface contract). */
  async getBySlug(slug: string): Promise<CourtDTO | null> {
    return getJsonOrNull<CourtDTO>(`/courts/${encodeURIComponent(slug)}`);
  }

  /** GET /v1/courts?q=query — free-text search (same endpoint as `list`). */
  async search(query: string): Promise<CourtSummaryDTO[]> {
    return this.list({ q: query });
  }

  /** GET /v1/courts/map — decorative pins (no geo). `bbox`/`zoom` are accepted for
   *  interface stability but unused by the API (no-PostGIS), so they are not sent. */
  async getMapPins(_bbox?: BBox, _zoom?: number): Promise<MapPinDTO[]> {
    return getJson<MapPinDTO[]>('/courts/map');
  }

  /**
   * GET /v1/courts/:slug/related?limit= — related published courts.
   *
   * The interface passes a court **id** but the endpoint is keyed by **slug**, so
   * we resolve id → slug first (see the file header for the rationale). An unknown
   * id yields `[]` (mirrors the mock's "no such court ⇒ no related"); we never call
   * the endpoint with an undefined slug.
   */
  async getRelated(courtId: string, limit = 4): Promise<CourtSummaryDTO[]> {
    const slug = await this.slugForId(courtId);
    if (!slug) return [];
    const query = buildQuery({ limit });
    return getJson<CourtSummaryDTO[]>(
      `/courts/${encodeURIComponent(slug)}/related${query}`,
    );
  }

  /** Resolve a court id to its routing slug via the published summary list. */
  private async slugForId(courtId: string): Promise<string | undefined> {
    const courts = await this.list();
    return courts.find((c) => c.id === courtId)?.slug;
  }

  /**
   * GET /v1/me/courts/:slug/exact-location — the PROTECTED exact-coordinate unlock
   * (Feature 63 endpoint; Feature 64 web wiring). The ONLY method here that carries the
   * caller's `auth` transport, and the ONLY one that ever returns exact `lat`/`lng`.
   *
   * Every "not unlocked" outcome collapses to `null` (see the interface doc): 401
   * (`AuthRequiredError` — logged out), 403 (`HttpError` — authed but not entitled), and
   * 404 (unknown/unpublished slug, mapped by `allowNull`). Court EXISTENCE is already
   * settled by the public `getBySlug` on the page, so a 404 here is only "no unlock for
   * you", not the page's not-found signal. Any OTHER `HttpError` (5xx, an unexpected 4xx)
   * PROPAGATES — a real fault must not masquerade as "locked".
   */
  async getExactLocation(slug: string): Promise<ExactLocationDTO | null> {
    try {
      // `allowNull` maps a 404 → null (no such published court for this viewer).
      return await getJsonOrNull<ExactLocationDTO>(
        `/me/courts/${encodeURIComponent(slug)}/exact-location`,
        this.auth,
      );
    } catch (err) {
      // Logged out (401) and not-entitled (403) are EXPECTED "locked" states on the
      // public court page — degrade to null (locked), never crash the render. Anything
      // else (network, 5xx, unexpected status) is a real fault → rethrow.
      if (err instanceof AuthRequiredError) return null;
      if (err instanceof HttpError && err.status === 403) return null;
      throw err;
    }
  }
}
