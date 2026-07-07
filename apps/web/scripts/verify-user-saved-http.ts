/* eslint-disable no-console */
//
// Feature 56 — Direct live verification of HttpUserRepository + HttpSavedRepository.
//
// The factory is NOT flipped to these HTTP repos in this feature (saved/user stay on
// the mock in `api` mode until Feature 57), so they can't be exercised through the
// app yet. This script drives them DIRECTLY against the live, auth-gated /v1/me/*
// API — the executable proof that the Feature-56 repositories work end-to-end.
//
// It instantiates the concrete `HttpUserRepository` / `HttpSavedRepository` classes
// (bypassing the env-driven factory) and authenticates every request with a BEARER
// token (the AuthGuard's `Authorization: Bearer <jwt>` path) — the same transport a
// mobile client uses, and the easiest to drive from a script.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   1. Bring up the deps + a logged-in token:
//        pnpm db:up
//        pnpm --filter @tennis/api db:seed
//        pnpm --filter @tennis/api dev        # (or: node apps/api/dist/main.js)
//   2. Obtain a bearer token via the real magic-link flow (the DB stores only the
//      token HASH, so the RAW token comes from the dev mailer log — MAGIC_LINK_DEV_LOG
//      defaults to true):
//        # request a link (always 202):
//        curl -s -X POST http://localhost:3001/v1/auth/request-link \
//          -H 'content-type: application/json' \
//          -d '{"email":"feature56@example.com"}'
//        # copy the `?token=...` value the API logs at WARN ("[dev magic-link] ..."),
//        # then exchange it for a session (returns { accessToken }):
//        curl -s -X POST http://localhost:3001/v1/auth/verify \
//          -H 'content-type: application/json' \
//          -d '{"token":"<RAW_TOKEN_FROM_LOG>"}'
//   3. Run this script with that token:
//        AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:user-saved-http
//
// The API base URL comes from `NEXT_PUBLIC_API_BASE_URL` (default
// http://localhost:3001/v1) — the same resolution the real http-client uses.
//
// Repos are imported by RELATIVE path (not the `@/` alias): `tsx` does not read the
// Next tsconfig `paths`. The workspace packages resolve normally through node_modules.
//
// CLEANUP: the script creates ONE wishlist folder ("Summer Italy" → renamed "Lake
// Como") and toggles one court (`tremezzo`) into and back out of it. The toggle leaves
// the folder empty again; the residual empty folder is harmless (a re-run just creates
// another, slug-deduped). A `--cleanup` flag is NOT added (no delete-folder endpoint
// exists — DELETE /v1/me/collections/:id is out of Phase-4 scope); the test data is
// minimal and clearly named.

import { HttpUserRepository } from '../src/domain/http/http-user.repository';
import { HttpSavedRepository } from '../src/domain/http/http-saved.repository';
import { AuthRequiredError, HttpError } from '../src/domain/http/http-client';

// ── Tiny assertion harness (no test framework — matches verify-api-parity.ts) ───────

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

function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
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

