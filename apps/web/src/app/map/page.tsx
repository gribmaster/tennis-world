import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { MapExplorer } from '@/features/map';
import { repositories } from '@/lib/repositories';
import { isSignedIn } from '@/lib/session.server';

// Map page (`/map`) — a required Phase-1 screen (Feature 13/14). Resolves the three
// live CTAs that point here ("Explore the Map", "Unlock Map", "View all courts").
//
// This is a SERVER component and the ONLY repository boundary on the screen. It
// fetches ONCE, unfiltered, and hands the full dataset to the single `'use client'`
// MapExplorer, which owns the search/filter state and narrows the arrays in memory
// (see MapExplorer for why filtering is client-side in Phase 1). The fetch is UNCHANGED
// by the `?q=` support added in Feature 76 — `q` only seeds the client's initial query;
// it is not a server-side filter:
//   • repositories.courts.list()       → CourtSummaryDTO[] (list panel + filter source)
//   • repositories.courts.getMapPins() → MapPinDTO[]       (canvas pin positions/state)
//
// Feature 74: markers are plotted on a REAL Leaflet map (env-configured tiles) from
// each court's APPROXIMATE geo (`approxLat`/`approxLng`) — exact `lat`/`lng` are not
// part of these DTOs and never reach the client (Architecture Plan §9 Risk #17). No
// payments here; the `pins` read supplies only pin state.
//
// NEAREST-COURT AUTO-FOCUS: MapExplorer asks the BROWSER for the visitor's position on
// first load and flies to the nearest court. That is entirely client-side — this page
// stays a plain server read of the same two court sources, there is no location-aware
// endpoint, and the visitor's coordinates never reach the server or the database.
//
// NOT `overHero` — the map screen has no full-bleed hero, so the header uses its
// standard solid bar + 72px content offset (same as Court Detail).

export const metadata: Metadata = {
  title: 'Map — Tennis World',
  description: 'Explore the world’s most beautiful tennis courts on the map.',
};

export default async function MapPage({
  searchParams,
}: {
  // Next 15: `searchParams` is async and must be awaited. The ONLY param this page reads
  // is `q` — the initial free-text query (Feature 76). The Collections screen's "By
  // Country" strip links here as `/map?q=<country name>`, and `GET /v1/courts`'s `q`
  // (and the in-memory `narrowCourts` predicate the client uses) already searches the
  // country name, so the country filter needs no new filter dimension. Nothing else about
  // the map reads the URL: the query is an INITIAL value only, and MapExplorer remains the
  // single owner of the live filter state.
  searchParams: Promise<{ q?: string }>;
}) {
  const [courts, pins, signedIn, params] = await Promise.all([
    repositories.courts.list(),
    repositories.courts.getMapPins(),
    // Header user icon: /profile vs /signin (true in a real session or staging demo mode).
    isSignedIn(),
    searchParams,
  ]);

  // A repeated `?q=` yields an array under Next's parsing; the type above narrows to the
  // single-value case, and a non-string is simply ignored rather than coerced.
  const initialQuery = typeof params.q === 'string' ? params.q : '';

  return (
    <AppShell unlocked={false} signedIn={signedIn}>
      <MapExplorer courts={courts} pins={pins} initialQuery={initialQuery} />
    </AppShell>
  );
}
