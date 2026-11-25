/* eslint-disable no-console */
//
// TASK_79 — court bulk-import API verification. Same `record()`/`expectTrue()`
// harness idiom as `verify-admin-courts.ts` (copied, not imported — that file
// is explicitly not to be refactored). Namespaced fixtures: AdminUser emails
// `f79-admin-*@tennis.test`, court slugs `f79-*` (via names `F79 Court N` —
// `slugify` turns that into `f79-court-n`), countries isoCode `ZF`/`ZG`
// (names `F79 Test Country`/`F79 Test Country 2`, distinct from TASK_73's
// `XZ`/`XY`). Cleaned up in a `finally`, defensively at the start too. Fails
// loudly if the API is unreachable; a skip never counts as a pass (same
// `ALLOW_SKIPS=1` escape hatch as `verify-admin-courts.ts`).
//
// Run (after the API is up and migrated/seeded, COURT_IMAGE_STORAGE=local):
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api build
//   COURT_IMAGE_STORAGE=local node apps/api/dist/main.js
//   pnpm --filter @tennis/api verify:admin-court-import
//
// The admin-login rate limiter is IP+email keyed with a 15-minute window —
// this script only ever logs in successfully (never deliberately fails a
// login), so it never trips that limiter. Restart the API between runs if
// you re-run this script many times back to back (the IMPORT limiter itself
// is in-memory and per-admin; this script uses a FRESH admin per run via a
// timestamp suffix so repeated runs don't inherit a prior run's budget).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashAdminPassword } from '../src/admin/auth/admin-password.util';
import { approxFromExact, mapCoordsFromSeed, slugify } from '../src/courts/court-derived-fields';
import { SURFACES, ACCESS_TYPES, INDOOR_OUTDOOR } from '../src/admin/courts/admin-courts.dto';
import { CONTINENTS } from '../src/admin/geo/admin-geo.dto';
import { COURT_TAGS } from '../src/courts/court-tags';
import { AdminCourtImportService } from '../src/admin/courts/admin-court-import.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:18001/v1';

const RUN_ID = Date.now().toString(36);
const EMAIL_PREFIX = 'f79-';
const EMAIL_DOMAIN = '@tennis.test';
const SLUG_PREFIX = 'f79-';
const FIXTURE_COUNTRY_ISO = 'ZF';
const FIXTURE_COUNTRY_NAME = 'F79 Test Country';
const FIXTURE_COUNTRY2_ISO = 'ZG';
const FIXTURE_COUNTRY2_NAME = 'F79 Test Country 2';

function adminEmail(name: string): string {
  return `${EMAIL_PREFIX}admin-${RUN_ID}-${name}${EMAIL_DOMAIN}`;
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
// No check in this harness is conditional on database/environment state (per
// the project's skip policy), so nothing ever pushes to this — it exists only
// so `summarize()` can report "Skipped: 0" in the same shape as the sibling
// `verify-admin-courts.ts` harness.
const skips: SkipResult[] = [];

// ── HTTP helpers ────────────────────────────────────────────────────────────────────

const allAdminResponseBodies: unknown[] = [];
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
  rawBody?: string;
  contentType?: string | null;
}

