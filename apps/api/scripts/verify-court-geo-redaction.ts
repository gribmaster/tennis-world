/* eslint-disable no-console */
//
// TASK_72 — Court geo redaction verification (DETERMINISTIC, no Stripe).
//
// Proves that a locked (`isLocked`) court's `approxLat`/`approxLng` are sent ONLY to
// a currently-entitled viewer, through the REAL public endpoints — never as `null`,
// never as `0`, the keys are simply ABSENT from the JSON for a guest or free account.
// Mints genuine bearer tokens via the production `/v1/auth/verify` path (the same
// technique as `ci-issue-token.ts` / `verify-exact-location.ts`), seeds `Entitlement`
// rows directly with Prisma (no payment provider), and hand-signs one HS256 JWT with
// the API's own `JWT_SECRET` to exercise a genuinely EXPIRED (not just malformed)
// bearer token without adding a `jsonwebtoken` dependency the API doesn't already
// expose as a direct import.
//
// FIXTURES: discovers a locked + an unlocked PUBLISHED court from `GET /v1/courts`
// (read as an entitled viewer, so both carry approx coords in the response to
// discover from) rather than depending on a specific seeded slug. If the seed is
// ever missing one or the other, this script creates its own fixture court row
// directly via Prisma (slug prefixed `f72-…`) and cleans it up after.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy   # (or migrate reset) + db:seed
//   pnpm --filter @tennis/api build && pnpm --filter @tennis/api start   # or `dev`
//   DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18001/v1 \
//     pnpm --filter @tennis/api verify:court-geo-redaction
//
// STAGING DEMO-AUTH CHECK: like `verify:staging-demo-auth`, this is config-gated —
// set `STAGING_DEMO_AUTH_SECRET` for THIS script (matching a second API instance
// started with `STAGING_DEMO_AUTH_ENABLED=true` and the same secret, pointed at via
// a second `NEXT_PUBLIC_API_BASE_URL` if needed) to run it; otherwise it SKIPS
// cleanly (exit 0 contribution, not a failure) and says so by name.
//
// CLEANUP: every user/entitlement/token/saved-court/collection/fixture-court this
// script creates lives under the dedicated, namespaced prefix `f72-…@tennis.test` /
// slug prefix `f72-…` (a `.test` TLD and slug prefix that cannot collide with a real
// or seeded row). Deleted at the end and defensively at the start.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:18001/v1';

const EMAIL_PREFIX = 'f72-';
const EMAIL_DOMAIN = '@tennis.test';
const SLUG_PREFIX = 'f72-';

// ── Tiny assertion harness (matches the sibling verify-*.ts scripts) ────────────────
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
function skip(name: string, reason: string): void {
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name} — ${reason}`);
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

/** Recursively collect every NUMBER value appearing anywhere in `value`. */
function collectNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === 'number') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value as Record<string, unknown>)) collectNumbers(v, acc);
  return acc;
}

/** No `approxLat`/`approxLng` KEY anywhere, and neither of the court's real stored
 *  approx values appears anywhere in the payload (belt-and-braces against a bug
 *  that renamed the key but still leaked the number). */
function assertFullyRedacted(
  name: string,
  payload: unknown,
  court: { approxLat: number; approxLng: number },
): void {
  const keys = collectKeys(payload);
  const leakedKeys = ['approxLat', 'approxLng'].filter((k) => keys.has(k));
  expectTrue(
    `${name}: no approxLat/approxLng keys anywhere`,
    leakedKeys.length === 0,
    leakedKeys.length ? `leaked keys: ${leakedKeys.join(', ')}` : undefined,
  );
  const numbers = collectNumbers(payload);
  const leakedValues = numbers.includes(court.approxLat) && numbers.includes(court.approxLng);
  expectTrue(
    `${name}: the court's stored approx lat/lng do not appear anywhere in the body`,
    !leakedValues,
    leakedValues ? `found (${court.approxLat}, ${court.approxLng}) in the payload` : undefined,
  );
}

