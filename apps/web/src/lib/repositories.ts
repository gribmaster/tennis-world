// THE sanctioned access point for repositories in the web app.
//
// Every page, component, server action, or hook that needs court (or future
// domain) data imports `repositories` from HERE — `@/lib/repositories` — and
// nowhere else. UI code must never:
//   - construct a repository class (e.g. `new MockCourtRepository()`),
//   - import a `mock-*.repository` module,
//   - import `@tennis/mock-data` directly,
//   - import the factory `@/domain` directly.
// The ESLint import-boundary rule (apps/web/.eslintrc.json) enforces this; the
// only files exempt are this one (+ repositories.server.ts / repositories.client.ts)
// and the domain folder itself.
//
// Initialized once at module load. `getRepositories()` reads the data source
// (NEXT_PUBLIC_DATA_SOURCE, default "mock") and returns the wired implementations.
// Because ES modules are singletons, every importer shares this one instance.
//
// PUBLIC vs PROTECTED (Feature 57): this `repositories` singleton carries NO auth
// context. Use it for the public discovery domains (courts/collections/journal/
// consultation), which need none. For the PROTECTED saved/user domains in `api` mode,
// import the request-scoped helpers instead:
//   - server component → `getRepositoriesForRequest()` (from '@/lib/repositories.server')
//   - browser island   → `getClientRepositories()`     (from '@/lib/repositories.client')
// (In MOCK mode all three resolve to the same in-memory mock wiring; the singleton's
// saved/user still work as before.)

import { getRepositories } from '@/domain';

/** Shared, ready-to-use repository instances. Import this — not the factory. */
export const repositories = getRepositories();

// Re-export the logged-out boundary error so UI code (server pages, islands, the
// `loadOrSignIn` helper) can branch on "not authenticated" without importing `@/domain`
// directly — keeping the single sanctioned door. `AuthRequiredError` is a 401 subclass;
// `HttpError` is its non-401 sibling.
export { AuthRequiredError, HttpError } from '@/domain';

// Re-export the mock-billing "not available in this environment" error so billing UI can
// distinguish it from a real network/auth failure (mock mode has no payment provider).
export { BillingNotAvailableError } from '@/domain';
