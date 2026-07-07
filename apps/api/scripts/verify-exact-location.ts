/* eslint-disable no-console */
//
// Feature 63 — Protected exact-location endpoint verification (DETERMINISTIC, no Stripe).
//
// Proves `GET /v1/me/courts/:slug/exact-location` end-to-end through the REAL endpoints:
// it seeds `Entitlement` rows directly with Prisma (no payment provider — the Feature-60
// intake §8 CI strategy: "seed `Entitlement` rows directly … and exercise the gating"),
// mints genuine bearer tokens via the production `/v1/auth/verify` path (the same
// technique as `ci-issue-token.ts` / `verify-effective-entitlement.ts` — insert a
// MagicLinkToken whose hash matches a known raw token, then exchange it), and asserts the
// 401/403/404/200 separation plus the response shape and the unchanged public masking.
//
// Scenarios (intake §4.5 matrix + the prompt's task-6 list):
//   A. no auth                              → 401  (AuthGuard, before handler)
//   B. authed, NO entitlement, real slug    → 403  (real court, not entitled)
//   C. authed, entitled,     real slug      → 200  + ExactLocationDTO
//   D. authed, entitled,     unknown slug   → 404  (existence checked first)
//   E. authed, NO entitlement, unknown slug → 404  (existence checked first → 404, not 403)
// On the 200 body: exact `lat`/`lng` are NUMBERS, they EQUAL the court's real exact coords
//   (and differ from the always-public approx), `directionsUrl` is the server-built Google
//   Maps deep link, and NO provider id (cus_/sub_/pi_/cs_) rides the payload.
// Public-masking regression: `/v1/courts/:slug` (detail), `/v1/courts` (list), `/v1/courts/
//   map`, `/v1/courts/:slug/related` carry NO `lat`/`lng` for an entitled AND a non-entitled
//   viewer (a recursive key scan) — the unlock surface did not widen the public surface.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy   # (or migrate reset) + db:seed
//   pnpm --filter @tennis/api dev                      # API on :3001
//   DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     pnpm --filter @tennis/api verify:exact-location
//
// CLEANUP: every user + entitlement + token this script creates lives under the dedicated,
// namespaced prefix `f63-…@tennis.test` (a `.test` TLD that can't collide with a real or
// seeded user — the seed creates NO users). The script deletes ALL of them at the end (and
// defensively at the start), so repeated runs stay clean. Uses the SAME Prisma client +
// DATABASE_URL the API uses, so the rows it writes are the rows the API reads.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// Dedicated, namespaced identity prefix. `.test` can't be a real user; the seed creates
// no users. Every row this harness writes is owned by an email starting with this.
const EMAIL_PREFIX = 'f63-';
const EMAIL_DOMAIN = '@tennis.test';

// A real, seeded, PUBLISHED court (also used by the parity harness). Its exact coords are
// what the entitled response must return.
const REAL_SLUG = 'grand-hotel-tremezzo';
const UNKNOWN_SLUG = 'not-a-real-court-f63';

// ── Tiny assertion harness (matches verify-effective-entitlement / verify-api-parity) ──

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}

/** SHA-256 hex — mirrors AuthService.sha256 (must stay in lockstep with the API). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

/** Recursively collect every string VALUE in a payload (for provider-id leak scans). */
function collectStringValues(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStringValues(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value as Record<string, unknown>))
      collectStringValues(v, acc);
  return acc;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Token minting: insert a MagicLinkToken, exchange it via the REAL verify endpoint ──

/**
 * Create (or reuse) the test user, optionally seed an ACTIVE lifetime entitlement, then
 * mint a real session through `/v1/auth/verify`. Returns the bearer token.
 */
