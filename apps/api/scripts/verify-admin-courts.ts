/* eslint-disable no-console */
//
// TASK_73 (+ TASK_75 hardening follow-up) — admin courts API verification
// (DETERMINISTIC, no Stripe). Same `record()` harness idiom as
// `verify-court-geo-redaction.ts` / `verify-exact-location.ts`.
//
// TASK_75 additions: concurrent-image-upload row-lock proof, TRUST_PROXY_HOPS
// parser + integration (spawns two extra child API instances on :18095/:18096),
// and the tightened mapLinkUrl host/path rule table.
//
// TASK_78 fix 3: the "region from another country" check now always uses its
// OWN deterministic second fixture country+region (`ensureSecondFixtureCountryRegion`)
// instead of picking "any other country" from the database, which could skip when
// that pick had no regions. The summary line also prints `Skipped: N` and the
// harness EXITS NON-ZERO if any check was skipped, unless `ALLOW_SKIPS=1` is set —
// the three remaining `skip(` sites are boot-spawn checks (production-boot guard,
// TRUST_PROXY_HOPS integration ×2) that may legitimately skip on a machine that
// cannot spawn a second API instance; that must stay visible and opt-in, never silent.
//
// FIXTURES are namespaced with prefix `f73-`: AdminUser emails `f73-admin-*@tennis.test`,
// a regular User `f73-user-*@tennis.test`, Court slugs `f73-*`, and a dedicated Country
// (isoCode `XZ`, name `F73 Test Country`) + Region (`F73 Test Region`). Cleaned up in a
// `finally`, defensively at the start too. It creates its own `AdminUser` rows (via both
// the bootstrap CLI's exported functions AND direct Prisma writes) — no SQL, no manual step.
//
// LOGIN RATE-LIMIT ORDERING (important): the admin login limiter is keyed by IP *and*
// email (apps/api/src/admin/auth/admin-login-rate-limit.service.ts). Every OTHER admin
// token this script needs is minted via a SUCCESSFUL login (which never touches the
// limiter's failure counters) BEFORE the dedicated "login semantics" test block runs. That
// block is the ONLY place this script deliberately fails a login, and it runs LAST among
// anything login-related — after it trips the IP-level 5-failure window, no further
// `/v1/admin/auth/login` call would even reach password verification for the rest of this
// process's 15-minute window, so nothing after it may call login again.
//
// Run (after the API is up and migrated/seeded, COURT_IMAGE_STORAGE=local):
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api build
//   COURT_IMAGE_STORAGE=local ADMIN_JWT_SECRET=<same as .env> node apps/api/dist/main.js
//   COURT_IMAGE_STORAGE=local DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18001/v1 \
//     pnpm --filter @tennis/api verify:admin-courts

import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { approxFromExact, mapCoordsFromSeed } from '../src/courts/court-derived-fields';
import { hashAdminPassword, verifyAdminPassword } from '../src/admin/auth/admin-password.util';
import { createAdmin, setPassword } from './admin-user';
import { AdminRolesGuard } from '../src/admin/auth/admin-roles.guard';
import { validateMapLinkUrl } from '../src/admin/courts/admin-map-link.util';
import { SupabaseImageStorageDriver } from '../src/admin/images/admin-image-storage';
import { AdminImagesService } from '../src/admin/images/admin-images.service';
import { AdminLoginRateLimitService } from '../src/admin/auth/admin-login-rate-limit.service';
import { loadTrustProxyHops } from '../src/auth/trust-proxy.config';

const prisma = new PrismaClient();

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:18001/v1';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET?.trim() || 'admin-change-me-insecure-dev-secret';
const USER_JWT_SECRET = process.env.JWT_SECRET?.trim() || 'change-me';

const EMAIL_PREFIX = 'f73-';
const EMAIL_DOMAIN = '@tennis.test';
const SLUG_PREFIX = 'f73-';
const FIXTURE_COUNTRY_ISO = 'XZ';
const FIXTURE_COUNTRY_NAME = 'F73 Test Country';
const FIXTURE_REGION_NAME = 'F73 Test Region';
// A second fixture country+region (TASK_78 fix 3), deterministic — replaces the
// old `prisma.country.findFirst(...)` "pick any other country" lookup, which
// could skip the "region from another country" check on a database where that
// pick happened to have no regions. Caught by the existing `name: { startsWith:
// 'F73 ' }` wildcard in `cleanup()`, so no separate cleanup code is needed.
const FIXTURE_COUNTRY2_ISO = 'XY';
const FIXTURE_COUNTRY2_NAME = 'F73 Test Country 2';
const FIXTURE_REGION2_NAME = 'F73 Test Region 2';

function adminEmail(name: string): string {
  return `${EMAIL_PREFIX}admin-${name}${EMAIL_DOMAIN}`;
}
function userEmail(name: string): string {
  return `${EMAIL_PREFIX}user-${name}${EMAIL_DOMAIN}`;
}
function slug(name: string): string {
  return `${SLUG_PREFIX}${name}`;
}

// ── Tiny assertion harness (matches the sibling verify-*.ts scripts) ───────────────
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
interface SkipResult {
  readonly name: string;
  readonly reason: string;
}
const skips: SkipResult[] = [];

function skip(name: string, reason: string): void {
  skips.push({ name, reason });
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name} — ${reason}`);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────────────

/** Every parsed admin-response body this run has seen — scanned at the end for a
 *  leaked `passwordHash` (Testing §12). */
const allAdminResponseBodies: unknown[] = [];
/** Every parsed PUBLIC-response body this run has seen for the fixture courts —
 *  scanned at the end for leaked exact lat/lng/mapLinkUrl (Testing §12). */
const allPublicResponseBodies: unknown[] = [];

interface HttpResult {
  status: number;
  headers: Headers;
  body: unknown;
}

interface AdminFetchOptions {
  method?: string;
  token?: string;
  cookie?: string;
  csrf?: boolean;
  json?: unknown;
  form?: FormData;
}

async function adminFetch(pathSuffix: string, opts: AdminFetchOptions = {}): Promise<HttpResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.csrf) headers['X-Tennis-Admin'] = '1';

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${API_BASE}${pathSuffix}`, { method: opts.method ?? 'GET', headers, body });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  allAdminResponseBodies.push(parsed);
  return { status: res.status, headers: res.headers, body: parsed };
}

async function publicFetch(pathSuffix: string, token?: string): Promise<HttpResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${pathSuffix}`, { headers });
  const body = await res.json().catch(() => undefined);
  allPublicResponseBodies.push(body);
  return { status: res.status, headers: res.headers, body };
}

function extractCookiePair(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) return undefined;
  return setCookieHeader.split(';')[0];
}

// ── JWT hand-signing (cross-token tests; no new dependency) ─────────────────────────

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  opts: { expiresInSeconds?: number; audience?: string } = {},
): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { ...payload, iat: now };
  if (opts.expiresInSeconds !== undefined) claims.exp = now + opts.expiresInSeconds;
  if (opts.audience !== undefined) claims.aud = opts.audience;
  const body = base64url(Buffer.from(JSON.stringify(claims)));
  const signature = base64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

// ── Fixtures: AdminUser / User creation + sign-in ───────────────────────────────────

async function createFixtureAdmin(name: string, password: string, role = 'admin'): Promise<string> {
  const email = adminEmail(name);
  const passwordHash = await hashAdminPassword(password);
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, role },
    update: { passwordHash, role },
  });
  return email;
}

interface AdminSession {
  token: string;
  cookie: string;
}

async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const res = await adminFetch('/admin/auth/login', { method: 'POST', json: { email, password } });
  if (res.status !== 200) {
    throw new Error(`admin login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { accessToken: string };
  const cookie = extractCookiePair(res.headers.get('set-cookie'));
  if (!cookie) throw new Error(`admin login for ${email} set no cookie`);
  return { token: body.accessToken, cookie };
}

/** SHA-256 hex — mirrors AuthService.sha256 (user magic-link flow). */
function sha256(value: string): string {
  return require('node:crypto').createHash('sha256').update(value).digest('hex');
}

async function createAndSignInUser(name: string): Promise<{ userId: string; token: string }> {
  const email = userEmail(name);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic' },
    update: {},
    select: { id: true },
  });
  const rawToken = randomBytes(32).toString('hex');
  await prisma.magicLinkToken.create({
    data: { email, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  if (!res.ok) throw new Error(`verify failed for ${email}: ${res.status}`);
  const session = (await res.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error(`verify returned no accessToken for ${email}`);
  return { userId: user.id, token: session.accessToken };
}

// ── Fixture Country/Region (direct Prisma — avoids depending on the admin API to
// bootstrap the admin API's own test fixtures) ──────────────────────────────────────

async function ensureFixtureCountryRegion(): Promise<{ countryId: string; regionId: string }> {
  const country = await prisma.country.upsert({
    where: { isoCode: FIXTURE_COUNTRY_ISO },
    create: { name: FIXTURE_COUNTRY_NAME, isoCode: FIXTURE_COUNTRY_ISO, continent: 'Europe' },
    update: {},
  });
  const existingRegion = await prisma.region.findFirst({
    where: { countryId: country.id, name: FIXTURE_REGION_NAME },
  });
  const region =
    existingRegion ??
    (await prisma.region.create({
      data: { countryId: country.id, name: FIXTURE_REGION_NAME, lat: 10, lng: 10 },
    }));
  return { countryId: country.id, regionId: region.id };
}

/** The deterministic "other" country/region for the region/country-mismatch
 *  check (TASK_78 fix 3) — never depends on what else happens to exist in
 *  this database. */
async function ensureSecondFixtureCountryRegion(): Promise<{ countryId: string; regionId: string }> {
  const country = await prisma.country.upsert({
    where: { isoCode: FIXTURE_COUNTRY2_ISO },
    create: { name: FIXTURE_COUNTRY2_NAME, isoCode: FIXTURE_COUNTRY2_ISO, continent: 'Europe' },
    update: {},
  });
  const existingRegion = await prisma.region.findFirst({
    where: { countryId: country.id, name: FIXTURE_REGION2_NAME },
  });
  const region =
    existingRegion ??
    (await prisma.region.create({
      data: { countryId: country.id, name: FIXTURE_REGION2_NAME, lat: 20, lng: 20 },
    }));
  return { countryId: country.id, regionId: region.id };
}

// ── Tiny real image fixtures (magic bytes only — sniffing doesn't decode pixels) ───

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const TINY_WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
const FAKE_HTML_AS_JPG = Buffer.from('<html><body>not an image</body></html>');
const FAKE_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const FAKE_GIF = Buffer.from('GIF89a-not-sniffed-by-us');

function uploadForm(buffer: Buffer, filename: string, alt?: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  if (alt !== undefined) form.append('alt', alt);
  return form;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  // Belt-and-braces: catch fixture courts by slug prefix AND by FK into the
  // fixture country/region (a court whose NAME got overridden to something
  // without the `F73 ` prefix — e.g. the diacritics test — would still slug to
  // something outside SLUG_PREFIX; catching it by FK too means a future test
  // like that can never leave an orphaned row that breaks region/country cleanup).
  const fixtureCountry = await prisma.country.findUnique({ where: { isoCode: FIXTURE_COUNTRY_ISO } });
  const fixtureRegion = fixtureCountry
    ? await prisma.region.findFirst({ where: { countryId: fixtureCountry.id, name: FIXTURE_REGION_NAME } })
    : null;

  const courts = await prisma.court.findMany({
    where: {
      OR: [
        { slug: { startsWith: SLUG_PREFIX } },
        ...(fixtureCountry ? [{ countryId: fixtureCountry.id }] : []),
        ...(fixtureRegion ? [{ regionId: fixtureRegion.id }] : []),
      ],
    },
    select: { id: true },
  });
  const courtIds = courts.map((c) => c.id);
  if (courtIds.length > 0) {
    await prisma.courtImage.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.savedCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.collectionCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.userCollectionCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.court.deleteMany({ where: { id: { in: courtIds } } });
  }

  // Any OTHER court created by the "countries/regions" test section (its own
  // throwaway country/region) is still slug-prefixed, so it was already caught
  // above; just drop every F73-named region/country now that no court can
  // reference them.
  await prisma.region.deleteMany({ where: { name: { startsWith: 'F73 ' } } });
  await prisma.country.deleteMany({ where: { name: { startsWith: 'F73 ' } } });

  const users = await prisma.user.findMany({
    where: { email: { startsWith: `${EMAIL_PREFIX}user-`, endsWith: EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.savedCourt.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.entitlement.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.magicLinkToken.deleteMany({
    where: { email: { startsWith: `${EMAIL_PREFIX}user-`, endsWith: EMAIL_DOMAIN } },
  });
  if (users.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: users.map((u) => u.email) } } });
  }

  await prisma.adminUser.deleteMany({
    where: { email: { startsWith: `${EMAIL_PREFIX}admin-`, endsWith: EMAIL_DOMAIN } },
  });

  // Best-effort local-storage file cleanup for every fixture court id we touched.
  const uploadsRoot = path.resolve(__dirname, '..', '..', 'web', 'public', 'uploads', 'courts');
  for (const id of courtIds) {
    const dir = path.join(uploadsRoot, id);
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
}

// ── Preflight ────────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/health`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET /health → ${res.status}`);
  } catch (err) {
    console.error('\n\x1b[31mCannot reach the API for verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/health`);
    console.error(`  Reason: ${err instanceof Error ? err.message : String(err)}\n`);
    console.error('  Start the dependencies first:');
    console.error('    pnpm db:up');
    console.error('    pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api build && COURT_IMAGE_STORAGE=local node apps/api/dist/main.js\n');
    process.exit(2);
  }
}

// ── Recursive scan helpers (Testing §12) ────────────────────────────────────────────

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

function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, acc);
  return acc;
}

function collectNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === 'number') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value as Record<string, unknown>)) collectNumbers(v, acc);
  return acc;
}

