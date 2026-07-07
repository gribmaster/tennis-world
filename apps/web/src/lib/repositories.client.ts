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

/**
 * Build a repository set for browser-side use whose PROTECTED domains (saved/user) send
 * the httpOnly session cookie via `credentials:'include'`. Use its `saved`/`user` for
 * client-side mutations in `api` mode; a 401 throws `AuthRequiredError`. In mock mode the
 * auth option is ignored and the in-memory mock wiring is returned.
 */
export function getClientRepositories(): Repositories {
  return getRepositories(undefined, { auth: 'include' });
}
