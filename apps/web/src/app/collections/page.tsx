import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { CollectionsHero, CollectionsGrid } from '@/features/collections';
import { repositories } from '@/lib/repositories';

// Collections page (`/collections`) — a Phase-1 screen (Feature 15). Resolves the
// "All collections" CTA in HomeCollectionsTeaser and the header/footer "Collections"
// nav link.
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// fetches the published collections once and passes them down as props. The
// feature-local components (hero + grid + card) stay presentational and never fetch.
//
// Only ONE repository call is needed: `CollectionDTO` already carries `count`
// (derived from the membership mapping in the data layer — Architecture Plan §9
// Risk #19), so there is no need to also fetch courts just to compute counts.
//
// Phase-1 scope: mock-first, presentational only. No auth, no payments, no API. Each
// card links to `/collections/{slug}`; that detail route is NOT built in this
// feature (intentionally — the link is wired ahead of the page existing).
//
// NOT `overHero` — the collections hero is a contained dark band, not a full-bleed
// transparent-header hero, so the header uses its standard solid bar + 72px offset.

export const metadata: Metadata = {
  title: 'Collections — Tennis World',
  description: 'Curated journeys, gathered by landscape and spirit.',
};

export default async function CollectionsPage() {
  const collections = await repositories.collections.list();

  return (
    <AppShell unlocked={false}>
      <CollectionsHero />
      <CollectionsGrid collections={collections} />
    </AppShell>
  );
}
