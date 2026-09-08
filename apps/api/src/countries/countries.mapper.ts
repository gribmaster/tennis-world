import { Prisma } from '@prisma/client';
import type { CountryDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Country mapper + Prisma select (Feature 75).
//
// The DERIVATION RULES this file implements are written down ONCE, in
// `packages/mock-data/src/countries.ts` ("THE COUNTRY AGGREGATE RULES"). The web
// mock repository implements the same rules against the in-memory dataset, and
// `verify:api-parity` asserts the two agree. Change a rule there, change both sides.
//
// Rules realized here:
//   1. eligibility  — `status = 'published'` only, on BOTH the count and the image
//                     pick, exactly as `courts.service.ts` filters its public reads.
//   2. count        — `_count.courts` under that same published filter.
//   3. representative — `courts` is selected with
//                     `orderBy: [{ isFeatured: 'desc' }, { seedOrder: 'asc' }], take: 1`,
//                     which is the total order the rules define; its hero image is
//                     `imageUrl`.
//
// GEO: this select touches NO coordinate column. `Region` is not joined at all and
// `Court.lat`/`lng`/`approxLat`/`approxLng` are never read — `CountryDTO` carries no
// coordinates at any depth, and the row type below is derived from the select, so it
// is structurally incapable of carrying one.
//
// Type-only `@tennis/contracts` import (CountryDTO): the API runs as plain Node and
// `@tennis/contracts`' `main` points at TS source, so its runtime (zod) objects
// cannot be `require`d — only the erased types. Same pattern as collections.mapper.ts.
// (For the same reason this module does NOT import `@tennis/mock-data` either; the
// seeded database is the API's source of truth for `isoCode`/`continent`.)
// ─────────────────────────────────────────────────────────────────────────────

/** Published-court filter, applied identically to the count and the image pick. */
const publishedCourts = { status: 'published' } as const;

/**
 * Public country aggregate read. Selects the CountryDTO scalars, the PUBLISHED
 * membership count, and exactly one representative published court's hero image.
 * No `Region` join, no coordinate column, no join internals.
 */
export const countrySelect = {
  name: true,
  isoCode: true,
  continent: true,
  // Rule 2 — count published courts only.
  _count: { select: { courts: { where: publishedCourts } } },
  // Rule 3 — the ONE representative published court, hero image only.
  courts: {
    where: publishedCourts,
    orderBy: [{ isFeatured: 'desc' }, { seedOrder: 'asc' }],
    take: 1,
    select: {
      images: {
        where: { isHero: true },
        select: { url: true },
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.CountrySelect;

/** Row payload derived from the select above (⇒ cannot contain lat/lng). */
export type CountryRow = Prisma.CountryGetPayload<{ select: typeof countrySelect }>;

/**
 * Flatten a Prisma country row into a `CountryDTO`.
 *
 *  - `courtCount` ← `_count.courts` (published-filtered).
 *  - `imageUrl`   ← the representative court's hero image url. Coalesced to `''` when
 *                   that court somehow has no hero row (same defensive idiom as the
 *                   court hero-url mapper) rather than widening the DTO to nullable.
 *
 * Relation internals (`_count`, the `courts` array) never reach the DTO.
 */
export function toCountryDTO(row: CountryRow): CountryDTO {
  return {
    name: row.name,
    isoCode: row.isoCode,
    continent: row.continent,
    courtCount: row._count.courts,
    imageUrl: row.courts[0]?.images[0]?.url ?? '',
  };
}
