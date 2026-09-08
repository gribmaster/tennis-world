import type { Continent } from '@tennis/contracts';
import { COURTS } from './courts';

// ─────────────────────────────────────────────────────────────────────────────
// Country metadata for the mock dataset (Feature 75).
//
// `packages/mock-data/src/courts.ts` carries only a country NAME per court. The
// Prisma `Country` row needs a non-null `isoCode` and `continent` as well, so those
// two facts have to be authored somewhere. Before this feature they were authored
// TWICE — a private copy in `apps/api/prisma/seed.ts` and another in
// `apps/api/scripts/import-courts-from-content.ts` — with nothing keeping them
// aligned.
//
// This file is now the SINGLE source for the mock/seeded set: the seed imports
// COUNTRY_METADATA from here instead of holding its own literal, so what
// `GET /v1/countries` reports (out of the seeded DB) and what
// `MockCountryRepository` reports (out of this package) come from the same
// authored table by construction. The content importer keeps its own map: it seeds
// a DIFFERENT court set (the 12 French Riviera courts in `content/`), and merging
// the two datasets is not this feature's job.
//
// NO GEO here. Region lat/lng stay a seed-only concern (`seed.ts` derives them from
// member courts' approx coords); nothing in this file reaches the public
// `CountryDTO`, which carries no coordinates at any depth.
// ─────────────────────────────────────────────────────────────────────────────

/** Authored, non-derivable facts about a country appearing in `COURTS`. */
export interface CountryMetadata {
  /** ISO-3166 alpha-2 code. `UK` uses `GB` per ISO-3166. */
  readonly isoCode: string;
  readonly continent: Continent;
}

/**
 * Keyed by the exact `CourtDTO.country` string used in `courts.ts`. Every distinct
 * country in `COURTS` MUST have an entry — the seed throws if one is missing, and
 * `countryMetadata()` below does too.
 */
export const COUNTRY_METADATA: Record<string, CountryMetadata> = {
  Italy: { isoCode: 'IT', continent: 'Europe' },
  Spain: { isoCode: 'ES', continent: 'Europe' },
  France: { isoCode: 'FR', continent: 'Europe' },
  Monaco: { isoCode: 'MC', continent: 'Europe' },
  Portugal: { isoCode: 'PT', continent: 'Europe' },
  UK: { isoCode: 'GB', continent: 'Europe' },
  Morocco: { isoCode: 'MA', continent: 'Africa' },
  Indonesia: { isoCode: 'ID', continent: 'Asia' },
  Japan: { isoCode: 'JP', continent: 'Asia' },
  Maldives: { isoCode: 'MV', continent: 'Asia' },
  USA: { isoCode: 'US', continent: 'Americas' },
};

/** Look up a country's authored metadata, throwing loudly when it is missing. */
export function countryMetadata(name: string): CountryMetadata {
  const meta = COUNTRY_METADATA[name];
  if (!meta) {
    throw new Error(
      `Missing continent/isoCode mapping for country "${name}". ` +
        `Add it to COUNTRY_METADATA in @tennis/mock-data.`,
    );
  }
  return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE COUNTRY AGGREGATE RULES (Feature 75) — stated ONCE, here.
//
// `GET /v1/countries` (apps/api/src/countries) and `MockCountryRepository`
// (apps/web/src/domain/countries) query two different stores — Postgres and this
// in-memory array — so they cannot share an implementation. They CAN share this
// written rule, and `verify:api-parity` asserts they agree. Both sides' code
// comments point back here; change a rule here and both sides must change.
//
//   1. ELIGIBILITY — only `status = 'published'` courts count, exactly as
//      `courts.service.ts` filters its public reads. A draft court must not inflate
//      a count nor supply an image. A country with ZERO published courts is OMITTED
//      from the response entirely (a zero-count country with no image is not
//      something the strip can render).
//
//   2. COUNT — `courtCount` is the number of published courts in that country.
//
//   3. REPRESENTATIVE COURT (the `imageUrl` source) — among that country's
//      published courts, take:
//         a. `isFeatured = true` before `isFeatured = false`, then
//         b. the LOWEST `seedOrder`.
//      and use that court's `heroImageUrl`. `seedOrder` is the stable ordinal the
//      seed writes as the index of the court in this package's `COURTS` array
//      (`seed.ts`: `seedOrder: i`), and it is unique per court, so this ordering is
//      a TOTAL order — no ties, no insertion-order accident, same answer on every
//      request and in both modes.
//
//   4. RESPONSE ORDER — alphabetical by `name` ascending, compared with
//      `localeCompare('en')` on both sides. Chosen over "descending by court count"
//      because a count is content that moves: adding one court silently reshuffles
//      the strip, and the two-court/one-court tail would need an arbitrary tiebreak
//      anyway. Names are stable, unique per country, and read as a browsable A–Z
//      strip.
// ─────────────────────────────────────────────────────────────────────────────

/** Sort comparator for rule 4 — the ONE definition of the response order. */
export function compareCountryNames(a: string, b: string): number {
  return a.localeCompare(b, 'en');
}

/**
 * Rank comparator for rule 3, over a court's `isFeatured` + `seedOrder`. Lower rank
 * sorts first, so `pick` is `reduce`-with-min, never an array `sort` (stability of
 * the underlying sort is then irrelevant).
 *
 * Exported so the mock repository and any future consumer share the exact
 * expression rather than re-deriving it. The API applies the SAME rule as a Prisma
 * `orderBy: [{ isFeatured: 'desc' }, { seedOrder: 'asc' }]` + `take: 1`.
 */
export function compareRepresentativeCourts(
  a: { readonly isFeatured: boolean; readonly seedOrder: number },
  b: { readonly isFeatured: boolean; readonly seedOrder: number },
): number {
  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
  return a.seedOrder - b.seedOrder;
}

/**
 * The mock dataset's `seedOrder` for a court slug — the index of that court in the
 * `COURTS` array, which is exactly what `seed.ts` writes into `Court.seedOrder`.
 * Derived, never authored, so it cannot drift from the seed.
 */
export const SEED_ORDER_BY_COURT_SLUG: ReadonlyMap<string, number> = new Map(
  COURTS.map((court, index) => [court.slug, index]),
);
