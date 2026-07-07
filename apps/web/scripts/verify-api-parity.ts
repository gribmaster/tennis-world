/* eslint-disable no-console */
//
// Feature 47 — Dual-mode mock/API parity verification harness.
//
// Proves that the MOCK repositories (`NEXT_PUBLIC_DATA_SOURCE=mock`) and the HTTP
// repositories (`NEXT_PUBLIC_DATA_SOURCE=api`) return EQUIVALENT DTOs for the
// public read domains (courts, collections, journal). It is the executable form of
// the "mock-first proof point" in docs/FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md §6:
// for each repository method the pages actually call, run BOTH implementations and
// assert deep equality, plus security (coordinate-masking) and shape invariants on
// the HTTP responses.
//
// VERIFICATION ONLY — no product behavior. This script never mutates data; it only
// reads. It does not import any UI/React code. The two saved/user domains stay on
// the mock in `api` mode (Phase 4), so they are intentionally NOT compared here.
//
// ── How it runs ──────────────────────────────────────────────────────────────────
//   pnpm --filter @tennis/web verify:api-parity
//     → tsx scripts/verify-api-parity.ts
//
// It instantiates the concrete repository classes DIRECTLY (bypassing the env-driven
// factory) so a single process can drive both data sources at once: the mock repos
// read `@tennis/mock-data` in-process; the HTTP repos `fetch` the live API. The
// API base URL comes from `NEXT_PUBLIC_API_BASE_URL` (default
// http://localhost:3001/v1) — the same resolution the real http-client uses.
//
// ── Prerequisites (see docs/FEATURE_47_DUAL_MODE_PARITY.md) ───────────────────────
//   pnpm db:up
//   pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api dev          (or: node apps/api/dist/main.js)
// If the API is not reachable the script exits non-zero with a clear instruction.
//
// Importing the repos by RELATIVE path (not the `@/` alias) on purpose: `tsx` does
// not read the Next tsconfig `paths`, and this keeps the harness free of any build
// tooling. The workspace packages (`@tennis/mock-data`, `@tennis/contracts`)
// resolve normally through node_modules.

import { MockCourtRepository } from '../src/domain/courts/mock-court.repository';
import { MockCollectionRepository } from '../src/domain/collections/mock-collection.repository';
import { MockArticleRepository } from '../src/domain/journal/mock-article.repository';
import { HttpCourtRepository } from '../src/domain/http/http-court.repository';
import { HttpCollectionRepository } from '../src/domain/http/http-collection.repository';
import { HttpArticleRepository } from '../src/domain/http/http-article.repository';
import { HttpError } from '../src/domain/http/http-client';

// ─────────────────────────────────────────────────────────────────────────────
// Tiny assertion + result harness (no test framework — prompt task 1: "do not
// overbuild"). Each check appends a pass/fail line; the process exits non-zero if
// any check failed.
// ─────────────────────────────────────────────────────────────────────────────

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
  if (!ok && detail) {
    for (const line of detail.split('\n')) console.log(`        ${line}`);
  }
}

// ── Canonical, order-insensitive-for-keys deep equality ──────────────────────────
//
// Repository list ORDER is significant (mock and API both define a stable order),
// so arrays are compared positionally — NOT sorted. Only OBJECT KEYS are
// canonicalized (sorted) so `{a,b}` and `{b,a}` serialize identically; tuples like
// `mapCoords` are arrays and keep their element order. This catches an extra/missing
// key, a changed value, a reordered list, or a differing length.

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

/** Compact unified-ish diff: first N differing lines of the two stable renders. */
function firstDiff(a: string, b: string, max = 12): string {
  const al = a.split('\n');
  const bl = b.split('\n');
  const out: string[] = [];
  const len = Math.max(al.length, bl.length);
  for (let i = 0; i < len && out.length < max; i++) {
    if (al[i] !== bl[i]) {
      out.push(`- mock: ${al[i] ?? '∅'}`);
      out.push(`+ api : ${bl[i] ?? '∅'}`);
    }
  }
  return out.join('\n');
}

/** Deep-equal check between a mock result and an HTTP result. */
function expectEqual(name: string, mock: unknown, api: unknown): void {
  const m = stable(mock);
  const a = stable(api);
  if (m === a) {
    record(name, true);
  } else {
    record(name, false, firstDiff(m, a));
  }
}

/** Boolean invariant check (masking / shape assertions). */
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}

