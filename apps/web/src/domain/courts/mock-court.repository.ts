// Courts domain — MOCK repository implementation.
//
// Reads the shared dataset from `@tennis/mock-data` (Architecture Plan Decision #5)
// and applies all filter/search/related/pin logic IN MEMORY. This adapter owns the
// query logic; it does NOT own the dataset — that lives in `packages/mock-data` so
// the same data later seeds Postgres in Phase 2 with zero drift.
//
// Plain TypeScript only — no React, no Next.js imports — so it is independently
// unit-testable (Phase 1 §1.2). The class is exported; wiring it into the app is
// the factory's job (a later feature), not this file's.

import { COLLECTION_COURTS, COURTS } from '@tennis/mock-data';
import type {
  CourtDTO,
  CourtSummaryDTO,
  ExactLocationDTO,
  MapPinDTO,
} from '@tennis/contracts';
import type { CourtRepository } from './court.repository';
import type { BBox, CourtFilter } from './court.types';

// `COURTS` from mock-data is structurally a full CourtDTO (it carries blurb,
// images, status, exact lat/lng). The mock treats each entry as the source of
// truth and projects down to the summary shape for list/search/related.
type MockCourt = (typeof COURTS)[number];

/** Project a full mock court down to the lightweight list/card/map shape. */
function toSummary(court: MockCourt): CourtSummaryDTO {
  return {
    id: court.id,
    slug: court.slug,
    name: court.name,
    country: court.country,
    region: court.region,
    surface: court.surface,
    setting: court.setting,
    access: court.access,
    indoorOutdoor: court.indoorOutdoor,
    isScenic: court.isScenic,
    isFeatured: court.isFeatured,
    isLocked: court.isLocked,
    heroImageUrl: court.heroImageUrl,
    mapCoords: court.mapCoords,
    // Always-public approximate geo only — exact lat/lng never enter the summary.
    approxLat: court.approxLat,
    approxLng: court.approxLng,
  };
}

/** Slugs of courts that belong to the given collection, per the membership map. */
function courtSlugsInCollection(collectionSlug: string): Set<string> {
  return new Set(
    COLLECTION_COURTS.filter((link) => link.collectionSlug === collectionSlug).map(
      (link) => link.courtSlug,
    ),
  );
}

/** Map a court's locked/featured fields to the pin's display state. */
function pinState(court: MockCourt): MapPinDTO['state'] {
  if (court.isLocked) return 'locked';
  if (court.isFeatured) return 'featured';
  return 'open';
}

export class MockCourtRepository implements CourtRepository {
  // Only published courts are ever exposed (matches what the API will return).
  private readonly courts: MockCourt[] = COURTS.filter((c) => c.status === 'published');

  async list(filter: CourtFilter = {}): Promise<CourtSummaryDTO[]> {
    const collectionMembers = filter.collection
      ? courtSlugsInCollection(filter.collection)
      : null;

    const q = filter.q?.trim().toLowerCase();

    let result = this.courts.filter((court) => {
      if (filter.country && court.country !== filter.country) return false;
      if (filter.region && court.region !== filter.region) return false;
      if (collectionMembers && !collectionMembers.has(court.slug)) return false;
      if (filter.surface && court.surface !== filter.surface) return false;
      if (filter.access && court.access !== filter.access) return false;
      if (filter.indoorOutdoor && court.indoorOutdoor !== filter.indoorOutdoor) return false;
      if (filter.scenic !== undefined && court.isScenic !== filter.scenic) return false;
      if (filter.featured !== undefined && court.isFeatured !== filter.featured) return false;
      if (q && !this.matchesQuery(court, q)) return false;
      return true;
    });

    if (filter.limit !== undefined) {
      result = result.slice(0, filter.limit);
    }

    return result.map(toSummary);
  }

  async getBySlug(slug: string): Promise<CourtDTO | null> {
    const court = this.courts.find((c) => c.slug === slug);
    if (!court) return null;
    // Phase 1 has no entitlement gating (Phase 4) — return the full detail incl.
    // exact lat/lng. The Phase-2 HTTP repo is where coordinate masking is enforced
    // server-side; the mock intentionally does not blur here.
    return {
      ...toSummary(court),
      blurb: court.blurb,
      images: court.images,
      status: court.status,
      lat: court.lat,
      lng: court.lng,
    };
  }

  async search(query: string): Promise<CourtSummaryDTO[]> {
    return this.list({ q: query });
  }

  async getMapPins(_bbox?: BBox, _zoom?: number): Promise<MapPinDTO[]> {
    // `bbox` is intentionally ignored (no-PostGIS, Risk #1); the stylized canvas
    // positions pins from each court's `mapCoords`, never from lat/lng. `zoom`
    // would select a hierarchy tier in a real clustering pass — for the 12-court
    // Phase-1 dataset every court is its own pin.
    return this.courts.map((court) => ({
      courtId: court.id,
      slug: court.slug,
      mapCoords: court.mapCoords,
      state: pinState(court),
    }));
  }

  async getRelated(courtId: string, limit = 4): Promise<CourtSummaryDTO[]> {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court) return [];
    // Simple in-memory heuristic: same country first, then same surface, never the
    // court itself. Good enough for Phase-1 demos; the API may rank differently.
    const others = this.courts.filter((c) => c.id !== courtId);
    const scored = others
      .map((c) => ({
        court: c,
        score: (c.country === court.country ? 2 : 0) + (c.surface === court.surface ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => toSummary(s.court));
  }

  /**
   * Exact-location unlock (Feature 64). MOCK mode has NO auth and NO entitlement system
   * (Decision #11) — `DEFAULT_MOCK_USER` is "free" — so there is no "entitled viewer" to
   * unlock for. Returning `null` keeps mock behavior EXACTLY as before: the court page
   * calls this only for a LOCKED court, and `null` leaves it locked (paywall CTA), while
   * an unlocked court never triggers the call at all. This intentionally never surfaces
   * the mock court's exact `lat`/`lng` — mock mode requires no auth and shows no real
   * directions link. (An entitled mock path would need a mock membership seam that
   * Phase-1 deliberately omits; out of scope here.)
   */
  async getExactLocation(_slug: string): Promise<ExactLocationDTO | null> {
    return null;
  }

  private matchesQuery(court: MockCourt, q: string): boolean {
    return (
      court.name.toLowerCase().includes(q) ||
      court.country.toLowerCase().includes(q) ||
      court.region.toLowerCase().includes(q) ||
      court.setting.toLowerCase().includes(q)
    );
  }
}
