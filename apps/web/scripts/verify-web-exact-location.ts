/* eslint-disable no-console */
//
// Feature 64 — Web exact-location wiring verification (no Stripe, no browser automation).
//
// This is the WEB-LAYER counterpart to the API's `verify-exact-location.ts` (Feature 63,
// 18/18). That harness proves the ENDPOINT (401/403/404/200 + masking) end-to-end against
// Postgres. THIS one proves the WEB WIRING the court page depends on: that the real
// `getRepositories('api', auth).courts.getExactLocation(slug)` — the exact call
// `courts/[slug]/page.tsx` makes through the request-scoped factory — collapses every
// "not unlocked" outcome (logged-out 401, non-entitled 403, unknown-slug 404) to `null`
// (so a locked/public court page never crashes and never redirects), passes an entitled
// 200 through as an `ExactLocationDTO` bearing a `directionsUrl`, and NEVER leaks exact
// `lat`/`lng` through the PUBLIC court reads the UI actually renders from.
//
// It goes through the real FACTORY (the same entry point `lib/repositories.server.ts`
// uses), NOT a hand-built repo, so it exercises the Feature-64 wiring (`courts` now carries
// `auth`). No Prisma import (the web package can't resolve `@prisma/client` — pnpm isolates
// it), so entitlement SEEDING stays the API harness's job; the entitled 200 path here is
// TOKEN-GATED (see below) and mirrors the persisted-saved-flow harness's operator-supplied
// bearer convention.
//
// AUTH TRANSPORT: bearer token (the AuthGuard's `Authorization: Bearer` path — trivial to
// script, same guard the cookie path hits). Two OPTIONAL env vars, each supplied by the
// operator via the dev magic-link flow (and, for the entitled one, a directly-seeded
// Entitlement row — exactly what the API `verify-exact-location.ts` does):
//
//   FREE_BEARER_TOKEN      → a signed-in but NOT-entitled user  → 403 → repo returns null
//   ENTITLED_BEARER_TOKEN  → a signed-in AND entitled user      → 200 → repo returns the DTO
//
// The LOGGED-OUT (no token → 401 → null), UNKNOWN-SLUG (404 → null), and PUBLIC-MASKING
// checks need NO token and always run. Token-gated checks are SKIPPED (not failed) when the
// corresponding env var is absent — the same "layer on when a token is available" shape as
// verify-user-saved-http.ts / verify-persisted-saved-flow.ts.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api dev                       # API on :3001
//   # Always-on checks only:
//   NEXT_PUBLIC_DATA_SOURCE=api pnpm --filter @tennis/web verify:web-exact-location
//   # With the 403 + 200 paths (mint tokens via the magic-link flow; seed an Entitlement
//   # for the entitled one — see apps/api/scripts/verify-exact-location.ts for the SQL-free
//   # Prisma seed technique):
//   NEXT_PUBLIC_DATA_SOURCE=api FREE_BEARER_TOKEN=<jwt> ENTITLED_BEARER_TOKEN=<jwt> \
//     pnpm --filter @tennis/web verify:web-exact-location
//
// Repos are imported by RELATIVE path (tsx doesn't read the Next tsconfig `paths`).

import type { ExactLocationDTO } from '@tennis/contracts';
import { getRepositories } from '../src/domain';
import type { HttpAuthOptions } from '../src/domain/http/http-client';

