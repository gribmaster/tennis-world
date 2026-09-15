import { AppShell } from '@/components/layout';
import { HomeHero, HomeExplorer } from '@/features/home';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

// Home page (v2, Feature 74) — the single data boundary for the Home screen.
//
// This is a SERVER component and the ONLY place on this screen that touches a repository.
// It fetches, then hands the results to `HomeExplorer` (the screen's one `'use client'`
// boundary), which owns the filter state and narrows in memory. Section components never
// fetch and never import a repository or @tennis/mock-data.
//
// ── THE FETCHING CHANGE, AND WHY ────────────────────────────────────────────────────────
// v1 fetched `courts.list({ featured: true, limit: 6 })` — six rows, enough for a static
// strip. v2 needs more than that: the search box returns inline results and the shortcut
// row narrows the strip in place, and BOTH operate over the CATALOGUE, not over six
// editorial picks. Searching six rows would silently hide most of the app.
//
// The choice was between (a) fetching the full published list and deriving the featured
// strip from it in memory, and (b) keeping the featured call and adding a second, full
// one. This page does (a):
//   • (b) is two round-trips where the second is a SUPERSET of the first — the featured
//     six are already inside the full list, distinguishable by the `isFeatured` flag the
//     summary DTO carries. The extra call buys nothing but latency and a second failure
//     mode.
//   • (a) also guarantees the strip and the search panel are views of ONE array. With two
//     fetches they are two arrays that can disagree — a court could be missing from the
//     strip's copy and present in the search copy, or vice versa, if the two reads
//     straddled a publish.
//   • It matches `app/map/page.tsx`, which already fetches the full set once and narrows
//     client-side. Home and Map now share both the fetch shape and the narrowing
//     predicate.
//
// SCALING LIMIT (the same hedge Feature 73 made, restated because this page now ships the
// whole catalogue to the browser): this is fine at ~12 published courts — a few kilobytes,
// one read, and instant narrowing with no round-trip per keystroke. It becomes a
// SERVER-SIDE QUERY when the catalogue grows large enough that shipping it all costs more
// than querying would. The shape of that change is already prepared: `toCourtQuery(state)`
// in `components/filters/court-filter-state.ts` maps the exact same filter state onto the
// wire query, so the swap is a data-source change, not a UI rewrite.
//
// ── SAVED STATE + VIEWER ENTITLEMENT (Task 26) ──────────────────────────────────────────
// The featured cards carry a working save heart, so the page seeds each one with the
// visitor's real saved set. That is a PROTECTED read (/v1/me/saved-courts), so it goes
// through `getRepositoriesForRequest()` (request-scoped, carries the session cookie) —
// unlike the three public reads above it, which need no identity. ONE call returns every
// saved court, so seeding N hearts costs one read, not N.
//
// Home is a PUBLIC page: a logged-out visitor in `api` mode gets `AuthRequiredError` here,
// which DEGRADES to an empty saved set + `signedIn:false` + `viewerIsEntitled:false`
// (never a redirect, never a crash) — exactly what Court Detail does with the same read.
// The hearts then route to /signin instead of mutating. This block also replaces the
// separate `isSignedIn()` call v1 made purely for the header icon, and now ALSO reads
// `/v1/me` for `membership` (Task 26) so locked-court content across Home unmasks for a
// paying visitor — both protected reads run together and degrade together on the same
// `AuthRequiredError` catch, so this stays two reads total, not three.
//
// `overHero` puts the full-bleed hero behind the transparent app header (which supplies
// the wordmark and avatar the prototype drew inside its own hero — see HomeHero).
// `unlocked` stays false: this page renders no gated content, and entitlement is resolved
// server-side wherever it actually matters.
export default async function Home() {
  const protectedRepos = await getRepositoriesForRequest();

  // Public discovery reads — no identity needed, so they use the plain singleton.
  const [courts, collections, articles] = await Promise.all([
    // The FULL published set: the source the search box, the shortcut row and the
    // featured strip all narrow over. See the fetching note above.
    repositories.courts.list(),
    repositories.collections.list({ featured: true, limit: 4 }),
    repositories.journal.list({ featured: true, limit: 3 }),
  ]);

  // Protected reads — degrade together for a logged-out visitor on this public page. The
  // second read (Task 26) resolves this viewer's real membership so locked-court content
  // across Home can unmask for a paying visitor, not just on the court's own detail page.
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
    <AppShell overHero unlocked={false} signedIn={signedIn}>
      <HomeHero />

      <HomeExplorer
        courts={courts}
        collections={collections}
        articles={articles}
        savedCourtIds={savedCourtIds}
        signedIn={signedIn}
        viewerIsEntitled={viewerIsEntitled}
      />
    </AppShell>
  );
}
