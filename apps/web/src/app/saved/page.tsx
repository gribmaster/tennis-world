import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { SavedTabs } from '@/features/saved';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';

// Saved page (`/saved`) — a Phase-1 screen (Feature 20), built from
// docs/FEATURE_19_SAVED_PAGE_LAYOUT.md. Resolves the desktop AppHeader bookmark icon
// and the mobile BottomNavigation "Saved" tab (both already point at /saved).
//
// This is a thin SERVER component and the ONLY repository boundary on the screen: it
// fetches the saved courts + wishlist folders once and passes them down as props. The
// feature-local components are presentational; only SavedTabs is a client boundary
// (it owns the active-tab state) — it does not fetch.
//
// AUTH (Feature 57): Saved is PRIVATE. In `api` mode the saved reads are protected
// (/v1/me/*) and carry the incoming session cookie via `getRepositoriesForRequest()`. A
// logged-out visitor's reads throw `AuthRequiredError`, which `loadOrSignIn` turns into a
// `redirect('/signin?redirectTo=/saved')`. In MOCK mode the protected reads never 401, so
// this stays the fixed mock saved set.
//
// NOT `overHero` — Saved has no full-bleed hero, so the header uses its standard solid
// bar + 72px offset.

export const metadata: Metadata = {
  title: 'Saved — Tennis World',
  description: 'Your saved courts, wishlist folders, and trip map.',
};

export default async function SavedPage() {
  const repositories = await getRepositoriesForRequest();

  const [savedCourts, savedCollections] = await loadOrSignIn(
    () =>
      Promise.all([
        repositories.saved.getSavedCourts(),
        repositories.saved.getSavedCollections(),
      ]),
    '/saved',
  );

  return (
    // Saved is private — if it rendered, the visitor is signed in. Point the header icon
    // at /profile.
    <AppShell unlocked={false} signedIn>
      <SavedTabs savedCourts={savedCourts} savedCollections={savedCollections} />
    </AppShell>
  );
}
