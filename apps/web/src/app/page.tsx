import { AppShell } from '@/components/layout';
import {
  HomeHero,
  HomeFeaturedCourts,
  HomeEditorsCut,
  HomeCollectionsTeaser,
  HomeJournalTeaser,
  HomePaywallBand,
} from '@/features/home';
import { repositories } from '@/lib/repositories';

// Home page — the real Home screen, assembled section by section across Phase-1
// features: hero, featured courts, Editor's Cut, collections teaser, journal
// teaser, and the closing membership/paywall CTA band.
//
// This is the data boundary: the page (a server component) is the single place
// that touches the repositories, fetches the data each section needs, and passes
// it down as props. Section components stay presentational and never fetch — so
// they never import a repository or @tennis/mock-data.
//
// `overHero` puts the full-bleed hero behind the transparent app header (it fades
// to a solid bar on scroll). `unlocked` is hardcoded false in Phase 1 — there is
// no real entitlement system yet; a real value flows from the user repository in a
// later feature.
export default async function Home() {
  // Each section's data is fetched here (the page is the only repository
  // boundary) and passed down as props; the section components never fetch.
  const [featuredCourts, collections, articles] = await Promise.all([
    // Featured destinations for the "This week, we're dreaming of…" strip. The
    // repository already supports `featured` + `limit`, matching the prototype's 6.
    repositories.courts.list({ featured: true, limit: 6 }),
    // A few collections for the "Curated journeys" teaser.
    repositories.collections.list({ featured: true, limit: 4 }),
    // The latest few articles for the "Reading list" journal teaser.
    repositories.journal.list({ featured: true, limit: 3 }),
  ]);

  return (
    <AppShell overHero unlocked={false}>
      <HomeHero />

      <HomeFeaturedCourts courts={featuredCourts} />

      {/* Reuses the featured courts already fetched above (no extra repository
          call); a small subset becomes the alternating editorial rows. */}
      <HomeEditorsCut courts={featuredCourts.slice(0, 3)} />

      <HomeCollectionsTeaser collections={collections} />

      <HomeJournalTeaser articles={articles} />

      {/* Closing membership CTA band — presentational only (no payments/auth). */}
      <HomePaywallBand />
    </AppShell>
  );
}
