'use client';

// CLIENT (browser) repository access for the PROTECTED domains (saved/user) — Feature 57.
//
// Client islands that MUTATE saved/user state (the Add-to-Collection menu, the
// Create-Collection trigger, the rename control) run in the browser. In `api` mode their
// writes go to the protected /v1/me/* endpoints, which need the session. The browser
// can't read the httpOnly cookie from JS (that's the whole point of httpOnly), so it
// can't build a `Cookie:` header the way the server helper does — instead it tells
// `fetch` to attach the cookie automatically with `credentials:'include'`. That is what
// `auth: 'include'` does in the http-client.
//
// So an island calls `getClientRepositories()` and uses its `saved`/`user` for protected
// writes. A 401 surfaces as `AuthRequiredError` (no silent mock fallback) so the island
// can show a sign-in prompt.
//
// MOCK mode: `getRepositories('mock', …)` ignores the auth context, so this helper
// returns the in-memory mock wiring — islands keep working against the mock seam exactly
// as before (the prototype's `useState`-backed, lost-on-reload behavior). Islands can
// therefore call this unconditionally regardless of the data source.
//
// NOTE on instance identity: each call builds a fresh repository set. That's fine — the
// HTTP repos are stateless thin adapters, and the mock repos read/write a module-level
// singleton store, so a new `MockSavedRepository()` still sees the same in-memory state.

import { getRepositories, type Repositories } from '@/domain';
import type { SavedRepository } from '@/domain';
import { isDemoMode } from '@/lib/demo-auth';
import {
  createUserCollectionAction,
  renameUserCollectionAction,
  saveCourtAction,
  toggleCourtInCollectionAction,
  unsaveCourtAction,
} from '@/lib/saved-actions';

/**
 * Build a repository set for browser-side use whose PROTECTED domains (saved/user) send
 * the httpOnly session cookie via `credentials:'include'`. Use its `saved`/`user` for
 * client-side mutations in `api` mode; a 401 throws `AuthRequiredError`. In mock mode the
 * auth option is ignored and the in-memory mock wiring is returned.
 */
export function getClientRepositories(): Repositories {
  return getRepositories(undefined, { auth: 'include' });
}

/**
 * The SavedRepository a CLIENT ISLAND should use for MUTATIONS (Feature 76).
 *
 * NORMAL operation: the browser HTTP repo, authenticating with the httpOnly session cookie
 * (`credentials:'include'`) — identical to `getClientRepositories().saved`.
 *
 * STAGING DEMO MODE (`isDemoMode()`): there is no session cookie, and the demo secret must
 * not reach the browser, so the browser can't authenticate a write itself. Instead the
 * mutations are routed through SERVER ACTIONS (`saved-actions.ts`) that run on the server,
 * where the secret lives. This adapter exposes exactly the mutation methods islands call
 * directly, each delegating to its action; the READ methods are never invoked on the client
 * in this mode (the toggle's read-before-write happens server-side inside the action), so
 * they throw a clear error if misused rather than silently returning wrong data.
 *
 * Islands call this instead of `getClientRepositories().saved` for writes; the returned
 * object satisfies the same `SavedRepository` type, so the call sites are otherwise unchanged.
 */
export function getMutationSavedRepository(): SavedRepository {
  if (!isDemoMode()) {
    return getClientRepositories().saved;
  }
  return new DemoActionSavedRepository();
}

/**
 * SavedRepository whose MUTATIONS delegate to server actions (staging demo mode). Read
 * methods are unsupported on the client here — they either run server-side (page loads) or
 * inside an action — so they throw rather than mislead. See {@link getMutationSavedRepository}.
 */
class DemoActionSavedRepository implements SavedRepository {
  private static unsupported(method: string): never {
    throw new Error(
      `${method} is not available on the client in staging demo mode; it runs server-side. ` +
        'Use a server component read or a server action.',
    );
  }

  // ── Mutations → server actions (the secret stays server-side) ────────────────
  saveCourt(courtId: string): Promise<void> {
    return saveCourtAction(courtId);
  }
  unsaveCourt(courtId: string): Promise<void> {
    return unsaveCourtAction(courtId);
  }
  toggleCourtInCollection(collectionId: string, courtId: string): Promise<void> {
    return toggleCourtInCollectionAction(collectionId, courtId);
  }
  createUserCollection(name: string) {
    return createUserCollectionAction(name);
  }
  renameUserCollection(collectionId: string, name: string) {
    return renameUserCollectionAction(collectionId, name);
  }

  // ── Reads → never called on the client in demo mode ──────────────────────────
  getSavedCourts(): never {
    return DemoActionSavedRepository.unsupported('getSavedCourts');
  }
  getSavedCollections(): never {
    return DemoActionSavedRepository.unsupported('getSavedCollections');
  }
  getUserCollectionBySlug(): never {
    return DemoActionSavedRepository.unsupported('getUserCollectionBySlug');
  }
  getCollectionIdsForCourt(): never {
    return DemoActionSavedRepository.unsupported('getCollectionIdsForCourt');
  }
  isCourtSaved(): never {
    return DemoActionSavedRepository.unsupported('isCourtSaved');
  }
}
