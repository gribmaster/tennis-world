/* eslint-disable no-console */
//
// Feature 58 — Persisted saved/user flow verification (factory-flipped `api` mode).
//
// Feature 56 verified the HTTP repositories DIRECTLY (`new HttpSavedRepository(...)`).
// Feature 57 then FLIPPED the factory so `getRepositories('api', auth)` returns those
// HTTP repos for the protected saved/user domains. This script verifies that FLIP and
// the property the three mutation islands (Add-to-Collection, Create, Rename) ultimately
// depend on: **a write survives a reload** — because the server component and the browser
// island now hit the SAME Postgres state (the mock client/server in-memory divergence is
// gone, intake §1.5).
//
// HOW IT DIFFERS FROM verify-user-saved-http.ts (Feature 56):
//   • It goes through the real `getRepositories(...)` FACTORY (the exact entry point
//     `lib/repositories.server.ts` / `lib/repositories.client.ts` call), not the concrete
//     classes — so it exercises the Feature-57 wiring, proving `api` mode returns the HTTP
//     repos for saved/user.
//   • It SIMULATES A RELOAD: after each mutation it DISCARDS the repo set and builds a
//     FRESH one (a new `getRepositories(...)` = a new page render / server request), then
//     RE-READS. A value that only lived in one in-memory instance (the old mock failure
//     mode) would vanish; persistence means it's still there.
//   • It exercises the island-facing `toggleCourtInCollection` BRIDGE for add AND remove
//     (the path SaveToCollectionMenu uses), then asserts membership across a reload.
//   • It checks the LOGGED-OUT path (no auth → AuthRequiredError) that the public court
//     page degrades on and the private pages redirect on.
//
// AUTH: bearer token (the AuthGuard's `Authorization: Bearer` path — easiest to script,
// same guard the cookie path hits). Obtain one via the magic-link flow exactly as
// verify-user-saved-http.ts documents:
//   curl -s -X POST http://localhost:3001/v1/auth/request-link -H 'content-type: application/json' -d '{"email":"feature58@example.com"}'
//   # copy the ?token=... the API logs ([dev magic-link] …), then:
//   curl -s -X POST http://localhost:3001/v1/auth/verify -H 'content-type: application/json' -d '{"token":"<RAW>"}'
//   AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:persisted-saved-flow
//
// CLEANUP: every court this script toggles into a folder is toggled back OUT at the end,
// so it leaves no membership rows; the saved court it adds is removed. The one residual is
// the empty wishlist FOLDER it creates — there is no delete-folder endpoint in Phase-4
// scope (intake §4.4 #5 / Q5), so the folder is left behind, clearly named
// ("F58 Persisted Flow"). A re-run just slug-dedupes another. See the Feature-58 doc note
// for the manual SQL cleanup snippet.
//
// Repos are imported by RELATIVE path (tsx doesn't read the Next tsconfig `paths`).

import { getRepositories, type Repositories } from '../src/domain';
import { AuthRequiredError, HttpError } from '../src/domain/http/http-client';

// ── Tiny assertion harness (matches verify-api-parity / verify-user-saved-http) ─────

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

/**
 * Build a FRESH api-mode repository set carrying the bearer token — the script's stand-in
 * for "a new page render / server request". Re-building (rather than reusing) is the whole
 * point: it proves state lives in Postgres, not in a per-instance cache. Mirrors what
 * `lib/repositories.server.ts` (cookie) / `lib/repositories.client.ts` (include) do, but
 * with the bearer transport a script can drive.
 */
