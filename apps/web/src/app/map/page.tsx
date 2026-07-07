import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { MapExplorer } from '@/features/map';
import { repositories } from '@/lib/repositories';

// Map page (`/map`) — a required Phase-1 screen (Feature 13/14). Resolves the three
// live CTAs that point here ("Explore the Map", "Unlock Map", "View all courts").
//
// This is a SERVER component and the ONLY repository boundary on the screen. It
// fetches ONCE, unfiltered, and hands the full dataset to the single `'use client'`
// MapExplorer, which owns the search/filter state and narrows the arrays in memory
// (see MapExplorer for why filtering is client-side in Phase 1):
//   • repositories.courts.list()       → CourtSummaryDTO[] (list panel + filter source)
//   • repositories.courts.getMapPins() → MapPinDTO[]       (canvas pin positions/state)
//
// Feature 74: markers are plotted on a REAL Leaflet map (env-configured tiles) from
// each court's APPROXIMATE geo (`approxLat`/`approxLng`) — exact `lat`/`lng` are not
// part of these DTOs and never reach the client (Architecture Plan §9 Risk #17). No
// geolocation, no payments here; the `pins` read supplies only pin state.
//
// NOT `overHero` — the map screen has no full-bleed hero, so the header uses its
// standard solid bar + 72px content offset (same as Court Detail).

export const metadata: Metadata = {
  title: 'Map — Tennis World',
  description: 'Explore the world’s most beautiful tennis courts on the map.',
};

export default async function MapPage() {
  const [courts, pins] = await Promise.all([
    repositories.courts.list(),
    repositories.courts.getMapPins(),
  ]);

  return (
    <AppShell unlocked={false}>
      <MapExplorer courts={courts} pins={pins} />
    </AppShell>
  );
}
