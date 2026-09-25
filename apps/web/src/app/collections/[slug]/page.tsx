import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { CollectionDetailHero, CollectionCourtsGrid } from '@/features/collection-detail';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

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
// Phase-1 scope: mock-first, presentational only. No auth, no payments, no API. The
// grid renders its own Featured-style card (Task 47) with a real, database-backed save
// heart, so this page now also does a PROTECTED read — `saved.getSavedCourts()` +
// `user.getCurrentUser()` — to seed those hearts and resolve this viewer's real
// entitlement, mirroring `app/page.tsx`'s own protected block: a logged-out visitor in
// `api` mode degrades on `AuthRequiredError` to an empty saved set + `signedIn:false` +
// `viewerIsEntitled:false` (never a redirect, never a crash) since this collection page
// stays public.
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

  const protectedRepos = await getRepositoriesForRequest();

  // Courts that belong to this collection. `CourtFilter.collection` takes the
  // collection slug and resolves membership in the data layer.
  const courts = await repositories.courts.list({ collection: slug });

  // Protected read — degrades for a logged-out visitor on this public page, exactly like
  // `app/page.tsx`'s own block.
  let savedCourtIds: string[] = [];
  let signedIn = true;
  let viewerIsEntitled = false;
  try {
    const [saved, user] = await Promise.all([
      protectedRepos.saved.getSavedCourts(),
      protectedRepos.user.getCurrentUser(),
    ]);
    savedCourtIds = saved.map((court) => court.id);
    viewerIsEntitled = user.membership !== 'free';
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      signedIn = false;
      viewerIsEntitled = false;
    } else {
      // A real fault (5xx, network) must surface rather than masquerade as "logged out".
      throw err;
    }
  }

  return (
    <AppShell unlocked={false} signedIn={signedIn}>
      <CollectionDetailHero collection={collection} />
      <CollectionCourtsGrid
        courts={courts}
        viewerIsEntitled={viewerIsEntitled}
        savedCourtIds={savedCourtIds}
        signedIn={signedIn}
      />
    </AppShell>
  );
}
