import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { JournalHero, JournalGrid } from '@/features/journal';
import { repositories } from '@/lib/repositories';

// Journal page (`/journal`) — a Phase-1 screen (Feature 16). Resolves the "All
// articles" CTA in HomeJournalTeaser and the header/footer "Journal" nav link.
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// fetches the published articles once (newest-first, ordered by the repository) and
// passes them down as props. The feature-local components (hero + grid + card) stay
// presentational and never fetch.
//
// Phase-1 scope: mock-first, presentational only. No auth, no payments, no API. Each
// card links to `/journal/{slug}`; that detail route is NOT built in this feature
// (intentionally — the link is wired ahead of the page existing).
//
// NOT `overHero` — the journal hero is a contained ivory band, not a full-bleed
// transparent-header hero, so the header uses its standard solid bar + 72px offset.

export const metadata: Metadata = {
  title: 'Journal — Tennis World',
  description: 'Reading, writing, and the world of tennis travel.',
};

export default async function JournalPage() {
  const articles = await repositories.journal.list();

  return (
    <AppShell unlocked={false}>
      <JournalHero />
      <JournalGrid articles={articles} />
    </AppShell>
  );
}
