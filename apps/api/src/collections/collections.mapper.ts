import { Prisma } from '@prisma/client';
import type { CollectionDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Collection mapper + Prisma select (prompt task 4).
//
// `count` is DERIVED from the CollectionCourt membership mapping, never authored
// (Architecture Plan §9 Risk #19). We use Prisma's relation `_count` rather than
// pulling the join rows: the select asks only for `_count.courts`, so the row
// payload carries the membership COUNT and none of the join internals.
//
// The relation is `Collection.courts: CollectionCourt[]` in schema.prisma, hence
// `_count: { select: { courts: true } }` and `row._count.courts`.
//
// Type-only @tennis/contracts import (CollectionDTO): the API runs as plain Node
// and @tennis/contracts' `main` points at TS source, so its runtime (zod) objects
// can't be `require`d — but the *types* are erased at build time and give us the
// single-source-of-truth shape. Same pattern as courts.mapper.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public collection read. Selects the CollectionDTO scalar fields plus the
 * membership `_count.courts` used to derive `count`. Relation rows themselves are
 * NOT selected — only their count.
 */
export const collectionSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  coverImageUrl: true,
  type: true,
  _count: { select: { courts: true } },
} satisfies Prisma.CollectionSelect;

/** Row payload derived from the select above. */
export type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

/**
 * Flatten a Prisma collection row + its `_count` into a CollectionDTO.
 *
 *  - `count`         ← `_count.courts` (derived membership count, Risk #19).
 *  - `coverImageUrl` ← column is nullable in the schema (`String?`) but the DTO
 *                      requires a string; every seeded/mock collection authors one,
 *                      so we coalesce a missing value to `''` (same defensive idiom
 *                      as the court hero-url mapper) rather than widen the DTO.
 *  - `description`   ← optional on the wire — omit the key entirely when null
 *                      (mirrors the court `alt` handling).
 *
 * Relation internals (`_count`, join rows) never reach the DTO.
 */
export function toCollectionDTO(row: CollectionRow): CollectionDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...(row.description !== null ? { description: row.description } : {}),
    coverImageUrl: row.coverImageUrl ?? '',
    type: row.type,
    count: row._count.courts,
  };
}
