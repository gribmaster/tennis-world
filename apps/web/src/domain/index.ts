// Central repository factory — the single place that decides WHICH concrete
// repository implementation backs each domain (Architecture Plan Decision #7 /
// Phase 1 §1.1).
//
// Pages and components never construct a repository directly and never read the
// data-source env var themselves. They import the already-initialized object from
// `src/lib/repositories.ts` (public/no-auth usage), or — for the PROTECTED saved/user
// domains in `api` mode — call a request-scoped helper:
//   - `src/lib/repositories.server.ts` → `getRepositoriesForRequest()` (server
//     components; forwards the incoming Cookie header to /v1/me/*), and
//   - `src/lib/repositories.client.ts` → `getClientRepositories()` (browser islands;
//     sends the httpOnly session cookie via `credentials:'include'`).
// All three call `getRepositories()` here. That keeps the mock→HTTP swap a one-line
// change in this file, invisible to the UI.
//
// Allowed imports INTO this file: concrete domain repository implementations
// (e.g. `MockCourtRepository`, `HttpCourtRepository`). This is the only file in the
// app — besides each domain's own folder — permitted to touch a `mock-*.repository`
// or `http-*.repository` module; the ESLint import-boundary rule
// (apps/web/.eslintrc.json) enforces that.

import { MockCourtRepository } from './courts/mock-court.repository';
import type { CourtRepository } from './courts/court.repository';
import { MockCollectionRepository } from './collections/mock-collection.repository';
import type { CollectionRepository } from './collections/collection.repository';
import { MockArticleRepository } from './journal/mock-article.repository';
import type { ArticleRepository } from './journal/article.repository';
import { MockSavedRepository } from './saved/mock-saved.repository';
import type { SavedRepository } from './saved/saved.repository';
import { MockUserRepository } from './user/mock-user.repository';
import type { UserRepository } from './user/user.repository';
import { MockConsultationRepository } from './consultation/mock-consultation.repository';
import type { ConsultationRepository } from './consultation/consultation.repository';
import { MockBillingRepository } from './billing/mock-billing.repository';
import type { BillingRepository } from './billing/billing.repository';

// Phase-2 HTTP implementations — wired in only for the `api` data source.
import { HttpCourtRepository } from './http/http-court.repository';
import { HttpCollectionRepository } from './http/http-collection.repository';
import { HttpArticleRepository } from './http/http-article.repository';
import { HttpConsultationRepository } from './consultation/http-consultation.repository';

// Phase-4 (Feature 57) protected HTTP implementations — wired in only for the `api`
// data source, and only with an auth context (server cookie / browser include / bearer).
import { HttpSavedRepository } from './http/http-saved.repository';
import { HttpUserRepository } from './http/http-user.repository';
import type { HttpAuthOptions } from './http/http-client';

// Phase-5 (Feature 67) protected billing implementation — wired in only for the `api`
// data source, and only with an auth context (browser include / server cookie / bearer).
import { HttpBillingRepository } from './http/http-billing.repository';

// Re-exported for the request-scoped factory helpers (lib/repositories.server.ts and
// lib/repositories.client.ts) so they describe the auth transport without importing a
// concrete `http-*` module (the import-boundary forbids that outside src/domain/**).
// `AuthRequiredError` is re-exported too so the logged-out boundary (server pages /
// islands) can `catch (err) { if (err instanceof AuthRequiredError) … }`.
export type { HttpAuthOptions } from './http/http-client';
export { AuthRequiredError, HttpError } from './http/http-client';

// Re-exported so the client mutation adapter (lib/repositories.client.ts — Feature 76) can
// implement the SavedRepository interface (its demo-mode server-action-backed variant)
// without importing a concrete `*.repository` module (the import-boundary forbids that
// outside src/domain/**). Type-only — no runtime coupling.
export type { SavedRepository } from './saved/saved.repository';

// Re-exported so the billing client action helper (UI layer) can recognise "billing is
// unavailable in this environment" (mock mode has no payment provider) and show a calm
// message instead of a scary error — without importing a concrete `*.repository` module
// (the import-boundary forbids that outside src/domain/**).
export { BillingNotAvailableError } from './billing/mock-billing.repository';

/**
 * The set of repositories the web app depends on. Every domain that exposes a
 * repository adds its interface here; UI code is typed against these interfaces,
 * never the concrete classes.
 */
export interface Repositories {
  courts: CourtRepository;
  collections: CollectionRepository;
  journal: ArticleRepository;
  saved: SavedRepository;
  user: UserRepository;
  consultation: ConsultationRepository;
  billing: BillingRepository;
}

