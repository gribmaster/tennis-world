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

// Profile page (`/profile`) — restyled to the v3 layout (TASK_61 §1,
// docs/TASK_61_V3_PROFILE_SAVED_SETTINGS.md): a single column on mobile, a two-column
// page at md+ (avatar/name/stats on the left, membership/"My collections" on the right),
// gear icon top-right.
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
// THE MENU IS GONE FROM THIS SCREEN — Subscription/Contact/Privacy/Terms/Sign-out live on
// the `/profile/settings` screen (reached via the gear icon below). See
// `app/profile/settings/page.tsx`'s header comment for the full old-row inventory.
//
// GEAR ROW: the wordmark itself is AppHeader's job (already rendered by AppShell above
// this content) — this page adds only the page-local gear icon, now a circular button
// (TASK_61) navigating to `/profile/settings` via PendingLink (CLAUDE.md §4 rule 1).
//
// CHECKOUT BANNER: moved to just under the gear row (TASK_61), spanning the full width
// above both columns — in the two-column layout there is no shared "top of the single
// column" spot left for it, and it should be the first thing a Stripe-return visitor sees
// regardless of which column the membership card ends up in.
//
// NOT `overHero` — Profile has no full-bleed hero, so AppShell's header uses its
// standard solid bar + 72px offset; this page's own gear row sits below that.

export const metadata: Metadata = {
  title: 'Profile — Tennis World',
  description: 'Your membership, saved courts, and account.',
};

function GearGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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

  return (
    <AppShell signedIn>
      <PageContainer className="pt-8 pb-section-lg md:pt-11 md:pb-section-xl">
        <div className="mx-auto max-w-[1120px]">
          {/* Page-local gear row — now a circle (TASK_61). The wordmark stays AppHeader's
              job; this row only adds the settings entry point. */}
          <div className="mb-3 flex justify-end md:mb-4">
            <PendingLink
              href="/profile/settings"
              aria-label="Settings"
              className="grid h-9 w-9 place-items-center rounded-pill border border-mist/40 bg-paper text-graphite md:h-[38px] md:w-[38px]"
            >
              <span className="md:hidden">
                <GearGlyph size={16} />
              </span>
              <span className="hidden md:inline-flex">
                <GearGlyph size={17} />
              </span>
            </PendingLink>
          </div>

          {/* Checkout status (Feature 67) — shown only when Stripe's default success/cancel
              URL lands here with `?checkout=…`. Spans the full width above both columns so
              it's the first thing a Stripe-return visitor sees. Presentational; the
              membership card below still reflects the real `/v1/me` state. */}
          {checkoutStatus ? (
            <div className="mb-6">
              <CheckoutStatusBanner status={checkoutStatus} />
            </div>
          ) : null}

          {/* Two columns at md+: left (header, stats), right (membership, collections).
              No explicit grid placement needed — sibling order already gives the right
              mobile order (header, stats, membership, collections). */}
          <div className="md:grid md:grid-cols-[320px_1fr] md:items-start md:gap-12">
            <div>
              <ProfileHeader user={user} />

              <ProfileStats
                savedCourtsCount={savedCourtsCount}
                collectionsCount={collectionsCount}
                countriesCount={countriesCount}
              />
            </div>

            <div className="mt-5 md:mt-0">
              {/* Membership card — unconditional: the free-tier "Choose your membership"
                  variant and the active (subscription/lifetime) gradient variant are both
                  real UI, not a branch the page decides whether to render. */}
              <ProfileMembershipCard membership={user.membership} />

              <ProfileCollectionsStrip collections={savedCollections} />
            </div>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}
