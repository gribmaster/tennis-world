// ─────────────────────────────────────────────────────────────────────────────
// Rewrite existing image URLs in an ALREADY-SEEDED database to the local
// `/placeholders/…` public paths (Feature: local placeholder images, Option A).
//
// Why this exists: changing the seed source (`@tennis/mock-data`) fixes fresh
// seeds, but a staging/production database that was seeded earlier still holds the
// old remote (Unsplash) URLs. This script rewrites those rows in place.
//
// What it touches (ONLY image URL columns):
//   • CourtImage.url          — every court gallery/hero image
//   • Article.heroImageUrl    — journal hero images
//   • Collection.coverImageUrl— editorial collection covers
//
// What it does NOT touch (scope guard — never deletes or edits unrelated data):
//   • Users, Entitlements, SavedCourt, UserCollection, AdminUser, ConsultationRequest
//   • Any non-image column on Court/Article/Collection
//   • It does not DELETE any row — it only UPDATEs URL strings.
//
// Source of truth: it reads the SAME `@tennis/mock-data` the seed uses and matches
// rows by their stable ids/slugs, so after running, the DB is byte-identical to a
// fresh `db:seed` for image URLs — no drift. Rows with no mock counterpart are left
// untouched (reported as "skipped").
//
// Idempotent: running twice is a no-op after the first pass (already-correct rows
// are counted as "unchanged").
//
// Run with (from repo root):
//   pnpm --filter @tennis/api exec tsx prisma/update-court-images.ts
// or from apps/api:
//   npx tsx prisma/update-court-images.ts
// Requires DATABASE_URL to point at the target DB (staging/prod uses that env's URL).
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ARTICLES, COLLECTIONS, COURTS, PLACEHOLDERS } from '@tennis/mock-data';

const prisma = new PrismaClient();

/** The exact local placeholder paths currently in use, for the summary print-out. */
const IMAGE_PATHS_USED = PLACEHOLDERS;

interface Summary {
  courtsSeen: number;
  courtImagesUpdated: number;
  courtImagesUnchanged: number;
  courtImagesMissing: number;
  articlesUpdated: number;
  articlesUnchanged: number;
  collectionsUpdated: number;
  collectionsUnchanged: number;
}

async function updateCourtImages(summary: Summary): Promise<void> {
  for (const court of COURTS) {
    summary.courtsSeen++;
    for (const img of court.images) {
      // Same deterministic id the seed uses: `${courtId}-img-${sortOrder}`.
      const id = `${court.id}-img-${img.sortOrder}`;
      const existing = await prisma.courtImage.findUnique({ where: { id } });
      if (!existing) {
        summary.courtImagesMissing++;
        continue;
      }
      if (existing.url === img.url) {
        summary.courtImagesUnchanged++;
        continue;
      }
      await prisma.courtImage.update({ where: { id }, data: { url: img.url } });
      summary.courtImagesUpdated++;
    }
  }
}

async function updateArticleImages(summary: Summary): Promise<void> {
  for (const a of ARTICLES) {
    const target = a.heroImageUrl ?? null;
    const existing = await prisma.article.findUnique({ where: { id: a.id } });
    if (!existing) continue;
    if (existing.heroImageUrl === target) {
      summary.articlesUnchanged++;
      continue;
    }
    await prisma.article.update({ where: { id: a.id }, data: { heroImageUrl: target } });
    summary.articlesUpdated++;
  }
}

async function updateCollectionImages(summary: Summary): Promise<void> {
  for (const c of COLLECTIONS) {
    const target = c.coverImageUrl ?? null;
    const existing = await prisma.collection.findUnique({ where: { id: c.id } });
    if (!existing) continue;
    if (existing.coverImageUrl === target) {
      summary.collectionsUnchanged++;
      continue;
    }
    await prisma.collection.update({
      where: { id: c.id },
      data: { coverImageUrl: target },
    });
    summary.collectionsUpdated++;
  }
}

async function main(): Promise<void> {
  console.log('Rewriting image URLs to local /placeholders/… paths …\n');

  const summary: Summary = {
    courtsSeen: 0,
    courtImagesUpdated: 0,
    courtImagesUnchanged: 0,
    courtImagesMissing: 0,
    articlesUpdated: 0,
    articlesUnchanged: 0,
    collectionsUpdated: 0,
    collectionsUnchanged: 0,
  };

  await updateCourtImages(summary);
  await updateArticleImages(summary);
  await updateCollectionImages(summary);

  console.log('Done. Summary:');
  console.table({
    'courts processed': summary.courtsSeen,
    'court images updated': summary.courtImagesUpdated,
    'court images already correct': summary.courtImagesUnchanged,
    'court image rows not found (skipped)': summary.courtImagesMissing,
    'article heroes updated': summary.articlesUpdated,
    'article heroes already correct': summary.articlesUnchanged,
    'collection covers updated': summary.collectionsUpdated,
    'collection covers already correct': summary.collectionsUnchanged,
  });

  console.log(`\n${IMAGE_PATHS_USED.length} placeholder image paths available. Sample:`);
  for (const p of IMAGE_PATHS_USED.slice(0, 5)) console.log(`  ${p}`);
  console.log('  …');
}

main()
  .catch((err) => {
    console.error('Update failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