/** Both approxLat/approxLng keys present as numbers, equal to the court's stored values. */
function assertApproxPresent(
  name: string,
  payload: unknown,
  court: { approxLat: number; approxLng: number },
): void {
  const rec = payload as Record<string, unknown> | null;
  const ok =
    !!rec &&
    typeof rec.approxLat === 'number' &&
    typeof rec.approxLng === 'number' &&
    rec.approxLat === court.approxLat &&
    rec.approxLng === court.approxLng;
  expectTrue(
    `${name}: approxLat/approxLng present and equal to the stored values`,
    ok,
    ok ? undefined : `got approxLat=${String(rec?.approxLat)} approxLng=${String(rec?.approxLng)}`,
  );
}

// ── Token minting: insert a MagicLinkToken, exchange it via the REAL verify endpoint ──

interface SignedInUser {
  readonly userId: string;
  readonly token: string;
  readonly entitlementId?: string;
}

async function seedUserAndSignIn(email: string, entitled: boolean): Promise<SignedInUser> {
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic' },
    update: {},
    select: { id: true },
  });

  let entitlementId: string | undefined;
  if (entitled) {
    const row = await prisma.entitlement.create({
      data: {
        userId: user.id,
        kind: 'lifetime_unlock',
        status: 'active',
        source: 'stripe_web',
        expiresAt: null,
      },
      select: { id: true },
    });
    entitlementId = row.id;
  }

  const rawToken = randomBytes(32).toString('hex');
  await prisma.magicLinkToken.create({
    data: { email, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + 15 * 60_000) },
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
  return { userId: user.id, token: session.accessToken, entitlementId };
}

// ── Hand-rolled HS256 JWT signer (no new dependency) — used ONLY to build a
// genuinely EXPIRED (not merely malformed) bearer token, signed with the API's own
// real JWT_SECRET (read from apps/api/.env via dotenv, same as main.ts). ──────────

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signExpiredJwt(payload: { sub: string; email: string }): string {
  const secret = process.env.JWT_SECRET ?? 'change-me';
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(
    Buffer.from(JSON.stringify({ ...payload, iat: now - 7200, exp: now - 3600 })),
  );
  const signature = base64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────────

interface FetchResult {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

async function getPublic(path: string, token?: string): Promise<FetchResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => undefined);
  return { status: res.status, headers: res.headers, body };
}

async function getProtected(path: string, token: string): Promise<FetchResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => undefined);
  return { status: res.status, headers: res.headers, body };
}

function assertHeaders(name: string, headers: Headers): void {
  const cacheControl = headers.get('cache-control') ?? '';
  const vary = headers.get('vary') ?? '';
  expectTrue(
    `${name}: Cache-Control: private, no-store`,
    cacheControl.includes('private') && cacheControl.includes('no-store'),
    `got "${cacheControl}"`,
  );
  expectTrue(
    `${name}: Vary includes Cookie and Authorization`,
    vary.includes('Cookie') && vary.includes('Authorization'),
    `got "${vary}"`,
  );
}

// ── Fixture discovery / creation ─────────────────────────────────────────────────

interface FixtureCourt {
  readonly id: string;
  readonly slug: string;
  readonly isLocked: boolean;
  readonly approxLat: number;
  readonly approxLng: number;
}

/** GET /v1/courts as an entitled viewer — every court (locked or not) carries approx geo. */
async function listAsEntitled(entitledToken: string): Promise<FixtureCourt[]> {
  const res = await getProtected('/courts', entitledToken);
  return res.body as FixtureCourt[];
}

