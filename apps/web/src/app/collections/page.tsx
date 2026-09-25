import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import {
  CollectionsHero,
  FeaturedCollectionsStrip,
  CountriesStrip,
  CuratedCollectionsList,
} from '@/features/collections';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

// Collections page (`/collections`) — rebuilt to the v2 prototype in Feature 76
// (`CollectionsScreen`, tennis_world_v2_standalone.html:1290–1377): a header, a featured
// strip, the "By Country" circular strip, and the "Curated for You" list.
//
// This is a SERVER component and remains the ONLY repository boundary on the screen: it
// fetches, then hands plain DTO arrays to presentational sections that never fetch and
// never import a repository or @tennis/mock-data.
//
// ── THE READS ───────────────────────────────────────────────────────────────────────────
// TWO reads, both public, in parallel:
//   • `collections.list()` — the whole published set. The featured strip and the curated
//     list are two views of the SAME array (the strip is its first `FEATURED_COUNT`,
//     matching the prototype's `COLLECTIONS.slice(0,3)`), derived here in memory rather
//     than fetched twice. A second `list({ featured: true })` call would be a round-trip
//     for a subset this array already contains, and would let the two sections disagree if
//     the reads straddled a publish — the same reasoning `app/page.tsx` records for Home.
//   • `countries.list()` — the country aggregate Feature 75 shipped (`GET /v1/countries`),
//     reached through the SAME central factory as every other domain. There is no second
//     way to reach it: no direct `HttpCountryRepository` construction, no fetch in a
//     component, no hardcoded country array (the prototype's lines 227–234 are gone).
//
// A THIRD, PROTECTED read (Task 42) seeds each editorial collection card's save heart
// with this visitor's real saved-collections set — the same degrade-on-`AuthRequiredError`
// pattern `app/page.tsx` uses for saved courts. This replaces the old `isSignedIn()` call
// (which only picked the header's user icon destination); `signedIn` now comes out of the
// same protected read and serves both purposes.
//
// TOP-LEVEL NAV ROUTE (CLAUDE.md §5): `/collections` is in `nav-items.ts`, so it gets NO
// Back button. It also becomes a bottom-tab destination in Feature 84, which is why the
// screen opens with its own title header rather than assuming a parent to return to.
//
// NOT `overHero` — the v2 header is a plain title row on the bone background, not a
// full-bleed image hero, so the app header keeps its standard solid bar + 72px offset.

export const metadata: Metadata = {
  title: 'Collections — Tennis World',
  description: 'Curated tennis destinations around the world.',
};

/** Prototype: `COLLECTIONS.slice(0,3)` in the featured strip (line 1310). */
const FEATURED_COUNT = 3;

export default async function CollectionsPage() {
  const protectedRepos = await getRepositoriesForRequest();

  const [collections, countries] = await Promise.all([
    repositories.collections.list(),
    repositories.countries.list(),
  ]);

  // Protected read (Task 42) — degrades for a logged-out visitor on this public page,
  // exactly as `app/page.tsx` does for saved courts.
  let savedCollectionIds: string[] = [];
  let signedIn = true;
  try {
    const saved = await protectedRepos.saved.getSavedEditorialCollections();
    savedCollectionIds = saved.map((c) => c.id);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      signedIn = false;
    } else {
      throw err;
    }
  }

  const featured = collections.slice(0, FEATURED_COUNT);

  // Every section returns null when its own data is empty, so an empty dataset would
  // otherwise leave the screen as a bare title. This says so instead.
  const isEmpty = collections.length === 0 && countries.length === 0;

  return (
    <AppShell unlocked={false} signedIn={signedIn}>
      <div className="bg-bone pb-section-lg">
        <CollectionsHero />

        {isEmpty ? (
          <p className="container-page body-m pt-8 text-stone">No collections to show yet.</p>
        ) : (
          <>
            <FeaturedCollectionsStrip
              collections={featured}
              savedCollectionIds={new Set(savedCollectionIds)}
              signedIn={signedIn}
            />
            <CountriesStrip countries={countries} />
            <CuratedCollectionsList
              collections={collections}
              savedCollectionIds={new Set(savedCollectionIds)}
              signedIn={signedIn}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