// A real, seeded, PUBLISHED court (the same fixture the API parity + exact-location
// harnesses use). Its slug is what we ask the endpoint to unlock.
const REAL_SLUG = 'grand-hotel-tremezzo';
const UNKNOWN_SLUG = 'not-a-real-court-f64';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// ── Tiny assertion harness (matches verify-api-parity / verify-persisted-saved-flow) ──

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];
let skipped = 0;

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}
function skip(name: string, why: string): void {
  skipped += 1;
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name}`);
  console.log(`        ${why}`);
}

/** Recursively collect every object-key name appearing anywhere in `value`. */
function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, acc);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      acc.add(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Build the web `api`-mode repository set through the REAL factory with the given auth. */
function apiRepos(auth: HttpAuthOptions = {}) {
  return getRepositories('api', auth);
}

// ── Preflight ─────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET /courts → ${res.status}`);
  } catch (err) {
    console.error('\n\x1b[31mCannot reach the API for verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/courts`);
    console.error(`  Reason: ${describeError(err)}\n`);
    console.error('  Start the dependencies first:');
    console.error('    pnpm db:up');
    console.error('    pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)\n');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  console.log('Feature 64 — Web exact-location wiring verification (no Stripe)');
  console.log(`API base: ${API_BASE}`);
  console.log(`Data source (forced): api\n`);
  await preflight();

  console.log('Always-on checks (no token required)');

  // 1. LOGGED OUT — no auth transport. The real endpoint 401s; the repo must collapse that
  //    to `null` (locked), NOT throw AuthRequiredError up to a public page.
  {
    const repos = apiRepos(); // no auth
    let out: ExactLocationDTO | null = 'sentinel' as unknown as ExactLocationDTO | null;
    let threw = false;
    try {
      out = await repos.courts.getExactLocation(REAL_SLUG);
    } catch {
      threw = true;
    }
    expectTrue('logged-out getExactLocation → null (401 degraded, no throw)', !threw && out === null,
      threw ? 'it THREW instead of returning null' : `returned ${JSON.stringify(out)}`);
  }

  // 2. UNKNOWN SLUG (logged out) — 404 also collapses to null; a missing court is never a
  //    thrown error here (the page settles existence via the public getBySlug).
  {
    const repos = apiRepos();
    let out: ExactLocationDTO | null = 'sentinel' as unknown as ExactLocationDTO | null;
    let threw = false;
    try {
      out = await repos.courts.getExactLocation(UNKNOWN_SLUG);
    } catch {
      threw = true;
    }
    expectTrue('unknown-slug getExactLocation → null (404 degraded, no throw)', !threw && out === null,
      threw ? 'it THREW instead of returning null' : `returned ${JSON.stringify(out)}`);
  }

  // 3. PUBLIC MASKING — the reads the court page ACTUALLY renders from (getBySlug / list /
  //    getMapPins / getRelated) carry NO exact lat/lng at any depth. This is the web-side
  //    mirror of the API parity/masking regression: the exact-location wiring did not widen
  //    any public court read.
  {
    const repos = apiRepos();
    const detail = await repos.courts.getBySlug(REAL_SLUG);
    expectTrue('public getBySlug resolves the fixture court', detail !== null,
      `getBySlug('${REAL_SLUG}') returned null — is the DB seeded?`);
    const list = await repos.courts.list();
    const pins = await repos.courts.getMapPins();
    const related = detail ? await repos.courts.getRelated(detail.id, 4) : [];

    for (const [name, payload] of [
      ['getBySlug', detail],
      ['list', list],
      ['getMapPins', pins],
      ['getRelated', related],
    ] as const) {
      const keys = collectKeys(payload);
      const leaked = ['lat', 'lng'].filter((k) => keys.has(k));
      expectTrue(`public ${name}: no exact lat/lng keys`, leaked.length === 0,
        leaked.length ? `leaked keys: ${leaked.join(', ')}` : undefined);
    }
  }

  // ── Token-gated checks ────────────────────────────────────────────────────────────
  console.log('\nToken-gated checks');

  // 4. NON-ENTITLED (signed in, no entitlement) — real endpoint 403; repo collapses to null
  //    (locked), no throw. The court page then shows the paywall for this user.
  const freeToken = process.env.FREE_BEARER_TOKEN?.trim();
  if (!freeToken) {
    skip('non-entitled getExactLocation → null (403 degraded)',
      'set FREE_BEARER_TOKEN to a signed-in NON-entitled user\'s bearer token to run this.');
  } else {
    const repos = apiRepos({ bearerToken: freeToken });
    let out: ExactLocationDTO | null = 'sentinel' as unknown as ExactLocationDTO | null;
    let threw = false;
    try {
      out = await repos.courts.getExactLocation(REAL_SLUG);
    } catch (err) {
      threw = true;
      out = null;
      console.log(`        (threw: ${describeError(err)})`);
    }
    expectTrue('non-entitled getExactLocation → null (403 degraded, no throw)', !threw && out === null,
      threw ? 'it THREW instead of returning null' : `returned ${JSON.stringify(out)}`);
  }

  // 5. ENTITLED (signed in + active entitlement) — real endpoint 200; repo returns the DTO.
  //    Assert the shape, that `directionsUrl` is the server-built deep link, and that the
  //    court page would place ONLY that URL in an href (the raw coords, though present in
  //    the DTO by contract, are never rendered as text — the wiring passes `directionsUrl`
  //    alone to the components).
  const entitledToken = process.env.ENTITLED_BEARER_TOKEN?.trim();
  if (!entitledToken) {
    skip('entitled getExactLocation → ExactLocationDTO (200 pass-through)',
      'set ENTITLED_BEARER_TOKEN to a signed-in ENTITLED user\'s bearer token to run this.');
  } else {
    const repos = apiRepos({ bearerToken: entitledToken });
    const dto = await repos.courts.getExactLocation(REAL_SLUG);
    expectTrue('entitled getExactLocation → non-null DTO', dto !== null,
      'returned null — is an active Entitlement seeded for this token\'s user?');
    if (dto) {
      const keys = Object.keys(dto).sort();
      expectTrue('entitled DTO is exactly {courtId,directionsUrl,lat,lng,slug}',
        JSON.stringify(keys) === JSON.stringify(['courtId', 'directionsUrl', 'lat', 'lng', 'slug']),
        `keys: ${keys.join(', ')}`);
      expectTrue('entitled DTO slug matches the fixture', dto.slug === REAL_SLUG,
        `slug=${dto.slug}`);
      expectTrue('entitled DTO directionsUrl is a Google Maps dir deep link',
        typeof dto.directionsUrl === 'string' &&
          dto.directionsUrl.startsWith('https://www.google.com/maps/dir/?api=1&destination='),
        `directionsUrl='${String(dto.directionsUrl)}'`);
      // The value the components receive from the page is directionsUrl only; assert the
      // exact coords appear IN it (server-built) but confirm they are numbers (contract),
      // not that any UI renders them as text.
      expectTrue('entitled DTO lat/lng are numbers (carried only for the server-built URL)',
        typeof dto.lat === 'number' && typeof dto.lng === 'number',
        `lat=${typeof dto.lat} lng=${typeof dto.lng}`);
      expectTrue('entitled DTO directionsUrl encodes the DTO coords',
        dto.directionsUrl.endsWith(`destination=${dto.lat},${dto.lng}`),
        `url='${dto.directionsUrl}' coords=(${dto.lat},${dto.lng})`);
    }
  }

  summarize();
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}   Skipped: ${skipped}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — web getExactLocation degrades 401/403/404 → null, passes 200 through, and public court reads carry no exact coords.\x1b[0m\n',
  );
  if (skipped) {
    console.log(
      `\x1b[33mNote:\x1b[0m ${skipped} token-gated check(s) skipped. Supply FREE_BEARER_TOKEN / ENTITLED_BEARER_TOKEN to run the full 403/200 matrix.\n`,
    );
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exitCode = 1;
});