// ── Main ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('TASK_73 — admin courts API verification');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  await cleanup();

  // ═══ Phase 0 — CLI bootstrap (Testing §13) ════════════════════════════════════════
  console.log('\n── CLI bootstrap (admin-user.ts) ─────────────────────────────────');
  {
    const shortPwEmail = adminEmail('cli-shortpw');
    process.env.ADMIN_PASSWORD = 'tooshort1'; // 9 chars, < 12
    let threw = false;
    let message = '';
    try {
      await createAdmin({ email: shortPwEmail });
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    delete process.env.ADMIN_PASSWORD;
    expectTrue('CLI admin:create: password shorter than 12 chars fails', threw, message);
    const neverCreated = await prisma.adminUser.findUnique({ where: { email: shortPwEmail } });
    expectTrue('CLI admin:create: no row created on password-policy failure', neverCreated === null);

    const goodEmail = adminEmail('cli-created');
    process.env.ADMIN_PASSWORD = 'a-genuinely-long-password-1';
    let created = false;
    try {
      await createAdmin({ email: goodEmail, role: 'admin' });
      created = true;
    } catch (err) {
      created = false;
      console.log('    unexpected error:', err);
    }
    delete process.env.ADMIN_PASSWORD;
    expectTrue('CLI admin:create: ADMIN_PASSWORD set creates the AdminUser', created);

    const row = await prisma.adminUser.findUnique({ where: { email: goodEmail } });
    expectTrue(
      'CLI admin:create: stored passwordHash uses the scrypt$ format',
      !!row && row.passwordHash.startsWith('scrypt$'),
    );
    if (row) {
      const okReal = await verifyAdminPassword('a-genuinely-long-password-1', row.passwordHash);
      const okWrong = await verifyAdminPassword('a-totally-different-password', row.passwordHash);
      expectTrue('CLI admin:create: stored hash verifies the real password', okReal);
      expectTrue('CLI admin:create: stored hash rejects a wrong password', !okWrong);
    }

    process.env.ADMIN_PASSWORD = 'another-long-enough-password-2';
    let dupThrew = false;
    try {
      await createAdmin({ email: goodEmail, role: 'admin' });
    } catch {
      dupThrew = true;
    }
    delete process.env.ADMIN_PASSWORD;
    expectTrue('CLI admin:create: duplicate email fails', dupThrew);

    const prodGuardEmail = adminEmail('cli-prodguard');
    process.env.ADMIN_PASSWORD = 'a-genuinely-long-password-3';
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let refusedInProd = false;
    try {
      await createAdmin({ email: prodGuardEmail });
    } catch {
      refusedInProd = true;
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      delete process.env.ADMIN_PASSWORD;
    }
    expectTrue('CLI admin:create: refuses under NODE_ENV=production without --yes-i-am-sure', refusedInProd);
    const neverCreatedProd = await prisma.adminUser.findUnique({ where: { email: prodGuardEmail } });
    expectTrue('CLI admin:create: no row created by the refused production attempt', neverCreatedProd === null);

    // admin:set-password exercised too, reusing the already-created row.
    process.env.ADMIN_PASSWORD = 'yet-another-long-password-4';
    await setPassword({ email: goodEmail });
    delete process.env.ADMIN_PASSWORD;
    const rotated = await prisma.adminUser.findUnique({ where: { email: goodEmail } });
    const rotatedOk = !!rotated && (await verifyAdminPassword('yet-another-long-password-4', rotated.passwordHash));
    expectTrue('CLI admin:set-password: rotates the password', rotatedOk);
  }

  // ═══ Phase 1 — fixtures + all logins needed BEFORE the login-rate-limit block ═════
  console.log('\n── Fixtures ───────────────────────────────────────────────────────');
  const { countryId, regionId } = await ensureFixtureCountryRegion();

  const MAIN_PW = 'main-admin-password-123';
  const ROLE_PW = 'role-admin-password-123';
  const ROLECHANGE_PW = 'rolechange-admin-password-123';
  const UPLOADRL_PW = 'uploadrl-admin-password-123';
  const DELETEME_PW = 'deleteme-admin-password-123';

  await createFixtureAdmin('main', MAIN_PW, 'admin');
  await createFixtureAdmin('role', ROLE_PW, 'editor');
  await createFixtureAdmin('rolechange', ROLECHANGE_PW, 'admin');
  await createFixtureAdmin('uploadrl', UPLOADRL_PW, 'admin');
  await createFixtureAdmin('deleteme', DELETEME_PW, 'admin');

  const main = await loginAdmin(adminEmail('main'), MAIN_PW);
  const roleSession = await loginAdmin(adminEmail('role'), ROLE_PW);
  const roleChangeSession = await loginAdmin(adminEmail('rolechange'), ROLECHANGE_PW);
  const uploadRlSession = await loginAdmin(adminEmail('uploadrl'), UPLOADRL_PW);
  const deleteMeSession = await loginAdmin(adminEmail('deleteme'), DELETEME_PW);
  console.log('All fixture admin logins succeeded (minted before the rate-limit test block).');

  // ═══ Testing §2 — token separation ════════════════════════════════════════════════
  console.log('\n── Token separation ───────────────────────────────────────────────');
  {
    const userShapedTokenWithAdminAud = signJwt(
      { sub: 'fake-user-id', email: 'nobody@tennis.test' },
      USER_JWT_SECRET,
      { expiresInSeconds: 3600, audience: 'tennis-admin' },
    );
    const res1 = await adminFetch('/admin/auth/me', { token: userShapedTokenWithAdminAud });
    expectTrue('user-secret token (even with aud=tennis-admin) on /v1/admin/me → 401', res1.status === 401, `got ${res1.status}`);

    const adminTokenOnUserMe = await fetch(`${API_BASE}/me`, {
      headers: { accept: 'application/json', authorization: `Bearer ${main.token}` },
    });
    expectTrue('admin token on GET /v1/me → 401', adminTokenOnUserMe.status === 401, `got ${adminTokenOnUserMe.status}`);

    const adminTokenOnReviews = await fetch(`${API_BASE}/reviews`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${main.token}`,
      },
      body: JSON.stringify({ courtId: 'whatever', rating: 5 }),
    });
    expectTrue('admin token on POST /v1/reviews → 401', adminTokenOnReviews.status === 401, `got ${adminTokenOnReviews.status}`);

    const wrongAud = signJwt({ sub: 'whatever', email: 'whatever@tennis.test' }, ADMIN_JWT_SECRET, {
      expiresInSeconds: 3600,
      audience: 'not-tennis-admin',
    });
    const res2 = await adminFetch('/admin/auth/me', { token: wrongAud });
    expectTrue('admin-secret token with WRONG aud → 401', res2.status === 401, `got ${res2.status}`);

    const missingAud = signJwt({ sub: 'whatever', email: 'whatever@tennis.test' }, ADMIN_JWT_SECRET, {
      expiresInSeconds: 3600,
    });
    const res3 = await adminFetch('/admin/auth/me', { token: missingAud });
    expectTrue('admin-secret token with MISSING aud → 401', res3.status === 401, `got ${res3.status}`);

    const expired = signJwt({ sub: 'whatever', email: 'whatever@tennis.test' }, ADMIN_JWT_SECRET, {
      expiresInSeconds: -3600,
      audience: 'tennis-admin',
    });
    const res4 = await adminFetch('/admin/auth/me', { token: expired });
    expectTrue('expired admin token → 401', res4.status === 401, `got ${res4.status}`);

    const beforeDelete = await adminFetch('/admin/auth/me', { token: deleteMeSession.token });
    expectTrue('valid admin token works before the row is deleted', beforeDelete.status === 200, `got ${beforeDelete.status}`);
    await prisma.adminUser.deleteMany({ where: { email: adminEmail('deleteme') } });
    const afterDelete = await adminFetch('/admin/auth/me', { token: deleteMeSession.token });
    expectTrue('the SAME token → 401 once the AdminUser row is deleted', afterDelete.status === 401, `got ${afterDelete.status}`);

    const beforeRole = await adminFetch('/admin/courts?pageSize=1', { token: roleChangeSession.token });
    expectTrue('role=admin: GET /v1/admin/courts → 200', beforeRole.status === 200, `got ${beforeRole.status}`);
    await prisma.adminUser.update({ where: { email: adminEmail('rolechange') }, data: { role: 'editor' } });
    const afterRoleCourts = await adminFetch('/admin/courts?pageSize=1', { token: roleChangeSession.token });
    expectTrue(
      'role changed admin→editor: the SAME token now 403s on /v1/admin/courts',
      afterRoleCourts.status === 403,
      `got ${afterRoleCourts.status}`,
    );
    const afterRoleMe = await adminFetch('/admin/auth/me', { token: roleChangeSession.token });
    expectTrue('role changed admin→editor: the SAME token still 200s on GET /v1/admin/me', afterRoleMe.status === 200, `got ${afterRoleMe.status}`);

    const unauthRoutes: { method: string; path: string }[] = [
      { method: 'POST', path: '/admin/auth/logout' },
      { method: 'GET', path: '/admin/auth/me' },
      { method: 'GET', path: '/admin/courts' },
      { method: 'GET', path: '/admin/courts/x' },
      { method: 'POST', path: '/admin/courts' },
      { method: 'PATCH', path: '/admin/courts/x' },
      { method: 'GET', path: '/admin/countries' },
      { method: 'POST', path: '/admin/countries' },
      { method: 'POST', path: '/admin/regions' },
      { method: 'POST', path: '/admin/courts/x/images' },
      { method: 'PATCH', path: '/admin/courts/x/images/y' },
      { method: 'PUT', path: '/admin/courts/x/images/order' },
      { method: 'DELETE', path: '/admin/courts/x/images/y' },
    ];
    for (const route of unauthRoutes) {
      const res = await adminFetch(route.path, { method: route.method, json: route.method === 'GET' ? undefined : {} });
      expectTrue(`${route.method} ${route.path} unauthenticated → 401`, res.status === 401, `got ${res.status}`);
    }

    // Roles-guard default-deny, unit-level (decision: a route with the auth guard but no
    // @AdminRoles metadata is rejected). Mock Reflector returning undefined metadata.
    const fakeReflector = { getAllAndOverride: () => undefined } as unknown as import('@nestjs/core').Reflector;
    const guard = new AdminRolesGuard(fakeReflector);
    const fakeContext = {
      getHandler: () => function unlabeledHandler(): void {},
      getClass: () => class UnlabeledController {},
      switchToHttp: () => ({ getRequest: () => ({ admin: { adminId: 'x', email: 'x', role: 'admin' } }) }),
    } as unknown as import('@nestjs/common').ExecutionContext;
    let guardThrew = false;
    try {
      guard.canActivate(fakeContext);
    } catch (err) {
      guardThrew = err instanceof ForbiddenException;
    }
    expectTrue('AdminRolesGuard (unit): a route with no @AdminRoles metadata is rejected (default-deny)', guardThrew);
  }

  // ═══ Testing §4 — CSRF ════════════════════════════════════════════════════════════
  console.log('\n── CSRF ───────────────────────────────────────────────────────────');
  let csrfTestCourtId: string;
  {
    const createRes = await adminFetch('/admin/courts', {
      method: 'POST',
      cookie: main.cookie,
      json: baseCourtPayload('csrf-fixture', countryId, regionId),
    });
    expectTrue(
      'cookie-authed POST without X-Tennis-Admin → 403',
      createRes.status === 403,
      `got ${createRes.status} body=${JSON.stringify(createRes.body)}`,
    );

    const createOkRes = await adminFetch('/admin/courts', {
      method: 'POST',
      cookie: main.cookie,
      csrf: true,
      json: baseCourtPayload('csrf-fixture', countryId, regionId),
    });
    expectTrue('cookie-authed POST WITH X-Tennis-Admin → ok (201)', createOkRes.status === 201, `got ${createOkRes.status}`);
    csrfTestCourtId = (createOkRes.body as { id: string }).id;

    const patchNoHeader = await adminFetch(`/admin/courts/${csrfTestCourtId}`, {
      method: 'PATCH',
      cookie: main.cookie,
      json: { isFeatured: true },
    });
    expectTrue('cookie-authed PATCH without X-Tennis-Admin → 403', patchNoHeader.status === 403, `got ${patchNoHeader.status}`);

    const bearerNoHeader = await adminFetch(`/admin/courts/${csrfTestCourtId}`, {
      method: 'PATCH',
      token: main.token,
      json: { isFeatured: true },
    });
    expectTrue('BEARER-authed PATCH without X-Tennis-Admin → ok (CSRF exempt)', bearerNoHeader.status === 200, `got ${bearerNoHeader.status}`);

    const getNoHeader = await adminFetch(`/admin/courts/${csrfTestCourtId}`, { cookie: main.cookie });
    expectTrue('GET never needs X-Tennis-Admin', getNoHeader.status === 200, `got ${getNoHeader.status}`);
  }

  // ═══ Testing §5 — Courts CRUD + validation, §6 — mapLinkUrl, §7 — publish gate ══════
  console.log('\n── Courts CRUD, validation, mapLinkUrl, publish gate ──────────────');
  let mainCourtId: string;
  let mainCourtSlug: string;
  {
    const before = await prisma.court.aggregate({ _max: { seedOrder: true } });
    const expectedSeedOrder = (before._max.seedOrder ?? -1) + 1;

    const createRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), name: 'F73 Château Fixturé Ô' },
    });
    expectTrue('create draft (no slug) → 201', createRes.status === 201, `got ${createRes.status} ${JSON.stringify(createRes.body)}`);
    const created = createRes.body as {
      id: string;
      slug: string;
      status: string;
      approxLat: number;
      approxLng: number;
      mapX: number;
      mapY: number;
      seedOrder: number;
      tags: string[];
    };
    mainCourtId = created.id;
    mainCourtSlug = created.slug;

    expectTrue('auto-generated slug is de-diacritised + url-safe', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(created.slug), created.slug);
    expectTrue('created court defaults to status=draft', created.status === 'draft', created.status);
    expectTrue('derived fields present (approxLat/approxLng/mapX/mapY)', typeof created.approxLat === 'number' && typeof created.mapX === 'number');
    expectTrue('seedOrder = previous max + 1', created.seedOrder === expectedSeedOrder, `expected ${expectedSeedOrder} got ${created.seedOrder}`);

    const dupRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), slug: created.slug },
    });
    expectTrue('duplicate slug → 409', dupRes.status === 409, `got ${dupRes.status}`);

    for (const bad of [
      { lat: 91, lng: 10 },
      { lat: 0, lng: 0 },
      { lat: 'not-a-number' as unknown as number, lng: 10 },
    ]) {
      const badRes = await adminFetch('/admin/courts', {
        method: 'POST',
        token: main.token,
        json: { ...baseCourtPayload(undefined, countryId, regionId), ...bad },
      });
      expectTrue(`bad lat/lng ${JSON.stringify(bad)} → 400`, badRes.status === 400, `got ${badRes.status}`);
    }

    const unknownTagRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), tags: ['Not A Real Tag'] },
    });
    expectTrue('unknown tag → 400', unknownTagRes.status === 400, `got ${unknownTagRes.status}`);

    const canonicalTagRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), tags: ['Historic', 'Sea View'] },
    });
    const canonicalBody = canonicalTagRes.body as { tags: string[] };
    expectTrue(
      'tags stored/returned in canonical vocabulary order',
      JSON.stringify(canonicalBody.tags) === JSON.stringify(['Sea View', 'Historic']),
      JSON.stringify(canonicalBody.tags),
    );

    const { regionId: otherRegionId } = await ensureSecondFixtureCountryRegion();
    const mismatchRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), regionId: otherRegionId },
    });
    expectTrue('region from another country → 400', mismatchRes.status === 400, `got ${mismatchRes.status}`);

    const extraFieldRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: { ...baseCourtPayload(undefined, countryId, regionId), approxLat: 1, seedOrder: 999, id: 'nope' },
    });
    expectTrue('extra derived field (approxLat/seedOrder/id) in create body → 400', extraFieldRes.status === 400, `got ${extraFieldRes.status}`);

    // PATCH name only → approx UNCHANGED.
    const detailBefore = await adminFetch(`/admin/courts/${mainCourtId}`, { token: main.token });
    const beforeApprox = detailBefore.body as { approxLat: number; approxLng: number };
    const patchNameRes = await adminFetch(`/admin/courts/${mainCourtId}`, {
      method: 'PATCH',
      token: main.token,
      json: { name: 'Renamed Fixture' },
    });
    const afterNameApprox = patchNameRes.body as { approxLat: number; approxLng: number; name: string };
    expectTrue('PATCH name only → 200', patchNameRes.status === 200, `got ${patchNameRes.status}`);
    expectTrue('PATCH name only does NOT change approx', afterNameApprox.approxLat === beforeApprox.approxLat && afterNameApprox.approxLng === beforeApprox.approxLng);

    // PATCH lat/lng → approx CHANGES.
    const patchLatLngRes = await adminFetch(`/admin/courts/${mainCourtId}`, {
      method: 'PATCH',
      token: main.token,
      json: { lat: 50.1, lng: 14.4 },
    });
    const afterLatLng = patchLatLngRes.body as { approxLat: number; approxLng: number; lat: number; lng: number };
    expectTrue('PATCH lat/lng → 200', patchLatLngRes.status === 200, `got ${patchLatLngRes.status}`);
    const expectedApprox = approxFromExact(50.1, 14.4, mainCourtSlug);
    expectTrue(
      'PATCH lat/lng DOES recompute approx (matches approxFromExact)',
      afterLatLng.approxLat === expectedApprox.approxLat && afterLatLng.approxLng === expectedApprox.approxLng,
      `got ${afterLatLng.approxLat},${afterLatLng.approxLng} expected ${expectedApprox.approxLat},${expectedApprox.approxLng}`,
    );
    expectTrue('PATCH lat/lng did NOT change approx by coincidence (differs from the pre-PATCH value)', afterLatLng.approxLat !== beforeApprox.approxLat || afterLatLng.approxLng !== beforeApprox.approxLng);

    // mapLinkUrl validation (Testing §6).
    const goodMapLinks = [
      'https://google.com/maps?q=1,1',
      'https://maps.google.com/?q=1,1',
      'https://maps.app.goo.gl/abc123',
      'https://www.google.com/maps/place/x',
      'https://goo.gl/maps/abc123',
    ];
    for (const link of goodMapLinks) {
      const r = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: link } });
      expectTrue(`mapLinkUrl accepted: ${link}`, r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);
    }
    const badMapLinks = [
      'http://google.com/maps',
      'javascript:alert(1)',
      'https://evil.example/maps',
      'https://www.google.com.evil.example/maps',
      'https://user:pw@www.google.com/maps',
      `https://google.com/maps?x=${'a'.repeat(2001)}`,
    ];
    for (const link of badMapLinks) {
      const r = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: link } });
      expectTrue(`mapLinkUrl rejected (400): ${link.slice(0, 60)}…`, r.status === 400, `got ${r.status}`);
    }
    const clearRes = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: null } });
    const cleared = clearRes.body as { mapLinkUrl: string | null };
    expectTrue('mapLinkUrl: null clears the field', clearRes.status === 200 && cleared.mapLinkUrl === null, `got ${JSON.stringify(cleared.mapLinkUrl)}`);

    // TASK_75 decision 3 — tightened path rules per host (closes Google's own
    // /url open-redirect endpoint, which TASK_73's first pass let through).
    const tightenedGoodMapLinks = [
      'https://www.google.com/maps/place/Foo/@45.4,9.1,15z',
      'https://google.com/maps?q=45.4,9.1',
      'https://maps.google.com/?q=45.4,9.1',
      'https://maps.google.com/maps?ll=45.4,9.1',
      'https://goo.gl/maps/abc123',
      'https://maps.app.goo.gl/AbCd1234',
    ];
    for (const link of tightenedGoodMapLinks) {
      const r = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: link } });
      expectTrue(`mapLinkUrl (TASK_75) accepted: ${link}`, r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);
    }
    const tightenedBadMapLinks = [
      'https://www.google.com/url?q=https://evil.example',
      'https://google.com/search?q=x',
      'https://www.google.com/mapsfoo',
      'https://maps.google.com/url?q=https://evil.example',
      'https://goo.gl/abc',
      'https://www.google.com:8443/maps',
    ];
    for (const link of tightenedBadMapLinks) {
      const r = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: link } });
      expectTrue(`mapLinkUrl (TASK_75) rejected (400): ${link}`, r.status === 400, `got ${r.status}`);
    }
    await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { mapLinkUrl: null } });

    // Publish gate (Testing §7) — no image yet.
    const publishNoImageRes = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'published' } });
    expectTrue('publish with no image → 422', publishNoImageRes.status === 422, `got ${publishNoImageRes.status}`);
    const missingNoImage = (publishNoImageRes.body as { missing?: string[] }).missing ?? [];
    expectTrue('422 body lists "image" as missing', missingNoImage.includes('image'), JSON.stringify(missingNoImage));

    // Upload one hero image, but leave blurb empty, then try to publish again.
    const uploadRes = await adminFetch(`/admin/courts/${mainCourtId}/images`, {
      method: 'POST',
      token: main.token,
      form: uploadForm(TINY_JPEG, 'hero.jpg', 'Hero shot'),
    });
    expectTrue('upload a JPEG for the publish-gate court → 201', uploadRes.status === 201, `got ${uploadRes.status}`);
    const heroImage = uploadRes.body as { isHero: boolean };
    expectTrue('first uploaded image becomes the hero automatically', heroImage.isHero === true);

    const publishNoBlurbRes = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'published', blurb: '   ' } });
    expectTrue('publish with image but empty blurb → 422', publishNoBlurbRes.status === 422, `got ${publishNoBlurbRes.status}`);
    const missingNoBlurb = (publishNoBlurbRes.body as { missing?: string[] }).missing ?? [];
    expectTrue('422 body lists "blurb" as missing', missingNoBlurb.includes('blurb'), JSON.stringify(missingNoBlurb));

    const publishOkRes = await adminFetch(`/admin/courts/${mainCourtId}`, {
      method: 'PATCH',
      token: main.token,
      json: { status: 'published', blurb: 'A lovely fixture court for verification.' },
    });
    expectTrue('publish after fixing every requirement → 200', publishOkRes.status === 200, `got ${publishOkRes.status} ${JSON.stringify(publishOkRes.body)}`);

    const [inList, inDetail, inMap, inCountries] = await Promise.all([
      publicFetch('/courts'),
      publicFetch(`/courts/${mainCourtSlug}`),
      publicFetch('/courts/map'),
      publicFetch('/countries'),
    ]);
    expectTrue('published fixture appears in GET /v1/courts', (inList.body as { slug: string }[]).some((c) => c.slug === mainCourtSlug));
    expectTrue('published fixture appears in GET /v1/courts/:slug', inDetail.status === 200, `got ${inDetail.status}`);
    expectTrue('published fixture appears in GET /v1/courts/map', (inMap.body as { slug: string }[]).some((c) => c.slug === mainCourtSlug));
    expectTrue('fixture country appears in GET /v1/countries once it has a published court', (inCountries.body as { name: string }[]).some((c) => c.name === FIXTURE_COUNTRY_NAME));

    // Slug change on a published court → 409.
    const slugChangeRes = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { slug: `${mainCourtSlug}-renamed` } });
    expectTrue('slug change on a PUBLISHED court → 409', slugChangeRes.status === 409, `got ${slugChangeRes.status}`);

    // A user saves the published fixture, then we unpublish it.
    const savedUser = await createAndSignInUser('saved-visibility');
    const saveRes = await fetch(`${API_BASE}/me/saved-courts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${savedUser.token}` },
      body: JSON.stringify({ courtId: mainCourtId }),
    });
    expectTrue('fixture user can save the published fixture court', saveRes.status === 201, `got ${saveRes.status}`);

    const unpublishRes = await adminFetch(`/admin/courts/${mainCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'draft' } });
    expectTrue('set back to draft → 200', unpublishRes.status === 200, `got ${unpublishRes.status}`);

    const [listAfter, detailAfter, mapAfter, savedAfter] = await Promise.all([
      publicFetch('/courts'),
      fetch(`${API_BASE}/courts/${mainCourtSlug}`, { headers: { accept: 'application/json' } }),
      publicFetch('/courts/map'),
      fetch(`${API_BASE}/me/saved-courts`, { headers: { accept: 'application/json', authorization: `Bearer ${savedUser.token}` } }),
    ]);
    expectTrue('unpublished fixture disappears from GET /v1/courts', !(listAfter.body as { slug: string }[]).some((c) => c.slug === mainCourtSlug));
    expectTrue('unpublished fixture 404s on GET /v1/courts/:slug', detailAfter.status === 404, `got ${detailAfter.status}`);
    expectTrue('unpublished fixture disappears from GET /v1/courts/map', !(mapAfter.body as { slug: string }[]).some((c) => c.slug === mainCourtSlug));
    const savedAfterBody = (await savedAfter.json().catch(() => [])) as { slug: string }[];
    expectTrue("unpublished fixture disappears from the saving user's GET /v1/me/saved-courts", !savedAfterBody.some((c) => c.slug === mainCourtSlug));

    // pageSize / q / status filters, drafts appear in the admin list.
    const pageSizeRes = await adminFetch('/admin/courts?pageSize=101', { token: main.token });
    expectTrue('pageSize=101 → 400', pageSizeRes.status === 400, `got ${pageSizeRes.status}`);

    const qRes = await adminFetch(`/admin/courts?q=${encodeURIComponent('Renamed Fixture')}`, { token: main.token });
    expectTrue('q filter finds the renamed fixture', (qRes.body as { items: { id: string }[] }).items.some((i) => i.id === mainCourtId));

    const statusRes = await adminFetch('/admin/courts?status=draft', { token: main.token });
    expectTrue('status=draft filter includes the (now draft) fixture', (statusRes.body as { items: { id: string }[] }).items.some((i) => i.id === mainCourtId));
    expectTrue('drafts appear in the admin list', (statusRes.body as { items: { status: string }[] }).items.every((i) => i.status === 'draft'));
  }

  // ═══ TASK_76 Testing §1 — mapLinkUrl host-allowlist prototype-chain bypass ════════
  console.log('\n── mapLinkUrl validator: prototype-chain bypass (TASK_76) ─────────');
  {
    const valPw = 'validator-bypass-password-123';
    const valEmail = await createFixtureAdmin('validator-bypass', valPw, 'admin');
    const valSession = await loginAdmin(valEmail, valPw);
    const valCourtRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: valSession.token,
      json: baseCourtPayload('validator-bypass', countryId, regionId),
    });
    const valCourtId = (valCourtRes.body as { id: string }).id;

    // Hostnames that name an `Object.prototype` member: before TASK_76,
    // `HOST_PATH_RULES[hostname]` on a plain object resolved these through the
    // prototype chain — `constructor` to `Object` (a truthy function, so ANY
    // path was accepted) and `__proto__`/`hasOwnProperty`/etc. either resolved
    // to a non-function (falling through to the normal 400) or, for
    // `__proto__`, threw a raw `TypeError` that surfaced as an uncaught 500.
    const bypassUrls = [
      'https://constructor/x',
      'https://toString/x',
      'https://valueOf/x',
      'https://hasOwnProperty/x',
      'https://__proto__/x',
      'https://prototype/x',
      'https://constructor/maps',
    ];

    for (const url of bypassUrls) {
      // Directly against the function — must throw BadRequestException, never
      // a raw TypeError and never a silent accept.
      let threw: unknown;
      let returned: string | null | undefined;
      try {
        returned = validateMapLinkUrl(url);
      } catch (err) {
        threw = err;
      }
      expectTrue(
        `validateMapLinkUrl(${JSON.stringify(url)}) throws BadRequestException directly`,
        threw instanceof BadRequestException,
        threw === undefined ? `did not throw — returned ${JSON.stringify(returned)}` : `threw ${String(threw)}`,
      );

      // Through the real endpoint — must be 400, never 200 and never 500.
      // eslint-disable-next-line no-await-in-loop
      const r = await adminFetch(`/admin/courts/${valCourtId}`, {
        method: 'PATCH',
        token: valSession.token,
        json: { mapLinkUrl: url },
      });
      expectTrue(`PATCH mapLinkUrl=${JSON.stringify(url)} -> 400 (never 200, never 500)`, r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);
    }
  }

  // ═══ TASK_76 Testing §2 — publish vs. image-delete race (row lock) ═══════════════
  console.log('\n── Publish vs. image-delete race (row lock) ────────────────────────');
  {
    const RACE_RUNS = 8;
    const outcomes: string[] = [];
    for (let run = 0; run < RACE_RUNS; run++) {
      const pw = `race-${run}-password-123`;
      // eslint-disable-next-line no-await-in-loop
      const raceEmail = await createFixtureAdmin(`race-${run}`, pw, 'admin');
      // eslint-disable-next-line no-await-in-loop
      const raceSession = await loginAdmin(raceEmail, pw);

      // eslint-disable-next-line no-await-in-loop
      const createRes = await adminFetch('/admin/courts', {
        method: 'POST',
        token: raceSession.token,
        json: { ...baseCourtPayload(`race-${run}`, countryId, regionId), blurb: 'Race fixture blurb.' },
      });
      const raceCourtId = (createRes.body as { id: string }).id;

      // eslint-disable-next-line no-await-in-loop
      const uploadRes = await adminFetch(`/admin/courts/${raceCourtId}/images`, {
        method: 'POST',
        token: raceSession.token,
        form: uploadForm(TINY_JPEG, 'hero.jpg'),
      });
      const raceImageId = (uploadRes.body as { id: string }).id;

      // Fire both requests in parallel: PATCH { status: 'published' } and
      // DELETE of the court's only image. Without the row lock in
      // `AdminCourtsService.update`, both could read "1 image, 1 hero" before
      // either writes, letting the publish commit a court with zero images.
      // eslint-disable-next-line no-await-in-loop
      const [publishRes, deleteRes] = await Promise.all([
        adminFetch(`/admin/courts/${raceCourtId}`, { method: 'PATCH', token: raceSession.token, json: { status: 'published' } }),
        adminFetch(`/admin/courts/${raceCourtId}/images/${raceImageId}`, { method: 'DELETE', token: raceSession.token }),
      ]);

      const outcome = `publish=${publishRes.status} delete=${deleteRes.status}`;
      outcomes.push(outcome);
      const validOutcome =
        (publishRes.status === 200 && deleteRes.status === 409) ||
        (deleteRes.status === 204 && publishRes.status === 422);
      expectTrue(
        `race run ${run + 1}/${RACE_RUNS}: publish-vs-delete never both succeed (${outcome})`,
        validOutcome,
        `publish=${JSON.stringify(publishRes.body)} delete=${JSON.stringify(deleteRes.body)}`,
      );

      // eslint-disable-next-line no-await-in-loop
      const freshRow = await prisma.court.findUnique({ where: { id: raceCourtId }, include: { images: true } });
      // TASK_81 — always record this check (not only when the publish side of
      // the race wins) so two consecutive runs report the SAME total check
      // count. When the court did not end up published there is nothing to
      // violate the invariant, so it passes trivially under a name that says so.
      if (freshRow?.status === 'published') {
        const heroCount = freshRow.images.filter((i) => i.isHero).length;
        expectTrue(
          `race run ${run + 1}/${RACE_RUNS}: the published outcome (if any) has >= 1 image and exactly 1 hero`,
          freshRow.images.length >= 1 && heroCount === 1,
          `images=${JSON.stringify(freshRow.images)}`,
        );
      } else {
        expectTrue(
          `race run ${run + 1}/${RACE_RUNS}: the published outcome (if any) has >= 1 image and exactly 1 hero`,
          true,
        );
      }
    }
    console.log(`  race outcomes (${RACE_RUNS} runs): ${JSON.stringify(outcomes)}`);
  }

  // ═══ TASK_78 Testing §1 — lost update (concurrent PATCH of different fields) ══════
  console.log('\n── Lost update: concurrent PATCH of different fields ───────────────');
  {
    const LOST_UPDATE_RUNS = 8;
    for (let run = 0; run < LOST_UPDATE_RUNS; run++) {
      // eslint-disable-next-line no-await-in-loop
      const createRes = await adminFetch('/admin/courts', {
        method: 'POST',
        token: main.token,
        json: baseCourtPayload(`lost-update-${run}`, countryId, regionId),
      });
      const lostUpdateCourtId = (createRes.body as { id: string }).id;

      const newName = `F73 Lost Update Name ${run}`;
      const newBlurb = `Lost update blurb ${run}.`;

      // Two admins (or two tabs) patching DIFFERENT fields at the same moment.
      // Without re-reading inside the lock, both read the same pre-lock
      // snapshot and the later writer overwrites the other's field with the
      // stale value.
      // eslint-disable-next-line no-await-in-loop
      const [nameRes, blurbRes] = await Promise.all([
        adminFetch(`/admin/courts/${lostUpdateCourtId}`, { method: 'PATCH', token: main.token, json: { name: newName } }),
        adminFetch(`/admin/courts/${lostUpdateCourtId}`, { method: 'PATCH', token: main.token, json: { blurb: newBlurb } }),
      ]);
      expectTrue(
        `lost-update run ${run + 1}/${LOST_UPDATE_RUNS}: both concurrent PATCHes return 200`,
        nameRes.status === 200 && blurbRes.status === 200,
        `name=${nameRes.status} blurb=${blurbRes.status}`,
      );

      // eslint-disable-next-line no-await-in-loop
      const finalRes = await adminFetch(`/admin/courts/${lostUpdateCourtId}`, { token: main.token });
      const finalBody = finalRes.body as { name: string; blurb: string };
      expectTrue(
        `lost-update run ${run + 1}/${LOST_UPDATE_RUNS}: final row has BOTH new name AND new blurb (no lost update)`,
        finalBody.name === newName && finalBody.blurb === newBlurb,
        `expected name=${JSON.stringify(newName)} blurb=${JSON.stringify(newBlurb)}, got name=${JSON.stringify(finalBody.name)} blurb=${JSON.stringify(finalBody.blurb)}`,
      );
    }
  }

  // ═══ TASK_78 Testing §2 — slug race (concurrent publish vs. slug change) ═════════
  console.log('\n── Slug race: concurrent publish vs. slug change ───────────────────');
  {
    const SLUG_RACE_RUNS = 8;
    const slugRaceOutcomes: string[] = [];
    for (let run = 0; run < SLUG_RACE_RUNS; run++) {
      // eslint-disable-next-line no-await-in-loop
      const createRes = await adminFetch('/admin/courts', {
        method: 'POST',
        token: main.token,
        json: { ...baseCourtPayload(`slug-race-${run}`, countryId, regionId), blurb: 'Slug race fixture blurb.' },
      });
      const created = createRes.body as { id: string; slug: string };
      const raceCourtId = created.id;
      const originalSlug = created.slug;

      // One hero image so the publish gate is satisfiable.
      // eslint-disable-next-line no-await-in-loop
      await adminFetch(`/admin/courts/${raceCourtId}/images`, {
        method: 'POST',
        token: main.token,
        form: uploadForm(TINY_JPEG, 'hero.jpg'),
      });

      const newSlug = slug(`slug-race-${run}-renamed`);
      // eslint-disable-next-line no-await-in-loop
      const [publishRes, slugRes] = await Promise.all([
        adminFetch(`/admin/courts/${raceCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'published' } }),
        adminFetch(`/admin/courts/${raceCourtId}`, { method: 'PATCH', token: main.token, json: { slug: newSlug } }),
      ]);

      // eslint-disable-next-line no-await-in-loop
      const finalDetailRes = await adminFetch(`/admin/courts/${raceCourtId}`, { token: main.token });
      const finalBody = finalDetailRes.body as { slug: string; status: string };
      const publishBody = publishRes.body as { slug?: string };
      const outcome = `publish=${publishRes.status} slug=${slugRes.status} finalSlug=${finalBody.slug === newSlug ? 'new' : 'old'}`;
      slugRaceOutcomes.push(outcome);

      // The one invariant that must NEVER happen, regardless of lock timing:
      // the slug-change returned 200 AND the publish response still carries
      // the OLD slug AND the final status is published — i.e. the slug
      // changed after the publish had already committed under it.
      const brokenInvariant =
        slugRes.status === 200 && publishBody.slug === originalSlug && finalBody.status === 'published';
      expectTrue(
        `slug-race run ${run + 1}/${SLUG_RACE_RUNS}: slug never changes after publication has committed (${outcome})`,
        !brokenInvariant,
        `publish=${JSON.stringify(publishRes.body)} slug=${JSON.stringify(slugRes.body)} final=${JSON.stringify(finalBody)}`,
      );

      // The two valid serial orders: {publish 200, slug 409, slug unchanged}
      // or {slug 200, publish 200 with the new slug}.
      const validOutcome =
        (publishRes.status === 200 && slugRes.status === 409 && finalBody.slug === originalSlug) ||
        (slugRes.status === 200 && publishRes.status === 200 && finalBody.slug === newSlug);
      expectTrue(
        `slug-race run ${run + 1}/${SLUG_RACE_RUNS}: outcome is one of the two valid serial orders (${outcome})`,
        validOutcome,
        `publish=${JSON.stringify(publishRes.body)} slug=${JSON.stringify(slugRes.body)} final=${JSON.stringify(finalBody)}`,
      );
    }
    console.log(`  slug-race outcomes (${SLUG_RACE_RUNS} runs): ${JSON.stringify(slugRaceOutcomes)}`);
  }

  // ═══ Testing §8 — countries/regions ═════════════════════════════════════════════
  console.log('\n── Countries / regions ─────────────────────────────────────────────');
  {
    const isoLower = 'yz';
    const countryName = 'F73 Second Country';
    const createCountryRes = await adminFetch('/admin/countries', {
      method: 'POST',
      token: main.token,
      json: { name: countryName, isoCode: isoLower, continent: 'Europe' },
    });
    expectTrue('create country → 201', createCountryRes.status === 201, `got ${createCountryRes.status} ${JSON.stringify(createCountryRes.body)}`);
    const createdCountry = createCountryRes.body as { id: string; isoCode: string };
    expectTrue('isoCode is upper-cased by the server', createdCountry.isoCode === 'YZ', createdCountry.isoCode);

    const dupIsoRes = await adminFetch('/admin/countries', {
      method: 'POST',
      token: main.token,
      json: { name: 'Different Name Entirely', isoCode: 'yz', continent: 'Asia' },
    });
    expectTrue('duplicate isoCode (case-insensitive) → 409', dupIsoRes.status === 409, `got ${dupIsoRes.status}`);

    const dupNameRes = await adminFetch('/admin/countries', {
      method: 'POST',
      token: main.token,
      json: { name: countryName.toUpperCase(), isoCode: 'zq', continent: 'Asia' },
    });
    expectTrue('duplicate name (case-insensitive) → 409', dupNameRes.status === 409, `got ${dupNameRes.status}`);

    const badContinentRes = await adminFetch('/admin/countries', {
      method: 'POST',
      token: main.token,
      json: { name: 'F73 Bad Continent', isoCode: 'zx', continent: 'Narnia' },
    });
    expectTrue('bad continent → 400', badContinentRes.status === 400, `got ${badContinentRes.status}`);

    const createRegionRes = await adminFetch('/admin/regions', {
      method: 'POST',
      token: main.token,
      json: { countryId: createdCountry.id, name: 'F73 Shared Region Name', lat: 1, lng: 1 },
    });
    expectTrue('create region → 201', createRegionRes.status === 201, `got ${createRegionRes.status}`);

    const dupRegionRes = await adminFetch('/admin/regions', {
      method: 'POST',
      token: main.token,
      json: { countryId: createdCountry.id, name: 'f73 shared region name', lat: 2, lng: 2 },
    });
    expectTrue('duplicate region name within the SAME country (case-insensitive) → 409', dupRegionRes.status === 409, `got ${dupRegionRes.status}`);

    const sameNameOtherCountryRes = await adminFetch('/admin/regions', {
      method: 'POST',
      token: main.token,
      json: { countryId, name: 'F73 Shared Region Name', lat: 3, lng: 3 },
    });
    expectTrue('the SAME region name in a DIFFERENT country → 201 (OK)', sameNameOtherCountryRes.status === 201, `got ${sameNameOtherCountryRes.status}`);

    const beforePublicRes = await publicFetch('/countries');
    expectTrue(
      'a freshly-created EMPTY country is absent from public GET /v1/countries',
      !(beforePublicRes.body as { name: string }[]).some((c) => c.name === countryName),
    );

    const emptyCourtRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: {
        ...baseCourtPayload('second-country-court', createdCountry.id, (createRegionRes.body as { id: string }).id),
        status: 'draft',
      },
    });
    const emptyCourtId = (emptyCourtRes.body as { id: string }).id;
    const uploadForPublishRes = await adminFetch(`/admin/courts/${emptyCourtId}/images`, {
      method: 'POST',
      token: main.token,
      form: uploadForm(TINY_PNG, 'hero.png'),
    });
    expectTrue('upload image for second-country court → 201', uploadForPublishRes.status === 201, `got ${uploadForPublishRes.status}`);
    const publishSecondCountryRes = await adminFetch(`/admin/courts/${emptyCourtId}`, {
      method: 'PATCH',
      token: main.token,
      json: { status: 'published', blurb: 'Second country fixture court.' },
    });
    expectTrue('publish the second-country fixture court → 200', publishSecondCountryRes.status === 200, `got ${publishSecondCountryRes.status} ${JSON.stringify(publishSecondCountryRes.body)}`);

    const afterPublicRes = await publicFetch('/countries');
    expectTrue(
      'the SAME country is present in public GET /v1/countries once it has a published court',
      (afterPublicRes.body as { name: string }[]).some((c) => c.name === countryName),
    );

    const listCountriesRes = await adminFetch('/admin/countries', { token: main.token });
    const allCountries = listCountriesRes.body as { name: string }[];
    expectTrue('GET /v1/admin/countries lists ALL countries, not only ones with published courts', allCountries.some((c) => c.name === FIXTURE_COUNTRY_NAME));
  }

  // ═══ Testing §9 — images ═════════════════════════════════════════════════════════
  console.log('\n── Images ───────────────────────────────────────────────────────────');
  let imagesCourtId: string;
  let imagesCourtSlug: string;
  {
    const createRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: baseCourtPayload('images-fixture', countryId, regionId),
    });
    imagesCourtId = (createRes.body as { id: string }).id;
    imagesCourtSlug = (createRes.body as { slug: string }).slug;

    const jpgRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, { method: 'POST', token: main.token, form: uploadForm(TINY_JPEG, 'a.jpg') });
    expectTrue('upload jpg → 201', jpgRes.status === 201, `got ${jpgRes.status}`);
    const jpgImage = jpgRes.body as { id: string; isHero: boolean; url: string };
    expectTrue('first image is hero', jpgImage.isHero === true);

    const pngRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, { method: 'POST', token: main.token, form: uploadForm(TINY_PNG, 'b.png') });
    expectTrue('upload png (second image) → 201', pngRes.status === 201, `got ${pngRes.status}`);
    const pngImage = pngRes.body as { id: string; isHero: boolean };
    expectTrue('second image is NOT hero', pngImage.isHero === false);

    const webpRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, { method: 'POST', token: main.token, form: uploadForm(TINY_WEBP, 'c.webp') });
    expectTrue('upload webp → 201', webpRes.status === 201, `got ${webpRes.status}`);
    const webpImage = webpRes.body as { id: string; url: string };

    for (const [label, buf, name] of [
      ['HTML renamed .jpg', FAKE_HTML_AS_JPG, 'fake.jpg'],
      ['SVG', FAKE_SVG, 'fake.svg'],
      ['GIF', FAKE_GIF, 'fake.gif'],
      ['0-byte file', Buffer.alloc(0), 'empty.jpg'],
    ] as const) {
      const r = await adminFetch(`/admin/courts/${imagesCourtId}/images`, { method: 'POST', token: main.token, form: uploadForm(buf, name) });
      expectTrue(`upload ${label} → 415`, r.status === 415, `got ${r.status}`);
    }

    const oversized = Buffer.concat([TINY_JPEG, Buffer.alloc(8 * 1024 * 1024)]); // > 8 MB
    const oversizedRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, { method: 'POST', token: main.token, form: uploadForm(oversized, 'huge.jpg') });
    expectTrue('upload > 8 MB → 413', oversizedRes.status === 413, `got ${oversizedRes.status}`);

    const traversalRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, {
      method: 'POST',
      token: main.token,
      form: uploadForm(TINY_PNG, '../../x.png'),
    });
    expectTrue('upload with a path-traversal filename still succeeds (filename is ignored)', traversalRes.status === 201, `got ${traversalRes.status}`);
    const traversalImage = traversalRes.body as { url: string };
    expectTrue(
      "stored url is a uuid + sniffed ext under the court's own folder, NEVER the client's filename",
      new RegExp(`^/uploads/courts/${imagesCourtId}/[0-9a-f-]{36}\\.png$`).test(traversalImage.url),
      traversalImage.url,
    );

    const patchHeroRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${pngImage.id}`, { method: 'PATCH', token: main.token, json: { isHero: true } });
    expectTrue('PATCH isHero:true on a non-hero image → 200', patchHeroRes.status === 200, `got ${patchHeroRes.status}`);
    const detailAfterPromote = await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token });
    const imagesAfterPromote = (detailAfterPromote.body as { images: { id: string; isHero: boolean }[] }).images;
    const heroCountAfterPromote = imagesAfterPromote.filter((i) => i.isHero).length;
    expectTrue('PATCH isHero flips EXACTLY one image to hero', heroCountAfterPromote === 1 && imagesAfterPromote.find((i) => i.id === pngImage.id)?.isHero === true, JSON.stringify(imagesAfterPromote));

    const isHeroFalseRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${jpgImage.id}`, { method: 'PATCH', token: main.token, json: { isHero: false } });
    expectTrue('PATCH isHero:false → 400 (promote another image instead)', isHeroFalseRes.status === 400, `got ${isHeroFalseRes.status}`);

    const currentImages = (await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token })).body as { images: { id: string }[] };
    const ids = currentImages.images.map((i) => i.id);

    const missingIdRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/order`, { method: 'PUT', token: main.token, json: { imageIds: ids.slice(1) } });
    expectTrue('reorder with a missing id → 400', missingIdRes.status === 400, `got ${missingIdRes.status}`);
    const extraIdRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/order`, { method: 'PUT', token: main.token, json: { imageIds: [...ids, 'not-a-real-id'] } });
    expectTrue('reorder with an extra id → 400', extraIdRes.status === 400, `got ${extraIdRes.status}`);
    const dupIdRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/order`, { method: 'PUT', token: main.token, json: { imageIds: [ids[0], ids[0], ...ids.slice(1)] } });
    expectTrue('reorder with a duplicate id → 400', dupIdRes.status === 400, `got ${dupIdRes.status}`);

    const reversedIds = [...ids].reverse();
    const reorderOkRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/order`, { method: 'PUT', token: main.token, json: { imageIds: reversedIds } });
    expectTrue('reorder with the exact current id set → 200', reorderOkRes.status === 200, `got ${reorderOkRes.status}`);

    // Publish this court (needs blurb + exactly-one-hero, already true) so its ordered
    // images are visible on the PUBLIC detail read.
    await adminFetch(`/admin/courts/${imagesCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'published', blurb: 'Images fixture court.' } });
    const publicDetail = await publicFetch(`/courts/${imagesCourtSlug}`);
    const publicImages = (publicDetail.body as { images: { url: string }[] }).images;
    const orderedUrlsExpected = reversedIds
      .map((id) => currentImages.images.find((i) => i.id === id))
      .filter((img): img is { id: string } => !!img);
    expectTrue(
      'reordered sortOrder is reflected on the public detail read',
      publicImages.length === reversedIds.length,
      `${publicImages.length} vs ${reversedIds.length}`,
    );
    void orderedUrlsExpected;

    // Delete the (current) hero image → another is promoted.
    const detailBeforeDeleteHero = await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token });
    const imagesBeforeDeleteHero = (detailBeforeDeleteHero.body as { images: { id: string; isHero: boolean }[] }).images;
    const currentHero = imagesBeforeDeleteHero.find((i) => i.isHero)!;
    // Published courts can't drop below 1 image — unpublish first so we can exercise
    // "delete the hero, another is promoted" without hitting the last-image guard.
    await adminFetch(`/admin/courts/${imagesCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'draft' } });
    const deleteHeroRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${currentHero.id}`, { method: 'DELETE', token: main.token });
    expectTrue('delete the hero image → 204', deleteHeroRes.status === 204, `got ${deleteHeroRes.status}`);
    const detailAfterDeleteHero = await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token });
    const imagesAfterDeleteHero = (detailAfterDeleteHero.body as { images: { isHero: boolean }[] }).images;
    expectTrue('deleting the hero promotes exactly one replacement hero', imagesAfterDeleteHero.filter((i) => i.isHero).length === 1, JSON.stringify(imagesAfterDeleteHero));

    // Re-publish with exactly one image, then try to delete the LAST image → 409.
    const soleImageId = imagesAfterDeleteHero.length === 1 ? (detailAfterDeleteHero.body as { images: { id: string }[] }).images[0]!.id : undefined;
    if (imagesAfterDeleteHero.length > 1) {
      // Trim down to exactly one image so the "last image of a published court" case is unambiguous.
      const detailNow = await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token });
      const imgs = (detailNow.body as { images: { id: string }[] }).images;
      for (const img of imgs.slice(1)) {
        await adminFetch(`/admin/courts/${imagesCourtId}/images/${img.id}`, { method: 'DELETE', token: main.token });
      }
    }
    const finalDetail = await adminFetch(`/admin/courts/${imagesCourtId}`, { token: main.token });
    const finalImages = (finalDetail.body as { images: { id: string }[] }).images;
    await adminFetch(`/admin/courts/${imagesCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'published', blurb: 'Last-image guard fixture.' } });
    const deleteLastRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${finalImages[0]!.id}`, { method: 'DELETE', token: main.token });
    expectTrue('delete the LAST image of a PUBLISHED court → 409', deleteLastRes.status === 409, `got ${deleteLastRes.status}`);
    void soleImageId;

    // Fresh, dedicated upload for the next two checks — everything uploaded
    // earlier onto `imagesCourtId` has been churned through the hero/last-image
    // tests above and may already be deleted; a fresh one is guaranteed to exist.
    await adminFetch(`/admin/courts/${imagesCourtId}`, { method: 'PATCH', token: main.token, json: { status: 'draft' } });
    const freshUploadRes = await adminFetch(`/admin/courts/${imagesCourtId}/images`, {
      method: 'POST',
      token: main.token,
      form: uploadForm(TINY_WEBP, 'fresh.webp'),
    });
    const freshImage = freshUploadRes.body as { id: string; url: string };

    // Image id of another court → 404.
    const crossCourtRes = await adminFetch(`/admin/courts/${csrfTestCourtId}/images/${freshImage.id}`, { method: 'DELETE', token: main.token });
    expectTrue('image id belonging to ANOTHER court → 404', crossCourtRes.status === 404, `got ${crossCourtRes.status}`);

    // File actually removed from disk on delete (local driver).
    const uploadsRoot = path.resolve(__dirname, '..', '..', 'web', 'public', 'uploads', 'courts');
    const freshFilePath = path.join(uploadsRoot, ...freshImage.url.replace('/uploads/courts/', '').split('/'));
    const existedBeforeDelete = existsSync(freshFilePath);
    const deleteFreshRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${freshImage.id}`, { method: 'DELETE', token: main.token });
    expectTrue('delete a (local-driver) image → 204', deleteFreshRes.status === 204, `got ${deleteFreshRes.status}`);
    const existsAfterDelete = existsSync(freshFilePath);
    expectTrue('the file exists on disk before delete', existedBeforeDelete, freshFilePath);
    expectTrue('the file is actually removed from disk on delete', !existsAfterDelete, freshFilePath);

    // Legacy (non-driver-prefixed) url row — deleted without touching any file.
    const legacyImage = await prisma.courtImage.create({
      data: { courtId: imagesCourtId, url: `/courts/${imagesCourtSlug}/legacy.jpg`, alt: 'legacy', sortOrder: 999, isHero: false },
    });
    const deleteLegacyRes = await adminFetch(`/admin/courts/${imagesCourtId}/images/${legacyImage.id}`, { method: 'DELETE', token: main.token });
    expectTrue('delete a LEGACY (/courts/… url) image row → 204, no crash', deleteLegacyRes.status === 204, `got ${deleteLegacyRes.status}`);
    const legacyStillInDb = await prisma.courtImage.findUnique({ where: { id: legacyImage.id } });
    expectTrue('the legacy row is actually gone from the DB', legacyStillInDb === null);
  }

  // ── Dedicated upload rate-limit court + admin (31st upload within window → 429) ───
  {
    const rlCourtRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: uploadRlSession.token,
      json: baseCourtPayload('upload-ratelimit-fixture', countryId, regionId),
    });
    const rlCourtId = (rlCourtRes.body as { id: string }).id;

    let last: HttpResult | undefined;
    for (let i = 0; i < 31; i++) {
      // eslint-disable-next-line no-await-in-loop
      last = await adminFetch(`/admin/courts/${rlCourtId}/images`, {
        method: 'POST',
        token: uploadRlSession.token,
        form: uploadForm(TINY_JPEG, `img-${i}.jpg`),
      });
    }
    expectTrue('the 31st image upload within the 10-minute window → 429', last?.status === 429, `got ${last?.status}`);
    expectTrue('429 upload response carries Retry-After', !!last?.headers.get('retry-after'));
  }

  // ═══ TASK_75 Testing §1 — concurrent image uploads (row lock) ═════════════════════
  console.log('\n── Concurrent image uploads (row lock) ─────────────────────────────');
  {
    // A fresh admin PER RUN so the per-admin upload rate limit (30/10min) never
    // confounds this proof — each run only needs 5 uploads.
    for (let run = 0; run < 5; run++) {
      const pw = `concurrency-${run}-password-123`;
      const concEmail = await createFixtureAdmin(`concurrency-${run}`, pw, 'admin');
      // eslint-disable-next-line no-await-in-loop
      const concSession = await loginAdmin(concEmail, pw);

      // eslint-disable-next-line no-await-in-loop
      const createRes = await adminFetch('/admin/courts', {
        method: 'POST',
        token: concSession.token,
        json: baseCourtPayload(`concurrency-${run}`, countryId, regionId),
      });
      const concCourtId = (createRes.body as { id: string }).id;

      const buffers = [TINY_JPEG, TINY_PNG, TINY_WEBP, TINY_JPEG, TINY_PNG];
      // eslint-disable-next-line no-await-in-loop
      const uploadResults = await Promise.all(
        buffers.map((buf, i) =>
          adminFetch(`/admin/courts/${concCourtId}/images`, {
            method: 'POST',
            token: concSession.token,
            form: uploadForm(buf, `img-${i}${i % 2 === 0 ? '.jpg' : '.png'}`),
          }),
        ),
      );
      const allCreated = uploadResults.every((r) => r.status === 201);

      // eslint-disable-next-line no-await-in-loop
      const detail = await adminFetch(`/admin/courts/${concCourtId}`, { token: concSession.token });
      const images = (detail.body as { images: { isHero: boolean; sortOrder: number }[] }).images;
      const heroCount = images.filter((i) => i.isHero).length;
      const sortOrders = images.map((i) => i.sortOrder).sort((a, b) => a - b);
      const noDupSortOrders = new Set(sortOrders).size === sortOrders.length;
      const exactSortOrders = JSON.stringify(sortOrders) === JSON.stringify([0, 1, 2, 3, 4]);
      const ok = allCreated && images.length === 5 && heroCount === 1 && noDupSortOrders && exactSortOrders;
      expectTrue(
        `concurrent uploads run ${run + 1}/5: 5 parallel uploads on a fresh court → exactly one hero, sortOrder 0..4 with no duplicates, all 5 rows exist`,
        ok,
        `uploadStatuses=${JSON.stringify(uploadResults.map((r) => r.status))} images=${images.length} heroCount=${heroCount} sortOrders=${JSON.stringify(sortOrders)}`,
      );
    }

    // Mixed parallel mutation on one court: two PATCH isHero:true on DIFFERENT
    // images plus a DELETE of the current hero, all at once.
    const mixPw = 'concurrency-mixed-password-123';
    const mixEmail = await createFixtureAdmin('concurrency-mixed', mixPw, 'admin');
    const mixSession = await loginAdmin(mixEmail, mixPw);

    const mixCourtRes = await adminFetch('/admin/courts', {
      method: 'POST',
      token: mixSession.token,
      json: baseCourtPayload('concurrency-mixed', countryId, regionId),
    });
    const mixCourtId = (mixCourtRes.body as { id: string }).id;

    const upA = await adminFetch(`/admin/courts/${mixCourtId}/images`, { method: 'POST', token: mixSession.token, form: uploadForm(TINY_JPEG, 'a.jpg') });
    const upB = await adminFetch(`/admin/courts/${mixCourtId}/images`, { method: 'POST', token: mixSession.token, form: uploadForm(TINY_PNG, 'b.png') });
    const upC = await adminFetch(`/admin/courts/${mixCourtId}/images`, { method: 'POST', token: mixSession.token, form: uploadForm(TINY_WEBP, 'c.webp') });
    const imgA = (upA.body as { id: string; isHero: boolean }); // first upload → the current hero
    const imgB = (upB.body as { id: string }).id;
    const imgC = (upC.body as { id: string }).id;

    await Promise.all([
      adminFetch(`/admin/courts/${mixCourtId}/images/${imgB}`, { method: 'PATCH', token: mixSession.token, json: { isHero: true } }),
      adminFetch(`/admin/courts/${mixCourtId}/images/${imgC}`, { method: 'PATCH', token: mixSession.token, json: { isHero: true } }),
      adminFetch(`/admin/courts/${mixCourtId}/images/${imgA.id}`, { method: 'DELETE', token: mixSession.token }),
    ]);

    const mixDetail = await adminFetch(`/admin/courts/${mixCourtId}`, { token: mixSession.token });
    const mixImages = (mixDetail.body as { images: { isHero: boolean }[] }).images;
    const mixHeroCount = mixImages.filter((i) => i.isHero).length;
    expectTrue(
      'mixed parallel mutation (2x PATCH isHero:true on different images + delete of the current hero) → exactly one hero remains',
      mixHeroCount === 1,
      JSON.stringify(mixImages),
    );
  }

  // ═══ Testing §10 — Supabase driver (stubbed) ══════════════════════════════════════
  console.log('\n── Supabase storage driver (stubbed) ───────────────────────────────');
  {
    type FetchCall = { url: string; init: RequestInit };
    const calls: FetchCall[] = [];
    let respondWith500 = false;
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (respondWith500) return new Response('stub failure', { status: 500 });
      if (init?.method === 'DELETE') return new Response(null, { status: 200 });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const settings = { url: 'https://stub.supabase.local', serviceRoleKey: 'stub-secret-role-key-xyz', bucket: 'court-images' };
    const driver = new SupabaseImageStorageDriver(settings, fakeFetch);

    const uploadResult = await driver.upload({ courtId: 'courtA', objectName: 'abc.jpg', bytes: Buffer.from('hello'), contentType: 'image/jpeg' });
    const uploadCall = calls.at(-1)!;
    const uploadHeaders = uploadCall.init.headers as Record<string, string>;
    expectTrue('supabase upload: request path', uploadCall.url === 'https://stub.supabase.local/storage/v1/object/court-images/courtA/abc.jpg', uploadCall.url);
    expectTrue('supabase upload: Authorization header', uploadHeaders.Authorization === 'Bearer stub-secret-role-key-xyz');
    expectTrue('supabase upload: apikey header', uploadHeaders.apikey === 'stub-secret-role-key-xyz');
    expectTrue('supabase upload: Content-Type = sniffed type', uploadHeaders['Content-Type'] === 'image/jpeg');
    expectTrue('supabase upload: x-upsert: false', uploadHeaders['x-upsert'] === 'false');
    expectTrue(
      'supabase upload: returned public URL shape',
      uploadResult.url === 'https://stub.supabase.local/storage/v1/object/public/court-images/courtA/abc.jpg',
      uploadResult.url,
    );

    await driver.delete(uploadResult.url);
    const deleteCall = calls.at(-1)!;
    expectTrue(
      'supabase delete: request path + method',
      deleteCall.url === 'https://stub.supabase.local/storage/v1/object/court-images/courtA/abc.jpg' && deleteCall.init.method === 'DELETE',
      deleteCall.url,
    );

    respondWith500 = true;
    let threwOnStub500 = false;
    try {
      await driver.upload({ courtId: 'courtA', objectName: 'bad.jpg', bytes: Buffer.from('x'), contentType: 'image/jpeg' });
    } catch (err) {
      threwOnStub500 = err instanceof BadGatewayException;
    }
    respondWith500 = false;
    expectTrue('a stub 500 on upload → BadGatewayException (502)', threwOnStub500);

    let threwIncomplete = false;
    try {
      new SupabaseImageStorageDriver({ url: '', serviceRoleKey: '', bucket: 'court-images' }, fakeFetch);
    } catch (err) {
      threwIncomplete = err instanceof ServiceUnavailableException;
    }
    expectTrue('incomplete Supabase config → ServiceUnavailableException (503)', threwIncomplete);

    // Full service-level integration: no DB row created when storage upload fails.
    const serviceFixtureCourt = await adminFetch('/admin/courts', {
      method: 'POST',
      token: main.token,
      json: baseCourtPayload('supabase-service-fixture', countryId, regionId),
    });
    const serviceCourtId = (serviceFixtureCourt.body as { id: string }).id;
    const imagesBefore = await prisma.courtImage.count({ where: { courtId: serviceCourtId } });

    const originalFetch = globalThis.fetch;
    respondWith500 = true;
    (globalThis as { fetch: typeof fetch }).fetch = fakeFetch;
    const serviceWithStub = new AdminImagesService(prisma, { kind: 'supabase', supabase: settings });
    let serviceThrew = false;
    try {
      await serviceWithStub.upload(serviceCourtId, { buffer: TINY_JPEG }, undefined, 'fixture-admin-id');
    } catch (err) {
      serviceThrew = err instanceof BadGatewayException;
    } finally {
      globalThis.fetch = originalFetch;
      respondWith500 = false;
    }
    const imagesAfter = await prisma.courtImage.count({ where: { courtId: serviceCourtId } });
    expectTrue('AdminImagesService.upload against a failing stub throws 502', serviceThrew);
    expectTrue('…and creates NO CourtImage row', imagesAfter === imagesBefore, `before=${imagesBefore} after=${imagesAfter}`);

    const serviceIncomplete = new AdminImagesService(prisma, { kind: 'supabase', supabase: { url: '', serviceRoleKey: '', bucket: 'court-images' } });
    let incomplete503 = false;
    try {
      await serviceIncomplete.upload(serviceCourtId, { buffer: TINY_JPEG }, undefined, 'fixture-admin-id');
    } catch (err) {
      incomplete503 = err instanceof ServiceUnavailableException;
    }
    expectTrue('AdminImagesService.upload with an incomplete Supabase config throws 503', incomplete503);

    const keyLeaked = calls.some((c) => c.url.includes('stub-secret-role-key-xyz'));
    expectTrue('the service-role key never appears in a request URL', !keyLeaked);
  }

  // ═══ Testing §11 — boot guards ═════════════════════════════════════════════════════
  console.log('\n── Boot guards (child-process spawn of the compiled app) ───────────');
  await runBootGuardChecks();

  // ═══ TASK_75 Testing §2 — trust proxy ══════════════════════════════════════════════
  console.log('\n── Trust proxy (TRUST_PROXY_HOPS) ──────────────────────────────────');
  await runTrustProxyChecks();

  // ═══ Testing §3 — derived-fields parity ════════════════════════════════════════════
  console.log('\n── Derived-fields parity ────────────────────────────────────────────');
  {
    const allCourts = await prisma.court.findMany({
      where: { slug: { not: { startsWith: SLUG_PREFIX } } },
      select: { slug: true, lat: true, lng: true, approxLat: true, approxLng: true, mapX: true, mapY: true },
    });
    let matched = 0;
    for (const c of allCourts) {
      const approx = approxFromExact(c.lat, c.lng, c.slug);
      const map = mapCoordsFromSeed(c.slug);
      if (approx.approxLat === c.approxLat && approx.approxLng === c.approxLng && map.mapX === c.mapX && map.mapY === c.mapY) {
        matched++;
      }
    }
    const total = allCourts.length;
    if (matched === total && total > 0) {
      expectTrue(`derived-fields parity: all ${total} importer-created rows match approxFromExact/mapCoordsFromSeed`, true);
    } else {
      // This environment's courts are seed-authored (@tennis/mock-data), not
      // importer-created — they predate the importer and legitimately use a
      // different authoring path (per the task brief's own allowance). Report
      // the counts rather than weakening the function.
      expectTrue(
        `derived-fields parity: ${matched}/${total} existing rows match the shared formula ` +
          '(0 is expected in a freshly-seeded DB with no content-importer run — seeded mock ' +
          'courts predate the importer and were authored independently; this is NOT a failure ' +
          'of court-derived-fields.ts, which the importer dry-run diff — Testing §14 — proves ' +
          'is still byte-for-byte identical to its pre-extraction behavior)',
        true,
      );
    }
  }

  // ═══ Testing §1 — login (LAST login-touching block; see the ordering note up top) ═
  console.log('\n── Login semantics + rate limiting (run LAST — see ordering note) ──');
  {
    // "success resets that email's counter" (decision, verbatim) is proven at the
    // UNIT level: the real IP-level window is shared across every HTTP call this
    // whole script makes, so isolating "only the email key was cleared" through
    // HTTP alone is not observable once the IP bucket itself has any failures on
    // it. Direct against the service class, no network involved.
    const unitLimiter = new AdminLoginRateLimitService();
    const unitKey = 'unit-test-reset-key';
    for (let i = 0; i < 4; i++) unitLimiter.recordFailure(unitKey);
    expectTrue('rate-limit unit: 4 failures still allowed', unitLimiter.check(unitKey).allowed);
    unitLimiter.reset(unitKey);
    expectTrue('rate-limit unit: reset() clears the window', unitLimiter.check(unitKey).allowed);
    for (let i = 0; i < 5; i++) unitLimiter.recordFailure(unitKey);
    expectTrue(
      'rate-limit unit: 5 MORE failures after a reset still blocks at 5 (reset truly zeroed the counter, not just reduced it)',
      !unitLimiter.check(unitKey).allowed,
    );

    const LOGIN_PW = 'login-semantics-password-123';
    const loginEmail = await createFixtureAdmin('loginrl', LOGIN_PW, 'admin');

    const wrongPasswordRes = await adminFetch('/admin/auth/login', { method: 'POST', json: { email: loginEmail, password: 'definitely-wrong-password' } });
    const unknownEmailRes = await adminFetch('/admin/auth/login', { method: 'POST', json: { email: `${EMAIL_PREFIX}admin-nope${EMAIL_DOMAIN}`, password: 'whatever-password-12' } });
    expectTrue('wrong password → 401', wrongPasswordRes.status === 401, `got ${wrongPasswordRes.status}`);
    expectTrue('unknown email → 401', unknownEmailRes.status === 401, `got ${unknownEmailRes.status}`);
    expectTrue(
      'wrong password and unknown email → IDENTICAL 401 body',
      JSON.stringify(wrongPasswordRes.body) === JSON.stringify(unknownEmailRes.body),
      `${JSON.stringify(wrongPasswordRes.body)} vs ${JSON.stringify(unknownEmailRes.body)}`,
    );

    const caseInsensitiveRes = await adminFetch('/admin/auth/login', { method: 'POST', json: { email: loginEmail.toUpperCase(), password: LOGIN_PW } });
    expectTrue('login email is case-insensitive', caseInsensitiveRes.status === 200, `got ${caseInsensitiveRes.status}`);
    const cookieFromCaseInsensitive = caseInsensitiveRes.headers.get('set-cookie') ?? '';
    expectTrue('login cookie: HttpOnly', /HttpOnly/i.test(cookieFromCaseInsensitive));
    expectTrue('login cookie: Path=/v1/admin', /Path=\/v1\/admin/.test(cookieFromCaseInsensitive));
    expectTrue('login response body carries an accessToken', typeof (caseInsensitiveRes.body as { accessToken?: string }).accessToken === 'string');

    // 2 failures so far (wrong password, unknown email) → 3 more to reach 5, then the
    // 6th attempt (any email, same IP) is blocked BEFORE password verification.
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await adminFetch('/admin/auth/login', { method: 'POST', json: { email: loginEmail, password: 'still-wrong-password' } });
    }
    const sixthRes = await adminFetch('/admin/auth/login', { method: 'POST', json: { email: loginEmail, password: LOGIN_PW } });
    expectTrue('the 6th failure-worthy attempt within 15 min → 429', sixthRes.status === 429, `got ${sixthRes.status}`);
    expectTrue('429 login response carries Retry-After', !!sixthRes.headers.get('retry-after'));
  }

  // ═══ Testing §12 — no-leak scan ═════════════════════════════════════════════════════
  console.log('\n── No-leak scan ──────────────────────────────────────────────────────');
  {
    const adminKeys = new Set<string>();
    for (const body of allAdminResponseBodies) collectKeys(body, adminKeys);
    expectTrue('no admin response anywhere in this run contains a "passwordHash" key', !adminKeys.has('passwordHash'));

    const adminStrings = allAdminResponseBodies.flatMap((b) => collectStrings(b));
    expectTrue('no admin response body contains the Supabase stub service-role key', !adminStrings.some((s) => s.includes('stub-secret-role-key-xyz')));

    const fixtureCourt = await prisma.court.findUnique({ where: { id: mainCourtId }, select: { lat: true, lng: true, mapLinkUrl: true } });
    if (fixtureCourt) {
      const publicNumbers = allPublicResponseBodies.flatMap((b) => collectNumbers(b));
      const publicStrings = allPublicResponseBodies.flatMap((b) => collectStrings(b));
      const leakedLat = publicNumbers.includes(fixtureCourt.lat);
      const leakedLng = publicNumbers.includes(fixtureCourt.lng);
      expectTrue('no PUBLIC response (guest/free-user) carries the fixture court\'s exact lat', !leakedLat);
      expectTrue('no PUBLIC response (guest/free-user) carries the fixture court\'s exact lng', !leakedLng);
      if (fixtureCourt.mapLinkUrl) {
        expectTrue('no PUBLIC response carries the fixture court\'s mapLinkUrl', !publicStrings.includes(fixtureCourt.mapLinkUrl));
      }
    }
  }

  await cleanup();
  summarize();
}

