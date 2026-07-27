// ─────────────────────────────────────────────────────────────────────────────
// One-time/manual data operation: populate the 6 existing editorial collections
// (Coastal Courts, Desert Courts, Hidden Resorts, Historic Clubs, Mountain Courts,
// Rooftop & Urban) with real court memberships for the client demo.
//
// Why this exists as its own script (not the seed): the live courts dataset was
// replaced by `db:import-courts-content` and no longer matches
// `@tennis/mock-data`'s COURTS/COLLECTION_COURTS (12 old placeholder courts vs.
// the 12 real imported France courts) — see prisma/scripts/import-courts-from-content.ts.
// Re-running `db:seed` would fight that imported content, so this script reads
// courts directly from the DATABASE by stable slug and only touches
// CollectionCourt membership rows for these 6 collections.
//
// What it touches:
//   • CollectionCourt rows for the 6 named collections ONLY (upsert by
//     [collectionId, courtId] — matches the existing PK, so re-running is a no-op).
//   • Stale memberships on these 6 collections pointing at court slugs that no
//     longer exist (leftover from the old mock dataset) are removed.
//
// What it does NOT touch:
//   • Any other collection (including user-created UserCollection rows — a
//     completely separate model).
//   • Court content, coordinates, images, or visibility.
//   • Collection rows themselves (name/slug/description/cover) — only membership.
//
// Idempotent: running twice makes zero further changes (verified by dry-run diff
// before each write).
//
// Run with (from repo root):
//   pnpm --filter @tennis/api db:populate-demo-collections
// Requires DATABASE_URL to point at the target DB (staging/prod uses that env's
// URL) — confirm which DB you're pointed at before running against anything but
// local.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Desired membership, by stable slugs. Hand-curated against the current live
 * court dataset (12 France courts imported via db:import-courts-content) —
 * matched on setting/blurb (coastal/sea-view, secluded/private, heritage,
 * alpine, urban/rooftop). See PR description for the full rationale per court.
 *
 * `desert-courts` is intentionally left with NO entries: the current dataset
 * has zero desert/arid or Middle-East/North-Africa courts, and per explicit
 * product direction we do not force an unrelated court into the collection
 * just to fill it. Revisit once desert-themed court content exists.
 */
const DESIRED_MEMBERSHIP: Record<string, string[]> = {
  'coastal-courts': [
    'hotel-du-cap-eden-roc',
    'grand-hotel-du-cap-ferrat-a-four-seasons',
    'hotel-cap-estel',
    'epi-baie-de-pampelonne',
    'chateau-de-la-messardiere',
  ],
  'desert-courts': [],
  'hidden-resorts': [
    'domaine-des-etangs',
    'hotel-cap-estel',
    'tennis-de-la-cavaleire',
    'monte-carlo-country-club',
  ],
  'historic-clubs': [
    'lagardere-paris-racing',
    'monte-carlo-country-club',
    'tennis-de-la-cavaleire',
    'tennis-du-jardin-du-luxembourg',
  ],
  'mountain-courts': ['tennis-de-la-rosiere'],
  'rooftop-urban': [
    'tennis-de-la-cavaleire',
    'tennis-du-jardin-du-luxembourg',
    'lagardere-paris-racing',
  ],
};

interface Summary {
  collectionSlug: string;
  added: string[];
  alreadyPresent: string[];
  staleRemoved: string[];
  missingCourtSlugs: string[];
}