async function createFixtureCourt(locked: boolean): Promise<FixtureCourt> {
  const [country, region] = await Promise.all([
    prisma.country.findFirst({ select: { id: true } }),
    prisma.region.findFirst({ select: { id: true } }),
  ]);
  if (!country || !region) {
    throw new Error('No seeded Country/Region row to attach a fixture court to.');
  }
  const slug = `${SLUG_PREFIX}${locked ? 'locked' : 'unlocked'}-fixture-${Date.now()}`;
  const row = await prisma.court.create({
    data: {
      slug,
      name: `TASK_72 fixture (${locked ? 'locked' : 'unlocked'})`,
      regionId: region.id,
      countryId: country.id,
      lat: 10,
      lng: 10,
      approxLat: 10.05,
      approxLng: 10.05,
      mapX: 50,
      mapY: 50,
      surface: 'Hard',
      setting: 'Fixture',
      access: 'Club',
      indoorOutdoor: 'Outdoor',
      isLocked: locked,
      status: 'published',
      blurb: 'TASK_72 verification fixture — safe to delete.',
    },
    select: { id: true, slug: true, isLocked: true, approxLat: true, approxLng: true },
  });
  return row;
}

async function discoverFixtures(
  entitledToken: string,
): Promise<{ locked: FixtureCourt; unlocked: FixtureCourt }> {
  const courts = await listAsEntitled(entitledToken);
  const locked = courts.find((c) => c.isLocked && !c.slug.startsWith(SLUG_PREFIX));
  const unlocked = courts.find((c) => !c.isLocked && !c.slug.startsWith(SLUG_PREFIX));
  return {
    locked: locked ?? (await createFixtureCourt(true)),
    unlocked: unlocked ?? (await createFixtureCourt(false)),
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────

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
  if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.court.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
}

// ── Preflight ─────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET /courts → ${res.status}`);
  } catch (err) {
    console.error('\n\x1b[31mCannot reach the API for verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/courts`);
    console.error(`  Reason: ${err instanceof Error ? err.message : String(err)}\n`);
    console.error('  Start the dependencies first:');
    console.error('    pnpm db:up');
    console.error('    pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)\n');
    process.exit(2);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('TASK_72 — court geo redaction verification');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  await cleanup();

  const entitled = await seedUserAndSignIn(`${EMAIL_PREFIX}entitled${EMAIL_DOMAIN}`, true);
  const free = await seedUserAndSignIn(`${EMAIL_PREFIX}free${EMAIL_DOMAIN}`, false);

  const { locked, unlocked } = await discoverFixtures(entitled.token);
  console.log(
    `Fixtures: locked="${locked.slug}" unlocked="${unlocked.slug}"\n`,
  );

  type Viewer = { label: string; token?: string };
  const anonymous: Viewer = { label: 'anonymous' };
  const freeViewer: Viewer = { label: 'free', token: free.token };
  const entitledViewer: Viewer = { label: 'entitled', token: entitled.token };

  // ── GET /courts, /courts/:slug, /courts/:slug/related, /courts/map ───────────────
  for (const viewer of [anonymous, freeViewer, entitledViewer]) {
    const list = await getPublic('/courts', viewer.token);
    const lockedInList = (list.body as FixtureCourt[]).find((c) => c.slug === locked.slug);
    const unlockedInList = (list.body as FixtureCourt[]).find((c) => c.slug === unlocked.slug);

    if (viewer.label === 'entitled') {
      if (lockedInList) assertApproxPresent(`GET /courts [${viewer.label}] locked`, lockedInList, locked);
    } else {
      if (lockedInList) assertFullyRedacted(`GET /courts [${viewer.label}] locked`, lockedInList, locked);
    }
    if (unlockedInList) assertApproxPresent(`GET /courts [${viewer.label}] unlocked`, unlockedInList, unlocked);

    const lockedDetail = await getPublic(`/courts/${locked.slug}`, viewer.token);
    const unlockedDetail = await getPublic(`/courts/${unlocked.slug}`, viewer.token);
    if (viewer.label === 'entitled') {
      assertApproxPresent(`GET /courts/:slug [${viewer.label}] locked`, lockedDetail.body, locked);
    } else {
      assertFullyRedacted(`GET /courts/:slug [${viewer.label}] locked`, lockedDetail.body, locked);
    }
    assertApproxPresent(`GET /courts/:slug [${viewer.label}] unlocked`, unlockedDetail.body, unlocked);
    assertHeaders(`GET /courts/:slug [${viewer.label}]`, lockedDetail.headers);

    const related = await getPublic(`/courts/${unlocked.slug}/related`, viewer.token);
    const lockedInRelated = (related.body as FixtureCourt[] | undefined)?.find(
      (c) => c.slug === locked.slug,
    );
    if (lockedInRelated) {
      if (viewer.label === 'entitled') {
        assertApproxPresent(`GET /courts/:slug/related [${viewer.label}] locked`, lockedInRelated, locked);
      } else {
        assertFullyRedacted(`GET /courts/:slug/related [${viewer.label}] locked`, lockedInRelated, locked);
      }
    }

    const mapPins = await getPublic('/courts/map', viewer.token);
    const pins = mapPins.body as Array<{ slug: string; state: string }>;
    const lockedPin = pins.find((p) => p.slug === locked.slug);
    const unlockedPin = pins.find((p) => p.slug === unlocked.slug);
    if (viewer.label === 'entitled') {
      expectTrue(
        `GET /courts/map [${viewer.label}]: locked pin present`,
        !!lockedPin,
      );
    } else {
      expectTrue(
        `GET /courts/map [${viewer.label}]: locked pin absent`,
        !lockedPin,
      );
    }
    expectTrue(`GET /courts/map [${viewer.label}]: unlocked pin present`, !!unlockedPin);
    assertHeaders(`GET /courts/map [${viewer.label}]`, mapPins.headers);
  }

  // ── Deep-equal: redacted (free) vs entitled payload with the two keys removed ────
  {
    const freeDetail = (await getPublic(`/courts/${locked.slug}`, free.token)).body as Record<
      string,
      unknown
    >;
    const entitledDetail = (await getPublic(`/courts/${locked.slug}`, entitled.token)).body as Record<
      string,
      unknown
    >;
    const { approxLat: _a, approxLng: _b, ...entitledWithoutApprox } = entitledDetail;
    expectTrue(
      'redaction changes ONLY approxLat/approxLng — every other field is identical',
      JSON.stringify(freeDetail) === JSON.stringify(entitledWithoutApprox),
      `free:     ${JSON.stringify(freeDetail)}\nentitled: ${JSON.stringify(entitledWithoutApprox)}`,
    );
  }

  // ── Invalid / expired bearer tokens on a public route ⇒ 200 + redacted ───────────
  {
    const invalid = await getPublic(`/courts/${locked.slug}`, 'not-a-real-token-at-all');
    expectTrue('invalid bearer token → 200 (not 401)', invalid.status === 200, `got ${invalid.status}`);
    assertFullyRedacted('invalid bearer token: locked court', invalid.body, locked);

    const expiredToken = signExpiredJwt({ sub: free.userId, email: `${EMAIL_PREFIX}free${EMAIL_DOMAIN}` });
    const expired = await getPublic(`/courts/${locked.slug}`, expiredToken);
    expectTrue('expired bearer token → 200 (not 401)', expired.status === 200, `got ${expired.status}`);
    assertFullyRedacted('expired bearer token: locked court', expired.body, locked);
  }

  // ── Staging demo-auth header (config-gated, like verify:staging-demo-auth) ──────
  {
    const demoSecret = process.env.STAGING_DEMO_AUTH_SECRET?.trim();
    if (!demoSecret) {
      skip(
        'staging demo-auth header redacts a locked court',
        'STAGING_DEMO_AUTH_SECRET not set for this harness — run against a second, ' +
          'demo-enabled API instance to exercise this (see verify:staging-demo-auth)',
      );
    } else {
      const res = await fetch(`${API_BASE}/courts/${locked.slug}`, {
        headers: { accept: 'application/json', 'X-Tennis-Demo-Auth': demoSecret },
      });
      const body = await res.json().catch(() => undefined);
      expectTrue('demo-auth header → 200', res.status === 200, `got ${res.status}`);
      assertFullyRedacted('demo-auth header (free demo user): locked court', body, locked);
    }
  }

  // ── GET /me/saved-courts (after saving the locked court) ─────────────────────────
  for (const [label, viewer] of [
    ['free', free],
    ['entitled', entitled],
  ] as const) {
    const saveRes = await fetch(`${API_BASE}/me/saved-courts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ courtId: locked.id }),
    });
    expectTrue(`POST /me/saved-courts [${label}] → 201`, saveRes.status === 201, `got ${saveRes.status}`);

    const list = await getProtected('/me/saved-courts', viewer.token);
    const saved = (list.body as FixtureCourt[]).find((c) => c.slug === locked.slug);
    expectTrue(`GET /me/saved-courts [${label}]: saved locked court present`, !!saved);
    if (saved) {
      if (label === 'entitled') assertApproxPresent(`GET /me/saved-courts [${label}]`, saved, locked);
      else assertFullyRedacted(`GET /me/saved-courts [${label}]`, saved, locked);
    }
  }

  // ── GET /me/collections/:slug (a folder containing the locked court) ─────────────
  for (const [label, viewer] of [
    ['free', free],
    ['entitled', entitled],
  ] as const) {
    const createRes = await fetch(`${API_BASE}/me/collections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ name: `TASK_72 ${label}` }),
    });
    const folder = (await createRes.json().catch(() => undefined)) as
      | { slug?: string; id?: string }
      | undefined;
    expectTrue(
      `POST /me/collections [${label}] → 201`,
      createRes.status === 201 && !!folder?.slug,
      `got ${createRes.status}`,
    );
    if (!folder?.slug || !folder.id) continue;

    const addRes = await fetch(`${API_BASE}/me/collections/${folder.id}/courts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ courtId: locked.id }),
    });
    expectTrue(`POST /me/collections/:id/courts [${label}] → 200`, addRes.status === 200, `got ${addRes.status}`);

    const detail = await getProtected(`/me/collections/${folder.slug}`, viewer.token);
    const courtInFolder = (detail.body as { courts?: FixtureCourt[] } | undefined)?.courts?.find(
      (c) => c.slug === locked.slug,
    );
    expectTrue(`GET /me/collections/:slug [${label}]: locked court present`, !!courtInFolder);
    if (courtInFolder) {
      if (label === 'entitled') assertApproxPresent(`GET /me/collections/:slug [${label}]`, courtInFolder, locked);
      else assertFullyRedacted(`GET /me/collections/:slug [${label}]`, courtInFolder, locked);
    }
  }

  // ── GET /countries still carries no coordinates (regression guard) ──────────────
  {
    const countries = await getPublic('/countries');
    const keys = collectKeys(countries.body);
    const leaked = ['lat', 'lng', 'approxLat', 'approxLng'].filter((k) => keys.has(k));
    expectTrue('GET /countries carries no coordinates', leaked.length === 0, `leaked: ${leaked.join(', ')}`);
  }

  // ── No caching of the entitlement decision: revoke, then re-check the SAME token ─
  if (entitled.entitlementId) {
    const before = await getPublic(`/courts/${locked.slug}`, entitled.token);
    assertApproxPresent('before revoke: entitled viewer sees approx geo', before.body, locked);

    await prisma.entitlement.update({
      where: { id: entitled.entitlementId },
      data: { status: 'revoked' },
    });

    const after = await getPublic(`/courts/${locked.slug}`, entitled.token);
    assertFullyRedacted('after revoke: the SAME token is redacted on the very next request', after.body, locked);
  }

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
  console.log('\n\x1b[32mVERIFICATION PASSED — locked-court approx geo reaches only entitled viewers.\x1b[0m\n');
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
