import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout';
import {
  CollectionDetailShell,
  CollectionCourtsGrid,
  type CollectionMapCta,
} from '@/features/collection-detail';
import { courtDisplay } from '@/components/court';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

// Collection Detail page (`/collections/[slug]`) — a Phase-1 screen (Feature 17),
// restyled to v3 in TASK_60: a mobile full-bleed hero under the pill nav + an
// overlapping white card, a desktop framed hero with "Back to Collections", and a
// two-column body (description + courts grid / a sticky map CTA card). See
// `docs/TASK_60_V3_COLLECTIONS.md`.
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// resolves the collection by slug, 404s if it doesn't exist, fetches the courts that
// belong to it, and passes everything down as props. The feature-local components
// (`CollectionDetailShell`/`CollectionDetailHero`/`CollectionCourtsGrid`) stay
// presentational (or, for the shell, client-side state-only) and never fetch.
//
// Repository methods used (all pre-existing — no repository/contract changes):
//   • repositories.collections.getBySlug(slug)        → CollectionDTO | null
//   • repositories.courts.list({ collection: slug })  → CourtSummaryDTO[]
//   • protectedRepos.saved.getSavedCourts()           → seeds each CourtCard's bookmark
//   • protectedRepos.saved.getSavedEditorialCollections() → seeds the collection's own
//     save state (TASK_60 — added to the same protected `Promise.all` as the other two)
//   • protectedRepos.user.getCurrentUser()            → this viewer's real entitlement
//
// AUTH: this page is PUBLIC. The protected block degrades on `AuthRequiredError` to an
// empty saved set + `signedIn:false` + `viewerIsEntitled:false` (never a redirect, never
// a crash) — the same pattern `app/page.tsx` / `app/map/page.tsx` use.
//
// MAP CTA (TASK_60 decision 7): computed ONCE here from the real per-viewer masking
// result (`courtDisplay(...).masked`) and `signedIn`, then handed to `CollectionDetailShell`
// as a plain string — three readings (`guest` / `unlock` / `map`), rendered twice (the
// desktop sticky card and the mobile floating bar) but derived in exactly one place.
//
// `overHero` (TASK_60) — the mobile hero is now a FULL-BLEED image under the pill nav,
// like Court Detail's; `CollectionDetailShell` adds back the nav-offset padding at md+
// itself, where the hero is no longer full-bleed.

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
  // `app/page.tsx`'s own block. TASK_60 added `getSavedEditorialCollections()` to this
  // SAME `Promise.all`, so the collection's own save state and the courts' save state
  // degrade together rather than via two separate try/catch blocks.
  let savedCourtIds: string[] = [];
  let signedIn = true;
  let viewerIsEntitled = false;
  let initialCollectionSaved = false;
  try {
    const [saved, user, savedCollections] = await Promise.all([
      protectedRepos.saved.getSavedCourts(),
      protectedRepos.user.getCurrentUser(),
      protectedRepos.saved.getSavedEditorialCollections(),
    ]);
    savedCourtIds = saved.map((court) => court.id);
    viewerIsEntitled = user.membership !== 'free';
    initialCollectionSaved = savedCollections.some((c) => c.id === collection.id);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      signedIn = false;
      viewerIsEntitled = false;
    } else {
      // A real fault (5xx, network) must surface rather than masquerade as "logged out".
      throw err;
    }
  }

  // The `guest` row is checked first — a logged-out visitor never sees the map,
  // regardless of masking. `courtDisplay(...).masked` already folds in `viewerIsEntitled`,
  // so a free user on an all-free collection correctly gets `map`, not a paywall.
  const anyMasked = courts.some((court) => courtDisplay(court, viewerIsEntitled).masked);
  const mapCta: CollectionMapCta = !signedIn ? 'guest' : anyMasked ? 'unlock' : 'map';

  return (
    <AppShell overHero signedIn={signedIn}>
      <CollectionDetailShell
        collection={collection}
        signedIn={signedIn}
        initialSaved={initialCollectionSaved}
        mapCta={mapCta}
      >
        {/* Description (TASK_60 decision 1: printed once here, dropping v3's extra `sub`
            line) + the mobile-only divider — rendered only when a description exists, and
            never a divider without one. */}
        {collection.description ? (
          <>
            <div className="px-5 pt-5 md:px-0 md:pt-0">
              <p className="body-m text-graphite leading-[1.6] md:max-w-[600px] md:text-[15px] md:leading-[1.7]">
                {collection.description}
              </p>
            </div>
            <div className="mx-5 my-5 h-px bg-hairline md:hidden" />
          </>
        ) : null}

        <CollectionCourtsGrid
          courts={courts}
          viewerIsEntitled={viewerIsEntitled}
          savedCourtIds={savedCourtIds}
          signedIn={signedIn}
        />
      </CollectionDetailShell>
    </AppShell>
  );
}