async function main(): Promise<void> {
  console.log('Populating demo editorial collections …');

  const collections = await prisma.collection.findMany({
    where: { slug: { in: Object.keys(DESIRED_MEMBERSHIP) } },
    select: { id: true, slug: true, name: true },
  });
  const collectionBySlug = new Map(collections.map((c) => [c.slug, c]));

  const missingCollections = Object.keys(DESIRED_MEMBERSHIP).filter(
    (slug) => !collectionBySlug.has(slug),
  );
  if (missingCollections.length > 0) {
    throw new Error(
      `Collections not found in DB (expected all 6 to pre-exist): ${missingCollections.join(', ')}`,
    );
  }

  const allDesiredSlugs = Array.from(
    new Set(Object.values(DESIRED_MEMBERSHIP).flat()),
  );
  const courts = await prisma.court.findMany({
    where: { slug: { in: allDesiredSlugs } },
    select: { id: true, slug: true },
  });
  const courtBySlug = new Map(courts.map((c) => [c.slug, c]));

  const summaries: Summary[] = [];

  for (const [collectionSlug, desiredCourtSlugs] of Object.entries(DESIRED_MEMBERSHIP)) {
    const collection = collectionBySlug.get(collectionSlug)!;
    const summary: Summary = {
      collectionSlug,
      added: [],
      alreadyPresent: [],
      staleRemoved: [],
      missingCourtSlugs: [],
    };

    const existingLinks = await prisma.collectionCourt.findMany({
      where: { collectionId: collection.id },
      include: { court: { select: { slug: true } } },
    });
    const existingCourtIdSet = new Set(existingLinks.map((l) => l.courtId));

    // Add missing desired memberships (upsert on the [collectionId, courtId] PK —
    // safe to re-run).
    for (let i = 0; i < desiredCourtSlugs.length; i++) {
      const courtSlug = desiredCourtSlugs[i]!;
      const court = courtBySlug.get(courtSlug);
      if (!court) {
        summary.missingCourtSlugs.push(courtSlug);
        continue;
      }
      if (existingCourtIdSet.has(court.id)) {
        summary.alreadyPresent.push(courtSlug);
        continue;
      }
      await prisma.collectionCourt.upsert({
        where: { collectionId_courtId: { collectionId: collection.id, courtId: court.id } },
        create: { collectionId: collection.id, courtId: court.id, sortOrder: i },
        update: { sortOrder: i },
      });
      summary.added.push(courtSlug);
    }

    // Remove stale memberships: links on this collection whose court is NOT in
    // this collection's desired set (covers both "court slug no longer exists"
    // and "court exists but was linked under the old mock dataset's curation").
    const desiredCourtIdSet = new Set(
      desiredCourtSlugs
        .map((slug) => courtBySlug.get(slug)?.id)
        .filter((id): id is string => Boolean(id)),
    );
    for (const link of existingLinks) {
      if (!desiredCourtIdSet.has(link.courtId)) {
        await prisma.collectionCourt.delete({
          where: { collectionId_courtId: { collectionId: collection.id, courtId: link.courtId } },
        });
        summary.staleRemoved.push(link.court.slug);
      }
    }

    summaries.push(summary);
  }

  console.log('\nDone. Per-collection summary:');
  for (const s of summaries) {
    console.log(`\n- ${s.collectionSlug}`);
    console.log(`    added:            ${s.added.length ? s.added.join(', ') : '(none)'}`);
    console.log(
      `    already present:  ${s.alreadyPresent.length ? s.alreadyPresent.join(', ') : '(none)'}`,
    );
    console.log(
      `    stale removed:    ${s.staleRemoved.length ? s.staleRemoved.join(', ') : '(none)'}`,
    );
    if (s.missingCourtSlugs.length > 0) {
      console.log(`    ⚠ missing court slugs (skipped): ${s.missingCourtSlugs.join(', ')}`);
    }
  }

  const finalCounts = await prisma.collectionCourt.groupBy({
    by: ['collectionId'],
    _count: true,
    where: { collectionId: { in: collections.map((c) => c.id) } },
  });
  const countByCollectionId = new Map(finalCounts.map((f) => [f.collectionId, f._count]));
  console.log('\nFinal court count per collection:');
  for (const c of collections) {
    console.log(`  ${c.slug}: ${countByCollectionId.get(c.id) ?? 0}`);
  }
}

main()
  .catch((err) => {
    console.error('populate-demo-collections failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
