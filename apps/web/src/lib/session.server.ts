// SERVER-ONLY session-status helper — resolves whether the current visitor has an
// active session AND whether they carry an active (non-free) membership, for
// NAVIGATION chrome (the AppHeader user icon: /profile vs /signin) and for per-viewer
// CONTENT MASKING (Task 26 — whether a locked court's name/location should be masked).
//
// WHY THIS EXISTS: `AppHeader.signedIn` defaulted to `false`, so every PUBLIC page
// (home/map/journal/about/collections/…) rendered the logged-out header — the user icon
// linked to /signin even when the visitor was authenticated OR walking through STAGING
// DEMO MODE (Feature 76), where they ARE the Demo User. The private Profile/Saved pages
// hardcode `signedIn` (they only render when authed) and Court Detail derives it inline;
// this centralizes the same derivation so the public pages can share it. Task 26 extended
// it to also surface `membership` off the SAME read, because `court.isLocked` (the summary
// DTO's field) is a content classification, not a per-viewer entitlement signal — a paying
// member must see real names/locations on locked courts, everywhere a court card renders.
//
// HOW: it goes through the EXACT SAME boundary the rest of the app uses — the
// request-scoped repositories from `getRepositoriesForRequest()`, which already merge the
// incoming session cookie AND (in demo mode) the server-only demo secret. So:
//   • real cookie session  → `GET /v1/me` 200 → signed in, membership from the response
//   • staging demo mode    → the merged demo secret authenticates → signed in (Demo User)
//   • logged out (api)     → 401 → `AuthRequiredError` → signed OUT, not entitled
//   • mock mode            → the mock user always resolves → signed in
// A 401 is the ONLY "logged out" signal; any OTHER error is re-thrown (a real API/network
// fault must not masquerade as "logged out" and silently degrade the header).
//
// NO CLIENT SECRETS, NO API ROUTES: this module imports `next/headers` (transitively, via
// `getRepositoriesForRequest`), which Next marks server-only — importing it from a
// `'use client'` file is a build error. The demo secret is read only on the server (see
// demo-auth.server.ts). Only the booleans this module returns cross to client components.

import { getRepositoriesForRequest } from './repositories.server';
import { AuthRequiredError } from './repositories';

export interface ViewerAuthState {
  /** Whether the current request has an active session. */
  signedIn: boolean;
  /** Active (non-free) membership — subscription or lifetime. False when signed out. */
  viewerIsEntitled: boolean;
}

/**
 * Resolve both the current request's sign-in state and its membership, off ONE
 * `GET /v1/me` read (in `api` mode). Callers that only need `signedIn` should keep using
 * `isSignedIn()` below; callers that also need to mask/unmask locked-court content for
 * this viewer (per-page, applied uniformly since membership is account-wide, not
 * per-court) should call this directly instead of adding a second read.
 */
export async function getViewerAuthState(): Promise<ViewerAuthState> {
  const repositories = await getRepositoriesForRequest();
  try {
    const user = await repositories.user.getCurrentUser();
    return { signedIn: true, viewerIsEntitled: user.membership !== 'free' };
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return { signedIn: false, viewerIsEntitled: false };
    }
    // A real fault (5xx, network) must surface, not be mislabeled "logged out".
    throw err;
  }
}

/**
 * Whether the current request has an active session (for the header user icon).
 *
 * Costs one `GET /v1/me` per public page render in `api` mode. That is the accepted price
 * for a header that reflects real auth state; the read is already the app's standard
 * protected path and degrades safely to `false` when logged out. In mock mode it hits the
 * in-memory user and always returns `true`.
 */
export async function isSignedIn(): Promise<boolean> {
  return (await getViewerAuthState()).signedIn;
}
