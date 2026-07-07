import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { CollectionDetailHero, CollectionCourtsGrid } from '@/features/collection-detail';
import { repositories } from '@/lib/repositories';

// Collection Detail page (`/collections/[slug]`) — a Phase-1 screen (Feature 17).
// Resolves the per-collection links emitted by the /collections grid and the
// HomeCollectionsTeaser (which already point at /collections/{slug}).
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// resolves the collection by slug, 404s if it doesn't exist, fetches the courts that
// belong to it, and passes both down as props. The feature-local components (hero +
// courts grid) stay presentational and never fetch.
//
// Repository methods used (both already exist — no repository/contract changes):
//   • repositories.collections.getBySlug(slug)        → CollectionDTO | null
//   • repositories.courts.list({ collection: slug })  → CourtSummaryDTO[]
//     (CourtFilter.collection is already supported by the mock, which maps the slug
//      through the COLLECTION_COURTS membership table.)
//
// Phase-1 scope: mock-first, presentational only. No auth, no payments, no API. Court
// cards reuse the shared CourtCard and link to `/courts/{slug}`.
//
// NOT `overHero` — the collection hero is a contained dark band, not a full-bleed
// transparent-header hero, so the header uses its standard solid bar + 72px offset.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await repositories.collections.getBySlug(slug);
  if (!collection) return { title: 'Collection — Tennis World' };
  return {
    title: `${collection.name} — Tennis World`,
    description: collection.description ?? `Courts in the ${collection.name} collection.`,
  };
}

export default async function CollectionDetailPage({
  params,
}: {
  // Next 15: `params` is async and must be awaited.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const collection = await repositories.collections.getBySlug(slug);
  if (!collection) {
    // Renders the framework 404 — no custom not-found page needed.
    notFound();
  }

  // Courts that belong to this collection. `CourtFilter.collection` takes the
  // collection slug and resolves membership in the data layer.
  const courts = await repositories.courts.list({ collection: slug });

  return (
    <AppShell unlocked={false}>
      <CollectionDetailHero collection={collection} />
      <CollectionCourtsGrid courts={courts} />
    </AppShell>
  );
}
