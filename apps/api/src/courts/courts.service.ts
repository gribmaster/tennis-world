import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CourtDTO, CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { CourtListQuery } from './courts.dto';
import {
  courtDetailSelect,
  courtSummarySelect,
  mapPinSelect,
  toCourtDTO,
  toCourtSummaryDTO,
  toMapPinDTO,
} from './courts.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// CourtsService — public court reads (intake §5).
//
// Behavior is a faithful server-side port of `MockCourtRepository` so the seeded
// API output matches the Phase-1 mock byte-for-byte:
//   - only `status = published`
//   - list/map ordered by `seedOrder asc` (reproduces the mock COURTS array order)
//   - filters mirror the web `CourtFilter`; `collection` filters by SLUG through
//     CollectionCourt; `q` searches name/country/region/setting (the mock fields)
//   - `getRelated` reproduces the mock heuristic exactly (see below)
//
// Coordinate masking is enforced by the PUBLIC selects in courts.mapper.ts, which
// never select `Court.lat`/`lng` — so exact geo never enters this process for a
// public read.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLISHED = 'published' as const;

@Injectable()
export class CourtsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /v1/courts — filtered list of published court summaries. */
  async list(query: CourtListQuery): Promise<CourtSummaryDTO[]> {
    const where: Prisma.CourtWhereInput = { status: PUBLISHED };

    // Denormalized country/region are stored as FK names — filter by the related
    // name so the wire param (a name string) maps straight through.
    if (query.country) where.country = { name: query.country };
    if (query.region) where.region = { name: query.region };
    if (query.surface) where.surface = query.surface;
    if (query.access) where.access = query.access;
    if (query.indoorOutdoor) where.indoorOutdoor = query.indoorOutdoor;
    if (query.scenic !== undefined) where.isScenic = query.scenic;
    if (query.featured !== undefined) where.isFeatured = query.featured;

    // Collection filter is by SLUG, resolved through the CollectionCourt join
    // (mirrors the mock's `courtSlugsInCollection`).
    if (query.collection) {
      where.collections = {
        some: { collection: { slug: query.collection } },
      };
    }

    // Free-text `q` over name/country/region/setting — the exact fields the mock
    // `matchesQuery` checks (NOT blurb). Case-insensitive `contains`, matching the
    // mock's `.toLowerCase().includes(...)`.
    if (query.q) {
      const contains = query.q;
      const mode = Prisma.QueryMode.insensitive;
      where.OR = [
        { name: { contains, mode } },
        { country: { name: { contains, mode } } },
        { region: { name: { contains, mode } } },
        { setting: { contains, mode } },
      ];
    }

    const rows = await this.prisma.court.findMany({
      where,
      select: courtSummarySelect,
      orderBy: { seedOrder: 'asc' },
      // `limit` is applied after filtering (Prisma `take` runs post-WHERE), which
      // matches the mock's `result.slice(0, limit)`.
      ...(query.limit !== undefined ? { take: query.limit } : {}),
    });

    return rows.map(toCourtSummaryDTO);
  }

  /** GET /v1/courts/:slug — full detail, or 404 if no published court matches. */
  async getBySlug(slug: string): Promise<CourtDTO> {
    const row = await this.prisma.court.findFirst({
      where: { slug, status: PUBLISHED },
      select: courtDetailSelect,
    });
    if (!row) {
      throw new NotFoundException(`Court "${slug}" not found.`);
    }
    return toCourtDTO(row);
  }

  /** GET /v1/courts/map — decorative pins for the stylized canvas (no geo). */
  async getMapPins(): Promise<MapPinDTO[]> {
    const rows = await this.prisma.court.findMany({
      where: { status: PUBLISHED },
      select: mapPinSelect,
      orderBy: { seedOrder: 'asc' },
    });
    return rows.map(toMapPinDTO);
  }

  /**
   * GET /v1/courts/:slug/related — related published courts.
   *
   * Reproduces the mock `getRelated` heuristic EXACTLY: score each other court by
   * `(sameCountry ? 2 : 0) + (sameSurface ? 1 : 0)`, sort by score DESC, then
   * `slice(0, limit)`. The mock relies on `Array.prototype.sort` being stable over
   * the published COURTS array order, so equal-score ties resolve by that order —
   * i.e. `seedOrder asc`. We fetch in `seedOrder asc` and use a STABLE sort to
   * make the tie-break deterministic and identical to the mock.
   *
   * NOTE (prompt task 6): the web mock `getRelated` keys off court **id**; this
   * public endpoint keys off **slug** because slug is the route key. We resolve
   * slug → court first (404 if the slug is unknown), then rank by the same fields.
   */
  async getRelated(slug: string, limit = 4): Promise<CourtSummaryDTO[]> {
    // Resolve the anchor court (need its country/surface; published only).
    // We compare on the denormalized country NAME exactly as the mock does.
    const anchor = await this.prisma.court.findFirst({
      where: { slug, status: PUBLISHED },
      select: { country: { select: { name: true } }, surface: true },
    });
    if (!anchor) {
      throw new NotFoundException(`Court "${slug}" not found.`);
    }

    // All OTHER published courts in seedOrder (the mock's implicit tie-break: it
    // ranks the published COURTS array, which is seedOrder, with a stable sort).
    const others = await this.prisma.court.findMany({
      where: { status: PUBLISHED, slug: { not: slug } },
      select: courtSummarySelect,
      orderBy: { seedOrder: 'asc' },
    });

    return others
      .map((row, index) => ({
        index, // preserve seedOrder position for a stable, deterministic tie-break
        row,
        score:
          (row.country.name === anchor.country.name ? 2 : 0) +
          (row.surface === anchor.surface ? 1 : 0),
      }))
      // score DESC, then seedOrder ASC — equivalent to the mock's stable sort.
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map((e) => toCourtSummaryDTO(e.row));
  }
}
