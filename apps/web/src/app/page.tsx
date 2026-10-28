import type { CourtSummaryDTO } from '@tennis/contracts';
import { AppShell } from '@/components/layout';
import { HomeHero, HomeMembership } from '@/features/home';
import type { HomeHeroSlide } from '@/features/home';
import { repositories } from '@/lib/repositories';
import { getViewerAuthState } from '@/lib/session.server';

// Home page ("Atlas", TASK_58) — the single data boundary for the Home screen.
//
// v3 shrinks Home to exactly two sections: a hero court carousel and a membership
// section (REDESIGN_V3_PLAN.md decision 1). Everything v2 Home fetched beyond the
// published court list — collections, articles, saved courts, saved collections — is
// gone, and so is `getRepositoriesForRequest()`: the only protected read this screen
// needs is folded into `getViewerAuthState()` below (the same call `app/map/page.tsx`
// already makes for its own header/entitlement state).
//
// Reads, both public/degrading-safe on this public page:
//   • repositories.courts.list()  → the full published set; the hero picks 4 slides
//     from it below, server-side, so the client never receives the whole catalogue.
//   • getViewerAuthState()        → `{ signedIn, viewerIsEntitled }` — drives the header
//     icon (via `AppShell`'s `signedIn`) and the membership section's copy/icon/CTA.
//
// NOT `overHero` anymore: v3's hero is a floating, INSET card (rounded corners, margin
// on every side) rather than a full-bleed band sitting behind the header, so Home now
// takes the standard `--nav-offset` top padding like every other screen; the hero's own
// wrapper adds only the small remainder (18px mobile / 36px desktop) on top of that.

/** The hero shows at most 4 slides — unlocked courts, featured first, then the rest. */
const HERO_SLIDE_COUNT = 4;

function toSlide(court: CourtSummaryDTO, masked: boolean): HomeHeroSlide {
  if (masked) {
    // Safety net only (see selectHeroSlides below) — a locked court's real name/region
    // still is not shown to a non-entitled viewer, matching `courtDisplay(...).masked`'s
    // rule everywhere else in the app.
    return { slug: court.slug, imageUrl: court.heroImageUrl, place: 'Premium', alt: 'Premium Court' };
  }
  return {
    slug: court.slug,
    imageUrl: court.heroImageUrl,
    place: court.region || court.country,
    alt: court.name,
  };
}

/**
 * Pick the hero's slides server-side so the client only ever receives what it renders
 * (never the whole court list) — see TASK_58_V3_HOME_ATLAS.md §1 "Which courts".
 *
 * Normal case: unlocked courts only, featured first, first 4. The hero shows a guest the
 * REAL photo and place name — locked courts are never used here, because they are masked
 * everywhere else in the app and the hero has no masked-pill treatment for an active
 * slide.
 *
 * Safety net (odd data only — e.g. every published court happens to be locked): fall
 * back to the first 4 courts regardless, masking any locked one exactly the way
 * `courtDisplay` does elsewhere (pill text "Premium", real photo still shown — masking
 * has never hidden a photo in this app, only the name/location strings).
 */
function selectHeroSlides(courts: CourtSummaryDTO[]): HomeHeroSlide[] {
  const unlocked = courts.filter((court) => !court.isLocked);
  if (unlocked.length > 0) {
    const featured = unlocked.filter((court) => court.isFeatured);
    const rest = unlocked.filter((court) => !court.isFeatured);
    return [...featured, ...rest].slice(0, HERO_SLIDE_COUNT).map((court) => toSlide(court, false));
  }
  return courts.slice(0, HERO_SLIDE_COUNT).map((court) => toSlide(court, court.isLocked));
}

export default async function Home() {
  const [courts, { signedIn, viewerIsEntitled }] = await Promise.all([
    repositories.courts.list(),
    getViewerAuthState(),
  ]);

  const slides = selectHeroSlides(courts);

  return (
    <AppShell signedIn={signedIn}>
      <div className="relative">
        <HomeHero slides={slides} />
        <HomeMembership viewerIsEntitled={viewerIsEntitled} />
      </div>
    </AppShell>
  );
}
