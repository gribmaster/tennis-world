// SERVER-ONLY session-status helper — resolves whether the current visitor has an
// active session, for NAVIGATION chrome (the AppHeader user icon: /profile vs /signin).
//
// WHY THIS EXISTS: `AppHeader.signedIn` defaulted to `false`, so every PUBLIC page
// (home/map/journal/about/collections/…) rendered the logged-out header — the user icon
// linked to /signin even when the visitor was authenticated OR walking through STAGING
// DEMO MODE (Feature 76), where they ARE the Demo User. The private Profile/Saved pages
// hardcode `signedIn` (they only render when authed) and Court Detail derives it inline;
// this centralizes the same derivation so the public pages can share it.
//
// HOW: it goes through the EXACT SAME boundary the rest of the app uses — the
// request-scoped repositories from `getRepositoriesForRequest()`, which already merge the
// incoming session cookie AND (in demo mode) the server-only demo secret. So:
//   • real cookie session  → `GET /v1/me` 200 → signed in
//   • staging demo mode    → the merged demo secret authenticates → signed in (Demo User)
//   • logged out (api)     → 401 → `AuthRequiredError` → signed OUT
//   • mock mode            → the mock user always resolves → signed in
// A 401 is the ONLY "logged out" signal; any OTHER error is re-thrown (a real API/network
// fault must not masquerade as "logged out" and silently degrade the header).
//
// NO CLIENT SECRETS, NO API ROUTES: this module imports `next/headers` (transitively, via
// `getRepositoriesForRequest`), which Next marks server-only — importing it from a
// `'use client'` file is a build error. The demo secret is read only on the server (see
// demo-auth.server.ts). The boolean it returns is all that crosses to the client header.

import { getRepositoriesForRequest } from './repositories.server';
import { AuthRequiredError } from './repositories';

/**
 * Whether the current request has an active session (for the header user icon).
 *
 * Costs one `GET /v1/me` per public page render in `api` mode. That is the accepted price
 * for a header that reflects real auth state; the read is already the app's standard
 * protected path and degrades safely to `false` when logged out. In mock mode it hits the
 * in-memory user and always returns `true`.
 */
export async function isSignedIn(): Promise<boolean> {
  const repositories = await getRepositoriesForRequest();
  try {
    await repositories.user.getCurrentUser();
    return true;
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return false;
    }
    // A real fault (5xx, network) must surface, not be mislabeled "logged out".
    throw err;
  }
}