function freshRepos(token: string): Repositories {
  return getRepositories('api', { bearerToken: token });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. FACTORY FLIP — `api` mode must return the HTTP saved/user repos (Feature 57).
//    With NO auth the protected reads 401 → AuthRequiredError (NOT a silent mock/empty
//    fallback). This is the logged-out signal the public court page degrades on and the
//    private pages redirect on.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyFactoryFlipAndLoggedOut(): Promise<void> {
  console.log('\n0. Factory flip + logged-out (no auth) path');

  const anon = getRepositories('api'); // no auth context — the bare/logged-out case
  try {
    await anon.user.getCurrentUser();
    expectTrue('api-mode user.getCurrentUser() w/o auth throws', false, 'no throw');
  } catch (err) {
    expectTrue(
      'api-mode user.getCurrentUser() w/o auth throws AuthRequiredError (logged-out signal)',
      err instanceof AuthRequiredError,
      `threw ${describeError(err)}`,
    );
  }
  try {
    await anon.saved.getSavedCollections();
    expectTrue('api-mode saved.getSavedCollections() w/o auth throws', false, 'no throw');
  } catch (err) {
    expectTrue(
      'api-mode saved.getSavedCollections() w/o auth throws AuthRequiredError',
      err instanceof AuthRequiredError,
      `threw ${describeError(err)}`,
    );
  }

  // The court-detail public degrade reads getCollectionIdsForCourt — it too must 401
  // (not return []), so the page can set signedIn:false rather than mislabel a logged-out
  // visitor as "in no folders".
  try {
    await anon.saved.getCollectionIdsForCourt(COURT_ID);
    expectTrue('api-mode getCollectionIdsForCourt() w/o auth throws', false, 'no throw');
  } catch (err) {
    expectTrue(
      'api-mode getCollectionIdsForCourt() w/o auth throws AuthRequiredError',
      err instanceof AuthRequiredError,
      `threw ${describeError(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE COLLECTION — survives reload.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyCreateSurvivesReload(token: string): Promise<string> {
  console.log('\n1. Create Collection — reload survival');

  const created = await freshRepos(token).saved.createUserCollection('F58 Persisted Flow');
  expectTrue(
    'createUserCollection returns a folder with a server-derived slug (count 0)',
    typeof created.id === 'string' &&
      typeof created.slug === 'string' &&
      created.slug.length > 0 &&
      created.name === 'F58 Persisted Flow' &&
      created.count === 0,
    `got: ${JSON.stringify(created)}`,
  );

  // ── RELOAD: brand-new repo set, re-read the list ──
  const afterReload = await freshRepos(token).saved.getSavedCollections();
  expectTrue(
    'created folder is present after a RELOAD (fresh repo set re-reads the API)',
    afterReload.some((c) => c.id === created.id && c.slug === created.slug),
    `slugs after reload: ${afterReload.map((c) => c.slug).join(', ')}`,
  );

  // ── RELOAD: detail by slug resolves to the same folder ──
  const detail = await freshRepos(token).saved.getUserCollectionBySlug(created.slug);
  expectTrue(
    'created folder detail resolves by slug after RELOAD (empty courts)',
    detail !== null && detail.id === created.id && detail.courts.length === 0,
    `got: ${JSON.stringify(detail)}`,
  );

  return created.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADD-TO-COLLECTION (the island's toggle bridge) — survives reload; then REMOVE.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyAddRemoveSurviveReload(
  token: string,
  collectionId: string,
): Promise<void> {
  console.log('\n2. Add-to-Collection toggle (add) — reload survival, then remove');

  // ADD via the island-facing bridge (read-before-write decides POST vs DELETE).
  await freshRepos(token).saved.toggleCourtInCollection(collectionId, COURT_ID);

  // ── RELOAD: the court's membership (the Add-to-Collection checkmark seed) persists ──
  const idsAfterAdd = await freshRepos(token).saved.getCollectionIdsForCourt(COURT_ID);
  expectTrue(
    'after toggle ADD + RELOAD: getCollectionIdsForCourt includes the folder (checkmark survives)',
    idsAfterAdd.includes(collectionId),
    `ids: ${idsAfterAdd.join(', ')}`,
  );

  // ── RELOAD: the collection detail now lists the court (collection-detail page survives) ──
  const detailWithCourt = await freshRepos(token).saved.getUserCollectionBySlug(
    (await freshRepos(token).saved.getSavedCollections()).find((c) => c.id === collectionId)!
      .slug,
  );
  expectTrue(
    'after toggle ADD + RELOAD: collection detail lists the court',
    detailWithCourt !== null && detailWithCourt.courts.some((c) => c.id === COURT_ID),
    `courts: ${detailWithCourt?.courts.map((c) => c.id).join(', ') ?? 'null'}`,
  );
  assertNoExactCoords('collection detail (with court)', detailWithCourt);

  // REMOVE via the bridge — then reload and confirm it's gone (the unsave path + cleanup).
  await freshRepos(token).saved.toggleCourtInCollection(collectionId, COURT_ID);
  const idsAfterRemove = await freshRepos(token).saved.getCollectionIdsForCourt(COURT_ID);
  expectTrue(
    'after toggle REMOVE + RELOAD: getCollectionIdsForCourt no longer includes the folder',
    !idsAfterRemove.includes(collectionId),
    `ids: ${idsAfterRemove.join(', ')}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RENAME COLLECTION — new slug survives reload; old slug 404s (→ null).
// ─────────────────────────────────────────────────────────────────────────────

async function verifyRenameSurvivesReload(
  token: string,
  collectionId: string,
  oldSlug: string,
): Promise<void> {
  console.log('\n3. Rename Collection — reload survival (URL/slug change)');

  const renamed = await freshRepos(token).saved.renameUserCollection(
    collectionId,
    'F58 Renamed Flow',
  );
  expectTrue(
    'renameUserCollection returns the new name + a re-derived slug',
    renamed.id === collectionId &&
      renamed.name === 'F58 Renamed Flow' &&
      renamed.slug !== oldSlug &&
      renamed.slug.length > 0,
    `got: ${JSON.stringify(renamed)}`,
  );

  // ── RELOAD: the NEW slug resolves to the renamed folder (the URL the island replaced to) ──
  const newDetail = await freshRepos(token).saved.getUserCollectionBySlug(renamed.slug);
  expectTrue(
    'after RENAME + RELOAD: new slug resolves to the renamed folder (title persists)',
    newDetail !== null &&
      newDetail.id === collectionId &&
      newDetail.name === 'F58 Renamed Flow',
    `got: ${JSON.stringify(newDetail)}`,
  );

  // ── RELOAD: the OLD slug is gone (→ null → the page's notFound() for an authed user) ──
  const oldGone = await freshRepos(token).saved.getUserCollectionBySlug(oldSlug);
  expectTrue(
    'after RENAME + RELOAD: OLD slug returns null (page would notFound for the authed user)',
    oldGone === null,
    `got: ${JSON.stringify(oldGone)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SAVED COURTS — save survives reload; then unsave (cleanup). Profile reads this.
// ─────────────────────────────────────────────────────────────────────────────

async function verifySavedCourtsSurviveReload(token: string): Promise<void> {
  console.log('\n4. Saved courts (Profile/Saved data) — reload survival');

  // The saved-courts list isn't wired to a heart UI yet, but /profile + /saved read it
  // and the HTTP repo backs the GET. The repo interface exposes no save/unsave method
  // (the heart is out of Phase-4 scope, intake Q4), so we drive the POST/DELETE endpoints
  // directly to mutate, but assert the result through the repo's `getSavedCourts()` — the
  // exact read the pages use — across a reload.
  const before = await freshRepos(token).saved.getSavedCourts();
  assertNoExactCoords('getSavedCourts (initial)', before);
  expectTrue(
    'getSavedCourts returns an array (Profile/Saved read path)',
    Array.isArray(before),
    `got: ${JSON.stringify(before)}`,
  );

  // Save directly against the endpoint (no repo method exists — heart UI is out of scope),
  // then prove the LIST read (the one the pages use) reflects it after a reload.
  const saveRes = await fetch(`${API_BASE}/me/saved-courts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ courtId: COURT_ID }),
  });
  expectTrue(
    'POST /me/saved-courts saves the court (201)',
    saveRes.status === 201,
    `status ${saveRes.status}`,
  );

  const afterSave = await freshRepos(token).saved.getSavedCourts();
  expectTrue(
    'after SAVE + RELOAD: getSavedCourts includes the court',
    afterSave.some((c) => c.id === COURT_ID),
    `ids: ${afterSave.map((c) => c.id).join(', ')}`,
  );
  assertNoExactCoords('getSavedCourts (with court)', afterSave);

  // Unsave (cleanup) — then reload and confirm gone.
  const delRes = await fetch(`${API_BASE}/me/saved-courts/${COURT_ID}`, {
    method: 'DELETE',
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  expectTrue(
    'DELETE /me/saved-courts/:courtId unsaves (200)',
    delRes.status === 200,
    `status ${delRes.status}`,
  );
  const afterUnsave = await freshRepos(token).saved.getSavedCourts();
  expectTrue(
    'after UNSAVE + RELOAD: getSavedCourts no longer includes the court',
    !afterUnsave.some((c) => c.id === COURT_ID),
    `ids: ${afterUnsave.map((c) => c.id).join(', ')}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROFILE — the authed user reads back through the factory user repo.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyProfile(token: string): Promise<void> {
  console.log('\n5. Profile — user.getCurrentUser via the factory');
  const profile = await freshRepos(token).user.getCurrentUser();
  expectTrue(
    'user.getCurrentUser returns a UserProfileDTO (no email)',
    typeof profile.id === 'string' &&
      typeof profile.name === 'string' &&
      typeof profile.initials === 'string' &&
      (profile.membership === 'free' ||
        profile.membership === 'subscription' ||
        profile.membership === 'lifetime') &&
      !('email' in (profile as Record<string, unknown>)),
    `got: ${JSON.stringify(profile)}`,
  );
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
  console.log('Feature 58 — Persisted saved/user flow verification (factory-flipped api mode)');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();

  // The factory-flip + logged-out checks need NO token (they assert the 401 path).
  await verifyFactoryFlipAndLoggedOut();

  const token = process.env.AUTH_BEARER_TOKEN?.trim();
  if (!token) {
    console.error('\n\x1b[33mAUTH_BEARER_TOKEN not set — skipping the authenticated reload-survival flow.\x1b[0m');
    console.error('  Obtain one via the magic-link flow (see this file\'s header), then:');
    console.error('    AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:persisted-saved-flow\n');
    // The flip/logged-out checks still ran; exit non-zero so a tokenless run isn't a pass.
    summarize(true);
    return;
  }

  const collectionId = await verifyCreateSurvivesReload(token);
  // Capture the slug for the rename old-slug assertion (re-read fresh).
  const created = (await freshRepos(token).saved.getSavedCollections()).find(
    (c) => c.id === collectionId,
  );
  const createdSlug = created?.slug ?? '';

  await verifyAddRemoveSurviveReload(token, collectionId);
  await verifyRenameSurvivesReload(token, collectionId, createdSlug);
  await verifySavedCourtsSurviveReload(token);
  await verifyProfile(token);

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
    console.log('\n\x1b[33mFactory-flip + logged-out path verified, but the authed reload flow was skipped (no token).\x1b[0m\n');
    process.exit(3);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — saved/user writes persist across reloads in factory-flipped api mode.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exit(1);
});
