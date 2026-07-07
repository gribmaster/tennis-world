import { Injectable, NotFoundException } from '@nestjs/common';
import type { CollectionDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { CollectionListQuery } from './collections.dto';
import { collectionSelect, toCollectionDTO } from './collections.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// CollectionsService — public collection reads.
//
// Behavior is a faithful server-side port of `MockCollectionRepository` so the
// seeded API output matches the Phase-1 mock:
//   - list ordered by `sortOrder asc` — the seed assigns `sortOrder = i` over the
//     mock COLLECTIONS array, so this reproduces that array order exactly.
//   - `featured` is accepted but does NOT narrow the set (the mock ignores it too —
//     no per-collection featured flag exists in Phase-1 data).
//   - `limit` trims AFTER ordering (mock's `slice(0, limit)`).
//   - `count` is DERIVED from CollectionCourt membership via `_count` (Risk #19).
//
// NOTE on `isPublished`: unlike CourtsService (which filters `status=published`
// because MockCourtRepository filters published), the mock COLLECTIONS set is NOT
// published-filtered — it returns every collection — so for byte-for-byte parity
// we do NOT add an `isPublished` WHERE here. All seeded collections are published
// anyway, so this is parity-driven, not a visibility gap.
//
// `getBySlug` returns CollectionDTO ONLY — no embedded courts. The detail page
// fetches a collection's courts separately via GET /v1/courts?collection=slug.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /v1/collections — ordered list of collection summaries. */
  async list(query: CollectionListQuery): Promise<CollectionDTO[]> {
    const rows = await this.prisma.collection.findMany({
      select: collectionSelect,
      orderBy: { sortOrder: 'asc' },
      // `limit` is applied after ordering (Prisma `take`), matching the mock's
      // `result.slice(0, limit)`. `featured` is intentionally NOT a filter here
      // (see header) — it is parsed only to reject malformed values.
      ...(query.limit !== undefined ? { take: query.limit } : {}),
    });

    return rows.map(toCollectionDTO);
  }

  /** GET /v1/collections/:slug — single collection, or 404 if none matches. */
  async getBySlug(slug: string): Promise<CollectionDTO> {
    const row = await this.prisma.collection.findUnique({
      where: { slug },
      select: collectionSelect,
    });
    if (!row) {
      throw new NotFoundException(`Collection "${slug}" not found.`);
    }
    return toCollectionDTO(row);
  }
}
