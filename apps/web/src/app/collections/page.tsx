import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import {
  CollectionsHero,
  FeaturedCollectionsStrip,
  CountriesStrip,
  CuratedCollectionsList,
} from '@/features/collections';
import { repositories } from '@/lib/repositories';
import { isSignedIn } from '@/lib/session.server';

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
// `isSignedIn()` is unrelated to the content — it only picks the header's user icon
// destination (/profile vs /signin). Nothing on this screen is gated, and nothing here
// mutates, so there is no protected read and no auth degradation path to handle.
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
  const [collections, countries, signedIn] = await Promise.all([
    repositories.collections.list(),
    repositories.countries.list(),
    isSignedIn(),
  ]);

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
            <FeaturedCollectionsStrip collections={featured} />
            <CountriesStrip countries={countries} />
            <CuratedCollectionsList collections={collections} />
          </>
        )}
      </div>
    </AppShell>
  );
}