async function adminFetch(pathSuffix: string, opts: AdminFetchOptions = {}): Promise<HttpResult> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.csrf) headers['X-Tennis-Admin'] = '1';

  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    if (opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json';
    body = opts.rawBody;
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

async function publicFetch(pathSuffix: string): Promise<HttpResult> {
  const res = await fetch(`${API_BASE}${pathSuffix}`, { headers: { accept: 'application/json' } });
  const body = await res.json().catch(() => undefined);
  allPublicResponseBodies.push(body);
  return { status: res.status, headers: res.headers, body };
}

function extractCookiePair(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) return undefined;
  return setCookieHeader.split(';')[0];
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────

async function createFixtureAdmin(name: string, password: string, role = 'admin'): Promise<string> {
  const email = adminEmail(name);
  const passwordHash = await hashAdminPassword(password);
  await prisma.adminUser.upsert({ where: { email }, create: { email, passwordHash, role }, update: { passwordHash, role } });
  return email;
}

interface AdminSession {
  token: string;
  cookie: string;
}
async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const res = await adminFetch('/admin/auth/login', { method: 'POST', json: { email, password } });
  if (res.status !== 200) throw new Error(`admin login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const body = res.body as { accessToken: string };
  const cookie = extractCookiePair(res.headers.get('set-cookie'));
  if (!cookie) throw new Error(`admin login for ${email} set no cookie`);
  return { token: body.accessToken, cookie };
}

/** A brand-new admin + session, scoped to ONE test section. The import rate
 *  limiter (10 commits / 60 dry runs per 10 min) is keyed per-admin, so
 *  sections that each do several commits/dry-runs MUST NOT share one admin —
 *  otherwise an earlier section's calls silently eat into a later section's
 *  budget and a 429 shows up where a 201/422/200 was expected. */
async function freshSession(label: string): Promise<AdminSession> {
  const email = await createFixtureAdmin(label, 'F79SectionPassword123!');
  return loginAdmin(email, 'F79SectionPassword123!');
}

async function ensureFixtureCountry(iso: string, name: string): Promise<string> {
  const country = await prisma.country.upsert({ where: { isoCode: iso }, create: { name, isoCode: iso, continent: 'Europe' }, update: {} });
  return country.id;
}

function minimalCourt(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    country: { name: FIXTURE_COUNTRY_NAME, isoCode: FIXTURE_COUNTRY_ISO, continent: 'Europe' },
    region: 'F79 Region',
    lat: 10.123456,
    lng: 10.123456,
    surface: 'Clay',
    access: 'Club',
    indoorOutdoor: 'Outdoor',
    setting: 'A quiet test court.',
    blurb:
      'This is paragraph one of a fixture blurb, long enough to pass the forty character minimum easily.\n\n' +
      'This is paragraph two of the same fixture blurb, for good measure and realism.',
    sources: ['https://example.com/source'],
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  const fixtureCourts = await prisma.court.findMany({ where: { slug: { startsWith: SLUG_PREFIX } }, select: { id: true } });
  const courtIds = fixtureCourts.map((c) => c.id);
  if (courtIds.length > 0) {
    await prisma.courtImage.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.collectionCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.savedCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.userCollectionCourt.deleteMany({ where: { courtId: { in: courtIds } } });
    await prisma.court.deleteMany({ where: { id: { in: courtIds } } });
  }
  await prisma.region.deleteMany({ where: { name: { startsWith: 'F79 ' } } });
  await prisma.country.deleteMany({ where: { isoCode: { in: [FIXTURE_COUNTRY_ISO, FIXTURE_COUNTRY2_ISO] } } });
  await prisma.adminUser.deleteMany({ where: { email: { contains: EMAIL_PREFIX } } });
}

// ── Main ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('TASK_79 — admin court import verification\n');

  try {
    await publicFetch('/health');
  } catch (err) {
    console.error(`\x1b[31mCannot reach the API at ${API_BASE} — is it running?\x1b[0m`, err);
    process.exit(2);
  }

  await cleanup();
  await ensureFixtureCountry(FIXTURE_COUNTRY_ISO, FIXTURE_COUNTRY_NAME);

  const editorEmail = await createFixtureAdmin('editor', 'F79EditorPassword123!', 'editor');
  const editorSession = await loginAdmin(editorEmail, 'F79EditorPassword123!');

  // ═══ 1 — Auth ═══════════════════════════════════════════════════════════════════
  console.log('\n── Auth ─────────────────────────────────────────────────────────────');
  {
    const authSession = await freshSession('auth');

    const noAuth = await adminFetch('/admin/courts/import', { method: 'POST', json: { courts: [minimalCourt('F79 Auth A')] } });
    expectTrue('no credentials → 401', noAuth.status === 401, `got ${noAuth.status}`);

    const wrongRole = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token: editorSession.token,
      json: { courts: [minimalCourt('F79 Auth B')] },
    });
    expectTrue('editor role → 403', wrongRole.status === 403, `got ${wrongRole.status}`);

    const cookieNoCsrf = await adminFetch('/admin/courts/import', {
      method: 'POST',
      cookie: authSession.cookie,
      json: { courts: [minimalCourt('F79 Auth C')] },
    });
    expectTrue('cookie-authenticated POST without X-Tennis-Admin → 403', cookieNoCsrf.status === 403, `got ${cookieNoCsrf.status}`);

    const bearerNoCsrf = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token: authSession.token,
      json: { courts: [minimalCourt('F79 Auth D')] },
    });
    expectTrue('Bearer works without X-Tennis-Admin', bearerNoCsrf.status === 200, `got ${bearerNoCsrf.status} ${JSON.stringify(bearerNoCsrf.body)}`);
  }

  // ═══ 2 — Defaults ═══════════════════════════════════════════════════════════════
  console.log('\n── Defaults (dryRun) ────────────────────────────────────────────────');
  {
    const defaultsSession = await freshSession('defaults');
    const before = await prisma.court.count();
    const r1 = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token: defaultsSession.token,
      json: { courts: [minimalCourt('F79 Default A')] },
    });
    const afterNoFlag = await prisma.court.count();
    expectTrue('body without dryRun → 200 (dry run) and writes nothing', r1.status === 200 && afterNoFlag === before, `status=${r1.status} before=${before} after=${afterNoFlag}`);

    const r2 = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token: defaultsSession.token,
      json: { dryRun: false, courts: [minimalCourt('F79 Default B')] },
    });
    const afterCommit = await prisma.court.count();
    expectTrue('"dryRun": false → 201 and writes', r2.status === 201 && afterCommit === before + 1, `status=${r2.status} before=${before} after=${afterCommit}`);
  }

  // ═══ 3 — Happy path ═════════════════════════════════════════════════════════════
  console.log('\n── Happy path ───────────────────────────────────────────────────────');
  {
    const happySession = await freshSession('happy');
    const newCountryIso = FIXTURE_COUNTRY2_ISO;
    const file = {
      courts: [
        minimalCourt('F79 Happy Existing Country', { region: 'F79 New Region A', tags: ['Sea View', 'Garden'] }),
        minimalCourt('F79 Happy New Country', {
          country: { name: FIXTURE_COUNTRY2_NAME, isoCode: newCountryIso, continent: 'Asia' },
          region: 'F79 New Region B',
          lat: 20.5,
          lng: 30.75,
        }),
      ],
    };

    const dry = await adminFetch('/admin/courts/import', { method: 'POST', token: happySession.token, json: file });
    const dryBody = dry.body as {
      ok: boolean;
      summary: { total: number; valid: number; invalid: number; newCountries: number; newRegions: number };
      items: Array<{ status: string; resolved: { country: string; region: string } }>;
    };
    expectTrue(
      'happy-path dry run → ok:true, correct summary and resolved',
      dry.status === 200 &&
        dryBody.ok === true &&
        dryBody.summary.total === 2 &&
        dryBody.summary.valid === 2 &&
        dryBody.summary.newCountries === 1 &&
        dryBody.summary.newRegions === 2 &&
        dryBody.items[0]?.resolved.country === 'existing' &&
        dryBody.items[1]?.resolved.country === 'create',
      JSON.stringify(dryBody),
    );

    const maxBefore = await prisma.court.aggregate({ _max: { seedOrder: true } });
    const prevMax = maxBefore._max.seedOrder ?? -1;

    const commit = await adminFetch('/admin/courts/import', { method: 'POST', token: happySession.token, json: { ...file, dryRun: false } });
    expectTrue('happy-path commit → 201', commit.status === 201, `got ${commit.status} ${JSON.stringify(commit.body)}`);

    const slug1 = slugify('F79 Happy Existing Country');
    const slug2 = slugify('F79 Happy New Country');
    const row1 = await prisma.court.findUnique({ where: { slug: slug1 }, select: { status: true, isLocked: true, isFeatured: true, approxLat: true, approxLng: true, mapX: true, mapY: true, seedOrder: true, tags: true, region: { select: { lat: true, lng: true } } } });
    const row2 = await prisma.court.findUnique({ where: { slug: slug2 }, select: { seedOrder: true, country: { select: { isoCode: true, continent: true } } } });

    const expectedApprox1 = approxFromExact(10.123456, 10.123456, slug1);
    const expectedMapXY1 = mapCoordsFromSeed(slug1);

    expectTrue(
      'created court: draft, isLocked true, isFeatured false',
      row1?.status === 'draft' && row1.isLocked === true && row1.isFeatured === false,
      JSON.stringify(row1),
    );
    expectTrue(
      'created court: approxLat/approxLng/mapX/mapY equal the shared derived-field functions',
      row1?.approxLat === expectedApprox1.approxLat &&
        row1.approxLng === expectedApprox1.approxLng &&
        row1.mapX === expectedMapXY1.mapX &&
        row1.mapY === expectedMapXY1.mapY,
      JSON.stringify({ row1, expectedApprox1, expectedMapXY1 }),
    );
    expectTrue('created court: tags in canonical vocabulary order', JSON.stringify(row1?.tags) === JSON.stringify(COURT_TAGS.filter((t) => ['Sea View', 'Garden'].includes(t))), JSON.stringify(row1?.tags));
    expectTrue('new region lat/lng equal the court\'s own lat/lng', row1?.region.lat === 10.123456 && row1.region.lng === 10.123456, JSON.stringify(row1?.region));
    expectTrue(
      'seedOrder = previous max + 1, +2 in file order',
      row1?.seedOrder === prevMax + 1 && row2?.seedOrder === prevMax + 2,
      `prevMax=${prevMax} row1=${row1?.seedOrder} row2=${row2?.seedOrder}`,
    );
    expectTrue('new country isoCode/continent match the given values', row2?.country.isoCode === newCountryIso && row2.country.continent === 'Asia', JSON.stringify(row2?.country));

    const adminList = await adminFetch(`/admin/courts?q=${encodeURIComponent('F79 Happy')}`, { method: 'GET', token: happySession.token });
    const adminItems = (adminList.body as { items: Array<{ slug: string }> }).items;
    expectTrue('both courts appear in GET /v1/admin/courts', [slug1, slug2].every((s) => adminItems.some((i) => i.slug === s)), JSON.stringify(adminItems));

    const publicList = await publicFetch('/courts/map');
    const publicSlugs = JSON.stringify(publicList.body);
    expectTrue('neither court appears in any public read (draft)', !publicSlugs.includes(slug1) && !publicSlugs.includes(slug2), publicSlugs.slice(0, 200));
  }

  // ═══ 4 — All-or-nothing ═════════════════════════════════════════════════════════
  console.log('\n── All-or-nothing ───────────────────────────────────────────────────');
  {
    const aonSession = await freshSession('aon');
    const file = {
      courts: [
        minimalCourt('F79 AON Valid 1'),
        minimalCourt('F79 AON Valid 2', { country: { name: 'F79 AON New Country', isoCode: 'ZH', continent: 'Africa' }, region: 'F79 AON Region' }),
        minimalCourt('F79 AON Valid 3'),
        minimalCourt('F79 AON Invalid', { surface: 'Bouncy' }),
      ],
    };

    const courtsBefore = await prisma.court.count();
    const countriesBefore = await prisma.country.count();
    const regionsBefore = await prisma.region.count();

    const commit = await adminFetch('/admin/courts/import', { method: 'POST', token: aonSession.token, json: { ...file, dryRun: false } });
    const commitBody = commit.body as { ok: boolean };
    expectTrue('3 valid + 1 invalid commit → 422, ok:false', commit.status === 422 && commitBody.ok === false, `${commit.status} ${JSON.stringify(commitBody)}`);

    const courtsAfter = await prisma.court.count();
    const countriesAfter = await prisma.country.count();
    const regionsAfter = await prisma.region.count();
    expectTrue(
      'nothing written on a failed all-or-nothing commit (courts/countries/regions unchanged)',
      courtsAfter === courtsBefore && countriesAfter === countriesBefore && regionsAfter === regionsBefore,
      `courts ${courtsBefore}->${courtsAfter} countries ${countriesBefore}->${countriesAfter} regions ${regionsBefore}->${regionsAfter}`,
    );
    await prisma.country.deleteMany({ where: { isoCode: 'ZH' } });

    const dry = await adminFetch('/admin/courts/import', { method: 'POST', token: aonSession.token, json: file });
    const dryBody = dry.body as { items: Array<{ status: string; errors: unknown[] }> };
    expectTrue(
      'a dry run of the same file reports the 3 valid items ok and the invalid one with errors',
      dryBody.items[0]?.status === 'ok' && dryBody.items[1]?.status === 'ok' && dryBody.items[2]?.status === 'ok' && dryBody.items[3]?.status === 'error' && dryBody.items[3].errors.length > 0,
      JSON.stringify(dryBody.items.map((i) => i.status)),
    );
  }

  // ═══ 5 — Idempotency / duplicates ═══════════════════════════════════════════════
  console.log('\n── Idempotency / duplicates ─────────────────────────────────────────');
  {
    const idemSession = await freshSession('idempotent');
    const name = 'F79 Idempotent Court';
    const file = { courts: [minimalCourt(name)], dryRun: false };
    const first = await adminFetch('/admin/courts/import', { method: 'POST', token: idemSession.token, json: file });
    expectTrue('first commit of a fresh court → 201', first.status === 201, JSON.stringify(first.body));

    const before = await prisma.court.count();
    const second = await adminFetch('/admin/courts/import', { method: 'POST', token: idemSession.token, json: file });
    const secondBody = second.body as { items: Array<{ errors: Array<{ message: string }> }> };
    const after = await prisma.court.count();
    expectTrue(
      'importing the same file twice → second commit 422 with "already exists" and nothing new written',
      second.status === 422 && (secondBody.items[0]?.errors ?? []).some((e) => e.message.includes('already exists')) && after === before,
      `${second.status} ${JSON.stringify(secondBody)} before=${before} after=${after}`,
    );

    const dupSlugFile = { courts: [minimalCourt('F79 Dup Slug', { slug: 'f79-dup-slug-shared' }), minimalCourt('F79 Dup Slug Two', { slug: 'f79-dup-slug-shared' })] };
    const dupSlug = await adminFetch('/admin/courts/import', { method: 'POST', token: idemSession.token, json: dupSlugFile });
    const dupSlugBody = dupSlug.body as { items: Array<{ status: string; errors: Array<{ path: string; message: string }> }> };
    expectTrue(
      'duplicate slug within one file → error on the second occurrence',
      dupSlugBody.items[0]?.status === 'ok' && dupSlugBody.items[1]?.status === 'error' && dupSlugBody.items[1].errors.some((e) => e.path === 'slug'),
      JSON.stringify(dupSlugBody.items),
    );

    const sameNameFile = { courts: [minimalCourt('F79 Same Name Court'), minimalCourt('F79 Same Name Court', { slug: 'f79-same-name-court-two' })] };
    const sameName = await adminFetch('/admin/courts/import', { method: 'POST', token: idemSession.token, json: sameNameFile });
    const sameNameBody = sameName.body as { ok: boolean; items: Array<{ status: string; warnings: unknown[] }> };
    expectTrue(
      'same name+country with a different slug → warning only, import still ok',
      sameNameBody.ok === true && sameNameBody.items[1]?.status === 'ok' && sameNameBody.items[1].warnings.length > 0,
      JSON.stringify(sameNameBody.items),
    );
  }

  // ═══ 6 — Concurrency ════════════════════════════════════════════════════════════
  console.log('\n── Concurrency (advisory lock) ──────────────────────────────────────');
  {
    const concurrencySession = await freshSession('concurrency');
    for (let run = 0; run < 5; run++) {
      const name = `F79 Concurrent Court ${run}`;
      const region = `F79 Concurrent Region ${run}`;
      const file = { courts: [minimalCourt(name, { region })], dryRun: false };

      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([
        adminFetch('/admin/courts/import', { method: 'POST', token: concurrencySession.token, json: file }),
        adminFetch('/admin/courts/import', { method: 'POST', token: concurrencySession.token, json: file }),
      ]);
      const statuses = [a.status, b.status].sort();
      const oneCreated = statuses[0] === 201 && (statuses[1] === 422 || statuses[1] === 409);

      // eslint-disable-next-line no-await-in-loop
      const slug = slugify(name);
      // eslint-disable-next-line no-await-in-loop
      const courtCount = await prisma.court.count({ where: { slug } });
      // eslint-disable-next-line no-await-in-loop
      const regionCount = await prisma.region.count({ where: { name: region } });

      expectTrue(
        `concurrency run ${run + 1}/5: exactly one 201 (other 422/409), exactly one court and one region row`,
        oneCreated && courtCount === 1 && regionCount === 1,
        `statuses=${JSON.stringify(statuses)} courtCount=${courtCount} regionCount=${regionCount}`,
      );
    }
    console.log(
      '  (advisory-lock failure mode verified manually: see the task report for the before/after run with the lock statement temporarily removed.)',
    );
  }

  // ═══ 7 — Per-field validation matrix ════════════════════════════════════════════
  console.log('\n── Per-field validation matrix ──────────────────────────────────────');
  {
    const matrixSession = await freshSession('matrix');
    await runFieldMatrix(matrixSession.token);
  }

  // ═══ 8 — Body / size / limits ═══════════════════════════════════════════════════
  console.log('\n── Body / size / limits ─────────────────────────────────────────────');
  {
    const limitsSession = await freshSession('limits');
    await runLimitsChecks(limitsSession.token);
  }

  // ═══ 9 — Create parity ══════════════════════════════════════════════════════════
  console.log('\n── Create parity with POST /v1/admin/courts ─────────────────────────');
  {
    const paritySession = await freshSession('parity');
    const countryId = await ensureFixtureCountry(FIXTURE_COUNTRY_ISO, FIXTURE_COUNTRY_NAME);
    const region = await prisma.region.create({ data: { countryId, name: 'F79 Parity Region', lat: 1, lng: 1 } });

    const shared = {
      name: 'F79 Parity Court',
      lat: 12.3456789,
      lng: 23.4567891,
      surface: 'Grass' as const,
      access: 'Academy' as const,
      indoorOutdoor: 'Indoor' as const,
      setting: 'Parity test setting.',
      tags: ['Mountains'],
    };

    const viaCreate = await adminFetch('/admin/courts', {
      method: 'POST',
      token: paritySession.token,
      json: { ...shared, countryId, regionId: region.id, slug: 'f79-parity-via-create' },
    });
    const viaImport = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token: paritySession.token,
      json: {
        dryRun: false,
        courts: [
          {
            ...shared,
            slug: 'f79-parity-via-import',
            country: { name: FIXTURE_COUNTRY_NAME, isoCode: FIXTURE_COUNTRY_ISO, continent: 'Europe' },
            region: 'F79 Parity Region',
            blurb: minimalCourt('x').blurb,
            sources: ['https://example.com/parity'],
          },
        ],
      },
    });
    expectTrue('create() and import both succeed for equivalent input', viaCreate.status === 201 && viaImport.status === 201, `${viaCreate.status} ${viaImport.status} ${JSON.stringify(viaImport.body)}`);

    const createdViaCreate = await prisma.court.findUnique({ where: { slug: 'f79-parity-via-create' }, select: { approxLat: true, approxLng: true, mapX: true, mapY: true, tags: true } });
    const createdViaImport = await prisma.court.findUnique({ where: { slug: 'f79-parity-via-import' }, select: { approxLat: true, approxLng: true, tags: true } });
    const expectedMapXY = mapCoordsFromSeed('f79-parity-via-create');
    const expectedApproxCreate = approxFromExact(shared.lat, shared.lng, 'f79-parity-via-create');
    const expectedApproxImport = approxFromExact(shared.lat, shared.lng, 'f79-parity-via-import');
    expectTrue(
      'approx/mapXY derived identically by both paths (same math, different slug seed)',
      createdViaCreate?.approxLat === expectedApproxCreate.approxLat &&
        createdViaCreate.mapX === expectedMapXY.mapX &&
        createdViaImport?.approxLat === expectedApproxImport.approxLat &&
        JSON.stringify(createdViaCreate?.tags) === JSON.stringify(createdViaImport?.tags),
      JSON.stringify({ createdViaCreate, createdViaImport, expectedMapXY, expectedApproxCreate, expectedApproxImport }),
    );
  }

  // ═══ 10 — Logging / no leaks ════════════════════════════════════════════════════
  console.log('\n── Logging / no leaks ───────────────────────────────────────────────');
  {
    const adminKeys = new Set<string>();
    collectKeys(allAdminResponseBodies, adminKeys);
    expectTrue('no admin response in this run contains a "passwordHash" key', !adminKeys.has('passwordHash'));
    console.log('  (server log line format — one per import, one `court.import` line per created court, no blurb/URL in either — verified by manual inspection of the API console output; see the task report.)');
  }

  // ═══ 11 — Kit drift test ════════════════════════════════════════════════════════
  console.log('\n── Kit drift test ───────────────────────────────────────────────────');
  {
    const kitSession = await freshSession('kit-drift');
    await runKitDriftChecks(kitSession.token);
  }

  // ═══ 12 — CORS survives the body-limit middleware's error paths (TASK_81 fix 1) ═══
  console.log('\n── CORS on body-limit error paths ───────────────────────────────────');
  {
    const corsSession = await freshSession('cors');
    await runCorsBodyLimitChecks(corsSession.token);
  }

  // ═══ 13 — resolveItems read-query count is independent of N (TASK_81 fix 2) ═══════
  console.log('\n── resolveItems read-query count (independent of N) ────────────────');
  {
    await runResolveItemsQueryCountCheck();
  }

  await cleanup();
  summarize();
}

// ── §12 helpers (CORS on body-limit error paths) ─────────────────────────────────────

async function runCorsBodyLimitChecks(token: string): Promise<void> {
  // An origin on the real allowlist (ADMIN_APP_URL is appended to
  // API_CORS_ORIGINS — see auth.config.ts) — the admin app is exactly the
  // browser client this path matters for.
  const ALLOWED_ORIGIN = process.env.ADMIN_APP_URL?.trim() || 'http://127.0.0.1:18002';
  const DISALLOWED_ORIGIN = 'https://evil.example';

  async function importWithOrigin(origin: string, rawBody: string): Promise<HttpResult> {
    const res = await fetch(`${API_BASE}/admin/courts/import`, {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${token}`, 'content-type': 'application/json', origin },
      body: rawBody,
    });
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

  const bigBlurbBody = JSON.stringify({ courts: [minimalCourt('F79 Cors Big', { blurb: 'x'.repeat(1024 * 1024 + 1000) })] });
  const malformedBody = 'not json at all {{{';
  const dryRunBody = JSON.stringify({ courts: [minimalCourt(`F79 Cors Dry ${Date.now().toString(36)}`)] });

  const cases: Array<{ label: string; rawBody: string; expectedStatus: number }> = [
    { label: 'over-1MB body', rawBody: bigBlurbBody, expectedStatus: 413 },
    { label: 'malformed JSON body', rawBody: malformedBody, expectedStatus: 400 },
    { label: 'normal dry run', rawBody: dryRunBody, expectedStatus: 200 },
  ];

  for (const { label, rawBody, expectedStatus } of cases) {
    // eslint-disable-next-line no-await-in-loop
    const allowed = await importWithOrigin(ALLOWED_ORIGIN, rawBody);
    expectTrue(
      `${label} with an allowed Origin → ${expectedStatus}, carries CORS headers`,
      allowed.status === expectedStatus &&
        allowed.headers.get('access-control-allow-origin') === ALLOWED_ORIGIN &&
        allowed.headers.get('access-control-allow-credentials') === 'true',
      `status=${allowed.status} allow-origin=${allowed.headers.get('access-control-allow-origin')} allow-credentials=${allowed.headers.get('access-control-allow-credentials')}`,
    );

    // eslint-disable-next-line no-await-in-loop
    const disallowed = await importWithOrigin(DISALLOWED_ORIGIN, rawBody);
    expectTrue(
      `${label} with a disallowed Origin → no Access-Control-Allow-Origin header`,
      disallowed.headers.get('access-control-allow-origin') === null,
      `status=${disallowed.status} allow-origin=${disallowed.headers.get('access-control-allow-origin')}`,
    );
  }

  const preflight = await fetch(`${API_BASE}/admin/courts/import`, {
    method: 'OPTIONS',
    headers: {
      origin: ALLOWED_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,authorization,x-tennis-admin',
    },
  });
  expectTrue(
    'OPTIONS preflight for the import route still answers with CORS headers',
    (preflight.status === 204 || preflight.status === 200) && preflight.headers.get('access-control-allow-origin') === ALLOWED_ORIGIN,
    `status=${preflight.status} allow-origin=${preflight.headers.get('access-control-allow-origin')}`,
  );
}