/**
 * Supported data sources. `mock` is the Phase-1 default (in-memory data from
 * `@tennis/mock-data`); `api` wires the Phase-2 HTTP repositories against the
 * public API.
 */
export type DataSource = 'mock' | 'api';

const DEFAULT_DATA_SOURCE: DataSource = 'mock';

/**
 * Resolve the active data source from the environment, falling back to the
 * default. Read via `NEXT_PUBLIC_DATA_SOURCE` so the value is available both on
 * the server and in the browser bundle (the repositories run in either place). An
 * unrecognized value is rejected loudly rather than silently defaulting, so a typo
 * in `.env` fails fast instead of shipping the wrong wiring.
 */
function resolveDataSource(): DataSource {
  const raw = process.env.NEXT_PUBLIC_DATA_SOURCE?.trim();
  if (!raw) return DEFAULT_DATA_SOURCE;
  if (raw === 'mock' || raw === 'api') return raw;
  throw new Error(
    `Unknown NEXT_PUBLIC_DATA_SOURCE "${raw}". Expected "mock" or "api".`,
  );
}

/**
 * Build the repository set for the given data source and (optional) auth context.
 *
 * AUTH CONTEXT (Feature 57): `saved` and `user` are PROTECTED — in `api` mode they
 * hit `/v1/me/*`, which requires a session. This factory stays FRAMEWORK-NEUTRAL: it
 * never reads cookies itself (no `next/headers`). The caller supplies how to
 * authenticate via `HttpAuthOptions`:
 *   - server component → `{ cookie: '<incoming Cookie header>' }`  (lib/repositories.server.ts)
 *   - browser island   → `{ auth: 'include' }`                     (lib/repositories.client.ts)
 *   - script/mobile    → `{ bearerToken }`
 * The PUBLIC domains (courts/collections/journal/consultation) ignore it entirely.
 *
 * MOCK mode: the auth context is irrelevant (no network, no /v1/me) and is ignored —
 * saved/user keep mutating the in-memory mock seam exactly as before. The zero-auth
 * call from `lib/repositories.ts` therefore still produces working mock-mode wiring.
 *
 * `api` MODE FLIP (Feature 57): saved → `HttpSavedRepository`, user →
 * `HttpUserRepository`, both carrying `auth`. With NO auth (the bare `repositories`
 * singleton) the protected reads will 401 → `AuthRequiredError` rather than silently
 * falling back to mock/empty — the logged-out boundary is handled by the request-scoped
 * callers (server pages redirect to /signin; islands show a sign-in prompt). The public
 * discovery domains continue to use the live API unchanged.
 *
 * @param dataSource Override for the env-resolved source (mainly for tests).
 * @param auth Auth transport forwarded to the protected `saved`/`user` repos in `api`
 *   mode. Omit for public/mock usage.
 */
export function getRepositories(
  dataSource: DataSource = resolveDataSource(),
  auth: HttpAuthOptions = {},
): Repositories {
  switch (dataSource) {
    case 'mock':
      return {
        courts: new MockCourtRepository(),
        collections: new MockCollectionRepository(),
        journal: new MockArticleRepository(),
        saved: new MockSavedRepository(),
        user: new MockUserRepository(),
        consultation: new MockConsultationRepository(),
        // No payment provider in mock mode — a checkout/portal action throws a clear
        // "not available in mock mode" error (see MockBillingRepository). The billing
        // buttons still render; clicking one in mock mode is a no-op-with-message.
        billing: new MockBillingRepository(),
      };
    case 'api':
      return {
        // Live API for the public discovery domains + consultation submit. `courts`
        // carries `auth` (Feature 64) SOLELY for its one protected read —
        // `getExactLocation` → `GET /v1/me/courts/:slug/exact-location`; every public
        // court read ignores it. With no auth (the bare singleton) that protected read
        // simply resolves to `null` (locked), never crashing a public court page.
        courts: new HttpCourtRepository(auth),
        collections: new HttpCollectionRepository(),
        journal: new HttpArticleRepository(),
        consultation: new HttpConsultationRepository(),
        // Protected /v1/me/* — carry the caller's auth transport (Feature 57).
        saved: new HttpSavedRepository(auth),
        user: new HttpUserRepository(auth),
        // Protected /v1/billing/* — carry the caller's auth transport (Feature 67). A
        // browser checkout/portal action passes `auth: 'include'`; a 401 → AuthRequiredError.
        billing: new HttpBillingRepository(auth),
      };
    default: {
      // Exhaustiveness guard: if a new DataSource member is added without a
      // branch above, this line becomes a compile error.
      const _exhaustive: never = dataSource;
      throw new Error(`Unhandled data source: ${String(_exhaustive)}`);
    }
  }
}