// ── The ONE intentional normalization: exact coordinates on court DETAIL ─────────
//
// This is the single documented, deliberate non-byte difference between the two
// implementations (prompt task 3) — and it is a DESIGNED difference, not a bug:
//
//   • The MOCK `getBySlug` returns the full `CourtDTO` INCLUDING exact `lat`/`lng`
//     (Phase 1 has no entitlement gating, so the mock does not blur — see
//     mock-court.repository.ts).
//   • The API `getBySlug` masks exact coordinates server-side (the public Prisma
//     select never reads `Court.lat`/`lng`), so `CourtDTO.lat`/`lng` are OMITTED on
//     the wire (they are `.optional()` in the contract for exactly this reason).
//
// So byte-for-byte the mock detail carries two keys the API correctly withholds.
// For the equivalence comparison we strip those two keys from the MOCK side; we do
// NOT add anything to the API side. The masking itself is asserted INDEPENDENTLY by
// `assertNoExactCoords` (which must continue to pass), so removing them here cannot
// hide a leak — a leak would fail that separate assertion. This is the only place
// the harness normalizes, and it is narrowed to exactly `lat`/`lng` on detail.
function stripExactCoords(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object') return detail;
  const { lat: _lat, lng: _lng, ...rest } = detail as Record<string, unknown>;
  return rest;
}

// ── Coordinate-masking helpers (prompt task 4) ───────────────────────────────────

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

