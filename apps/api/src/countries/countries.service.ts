import { Injectable } from '@nestjs/common';
import type { CountryDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { countrySelect, toCountryDTO } from './countries.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// CountriesService — the public country aggregate read behind GET /v1/countries.
//
// Read-only. It answers exactly what the Collections screen's "By Country" strip
// needs (name + "N courts" + one photo) and nothing more.
//
// The rules it implements — published-only eligibility, the count, the
// representative-court pick, the response order — are stated once in
// `packages/mock-data/src/countries.ts` ("THE COUNTRY AGGREGATE RULES"). The web
// `MockCountryRepository` implements the same rules over the in-memory dataset and
// `verify:api-parity` compares the two outputs, so a divergence fails the harness
// rather than shipping.
//
// ORDERING (rule 4): alphabetical by `name` ascending, sorted IN JS with
// `localeCompare('en')` rather than with a Prisma `orderBy: { name: 'asc' }`. That
// is deliberate: a database `ORDER BY name` uses the server's collation, which is
// environment-dependent (local docker Postgres vs. Supabase) and is NOT guaranteed
// to match JavaScript's `localeCompare` — the mock side has no database and can only
// sort in JS. Doing the final sort in JS on both sides makes the two orders
// identical by construction instead of by coincidence. At ~11 countries the cost is
// nil; this is an aggregate over a small, slow-moving dimension, not a paged list.
//
// OMITTING EMPTY COUNTRIES (rule 1): filtered with `where: { courts: { some: {
// status: 'published' } } }`, so a country whose courts are all drafts (or which has
// none at all) never reaches the response. That also guarantees the representative
// court in the select exists, so `imageUrl` is never empty for lack of a court.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /v1/countries — every country with >= 1 published court, name-ascending. */
  async list(): Promise<CountryDTO[]> {
    const rows = await this.prisma.country.findMany({
      where: { courts: { some: { status: 'published' } } },
      select: countrySelect,
    });

    return rows
      .map(toCountryDTO)
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }
}
