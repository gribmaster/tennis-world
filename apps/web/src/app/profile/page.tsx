import type { Metadata } from 'next';
import { AppShell, PageContainer } from '@/components/layout';
import { PendingLink } from '@/components/navigation';
import {
  ProfileCollectionsStrip,
  ProfileHeader,
  ProfileMembershipCard,
  ProfileStats,
} from '@/features/profile';
import { CheckoutStatusBanner, parseCheckoutStatus } from '@/features/billing';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';

// Profile page (`/profile`) — rebuilt to the v2 prototype's ProfileScreen (Feature
// 81/82; `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.7, prototype
// `new design/tennis_world_v2_standalone.html` lines 1376-1516).
//
// This is a thin SERVER component and the ONLY repository boundary on the screen. The
// only interactivity is self-contained client islands dropped into the tree —
// `ProfileEditTrigger` (inside ProfileHeader; owns the edit-profile modal),
// `PaywallTrigger` (inside ProfileMembershipCard's free-tier CTA), and
// `ManageBillingButton` (inside its active-tier CTA) — each owning its own state. The
// rest stays presentational, receiving plain props.
//
// AUTH (Feature 57): Profile is PRIVATE. In `api` mode the user/saved reads are protected
// (/v1/me/*) and carry the incoming session cookie via `getRepositoriesForRequest()`. A
// logged-out visitor's reads throw `AuthRequiredError`, which `loadOrSignIn` turns into a
// `redirect('/signin?redirectTo=/profile')` — we never render a broken/empty profile. In
// MOCK mode the protected reads never 401, so this stays the fixed mock profile.
//
// THE MENU IS GONE FROM THIS SCREEN — the prototype moves Subscription/Contact/
// Privacy/Terms/Sign-out into the new `/profile/settings` screen (reached via the gear
// icon below), matching the prototype's ProfileScreen (no menu list at all). See
// `app/profile/settings/page.tsx`'s header comment for the full old-row inventory.
//
// GEAR + WORDMARK ROW: the wordmark itself is AppHeader's job (already rendered by
// AppShell above this content) — this page adds only the page-local gear icon, a small
// header row matching the prototype's `padding:'48px 20px 0'` spacing, navigating to
// `/profile/settings` via PendingLink (CLAUDE.md §4 rule 1).
//
// NOT `overHero` — Profile has no full-bleed hero, so AppShell's header uses its
// standard solid bar + 72px offset; this page's own gear row sits below that.

export const metadata: Metadata = {
  title: 'Profile — Tennis World',
  description: 'Your membership, saved courts, and account.',
};

function GearGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  // Next 15: `searchParams` is async and must be awaited. Used only to surface the
  // checkout status banner when Stripe's DEFAULT success/cancel URL lands here
  // (`?checkout=success|cancelled`, Feature 67) — the membership state itself still
  // comes from `/v1/me` below.
  searchParams: Promise<{ checkout?: string }>;
}) {
  const checkoutStatus = parseCheckoutStatus((await searchParams).checkout);

  // Request-scoped repos so the protected reads authenticate as the logged-in user.
  const repositories = await getRepositoriesForRequest();

  // The ONLY repository reads on this screen. Fetch once; derive; pass props down. All
  // three are private — `loadOrSignIn` redirects to /signin on a 401 (logged-out, api
  // mode); any other error still surfaces.
  const [user, savedCourts, savedCollections] = await loadOrSignIn(
    () =>
      Promise.all([
        repositories.user.getCurrentUser(),
        repositories.saved.getSavedCourts(),
        repositories.saved.getSavedCollections(),
      ]),
    '/profile',
  );

  // Stats are DERIVED server-side from the saved data (never hardcoded; Phase 1 §3.10):
  //   • Saved Courts = number of saved court summaries
  //   • Collections  = number of wishlist folders
  //   • Countries    = distinct countries across the saved courts
  const savedCourtsCount = savedCourts.length;
  const collectionsCount = savedCollections.length;
  const countriesCount = new Set(savedCourts.map((court) => court.country)).size;

  // `unlocked` is derived from the real membership (entitlement-derived, Feature 62).
  // Any non-free membership (subscription OR lifetime) counts as unlocked.
  const unlocked = user.membership !== 'free';

  return (
    <AppShell
      unlocked={unlocked}
      signedIn
      headerUser={{ name: user.name, initials: user.initials, avatarUrl: user.avatarUrl }}
    >
      <PageContainer className="py-section-lg md:py-section-xl">
        {/* Single calm reading column — ~680px on all breakpoints (no desktop dashboard). */}
        <div className="mx-auto max-w-[680px]">
          {/* Page-local gear row. The wordmark stays AppHeader's job — this row only adds
              the settings entry point (prototype: an empty spacer / wordmark / gear
              three-up row; the wordmark half is already covered by AppShell above). */}
          <div className="mb-6 flex justify-end">
            <PendingLink
              href="/profile/settings"
              aria-label="Settings"
              className="p-2 text-stone transition-colors hover:text-ink"
            >
              <GearGlyph />
            </PendingLink>
          </div>

          <ProfileHeader user={user} />

          {/* Checkout status (Feature 67) — shown only when Stripe's default success/cancel
              URL lands here with `?checkout=…`. Presentational; the membership card below
              still reflects the real `/v1/me` state. */}
          {checkoutStatus ? <CheckoutStatusBanner status={checkoutStatus} /> : null}

          <ProfileStats
            savedCourtsCount={savedCourtsCount}
            collectionsCount={collectionsCount}
            countriesCount={countriesCount}
          />

          {/* Membership card — now unconditional: the free-tier "Choose your membership"
              variant and the active (subscription/lifetime) gradient variant are both
              real UI, matching the prototype's `!unlocked`/`unlocked` split at the SAME
              card rather than the page choosing whether to render it at all. */}
          <ProfileMembershipCard membership={user.membership} />

          <ProfileCollectionsStrip collections={savedCollections} />
        </div>
      </PageContainer>
    </AppShell>
  );
}