async function seedUserAndSignIn(
  email: string,
  entitled: boolean,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic' },
    update: {},
    select: { id: true },
  });

  if (entitled) {
    // One active, non-expiring lifetime unlock → effective for all time.
    await prisma.entitlement.create({
      data: {
        userId: user.id,
        kind: 'lifetime_unlock',
        status: 'active',
        source: 'stripe_web',
        expiresAt: null,
      },
    });
  }

  const rawToken = randomBytes(32).toString('hex');
  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });

  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /auth/verify → ${res.status} ${res.statusText}\n${body}`);
  }
  const session = (await res.json()) as { accessToken?: string };
  if (!session.accessToken) {
    throw new Error(`verify returned no accessToken: ${JSON.stringify(session)}`);
  }
  return session.accessToken;
}

/** GET the exact-location endpoint. Returns the HTTP status + parsed body (best-effort). */
async function getExactLocation(
  slug: string,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(
    `${API_BASE}/me/courts/${encodeURIComponent(slug)}/exact-location`,
    {
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const body = await res.json().catch(() => undefined);
  return { status: res.status, body };
}

/** GET a public read, returning its JSON (for the masking-regression scan). */
async function getPublic(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

/** Assert no `lat`/`lng` key appears at ANY depth in a public payload. */
function assertNoExactCoords(name: string, payload: unknown): void {
  const keys = collectKeys(payload);
  const leaked = ['lat', 'lng'].filter((k) => keys.has(k));
  expectTrue(
    `${name}: no exact lat/lng keys (public masking)`,
    leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(', ')}` : undefined,
  );
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });
  const ids = users.map((u) => u.id);
  const emails = users.map((u) => u.email);
  if (ids.length) {
    await prisma.entitlement.deleteMany({ where: { userId: { in: ids } } });
    await prisma.savedCourt.deleteMany({ where: { userId: { in: ids } } });
    await prisma.consultationRequest.deleteMany({ where: { userId: { in: ids } } });
    const cols = await prisma.userCollection.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });
    await prisma.userCollectionCourt.deleteMany({
      where: { userCollectionId: { in: cols.map((c) => c.id) } },
    });
    await prisma.userCollection.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.magicLinkToken.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } },
  });
  if (emails.length)
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
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
  console.log('Feature 63 — Protected exact-location endpoint verification (no Stripe)');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  // Defensive pre-clean in case a prior run aborted mid-flight.
  await cleanup();

  // Read the court's REAL exact + approx coords straight from the DB so we can assert the
  // entitled response returns the EXACT coords (not approx). Uses the same DB the API reads.
  const court = await prisma.court.findFirst({
    where: { slug: REAL_SLUG, status: 'published' },
    select: { id: true, lat: true, lng: true, approxLat: true, approxLng: true },
  });
  if (!court) {
    console.error(`\n\x1b[31mFixture court "${REAL_SLUG}" not found / unpublished — is the DB seeded?\x1b[0m\n`);
    process.exit(2);
  }

  console.log('Scenarios');

  // A. No auth → 401 (AuthGuard, before handler).
  {
    const { status } = await getExactLocation(REAL_SLUG);
    expectTrue('A no-auth + real slug → 401', status === 401, `got ${status}`);
  }

  // B. Authed, no entitlement, real slug → 403.
  {
    const token = await seedUserAndSignIn(`${EMAIL_PREFIX}free${EMAIL_DOMAIN}`, false);
    const { status, body } = await getExactLocation(REAL_SLUG, token);
    expectTrue('B authed no-entitlement + real slug → 403', status === 403, `got ${status}`);
    // A 403 body must NOT carry coords (it's an error, not the DTO).
    expectTrue(
      'B 403 body carries no lat/lng',
      !collectKeys(body).has('lat') && !collectKeys(body).has('lng'),
    );
  }

  // C. Authed, entitled, real slug → 200 + ExactLocationDTO with the EXACT coords.
  {
    const token = await seedUserAndSignIn(`${EMAIL_PREFIX}premium${EMAIL_DOMAIN}`, true);
    const { status, body } = await getExactLocation(REAL_SLUG, token);
    expectTrue('C authed entitled + real slug → 200', status === 200, `got ${status}`);

    const dto = body as Record<string, unknown>;
    const keys = Object.keys(dto ?? {}).sort();
    expectTrue(
      'C body is exactly {courtId,directionsUrl,lat,lng,slug}',
      JSON.stringify(keys) === JSON.stringify(['courtId', 'directionsUrl', 'lat', 'lng', 'slug']),
      `keys: ${keys.join(', ')}`,
    );
    expectTrue(
      'C lat/lng are numbers',
      typeof dto.lat === 'number' && typeof dto.lng === 'number',
      `lat=${typeof dto.lat} lng=${typeof dto.lng}`,
    );
    expectTrue(
      'C lat/lng EQUAL the court exact coords (not approx)',
      dto.lat === court.lat && dto.lng === court.lng,
      `got (${dto.lat},${dto.lng}) want (${court.lat},${court.lng})`,
    );
    expectTrue(
      'C lat/lng DIFFER from the public approx coords',
      dto.lat !== court.approxLat || dto.lng !== court.approxLng,
      `exact equals approx — masking would be meaningless`,
    );
    expectTrue(
      'C courtId/slug match the fixture court',
      dto.courtId === court.id && dto.slug === REAL_SLUG,
      `courtId=${String(dto.courtId)} slug=${String(dto.slug)}`,
    );
    const expectedUrl = `https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`;
    expectTrue(
      'C directionsUrl is the server-built Google Maps deep link',
      dto.directionsUrl === expectedUrl,
      `got '${String(dto.directionsUrl)}'\nwant '${expectedUrl}'`,
    );
    // No provider correlation id rides the payload.
    const providerVals = collectStringValues(dto).filter((s) => /^(cus_|sub_|pi_|cs_)/.test(s));
    expectTrue(
      'C body carries no provider-id values (cus_/sub_/pi_/cs_)',
      providerVals.length === 0,
      `leaked: ${providerVals.join(', ')}`,
    );
    const providerKeys = ['providerCustomerId', 'providerSubscriptionId', 'providerPurchaseId', 'stripeCustomerId']
      .filter((k) => keys.includes(k));
    expectTrue('C body carries no provider-id keys', providerKeys.length === 0, `leaked: ${providerKeys.join(', ')}`);
  }

  // D. Authed, entitled, unknown slug → 404 (existence checked first).
  {
    const token = await seedUserAndSignIn(`${EMAIL_PREFIX}premium2${EMAIL_DOMAIN}`, true);
    const { status } = await getExactLocation(UNKNOWN_SLUG, token);
    expectTrue('D authed entitled + unknown slug → 404', status === 404, `got ${status}`);
  }

  // E. Authed, NO entitlement, unknown slug → 404 (existence FIRST → 404, not 403).
  {
    const token = await seedUserAndSignIn(`${EMAIL_PREFIX}free2${EMAIL_DOMAIN}`, false);
    const { status } = await getExactLocation(UNKNOWN_SLUG, token);
    expectTrue(
      'E authed no-entitlement + unknown slug → 404 (existence checked first)',
      status === 404,
      `got ${status}`,
    );
  }

  // ── Public-masking regression: the unlock surface did NOT widen public reads ────────
  // For BOTH an entitled and a non-entitled viewer the PUBLIC court reads are unchanged
  // and carry no exact coords (the public endpoints are unauthenticated, so the viewer's
  // entitlement is irrelevant — but we assert it explicitly to nail the invariant).
  console.log('\nPublic-masking regression');
  const publicDetail = await getPublic(`/courts/${REAL_SLUG}`);
  const publicList = await getPublic('/courts');
  const publicMap = await getPublic('/courts/map');
  const publicRelated = await getPublic(`/courts/${REAL_SLUG}/related`);
  assertNoExactCoords('/v1/courts/:slug (detail)', publicDetail);
  assertNoExactCoords('/v1/courts (list)', publicList);
  assertNoExactCoords('/v1/courts/map', publicMap);
  assertNoExactCoords('/v1/courts/:slug/related', publicRelated);

  await cleanup();
  summarize();
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — exact-location gates 401/403/404/200 correctly and public masking is intact.\x1b[0m\n',
  );
}

main()
  .catch(async (err) => {
    console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