/** Assert no `lat`/`lng` key appears at ANY nesting depth in an HTTP payload. */
function assertNoExactCoords(name: string, payload: unknown): void {
  const keys = collectKeys(payload);
  const leaked = ['lat', 'lng'].filter((k) => keys.has(k));
  expectTrue(
    `${name}: no exact lat/lng keys (masking)`,
    leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(', ')}` : undefined,
  );
}

/** Assert every element carries the always-public approx geo + map coords. */
function assertApproxPresent(name: string, summaries: ReadonlyArray<Record<string, unknown>>): void {
  const missing = summaries.filter(
    (c) =>
      typeof c.approxLat !== 'number' ||
      typeof c.approxLng !== 'number' ||
      !Array.isArray(c.mapCoords),
  );
  expectTrue(
    `${name}: approxLat/approxLng + mapCoords present`,
    summaries.length > 0 && missing.length === 0,
    missing.length ? `${missing.length} element(s) missing approx/map fields` : 'empty set',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository instances. Mock = in-process; HTTP = live API via fetch.
// ─────────────────────────────────────────────────────────────────────────────

const mockCourts = new MockCourtRepository();
const httpCourts = new HttpCourtRepository();
const mockCollections = new MockCollectionRepository();
const httpCollections = new HttpCollectionRepository();
const mockArticles = new MockArticleRepository();
const httpArticles = new HttpArticleRepository();

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// ─────────────────────────────────────────────────────────────────────────────
// Preflight — fail fast with an actionable message if the API is not reachable.
// ─────────────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  try {
    // Cheapest live read; also proves the DB is seeded enough to answer.
    await httpCourts.list();
  } catch (err) {
    const reason =
      err instanceof HttpError
        ? `API responded ${err.status} for ${err.path}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error('\n\x1b[31mCannot reach the API for parity verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/courts`);
    console.error(`  Reason: ${reason}\n`);
    console.error('  Start the dependencies first:');
    console.error('    pnpm db:up');
    console.error('    pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)\n');
    console.error('  Optionally set NEXT_PUBLIC_API_BASE_URL (default http://localhost:3001/v1).\n');
    process.exit(2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain comparisons.
// ─────────────────────────────────────────────────────────────────────────────

async function compareCourts(): Promise<void> {
  console.log('\nCourts — MockCourtRepository vs HttpCourtRepository');

  // list() variants — filter values are taken from real mock data.
  expectEqual('courts.list()', await mockCourts.list(), await httpCourts.list());
  expectEqual(
    'courts.list({ featured: true, limit: 6 })',
    await mockCourts.list({ featured: true, limit: 6 }),
    await httpCourts.list({ featured: true, limit: 6 }),
  );
  expectEqual(
    "courts.list({ collection: 'coastal-courts' })",
    await mockCourts.list({ collection: 'coastal-courts' }),
    await httpCourts.list({ collection: 'coastal-courts' }),
  );
  expectEqual(
    "courts.list({ surface: 'Clay' })",
    await mockCourts.list({ surface: 'Clay' }),
    await httpCourts.list({ surface: 'Clay' }),
  );
  expectEqual(
    "courts.list({ access: 'Club' })",
    await mockCourts.list({ access: 'Club' }),
    await httpCourts.list({ access: 'Club' }),
  );
  // search(q) routes through list({ q }) in both implementations.
  expectEqual(
    "courts.search('Como')",
    await mockCourts.search('Como'),
    await httpCourts.search('Como'),
  );
  expectEqual(
    "courts.list({ q: 'lake' })",
    await mockCourts.list({ q: 'lake' }),
    await httpCourts.list({ q: 'lake' }),
  );

  // getBySlug — hit + miss(→null). The mock detail carries exact lat/lng that the
  // API deliberately masks; strip them from the mock side before comparing (the
  // ONLY intentional normalization — see stripExactCoords). Masking is asserted
  // separately below, so this cannot hide a leak.
  expectEqual(
    "courts.getBySlug('grand-hotel-tremezzo') [exact lat/lng stripped from mock]",
    stripExactCoords(await mockCourts.getBySlug('grand-hotel-tremezzo')),
    await httpCourts.getBySlug('grand-hotel-tremezzo'),
  );
  expectEqual(
    "courts.getBySlug('not-a-real-court') → null",
    await mockCourts.getBySlug('not-a-real-court'),
    await httpCourts.getBySlug('not-a-real-court'),
  );

  // getMapPins.
  expectEqual('courts.getMapPins()', await mockCourts.getMapPins(), await httpCourts.getMapPins());

  // getRelated — `tremezzo` is a real court id; `como` is NOT a court id (the mock
  // keys getRelated off id, so it returns [] — the HTTP repo must too). Plus a
  // smaller limit to exercise the slice.
  expectEqual(
    "courts.getRelated('tremezzo', 4)",
    await mockCourts.getRelated('tremezzo', 4),
    await httpCourts.getRelated('tremezzo', 4),
  );
  expectEqual(
    "courts.getRelated('como', 4) → [] (no such court id)",
    await mockCourts.getRelated('como', 4),
    await httpCourts.getRelated('como', 4),
  );
  expectEqual(
    "courts.getRelated('tremezzo', 2)",
    await mockCourts.getRelated('tremezzo', 2),
    await httpCourts.getRelated('tremezzo', 2),
  );

  // ── Security: coordinate masking on the HTTP side (prompt task 4) ──────────────
  const apiList = await httpCourts.list();
  const apiDetail = await httpCourts.getBySlug('grand-hotel-tremezzo');
  const apiMap = await httpCourts.getMapPins();
  const apiRelated = await httpCourts.getRelated('tremezzo', 4);

  assertNoExactCoords('courts.list', apiList);
  assertNoExactCoords('courts.getBySlug', apiDetail);
  assertNoExactCoords('courts.getMapPins', apiMap);
  assertNoExactCoords('courts.getRelated', apiRelated);

  assertApproxPresent('courts.list', apiList as Record<string, unknown>[]);
  assertApproxPresent('courts.getRelated', apiRelated as Record<string, unknown>[]);
  if (apiDetail) assertApproxPresent('courts.getBySlug', [apiDetail as Record<string, unknown>]);

  // ── Shape: HTTP detail + map + list invariants (prompt task 5) ─────────────────
  if (apiDetail) {
    const detailKeys = Object.keys(apiDetail).sort();
    const expectedDetailKeys = [
      'access', 'approxLat', 'approxLng', 'blurb', 'country', 'heroImageUrl', 'id',
      'images', 'indoorOutdoor', 'isFeatured', 'isLocked', 'isScenic', 'mapCoords',
      'name', 'region', 'setting', 'slug', 'status', 'surface',
    ].sort();
    expectTrue(
      'courts.getBySlug: detail has exactly the CourtDTO keys (no Prisma internals, no lat/lng)',
      JSON.stringify(detailKeys) === JSON.stringify(expectedDetailKeys),
      `got: ${detailKeys.join(', ')}`,
    );
    // images present + ordered by sortOrder ascending (non-decreasing).
    const imgs = (apiDetail as { images: { sortOrder: number }[] }).images;
    let ordered = true;
    let prevSort = -Infinity;
    for (const img of imgs) {
      if (img.sortOrder < prevSort) ordered = false;
      prevSort = img.sortOrder;
    }
    expectTrue(
      'courts.getBySlug: images present and ordered by sortOrder',
      imgs.length > 0 && ordered,
      `images=${imgs.length}, ordered=${ordered}`,
    );
  }

  // Map pins carry ONLY the four MapPinDTO fields — nothing else.
  const pinKeysOk = apiMap.every(
    (p) =>
      JSON.stringify(Object.keys(p as object).sort()) ===
      JSON.stringify(['courtId', 'mapCoords', 'slug', 'state']),
  );
  expectTrue('courts.getMapPins: pins have only courtId/slug/mapCoords/state', pinKeysOk);
}

async function compareCollections(): Promise<void> {
  console.log('\nCollections — MockCollectionRepository vs HttpCollectionRepository');

  expectEqual('collections.list()', await mockCollections.list(), await httpCollections.list());
  expectEqual(
    'collections.list({ limit: 4 })',
    await mockCollections.list({ limit: 4 }),
    await httpCollections.list({ limit: 4 }),
  );
  expectEqual(
    'collections.list({ featured: true })',
    await mockCollections.list({ featured: true }),
    await httpCollections.list({ featured: true }),
  );
  expectEqual(
    "collections.getBySlug('coastal-courts')",
    await mockCollections.getBySlug('coastal-courts'),
    await httpCollections.getBySlug('coastal-courts'),
  );
  expectEqual(
    "collections.getBySlug('not-a-real-collection') → null",
    await mockCollections.getBySlug('not-a-real-collection'),
    await httpCollections.getBySlug('not-a-real-collection'),
  );

  // ── Shape: collection detail must NOT embed a `courts` array (prompt task 5) ───
  // CollectionDTO required keys are always present; `description` is OPTIONAL and is
  // omitted when null (coastal-courts has none), so we check a SUBSET relationship
  // against the allowed key set rather than an exact list — and assert the critical
  // invariant that there is no embedded `courts` array (Risk #10 regression guard).
  const detail = await httpCollections.getBySlug('coastal-courts');
  if (detail) {
    const keys = Object.keys(detail);
    const allowed = new Set(['id', 'slug', 'name', 'description', 'coverImageUrl', 'type', 'count']);
    const required = ['id', 'slug', 'name', 'coverImageUrl', 'type', 'count'];
    const noUnknownKeys = keys.every((k) => allowed.has(k));
    const hasRequired = required.every((k) => k in detail);
    expectTrue(
      'collections.getBySlug: CollectionDTO only (has `count`, NO `courts` key, no Prisma internals)',
      !('courts' in detail) && noUnknownKeys && hasRequired,
      `got: ${keys.sort().join(', ')}`,
    );
  }
}

async function compareArticles(): Promise<void> {
  console.log('\nJournal — MockArticleRepository vs HttpArticleRepository');

  expectEqual('journal.list()', await mockArticles.list(), await httpArticles.list());
  expectEqual(
    'journal.list({ limit: 3 })',
    await mockArticles.list({ limit: 3 }),
    await httpArticles.list({ limit: 3 }),
  );
  expectEqual(
    'journal.list({ featured: true })',
    await mockArticles.list({ featured: true }),
    await httpArticles.list({ featured: true }),
  );
  expectEqual(
    "journal.getBySlug('the-world-as-a-tennis-map')",
    await mockArticles.getBySlug('the-world-as-a-tennis-map'),
    await httpArticles.getBySlug('the-world-as-a-tennis-map'),
  );
  expectEqual(
    "journal.getBySlug('not-a-real-article') → null",
    await mockArticles.getBySlug('not-a-real-article'),
    await httpArticles.getBySlug('not-a-real-article'),
  );

  // ── Shape: full ArticleDTO[] incl. bodyRichText + author (prompt task 5) ───────
  const apiList = await httpArticles.list();
  const allFull = apiList.every(
    (a) =>
      typeof (a as Record<string, unknown>).bodyRichText === 'string' &&
      typeof (a as Record<string, unknown>).author === 'string' &&
      typeof (a as Record<string, unknown>).publishedAt === 'string',
  );
  expectTrue(
    'journal.list: every item is a full ArticleDTO (bodyRichText + author + publishedAt)',
    apiList.length > 0 && allFull,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main.
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Dual-mode mock/API parity verification (Feature 47)');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();

  await compareCourts();
  await compareCollections();
  await compareArticles();

  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mPARITY VERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log('\n\x1b[32mPARITY VERIFIED — mock and API return equivalent DTOs.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exit(1);
});
