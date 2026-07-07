// SERVER-ONLY repository access for the PROTECTED domains (saved/user) — Feature 57.
//
// The bare `repositories` singleton in `./repositories` is built once at module load
// with NO auth context. That is correct for the public discovery domains
// (courts/collections/journal/consultation) and for mock mode, but the protected
// /v1/me/* reads (saved/user) need to carry the caller's identity. A module-level
// singleton can't — a cookie is per-request. So a SERVER COMPONENT that needs saved/user
// in `api` mode calls `getRepositoriesForRequest()` here, which:
//   • reads the incoming request's cookies via `next/headers` (`cookies()`), and
//   • builds a repository set whose saved/user repos forward that Cookie header to the
//     API (so the AuthGuard's cookie path authenticates the request).
//
// SERVER-ONLY GUARANTEE: this module imports `next/headers`, which Next marks
// server-only — importing it into a `'use client'` module is a build error. That makes
// the boundary self-enforcing without a `server-only` dependency: a client island that
// tried to import this file would fail the build loudly, not leak `cookies()` into the
// browser bundle. The `@/domain` factory it calls stays framework-neutral (it never
// touches `next/headers`); this file is the ONLY place the cookie is read.
//
// MOCK mode: `getRepositories('mock', …)` ignores the auth context entirely, so this
// helper transparently returns the in-memory mock wiring — server pages can call it
// unconditionally regardless of the data source.

import { cookies } from 'next/headers';
import { getRepositories, type Repositories } from '@/domain';
import { demoAuthOptions } from './demo-auth.server';

/**
 * Build a request-scoped repository set whose PROTECTED domains (saved/user) carry the
 * incoming session cookie, so a server component can read /v1/me/* as the logged-in
 * user. In `api` mode the saved/user repos throw `AuthRequiredError` on a 401 (no silent
 * mock fallback) — the calling page decides the logged-out UX (redirect to /signin). In
 * mock mode the cookie is ignored and the in-memory mock wiring is returned.
 *
 * `cookies()` is async in Next 15 and must be awaited; this helper is therefore async.
 * The serialized `name=value; name2=value2` string is passed as the literal `Cookie:`
 * header to the HTTP repos (the public discovery repos ignore it).
 */
export async function getRepositoriesForRequest(): Promise<Repositories> {
  const cookieStore = await cookies();
  // Re-serialize the readable cookies into a single Cookie header. The httpOnly session
  // cookie IS present here (the server can read httpOnly cookies it received; only JS in
  // the browser can't), so the API's cookie-first AuthGuard authenticates.
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  // STAGING-ONLY (Feature 76): in demo mode there is no session cookie (the Vercel↔Railway
  // cross-domain cookie doesn't stick — the whole reason demo mode exists), so the demo-auth
  // header IS the credential for the protected /v1/me/* reads. `demoAuthOptions()` reads the
  // server-only secret (or `{}` when demo mode is off / secret missing) and is merged on top
  // of the cookie transport. In normal operation this is `{}` and nothing changes.
  const demo = demoAuthOptions();

  // Pass the cookie only when non-empty so a logged-out request sends no Cookie at all
  // (cleaner than an empty header) — outside demo mode the protected reads then 401 as
  // expected. In demo mode the merged demo secret authenticates even with no cookie.
  return getRepositories(undefined, {
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...demo,
  });
}