// ── §13 helpers (resolveItems read-query count) ───────────────────────────────────────

/** Direct (non-HTTP) instrumentation: construct the service with a logging
 *  PrismaClient and count `query` events during a DRY RUN, which performs NO
 *  writes and no other DB access besides `resolveItems`'s own preload reads
 *  (TASK_81 fix 2 — these must be a fixed, small, N-independent count). */
async function runResolveItemsQueryCountCheck(): Promise<void> {
  const countingPrisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  let queryCount = 0;
  (countingPrisma as unknown as { $on: (event: 'query', cb: () => void) => void }).$on('query', () => {
    queryCount += 1;
  });
  const service = new AdminCourtImportService(countingPrisma as unknown as PrismaService);

  const counts: Record<number, number> = {};
  for (const n of [1, 10, 50]) {
    const courts = Array.from({ length: n }, (_, i) =>
      minimalCourt(`F79 QueryCount ${n}-${i}`, { region: 'F79 Query Count Region' }),
    );
    queryCount = 0;
    // eslint-disable-next-line no-await-in-loop
    await service.run(courts, true, 'f79-query-count-harness');
    counts[n] = queryCount;
  }
  await countingPrisma.$disconnect();

  console.log(`  resolveItems read-query counts: N=1 → ${counts[1]}, N=10 → ${counts[10]}, N=50 → ${counts[50]}`);
  expectTrue(
    'resolveItems issues the SAME number of read queries for N=1, 10, and 50 items',
    counts[1] === counts[10] && counts[10] === counts[50],
    JSON.stringify(counts),
  );
  expectTrue(
    'resolveItems issues a small, bounded number of read queries (<= 10, independent of N)',
    typeof counts[1] === 'number' && counts[1] <= 10,
    JSON.stringify(counts),
  );
}