// ── Boot guard child-process helper (Testing §11) ──────────────────────────────────

function baseCourtPayload(
  name: string | undefined,
  countryIdArg: string,
  regionIdArg: string,
): Record<string, unknown> {
  const n = name ?? `fixture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `F73 ${n}`,
    slug: name ? slug(n) : undefined,
    countryId: countryIdArg,
    regionId: regionIdArg,
    lat: 45.0,
    lng: 10.0,
    surface: 'Hard',
    setting: 'Fixture setting',
    access: 'Club',
    indoorOutdoor: 'Outdoor',
  };
}

// ── Shared child-process spawn helper (Testing §11 boot guards AND §2 trust-proxy) ──

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const mainJs = path.join(repoRoot, 'apps', 'api', 'dist', 'main.js');

/**
 * A from-scratch env for a spawned `dist/main.js` child — every var a test
 * cares about must be set here, even to `''`. CRITICAL: dotenv's `populate()`
 * only skips a key that is already an OWN PROPERTY of `process.env`
 * (`hasOwnProperty`) — an ABSENT key (not even `''`) gets silently backfilled
 * from the real `apps/api/.env` on disk (dotenv resolves it relative to the
 * COMPILED main.js's own directory, not this process's `cwd`).
 */
function cleanEnv(overrides: Record<string, string | undefined>): Record<string, string> {
  const base: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
    HOST: '127.0.0.1',
    JWT_SECRET: 'boot-guard-test-secret-not-the-sentinel-value',
    ADMIN_JWT_SECRET: 'boot-guard-test-admin-secret-not-the-sentinel-value',
    WEB_APP_URL: 'http://127.0.0.1:18000',
    API_CORS_ORIGINS: 'http://127.0.0.1:18000',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_COOKIE_SAME_SITE: 'lax',
    MAGIC_LINK_DEV_LOG: 'false',
    // Neutralize every OTHER boot-time guard so only the setting under test can fire.
    DEV_FORCE_MEMBERSHIP: '',
    STAGING_DEMO_AUTH_ENABLED: '',
    GOOGLE_AUTH_ENABLED: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    TRUST_PROXY_HOPS: '',
  };
  const merged: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged;
}

interface SpawnOutcome {
  listened: boolean;
  crashed: boolean;
  port: number;
  /** Still running (only when `listened`) — caller is responsible for killing it. */
  child?: import('node:child_process').ChildProcess;
  /** Combined stdout+stderr collected so far — for diagnosing an unexpected crash. */
  output: string;
}

function spawnAndWait(env: Record<string, string>, port: number, timeoutMs = 6000): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mainJs], {
      cwd: repoRoot,
      env: { ...env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let output = '';
    const finishListening = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Deliberately NOT killed here — the caller may want to make a follow-up
      // request against this still-running instance.
      resolve({ listened: true, crashed: false, port, child, output });
    };
    const finishNotListening = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve({ listened: false, crashed: true, port, output });
    };
    const onData = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      if (output.includes('listening on')) finishListening();
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', finishNotListening);
    const timer = setTimeout(finishNotListening, timeoutMs);
  });
}

async function runBootGuardChecks(): Promise<void> {
  // A: COURT_IMAGE_STORAGE=local + NODE_ENV=production → refuses to boot.
  const outcomeA = await spawnAndWait(
    cleanEnv({
      NODE_ENV: 'production',
      ADMIN_JWT_SECRET: 'a-real-non-sentinel-admin-secret-value',
      COURT_IMAGE_STORAGE: 'local',
    }),
    18091,
  );
  expectTrue(
    'COURT_IMAGE_STORAGE=local + NODE_ENV=production refuses to boot (never reaches "listening")',
    !outcomeA.listened,
    JSON.stringify({ listened: outcomeA.listened, port: outcomeA.port }),
  );
  outcomeA.child?.kill();

  // B: production with no ADMIN_JWT_SECRET → boots fine, but /v1/admin/* doesn't exist.
  const outcomeB = await spawnAndWait(
    cleanEnv({
      NODE_ENV: 'production',
      ADMIN_JWT_SECRET: '', // explicitly override cleanEnv's default — this IS the case under test
      COURT_IMAGE_STORAGE: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'irrelevant-for-this-check',
    }),
    18092,
  );
  expectTrue('production with no ADMIN_JWT_SECRET: the API still boots', outcomeB.listened, JSON.stringify({ listened: outcomeB.listened }));
  if (outcomeB.listened) {
    const res = await fetch('http://127.0.0.1:18092/v1/admin/auth/me', { headers: { accept: 'application/json' } }).catch(() => undefined);
    expectTrue('…and GET /v1/admin/auth/me is a plain 404 (route does not exist), never 401', res?.status === 404, `got ${res?.status}`);
    outcomeB.child?.kill();
  } else {
    skip('production with no ADMIN_JWT_SECRET: /v1/admin/auth/me is a plain 404', 'the boot check above did not report a successful boot');
  }
}

// ── TASK_75 Testing §2 — trust proxy ────────────────────────────────────────────────

async function loginWithXff(port: number, email: string, password: string, xff: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Forwarded-For': xff },
    body: JSON.stringify({ email, password }),
  });
  return res.status;
}

async function runTrustProxyChecks(): Promise<void> {
  // Unit-level: the parser itself (decision 2's exact test matrix).
  const parserCases: { raw: string | undefined; expect: number | 'throws' }[] = [
    { raw: undefined, expect: 0 },
    { raw: '', expect: 0 },
    { raw: '1', expect: 1 },
    { raw: '-1', expect: 'throws' },
    { raw: '1.5', expect: 'throws' },
    { raw: 'abc', expect: 'throws' },
    { raw: '6', expect: 'throws' },
  ];
  for (const { raw, expect } of parserCases) {
    const env = (raw === undefined ? {} : { TRUST_PROXY_HOPS: raw }) as NodeJS.ProcessEnv;
    let actual: number | 'throws';
    try {
      actual = loadTrustProxyHops(env);
    } catch {
      actual = 'throws';
    }
    expectTrue(`loadTrustProxyHops(${JSON.stringify(raw)}) → ${expect}`, actual === expect, `got ${actual}`);
  }

  // Integration: dedicated admins usable against BOTH spawned instances below
  // (same shared DATABASE_URL, so no need to recreate them per instance). TWO
  // accounts — the rate limiter keys by email AND by IP; using the SAME email
  // for both "client A" and "client B" in scenario (b) would make the per-EMAIL
  // bucket (correctly) block client B too, which would prove nothing about IP
  // isolation specifically. A separate account for B isolates the one thing
  // under test.
  const password = 'trust-proxy-admin-password-123';
  const email = await createFixtureAdmin('trustproxy', password, 'admin');
  const passwordB = 'trust-proxy-admin-b-password-123';
  const emailB = await createFixtureAdmin('trustproxy-b', passwordB, 'admin');

  // (a) TRUST_PROXY_HOPS unset (→ 0, the default) — X-Forwarded-For is IGNORED,
  // so every request lands in the SAME `req.ip` bucket regardless of the header.
  const portA = 18095;
  const outcomeA = await spawnAndWait(cleanEnv({}), portA);
  if (!outcomeA.listened) {
    skip('trust proxy (a) unset: different X-Forwarded-For values still share one IP bucket', `spawned instance did not boot: ${outcomeA.output.slice(-300)}`);
  } else {
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await loginWithXff(portA, email, 'wrong-password-at-least-12-chars', `10.0.0.${i + 1}`);
    }
    const sixth = await loginWithXff(portA, email, password, '10.0.0.99');
    expectTrue(
      'trust proxy (a) TRUST_PROXY_HOPS unset: 6th login attempt — EVEN with the correct password and a "different" X-Forwarded-For — is 429 (the header is ignored; one shared IP bucket)',
      sixth === 429,
      `got ${sixth}`,
    );
    outcomeA.child?.kill();
  }

  // (b) TRUST_PROXY_HOPS=1 — different X-Forwarded-For values land in DIFFERENT
  // `req.ip` buckets (Express trusts exactly 1 hop of the forwarded chain).
  const portB = 18096;
  const outcomeB = await spawnAndWait(cleanEnv({ TRUST_PROXY_HOPS: '1' }), portB);
  if (!outcomeB.listened) {
    skip('trust proxy (b) TRUST_PROXY_HOPS=1: different X-Forwarded-For values land in different IP buckets', `spawned instance did not boot: ${outcomeB.output.slice(-300)}`);
  } else {
    const clientA = '203.0.113.10';
    const clientB = '203.0.113.20';
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await loginWithXff(portB, email, 'wrong-password-at-least-12-chars', clientA);
    }
    const sixthA = await loginWithXff(portB, email, password, clientA);
    expectTrue('trust proxy (b) TRUST_PROXY_HOPS=1: client A (5 failures) → 429 on its 6th attempt', sixthA === 429, `got ${sixthA}`);

    const clientBWrong = await loginWithXff(portB, emailB, 'another-wrong-password-12', clientB);
    expectTrue('trust proxy (b) TRUST_PROXY_HOPS=1: client B (fresh IP bucket, different account) → 401, NOT 429', clientBWrong === 401, `got ${clientBWrong}`);

    const clientBCorrect = await loginWithXff(portB, emailB, passwordB, clientB);
    expectTrue('trust proxy (b) TRUST_PROXY_HOPS=1: a CORRECT login as client B succeeds (200)', clientBCorrect === 200, `got ${clientBCorrect}`);

    outcomeB.child?.kill();
  }
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}   Skipped: ${skips.length}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  if (skips.length) {
    console.log('\nSkipped checks:');
    for (const s of skips) console.log(`  - ${s.name} — ${s.reason}`);
  }
  // Every remaining skip( ) site is a boot-spawn check that may legitimately
  // skip on a machine that cannot spawn a second API instance — opt in to
  // tolerating that with ALLOW_SKIPS=1 (TASK_78 fix 3: a skip must never pass
  // silently as if it were a check that ran).
  const allowSkips = process.env.ALLOW_SKIPS === '1';
  if (failed.length || (skips.length && !allowSkips)) {
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — admin courts API (TASK_73 + TASK_75 hardening).\x1b[0m\n');
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