/** Assert no `lat`/`lng` key appears at ANY nesting depth in a payload (masking). */
function assertNoExactCoords(name: string, payload: unknown): void {
  const keys = collectKeys(payload);
  const leaked = ['lat', 'lng'].filter((k) => keys.has(k));
  expectTrue(
    `${name}: no exact lat/lng keys (masking)`,
    leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(', ')}` : undefined,
  );
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// A real published court id (the seed's Grand Hotel Tremezzo). Stable across re-seeds.
const COURT_ID = 'tremezzo';

function describeError(err: unknown): string {
  if (err instanceof HttpError) return `${err.name}: ${err.status} for ${err.path}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 path — prove a bad/absent token surfaces AuthRequiredError (not a silent
// fallback). Runs regardless of whether a real token is supplied.
// ─────────────────────────────────────────────────────────────────────────────

async function verify401Path(): Promise<void> {
  console.log('\n401 path — invalid bearer must surface AuthRequiredError');
  const badUser = new HttpUserRepository({ bearerToken: 'not-a-real-jwt' });
  try {
    await badUser.getCurrentUser();
    expectTrue('getCurrentUser() with bad token throws', false, 'no error thrown');
  } catch (err) {
    expectTrue(
      'getCurrentUser() with bad token throws AuthRequiredError',
      err instanceof AuthRequiredError,
      `threw ${describeError(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated flow — the full repository contract against the live API.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyAuthedFlow(token: string): Promise<void> {
  const user = new HttpUserRepository({ bearerToken: token });
  const saved = new HttpSavedRepository({ bearerToken: token });

  // ── User ──────────────────────────────────────────────────────────────────
  console.log('\nHttpUserRepository — GET /v1/me');
  const profile = await user.getCurrentUser();
  expectTrue(
    'getCurrentUser() returns a UserProfileDTO (id/name/initials/membership)',
    typeof profile.id === 'string' &&
      typeof profile.name === 'string' &&
      typeof profile.initials === 'string' &&
      (profile.membership === 'free' || profile.membership === 'lifetime'),
    `got: ${JSON.stringify(profile)}`,
  );
  expectTrue(
    'getCurrentUser() does NOT expose email',
    !('email' in (profile as Record<string, unknown>)),
    `keys: ${Object.keys(profile).join(', ')}`,
  );

  // ── Saved courts (initial state) ────────────────────────────────────────────
  console.log('\nHttpSavedRepository — saved courts + collections');
  const savedCourts = await saved.getSavedCourts();
  expectTrue(
    'getSavedCourts() returns an array (saved-courts list)',
    Array.isArray(savedCourts),
    `got: ${JSON.stringify(savedCourts)}`,
  );
  assertNoExactCoords('getSavedCourts', savedCourts);

  // ── Create a collection ─────────────────────────────────────────────────────
  const created = await saved.createUserCollection('Summer Italy');
  expectTrue(
    'createUserCollection("Summer Italy") returns a folder with a slug',
    typeof created.id === 'string' &&
      typeof created.slug === 'string' &&
      created.slug.length > 0 &&
      created.name === 'Summer Italy' &&
      created.count === 0,
    `got: ${JSON.stringify(created)}`,
  );
  const collectionId = created.id;
  const createdSlug = created.slug;

  // ── getSavedCollections includes it ─────────────────────────────────────────
  const collections = await saved.getSavedCollections();
  expectTrue(
    'getSavedCollections() includes the created folder',
    collections.some((c) => c.id === collectionId && c.slug === createdSlug),
    `slugs: ${collections.map((c) => c.slug).join(', ')}`,
  );

  // ── getUserCollectionBySlug returns detail ──────────────────────────────────
  const detail = await saved.getUserCollectionBySlug(createdSlug);
  expectTrue(
    'getUserCollectionBySlug(slug) returns the detail (empty courts)',
    detail !== null &&
      detail.id === collectionId &&
      Array.isArray(detail.courts) &&
      detail.courts.length === 0,
    `got: ${JSON.stringify(detail)}`,
  );

  // ── Toggle a court IN (add via the bridge) ──────────────────────────────────
  await saved.toggleCourtInCollection(collectionId, COURT_ID);
  const idsAfterAdd = await saved.getCollectionIdsForCourt(COURT_ID);
  expectTrue(
    `toggleCourtInCollection(id, "${COURT_ID}") ADDS — collection-ids include the folder`,
    idsAfterAdd.includes(collectionId),
    `ids: ${idsAfterAdd.join(', ')}`,
  );

  const detailWithCourt = await saved.getUserCollectionBySlug(createdSlug);
  expectTrue(
    'getUserCollectionBySlug(slug) now includes the court',
    detailWithCourt !== null &&
      detailWithCourt.courts.some((c) => c.id === COURT_ID),
    `courts: ${detailWithCourt?.courts.map((c) => c.id).join(', ') ?? 'null'}`,
  );
  assertNoExactCoords('getUserCollectionBySlug (with court)', detailWithCourt);

  // ── Toggle the same court OUT (remove via the bridge) ───────────────────────
  await saved.toggleCourtInCollection(collectionId, COURT_ID);
  const idsAfterRemove = await saved.getCollectionIdsForCourt(COURT_ID);
  expectTrue(
    `toggleCourtInCollection(id, "${COURT_ID}") REMOVES — collection-ids no longer include the folder`,
    !idsAfterRemove.includes(collectionId),
    `ids: ${idsAfterRemove.join(', ')}`,
  );

  // ── Rename → new slug; old slug 404s, new slug resolves ─────────────────────
  const renamed = await saved.renameUserCollection(collectionId, 'Lake Como');
  expectTrue(
    'renameUserCollection(id, "Lake Como") returns a new slug',
    renamed.id === collectionId &&
      renamed.name === 'Lake Como' &&
      renamed.slug !== createdSlug &&
      renamed.slug.length > 0,
    `got: ${JSON.stringify(renamed)}`,
  );
  const newSlug = renamed.slug;

  const oldGone = await saved.getUserCollectionBySlug(createdSlug);
  expectTrue(
    'getUserCollectionBySlug(oldSlug) returns null after rename',
    oldGone === null,
    `got: ${JSON.stringify(oldGone)}`,
  );

  const newDetail = await saved.getUserCollectionBySlug(newSlug);
  expectTrue(
    'getUserCollectionBySlug(newSlug) returns the detail',
    newDetail !== null && newDetail.id === collectionId && newDetail.name === 'Lake Como',
    `got: ${JSON.stringify(newDetail)}`,
  );

  // ── Masking across all court-bearing reads ──────────────────────────────────
  assertNoExactCoords('getSavedCollections', collections);
  assertNoExactCoords('getUserCollectionBySlug (final)', newDetail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Preflight — fail fast with an actionable message if the API is not reachable.
// ─────────────────────────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/courts`, {
      headers: { accept: 'application/json' },
    });
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
  console.log('Feature 56 — HttpUserRepository + HttpSavedRepository live verification');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  await verify401Path();

  const token = process.env.AUTH_BEARER_TOKEN?.trim();
  if (!token) {
    console.error('\n\x1b[33mAUTH_BEARER_TOKEN not set — skipping the authenticated flow.\x1b[0m');
    console.error('  Obtain one via the magic-link flow (see this file\'s header), then:');
    console.error('    AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:user-saved-http\n');
    // The 401 path still ran; exit non-zero so a tokenless run isn't mistaken for a pass.
    summarize(true);
    return;
  }

  await verifyAuthedFlow(token);
  summarize(false);
}

function summarize(tokenMissing: boolean): void {
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
  if (tokenMissing) {
    console.log('\n\x1b[33m401 path verified, but the authed flow was skipped (no token).\x1b[0m\n');
    process.exit(3);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — Http user/saved repositories work against the live API.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exit(1);
});
