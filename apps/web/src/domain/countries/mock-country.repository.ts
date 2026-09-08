// Countries domain — MOCK repository implementation.
//
// Reads the shared dataset from `@tennis/mock-data` (Architecture Plan Decision #5)
// and computes the country aggregate IN MEMORY. This adapter owns the query logic;
// it does NOT own the dataset.
//
// ── Keeping this in step with the API ────────────────────────────────────────────
// This class and `apps/api/src/countries/countries.service.ts` query two different
// stores (this array vs. Postgres), so they cannot share an implementation. What they
// DO share:
//
//   • ONE written statement of the rules — "THE COUNTRY AGGREGATE RULES" in
//     `packages/mock-data/src/countries.ts`. Both files' headers point at it.
//   • ONE authored table of the non-derivable facts — `COUNTRY_METADATA` there is
//     what `apps/api/prisma/seed.ts` writes into the `Country` rows the API reads,
//     so `isoCode`/`continent` cannot diverge by construction.
//   • ONE definition of each comparator — `compareRepresentativeCourts` (rule 3) and
//     `compareCountryNames` (rule 4) are imported here rather than re-expressed, and
//     the API applies the same expressions as a Prisma `orderBy` / a JS sort.
//   • ONE derived `seedOrder` — `SEED_ORDER_BY_COURT_SLUG` is the index into the
//     `COURTS` array, which is literally what the seed writes (`seedOrder: i`).
//
// And `verify:api-parity` deep-compares this output against the live endpoint, so a
// drift in anything left over fails the harness instead of shipping.
//
// Plain TypeScript only — no React, no Next.js — so it is independently testable.

import {
  COURTS,
  compareCountryNames,
  compareRepresentativeCourts,
  countryMetadata,
  SEED_ORDER_BY_COURT_SLUG,
} from '@tennis/mock-data';
import type { CountryDTO } from '@tennis/contracts';
import type { CountryRepository } from './country.repository';

/** A published mock court, annotated with the `seedOrder` the seed would write. */
interface RankedCourt {
  readonly country: string;
  readonly heroImageUrl: string;
  readonly isFeatured: boolean;
  readonly seedOrder: number;
}

export class MockCountryRepository implements CountryRepository {
  async list(): Promise<CountryDTO[]> {
    // Rule 1 — eligibility: published courts only, on BOTH the count and the image
    // pick. A draft court neither inflates a count nor supplies an image.
    const published: RankedCourt[] = COURTS.filter(
      (court) => court.status === 'published',
    ).map((court) => ({
      country: court.country,
      heroImageUrl: court.heroImageUrl,
      isFeatured: court.isFeatured,
      // Every court in COURTS has an entry (the map is built from COURTS itself).
      seedOrder: SEED_ORDER_BY_COURT_SLUG.get(court.slug)!,
    }));

    // Group by country name. A country with no published court never gets a bucket,
    // which is rule 1's "omitted from the response entirely".
    const byCountry = new Map<string, RankedCourt[]>();
    for (const court of published) {
      const bucket = byCountry.get(court.country);
      if (bucket) bucket.push(court);
      else byCountry.set(court.country, [court]);
    }

    const countries: CountryDTO[] = [];
    for (const [name, courts] of byCountry) {
      const { isoCode, continent } = countryMetadata(name);
      // Rule 3 — representative court: min under the shared comparator (isFeatured
      // desc, then seedOrder asc). `reduce`-with-min rather than `sort` so sort
      // stability is irrelevant; the comparator is a TOTAL order (seedOrder is
      // unique per court), so the winner is unambiguous.
      const representative = courts.reduce((best, court) =>
        compareRepresentativeCourts(court, best) < 0 ? court : best,
      );
      countries.push({
        name,
        isoCode,
        continent,
        // Rule 2 — count of published courts.
        courtCount: courts.length,
        imageUrl: representative.heroImageUrl,
      });
    }

    // Rule 4 — response order: name ascending.
    return countries.sort((a, b) => compareCountryNames(a.name, b.name));
  }
}
