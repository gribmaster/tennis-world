import type { Metadata } from 'next';
import { AppShell, PageContainer } from '@/components/layout';
import {
  ProfileHeader,
  ProfileMembershipCard,
  ProfileMenuList,
  ProfileStats,
} from '@/features/profile';
import { CheckoutStatusBanner, parseCheckoutStatus } from '@/features/billing';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';

// Profile page (`/profile`) — the last Phase-1 screen (Feature 22), built from
// docs/FEATURE_21_PROFILE_PAGE_LAYOUT.md. Resolves the desktop AppHeader user icon and
// the mobile BottomNavigation "Profile" tab (both already point at /profile).
//
// This is a thin SERVER component and the ONLY repository boundary on the screen. It
// stays a server component; the only interactivity is self-contained client islands
// dropped into the menu — the "See Membership" CTA (PaywallTrigger) and the "Contact
// Concierge" row (ConsultationTrigger), each of which owns its own modal state. The rest
// of the feature-local components are presentational and receive plain props.
//
// AUTH (Feature 57): Profile is PRIVATE. In `api` mode the user/saved reads are protected
// (/v1/me/*) and carry the incoming session cookie via `getRepositoriesForRequest()`. A
// logged-out visitor's reads throw `AuthRequiredError`, which `loadOrSignIn` turns into a
// `redirect('/signin?redirectTo=/profile')` — we never render a broken/empty profile. In
// MOCK mode the protected reads never 401, so this stays the fixed mock profile.
//
// NOT `overHero` — Profile has no full-bleed hero, so the header uses its standard solid
// bar + 72px offset.

export const metadata: Metadata = {
  title: 'Profile — Tennis World',
  description: 'Your membership, saved courts, and account.',
};

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

  // Stats are DERIVED server-side from the saved data (never hardcoded; the
  // prototype's literal 12/3/8 are discarded — FEATURE_21 §3.2):
  //   • Saved Courts = number of saved court summaries
  //   • Collections  = number of wishlist folders
  //   • Countries    = distinct countries across the saved courts
  const savedCourtsCount = savedCourts.length;
  const collectionsCount = savedCollections.length;
  const countriesCount = new Set(savedCourts.map((court) => court.country)).size;

  // `unlocked` is derived from the (mock) membership — the User-shaped stub (Risk #7),
  // not a hardcoded stand-in. DEFAULT_MOCK_USER is "free", so this is false today and
  // the unlock card + header "Unlock Map" CTA both show, matching the prototype default.
  const unlocked = user.membership === 'lifetime';

  return (
    <AppShell unlocked={unlocked} signedIn>
      <PageContainer className="py-section-lg md:py-section-xl">
        {/* Single calm reading column — ~680px on all breakpoints (no desktop dashboard). */}
        <div className="mx-auto max-w-[680px]">
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

          {/* Membership/unlock card only when the user has not unlocked (prototype gates
              this on `!unlocked`). */}
          {!unlocked ? <ProfileMembershipCard /> : null}

          {/* The page only renders for a signed-in visitor (api mode redirects otherwise;
              mock mode always has the mock user), so the menu shows the Sign Out island. */}
          <ProfileMenuList signedIn />
        </div>
      </PageContainer>
    </AppShell>
  );
}