// ── §7 helpers ───────────────────────────────────────────────────────────────────────

async function runFieldMatrix(token: string): Promise<void> {
  async function expectItemError(name: string, item: Record<string, unknown>, pathPrefix: string): Promise<void> {
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: [item] } });
    const body = res.body as { items: Array<{ status: string; errors: Array<{ path: string }> }> };
    const errored = body?.items?.[0]?.status === 'error';
    const hasPath = body?.items?.[0]?.errors?.some((e) => e.path === pathPrefix || e.path.startsWith(`${pathPrefix}.`) || e.path.startsWith(`${pathPrefix}[`));
    expectTrue(name, res.status === 200 && errored && hasPath, `status=${res.status} body=${JSON.stringify(body)}`);
  }

  const base = minimalCourt('F79 Matrix');

  await expectItemError('missing name → error on "name"', withoutKey(base, 'name'), 'name');
  await expectItemError('missing country → error on "country"', withoutKey(base, 'country'), 'country');
  await expectItemError('missing region → error on "region"', withoutKey(base, 'region'), 'region');
  await expectItemError('missing lat → error on "lat"', withoutKey(base, 'lat'), 'lat');
  await expectItemError('missing lng → error on "lng"', withoutKey(base, 'lng'), 'lng');
  await expectItemError('missing surface → error on "surface"', withoutKey(base, 'surface'), 'surface');
  await expectItemError('missing access → error on "access"', withoutKey(base, 'access'), 'access');
  await expectItemError('missing indoorOutdoor → error on "indoorOutdoor"', withoutKey(base, 'indoorOutdoor'), 'indoorOutdoor');
  await expectItemError('missing setting → error on "setting"', withoutKey(base, 'setting'), 'setting');
  await expectItemError('missing blurb → error on "blurb"', withoutKey(base, 'blurb'), 'blurb');
  await expectItemError('missing sources → error on "sources"', withoutKey(base, 'sources'), 'sources');

  await expectItemError('unknown extra key → error', minimalCourt('F79 Matrix', { bogusField: 1 }), 'bogusField');
  await expectItemError('"status" present → error', minimalCourt('F79 Matrix', { status: 'published' }), 'status');
  await expectItemError('"images" present → error', minimalCourt('F79 Matrix', { images: [] }), 'images');
  await expectItemError('wrong type (lat as string) → error', minimalCourt('F79 Matrix', { lat: '10.5' }), 'lat');

  for (const bad of ['Bouncy', 1, null]) {
    await expectItemError(`surface=${JSON.stringify(bad)} → error`, minimalCourt('F79 Matrix', { surface: bad }), 'surface');
  }
  for (const bad of ['Hotel', 2]) {
    await expectItemError(`access=${JSON.stringify(bad)} → error`, minimalCourt('F79 Matrix', { access: bad }), 'access');
  }
  await expectItemError('indoorOutdoor="Sideways" → error', minimalCourt('F79 Matrix', { indoorOutdoor: 'Sideways' }), 'indoorOutdoor');
  await expectItemError('country.continent="Narnia" → error', minimalCourt('F79 Matrix', { country: { ...base.country as object, continent: 'Narnia' } }), 'country.continent');

  await expectItemError('lat=91 (out of range) → error', minimalCourt('F79 Matrix', { lat: 91 }), 'lat');
  await expectItemError('lat/lng = 0,0 → error', minimalCourt('F79 Matrix', { lat: 0, lng: 0 }), 'lat');
  await expectItemError('lat with 8 decimals → error', minimalCourt('F79 Matrix', { lat: 10.123456789 }), 'lat');
  await expectItemError('lat as a non-numeric string → error', minimalCourt('F79 Matrix', { lat: 'not-a-number' }), 'lat');

  for (const bad of ['http://evil.example/maps', 'https://constructor/x', 'https://www.google.com.evil.example/maps', 'https://user:pw@www.google.com/maps']) {
    await expectItemError(`mapLinkUrl="${bad}" → error`, minimalCourt('F79 Matrix', { mapLinkUrl: bad }), 'mapLinkUrl');
  }
  {
    const ok = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      json: { courts: [minimalCourt('F79 Matrix', { mapLinkUrl: 'https://maps.app.goo.gl/abc123' })] },
    });
    const okBody = ok.body as { items: Array<{ status: string }> };
    expectTrue('mapLinkUrl with an accepted host → ok', okBody.items[0]?.status === 'ok', JSON.stringify(okBody));
  }

  await expectItemError('unknown tag → error on "tags[0]"', minimalCourt('F79 Matrix', { tags: ['Not A Real Tag'] }), 'tags[0]');
  {
    const dup = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      json: { courts: [minimalCourt('F79 Matrix', { tags: ['Garden', 'Garden', 'Sea View'] })] },
    });
    const dupBody = dup.body as { items: Array<{ status: string }> };
    expectTrue('duplicate tags normalised, item still ok', dupBody.items[0]?.status === 'ok', JSON.stringify(dupBody));
  }

  await expectItemError('name too short → error', minimalCourt('F79 Matrix', { name: 'A' }), 'name');
  await expectItemError('setting too long (>120) → error', minimalCourt('F79 Matrix', { setting: 'x'.repeat(121) }), 'setting');
  await expectItemError('blurb too short (<40) → error', minimalCourt('F79 Matrix', { blurb: 'too short' }), 'blurb');
  await expectItemError('"<script>" in blurb → error', minimalCourt('F79 Matrix', { blurb: `${base.blurb}<script>alert(1)</script>` }), 'blurb');
  await expectItemError('too many blurb paragraphs (7) → error', minimalCourt('F79 Matrix', { blurb: Array.from({ length: 7 }, (_, i) => `Paragraph number ${i} of the fixture blurb text body here.`).join('\n\n') }), 'blurb');

  await expectItemError('sources missing → error', withoutKey(base, 'sources'), 'sources');
  await expectItemError('sources empty array → error', minimalCourt('F79 Matrix', { sources: [] }), 'sources');
  await expectItemError('sources with http:// → error', minimalCourt('F79 Matrix', { sources: ['http://example.com'] }), 'sources');
  await expectItemError('sources with 11 entries → error', minimalCourt('F79 Matrix', { sources: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`) }), 'sources');
  await expectItemError('sources with a non-URL string → error', minimalCourt('F79 Matrix', { sources: ['not a url'] }), 'sources');

  await expectItemError('slug with an invalid pattern → error', minimalCourt('F79 Matrix', { slug: 'Not Valid Slug!' }), 'slug');
  {
    const lower = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: [minimalCourt('F79 Matrix', { country: { name: FIXTURE_COUNTRY_NAME, isoCode: FIXTURE_COUNTRY_ISO.toLowerCase(), continent: 'Europe' } })] } });
    const lowerBody = lower.body as { items: Array<{ status: string }> };
    expectTrue('lower-case isoCode accepted (upper-cased by the service)', lowerBody.items[0]?.status === 'ok', JSON.stringify(lowerBody));
  }
  await expectItemError('isoCode of wrong length → error', minimalCourt('F79 Matrix', { country: { name: 'X', isoCode: 'ABC', continent: 'Europe' } }), 'country.isoCode');

  {
    const mismatch = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      json: { courts: [minimalCourt('F79 Matrix', { country: { name: `${FIXTURE_COUNTRY_NAME} Renamed`, isoCode: FIXTURE_COUNTRY_ISO, continent: 'Asia' } })] },
    });
    const mismatchBody = mismatch.body as { items: Array<{ status: string; warnings: unknown[] }> };
    expectTrue('existing-country name/continent mismatch → warning, not an error', mismatchBody.items[0]?.status === 'ok' && mismatchBody.items[0].warnings.length > 0, JSON.stringify(mismatchBody));
  }
  {
    const otherIso = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      json: { courts: [minimalCourt('F79 Matrix', { country: { name: FIXTURE_COUNTRY_NAME, isoCode: 'ZK', continent: 'Europe' } })] },
    });
    const otherIsoBody = otherIso.body as { items: Array<{ status: string; errors: Array<{ path: string }> }> };
    expectTrue('same country name under a different isoCode → error', otherIsoBody.items[0]?.status === 'error' && otherIsoBody.items[0].errors.some((e) => e.path === 'country.name'), JSON.stringify(otherIsoBody));
  }

  for (const [label, value] of [['null', null], ['string', '"oops"'], ['array', '[]'], ['number', '42']] as const) {
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, rawBody: `{"courts":[${typeof value === 'string' ? value : JSON.stringify(value)}]}` });
    const body = res.body as { items: Array<{ status: string }> };
    expectTrue(`item that is ${label} → item error, not a 500`, res.status === 200 && body.items[0]?.status === 'error', `status=${res.status} body=${JSON.stringify(body)}`);
  }

  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const res = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      rawBody: JSON.stringify({ courts: [{ [key]: { x: 1 }, ...minimalCourt('F79 Matrix Danger') }] }),
    });
    const body = res.body as { items: Array<{ status: string; errors: Array<{ path: string }> }> };
    expectTrue(
      `"${key}" key anywhere in an item → item error, not a 500`,
      res.status === 200 && body.items[0]?.status === 'error' && body.items[0].errors.some((e) => e.path === key),
      `status=${res.status} body=${JSON.stringify(body)}`,
    );
  }

  // Other items in the same request are unaffected by one bad item.
  {
    const res = await adminFetch('/admin/courts/import', {
      method: 'POST',
      token,
      json: { courts: [minimalCourt('F79 Matrix Good'), minimalCourt('F79 Matrix Bad', { surface: 'Bouncy' })] },
    });
    const body = res.body as { items: Array<{ status: string }> };
    expectTrue('one bad item does not affect another item\'s result', body.items[0]?.status === 'ok' && body.items[1]?.status === 'error', JSON.stringify(body.items.map((i) => i.status)));
  }
}

function withoutKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

// ── §8 helpers ───────────────────────────────────────────────────────────────────────

async function runLimitsChecks(token: string): Promise<void> {
  {
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: [] } });
    expectTrue('courts: [] → 400', res.status === 400, `got ${res.status}`);
  }
  {
    const items = Array.from({ length: 51 }, (_, i) => minimalCourt(`F79 Many ${i}`));
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: items } });
    expectTrue('51 items → 400', res.status === 400, `got ${res.status}`);
  }
  {
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, rawBody: 'not json at all' });
    expectTrue('non-JSON body → 400', res.status === 400, `got ${res.status}`);
  }
  {
    const bigBlurb = 'x'.repeat(1024 * 1024 + 1000);
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: [minimalCourt('F79 Big', { blurb: bigBlurb })] } });
    expectTrue('body > 1 MB → 413', res.status === 413, `got ${res.status}`);
  }
  {
    const okBigName = 'x'.repeat(150 * 1024);
    const res = await adminFetch('/admin/courts', { method: 'POST', token, json: { name: okBigName, countryId: 'does-not-matter', regionId: 'does-not-matter', lat: 1, lng: 1, surface: 'Clay', access: 'Club', indoorOutdoor: 'Outdoor', setting: 's' } });
    expectTrue('a 150 kB body to another admin route is still rejected (global limit not raised)', res.status === 413, `got ${res.status}`);
  }
  {
    const results2: number[] = [];
    for (let i = 0; i < 11; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { dryRun: false, courts: [minimalCourt(`F79 RateLimit ${i}-${RUN_ID}`)] } });
      results2.push(res.status);
    }
    const eleventh = results2[10];
    expectTrue('11th commit within the window → 429', eleventh === 429, `statuses=${JSON.stringify(results2)}`);

    const dryRunAfterLimit = await adminFetch('/admin/courts/import', { method: 'POST', token, json: { courts: [minimalCourt(`F79 RateLimit dry-${RUN_ID}`)] } });
    expectTrue('dry runs are not counted against the commit limit', dryRunAfterLimit.status === 200, `got ${dryRunAfterLimit.status}`);
  }
}

// ── §11 helpers (kit drift) ──────────────────────────────────────────────────────────

async function runKitDriftChecks(token: string): Promise<void> {
  const kitDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'court-import');

  let schema: { $defs: { court: { required: string[]; properties: Record<string, unknown> } } } | undefined;
  try {
    schema = JSON.parse(readFileSync(path.join(kitDir, 'court-import.schema.json'), 'utf-8'));
    expectTrue('court-import.schema.json parses as JSON', true);
  } catch (err) {
    expectTrue('court-import.schema.json parses as JSON', false, String(err));
  }

  if (schema) {
    const props = schema.$defs.court.properties as Record<string, { enum?: string[] }>;
    expectTrue('schema surface enum matches SURFACES', JSON.stringify(props.surface?.enum) === JSON.stringify(SURFACES), JSON.stringify(props.surface?.enum));
    expectTrue('schema access enum matches ACCESS_TYPES', JSON.stringify(props.access?.enum) === JSON.stringify(ACCESS_TYPES), JSON.stringify(props.access?.enum));
    expectTrue('schema indoorOutdoor enum matches INDOOR_OUTDOOR', JSON.stringify(props.indoorOutdoor?.enum) === JSON.stringify(INDOOR_OUTDOOR), JSON.stringify(props.indoorOutdoor?.enum));
    const continentEnum = (props.country as unknown as { properties: Record<string, { enum?: string[] }> }).properties.continent.enum;
    expectTrue('schema continent enum matches CONTINENTS', JSON.stringify(continentEnum) === JSON.stringify(CONTINENTS), JSON.stringify(continentEnum));
    const tagEnum = (props.tags as unknown as { items: { enum?: string[] } }).items.enum;
    expectTrue('schema tags enum matches COURT_TAGS', JSON.stringify(tagEnum) === JSON.stringify(COURT_TAGS), JSON.stringify(tagEnum));

    const requiredSchema = new Set(schema.$defs.court.required);
    const requiredDto = new Set(['name', 'country', 'region', 'lat', 'lng', 'surface', 'access', 'indoorOutdoor', 'setting', 'blurb', 'sources']);
    expectTrue('schema "required" list matches the DTO\'s required fields', setsEqual(requiredSchema, requiredDto), `${[...requiredSchema]} vs ${[...requiredDto]}`);

    const schemaProps = new Set(Object.keys(props));
    const dtoProps = new Set(['name', 'slug', 'country', 'region', 'lat', 'lng', 'mapLinkUrl', 'surface', 'access', 'indoorOutdoor', 'setting', 'isScenic', 'tags', 'blurb', 'isLocked', 'isFeatured', 'sources', 'notes']);
    expectTrue('every DTO property exists in the schema and vice versa', setsEqual(schemaProps, dtoProps), `${[...schemaProps]} vs ${[...dtoProps]}`);
  }

  try {
    const exampleRaw = readFileSync(path.join(kitDir, 'example.json'), 'utf-8');
    const example = JSON.parse(exampleRaw) as { courts: unknown[] };
    const res = await adminFetch('/admin/courts/import', { method: 'POST', token, json: example });
    const body = res.body as { items: Array<{ status: string; errors: Array<{ message: string }> }> };
    const allOkOrSlugExists = body.items.every((i) => i.status === 'ok' || (i.errors.length === 1 && i.errors[0]!.message.includes('already exists')));
    expectTrue(
      'example.json dry-runs: every item is ok, or its only error is "already exists"',
      res.status === 200 && allOkOrSlugExists,
      body.items.map((i) => `${i.status}: ${JSON.stringify(i.errors)}`).join(' | '),
    );
  } catch (err) {
    expectTrue('example.json dry-runs cleanly', false, String(err));
  }

  try {
    const prompt = readFileSync(path.join(kitDir, 'AGENT_PROMPT.md'), 'utf-8');
    const missingTags = COURT_TAGS.filter((t) => !prompt.includes(t));
    const missingEnumValues = [...SURFACES, ...ACCESS_TYPES, ...INDOOR_OUTDOOR].filter((v) => !prompt.includes(v));
    expectTrue('AGENT_PROMPT.md mentions every tag in the vocabulary', missingTags.length === 0, `missing: ${missingTags.join(', ')}`);
    expectTrue('AGENT_PROMPT.md mentions every surface/access/indoorOutdoor value', missingEnumValues.length === 0, `missing: ${missingEnumValues.join(', ')}`);
  } catch (err) {
    expectTrue('AGENT_PROMPT.md readable and complete', false, String(err));
  }

  try {
    const guide = readFileSync(path.join(kitDir, 'CLIENT_GUIDE.ru.md'), 'utf-8');
    expectTrue('CLIENT_GUIDE.ru.md exists, is non-empty, and contains Cyrillic text', guide.trim().length > 0 && /[Ѐ-ӿ]/.test(guide));
  } catch (err) {
    expectTrue('CLIENT_GUIDE.ru.md exists and is readable', false, String(err));
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ── misc ─────────────────────────────────────────────────────────────────────────────

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}   Skipped: ${skips.length}`);
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  if (skips.length) {
    console.log('\nSkipped checks:');
    for (const s of skips) console.log(`  - ${s.name} — ${s.reason}`);
  }
  const allowSkips = process.env.ALLOW_SKIPS === '1';
  if (failed.length || (skips.length && !allowSkips)) {
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — admin court import (TASK_79).\x1b[0m\n');
}

main()
  .catch(async (err) => {
    console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
