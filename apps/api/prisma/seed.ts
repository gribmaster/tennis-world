// ─────────────────────────────────────────────────────────────────────────────
// Postgres seed (Feature 40 / intake §6) — writes `@tennis/mock-data` into the
// finalized Phase-2 schema so the seeded API output matches the Phase-1 mock
// repositories byte-for-byte. DATA flows one way: @tennis/mock-data → Postgres.
//
// Idempotent: every write is an `upsert` keyed on a stable id/slug, so running the
// seed twice produces no duplicates and no drift. Run with:
//   pnpm --filter @tennis/api db:seed         (or `prisma db seed`)
//
// FK write order: Country → Region → Court → CourtImage → Collection →
// CollectionCourt → Article.
//
// Scope guard (Feature 40 hard rules): NO User/Entitlement/SavedCourt/
// UserCollection/AdminUser/ConsultationRequest seeding — those are auth/Phase-4
// (or runtime-only) and out of scope here. Exact `Court.lat`/`lng` are stored in
// the DB (schema keeps them) but are NEVER exposed — there are no endpoints yet.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import {
  ARTICLES,
  COLLECTION_COURTS,
  COLLECTIONS,
  COURTS,
} from '@tennis/mock-data';

const prisma = new PrismaClient();

// ── Local seed helpers ───────────────────────────────────────────────────────

/** Kebab-case slug used for deterministic Country/Region ids (re-seed stable). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Continent per country — seed-only data (mock-data carries no continent and the
 * Prisma `Country.continent` column is non-null). Not exposed by any Phase-2 DTO.
 */
const CONTINENT_BY_COUNTRY: Record<string, string> = {
  Italy: 'Europe',
  Spain: 'Europe',
  France: 'Europe',
  Monaco: 'Europe',
  Portugal: 'Europe',
  UK: 'Europe',
  Morocco: 'Africa',
  Indonesia: 'Asia',
  Japan: 'Asia',
  Maldives: 'Asia',
  USA: 'Americas',
};

/**
 * Stable ISO code per country — seed-only (the `Country.isoCode` column is unique
 * and non-null). Not exposed by any Phase-2 DTO. `UK` uses `GB` per ISO-3166.
 */
const ISO_CODE_BY_COUNTRY: Record<string, string> = {
  Italy: 'IT',
  Spain: 'ES',
  France: 'FR',
  Monaco: 'MC',
  Portugal: 'PT',
  UK: 'GB',
  Morocco: 'MA',
  Indonesia: 'ID',
  Japan: 'JP',
  Maldives: 'MV',
  USA: 'US',
};

/** Deterministic Country id from its name. */
const countryId = (country: string): string => slugify(country);

/** Deterministic Region id from its (country, region) pair. */
const regionId = (country: string, region: string): string =>
  slugify(`${country}-${region}`);

/**
 * Representative region coords — reuse the first member court's approx geo. These
 * region coords are seed-only and not surfaced by any Phase-2 DTO (Region exists
 * purely as a denormalization target the mapper flattens back to a name).
 */
function getRepresentativeRegionCoords(
  country: string,
  region: string,
): { lat: number; lng: number } {
  const member = COURTS.find((c) => c.country === country && c.region === region);
  // Every (country, region) pair is derived from COURTS, so a member always exists.
  return { lat: member!.approxLat, lng: member!.approxLng };
}

/** `'YYYY-MM-DD'` (or any ISO string) → DateTime for `Article.publishedAt`. */
function parsePublishedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Seed steps (FK order) ────────────────────────────────────────────────────

async function seedCountries(): Promise<number> {
  const names = Array.from(new Set(COURTS.map((c) => c.country)));
  for (const name of names) {
    const continent = CONTINENT_BY_COUNTRY[name];
    const isoCode = ISO_CODE_BY_COUNTRY[name];
    if (!continent || !isoCode) {
      throw new Error(
        `Seed: missing continent/isoCode mapping for country "${name}". ` +
          `Add it to CONTINENT_BY_COUNTRY / ISO_CODE_BY_COUNTRY.`,
      );
    }
    const data = { name, isoCode, continent: continent as never };
    await prisma.country.upsert({
      where: { id: countryId(name) },
      create: { id: countryId(name), ...data },
      update: data,
    });
  }
  return names.length;
}

