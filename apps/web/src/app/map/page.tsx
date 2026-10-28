import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { parseCourtFilterSearchParams } from '@/components/filters';
import { MapExplorer } from '@/features/map';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { getViewerAuthState } from '@/lib/session.server';

// Courts screen (`/map`) — a required Phase-1 screen (Feature 13/14), rebuilt as a v3
// card screen in TASK_57 (route stays `/map`; only the nav label became "Courts" in
// TASK_55). Resolves the three live CTAs that point here ("Explore the Map", "Unlock
// Map", "View all courts").
//
// This is a SERVER component and the ONLY repository boundary on the screen. It
// fetches ONCE, unfiltered, and hands the full dataset to the single `'use client'`
// MapExplorer, which owns the search/filter state and narrows the arrays in memory
// (see MapExplorer for why filtering is client-side in Phase 1). The fetch is UNCHANGED
// by the URL-seeded filter state (Feature 76's `?q=`, widened in Task 54 to every chip
// dimension) — the URL only seeds the client's initial filter state; it is not a
// server-side filter:
//   • repositories.courts.list()       → CourtSummaryDTO[] (card grid + filter source)
//   • repositories.courts.getMapPins() → MapPinDTO[]       (map marker positions/state)
//
// Feature 74 (engine migrated to Google Maps in Feature 88): markers are plotted on a
// REAL map from each court's APPROXIMATE geo (`approxLat`/`approxLng`) — exact `lat`/
// `lng` are not part of these DTOs and never reach the client (Architecture Plan §9
// Risk #17). No payments here; the `pins` read supplies only pin state.
//
// SAVED-COURT IDS (TASK_57): a PROTECTED read, mirroring the same degrade-on-
// AuthRequiredError block `app/collections/[slug]/page.tsx` / `app/page.tsx` already
// use for this public screen — a logged-out visitor in `api` mode degrades to an empty
// saved set rather than a redirect or a crash. Seeds every card's save-button initial
// state; `MapExplorer` is the one that lifts it into live state (see its own header).
//
// NEAREST-COURT AUTO-FOCUS moved into `MapExpandedModal` in TASK_57 — it now asks the
// BROWSER for the visitor's position only once that modal is opened, not on this page's
// load. That remains entirely client-side: this page stays a plain server read of the
// same two court sources, there is no location-aware endpoint, and the visitor's
// coordinates never reach the server or the database.
//
// NOT `overHero` — the Courts screen has no full-bleed hero, so the header uses its
// standard solid bar + `--nav-offset` content offset (same as Court Detail).

export const metadata: Metadata = {
  title: 'Map — Tennis World',
  description: 'Explore the world’s most beautiful tennis courts on the map.',
};

export default async function MapPage({
  searchParams,
}: {
  // Next 15: `searchParams` is async and must be awaited. Every chip dimension
  // (`tags`, `surface`, `access`, `indoorOutdoor`, `scenic`) plus the free-text `q`
  // can arrive here now (Task 54) — Home's shortcut row and filter sheet both link
  // here pre-filtered instead of narrowing Home's own much smaller in-memory list.
  // Parsed by the shared, framework-free `parseCourtFilterSearchParams`
  // (components/filters), which validates every chip value against its real
  // contract enum and drops anything unrecognized — untrusted URL input is never
  // trusted blindly. Still an INITIAL value only: MapExplorer remains the single
  // owner of the live filter state (unchanged from the `q`-only behavior before
  // this task). The Collections screen's "By Country" strip still links here as
  // `/map?q=<country name>` and parses to exactly the same result as before.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [courts, pins, { signedIn, viewerIsEntitled }, params] = await Promise.all([
    repositories.courts.list(),
    repositories.courts.getMapPins(),
    // Header user icon (/profile vs /signin) AND per-viewer entitlement (Task 26) — the
    // same protected `/v1/me` read `isSignedIn()` already made, now also read for
    // `membership` so locked-court masking on this screen respects the real viewer.
    getViewerAuthState(),
    searchParams,
  ]);

  const initialFilters = parseCourtFilterSearchParams(params);

  // Protected read — degrades for a logged-out visitor on this public page, exactly
  // like `app/collections/[slug]/page.tsx` / `app/page.tsx`'s own block.
  let savedCourtIds: string[] = [];
  if (signedIn) {
    try {
      const protectedRepos = await getRepositoriesForRequest();
      const saved = await protectedRepos.saved.getSavedCourts();
      savedCourtIds = saved.map((court) => court.id);
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) {
        // A real fault (5xx, network) must surface rather than masquerade as "no saves".
        throw err;
      }
    }
  }

  return (
    <AppShell signedIn={signedIn}>
      <MapExplorer
        courts={courts}
        pins={pins}
        initialFilters={initialFilters}
        viewerIsEntitled={viewerIsEntitled}
        signedIn={signedIn}
        savedCourtIds={savedCourtIds}
      />
    </AppShell>
  );
}
