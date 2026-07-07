'use server';

import type { UserCollectionDTO } from '@tennis/contracts';
import { getRepositoriesForRequest } from './repositories.server';

// SERVER ACTIONS for the protected saved/collection MUTATIONS (Feature 76).
//
// WHY THIS EXISTS: client islands (Add-to-Collection menu, save/unsave heart, create/rename
// collection) normally mutate directly from the BROWSER via `getClientRepositories()`, which
// authenticates with the httpOnly session cookie (`credentials:'include'`). In STAGING DEMO
// MODE there is no session cookie (the Vercel↔Railway cross-domain cookie doesn't stick — the
// reason demo mode exists), so the browser has no way to authenticate a write. The demo secret
// must NOT ship to the browser, so the browser also can't send the demo header itself.
//
// These server actions bridge that gap: they run on the SERVER, where they call
// `getRepositoriesForRequest()` — which already merges the incoming cookie AND (in demo mode)
// the server-only demo-auth secret. An island in demo mode calls the action instead of the
// browser repo; the secret stays entirely server-side. See docs/STAGING_DEMO_AUTH.md.
//
// NOT DEMO-SPECIFIC AT RUNTIME: each action is a plain server-side write that works in normal
// cookie mode too (the request-scoped repos forward the incoming cookie). The islands only
// ROUTE through them when `isDemoMode()` is true; outside demo mode they keep the existing
// browser-direct path unchanged. An `AuthRequiredError` from a genuinely-unauthenticated
// request still propagates to the caller (the island's existing catch handles it).
//
// These are thin pass-throughs to the SavedRepository — no extra logic, no revalidation (the
// islands manage their own optimistic UI, matching the browser-direct path they replace).

/** POST /v1/me/saved-courts — save a court (idempotent). */
export async function saveCourtAction(courtId: string): Promise<void> {
  const repositories = await getRepositoriesForRequest();
  await repositories.saved.saveCourt(courtId);
}

/** DELETE /v1/me/saved-courts/:courtId — unsave a court (idempotent). */
export async function unsaveCourtAction(courtId: string): Promise<void> {
  const repositories = await getRepositoriesForRequest();
  await repositories.saved.unsaveCourt(courtId);
}

/** Toggle a court in/out of a folder (read-before-write bridge lives in the repo). */
export async function toggleCourtInCollectionAction(
  collectionId: string,
  courtId: string,
): Promise<void> {
  const repositories = await getRepositoriesForRequest();
  await repositories.saved.toggleCourtInCollection(collectionId, courtId);
}

/** POST /v1/me/collections — create an empty folder; server derives the slug. */
export async function createUserCollectionAction(
  name: string,
): Promise<UserCollectionDTO> {
  const repositories = await getRepositoriesForRequest();
  return repositories.saved.createUserCollection(name);
}

/** PATCH /v1/me/collections/:id — rename a folder; server re-derives the slug. */
export async function renameUserCollectionAction(
  collectionId: string,
  name: string,
): Promise<UserCollectionDTO> {
  const repositories = await getRepositoriesForRequest();
  return repositories.saved.renameUserCollection(collectionId, name);
}