async function seedRegions(): Promise<number> {
  const seen = new Set<string>();
  const pairs: { country: string; region: string }[] = [];
  for (const c of COURTS) {
    const key = `${c.country}::${c.region}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ country: c.country, region: c.region });
    }
  }
  for (const { country, region } of pairs) {
    const { lat, lng } = getRepresentativeRegionCoords(country, region);
    const id = regionId(country, region);
    const data = { name: region, lat, lng, countryId: countryId(country) };
    await prisma.region.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  return pairs.length;
}

async function seedCourts(): Promise<number> {
  for (let i = 0; i < COURTS.length; i++) {
    const c = COURTS[i]!;
    const [mapX, mapY] = c.mapCoords;
    // `CourtDTO.lat`/`lng` are optional on the wire (omitted for non-entitled
    // requests, Phase 4) so they type as `number | undefined`, but the DB column
    // is non-null and every mock court authors them. Guard so missing geo fails
    // loudly rather than seeding a bad row.
    if (c.lat === undefined || c.lng === undefined) {
      throw new Error(`Seed: court "${c.id}" is missing exact lat/lng.`);
    }
    const data = {
      slug: c.slug,
      name: c.name,
      countryId: countryId(c.country),
      regionId: regionId(c.country, c.region),
      lat: c.lat,
      lng: c.lng,
      approxLat: c.approxLat,
      approxLng: c.approxLng,
      mapX,
      mapY,
      surface: c.surface as never,
      setting: c.setting,
      access: c.access as never,
      indoorOutdoor: c.indoorOutdoor as never,
      isScenic: c.isScenic,
      isFeatured: c.isFeatured,
      isLocked: c.isLocked,
      status: c.status as never,
      blurb: c.blurb,
      seedOrder: i, // reproduce mock-data COURTS array order
    };
    await prisma.court.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  return COURTS.length;
}

async function seedCourtImages(): Promise<number> {
  let total = 0;
  for (const c of COURTS) {
    for (const img of c.images) {
      // Deterministic id from court + slot so re-seeds upsert in place.
      const id = `${c.id}-img-${img.sortOrder}`;
      const data = {
        courtId: c.id,
        url: img.url,
        alt: img.alt ?? null,
        sortOrder: img.sortOrder,
        isHero: img.isHero,
      };
      await prisma.courtImage.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      total++;
    }
  }
  return total;
}

async function seedCollections(): Promise<number> {
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const col = COLLECTIONS[i]!;
    // `count` is intentionally NOT stored — it is derived from CollectionCourt.
    const data = {
      slug: col.slug,
      name: col.name,
      description: col.description ?? null,
      coverImageUrl: col.coverImageUrl,
      type: col.type as never,
      sortOrder: i, // reproduce mock-data COLLECTIONS list order
    };
    await prisma.collection.upsert({
      where: { id: col.id },
      create: { id: col.id, ...data },
      update: data,
    });
  }
  return COLLECTIONS.length;
}

async function seedCollectionCourts(): Promise<number> {
  // Resolve slugs → ids once.
  const collectionIdBySlug = new Map(COLLECTIONS.map((c) => [c.slug, c.id]));
  const courtIdBySlug = new Map(COURTS.map((c) => [c.slug, c.id]));

  for (const link of COLLECTION_COURTS) {
    const collectionId = collectionIdBySlug.get(link.collectionSlug);
    const courtId = courtIdBySlug.get(link.courtSlug);
    if (!collectionId) {
      throw new Error(
        `Seed: COLLECTION_COURTS references unknown collection "${link.collectionSlug}".`,
      );
    }
    if (!courtId) {
      throw new Error(
        `Seed: COLLECTION_COURTS references unknown court "${link.courtSlug}".`,
      );
    }
    await prisma.collectionCourt.upsert({
      where: { collectionId_courtId: { collectionId, courtId } },
      create: { collectionId, courtId, sortOrder: link.sortOrder },
      update: { sortOrder: link.sortOrder },
    });
  }
  return COLLECTION_COURTS.length;
}

async function seedArticles(): Promise<number> {
  for (const a of ARTICLES) {
    const data = {
      slug: a.slug,
      title: a.title,
      subtitle: a.subtitle ?? null,
      category: a.category,
      bodyRichText: a.bodyRichText,
      heroImageUrl: a.heroImageUrl ?? null,
      readTimeMinutes: a.readTimeMinutes,
      publishedAt: parsePublishedAt(a.publishedAt),
      // Optional byline (Feature 44) — null when the mock omits it.
      author: a.author ?? null,
    };
    await prisma.article.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });
  }
  return ARTICLES.length;
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Seeding Postgres from @tennis/mock-data …');

  const countries = await seedCountries();
  const regions = await seedRegions();
  const courts = await seedCourts();
  const courtImages = await seedCourtImages();
  const collections = await seedCollections();
  const memberships = await seedCollectionCourts();
  const articles = await seedArticles();

  console.log('Seed complete. Row counts:');
  console.table({
    countries,
    regions,
    courts,
    courtImages,
    collections,
    collectionMemberships: memberships,
    articles,
  });
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
