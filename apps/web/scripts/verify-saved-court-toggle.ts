/* eslint-disable no-console */
//
// Saved-court flow audit — standalone save/unsave (heart) verification.
//
// The API landed the individual saved-courts endpoints in Feature 54
// (POST/DELETE /v1/me/saved-courts), but the web SavedRepository never exposed a
// save/unsave pair, so the endpoints were unreachable from the app and no heart worked.
// This audit added `saveCourt` / `unsaveCourt` / `isCourtSaved` to the interface + both
// implementations, and wired the Court Detail Save button and the /saved Courts-tab unsave.
//
// This script is the executable proof of the round trip, driven through the SAME
// `getRepositories('api', auth)` FACTORY the server/client helpers call (not the concrete
// classes) — so it exercises the real wiring. It mirrors verify-persisted-saved-flow.ts:
//   • RELOAD survival — after each mutation it DISCARDS the repo set and builds a FRESH one
//     (a new page render / server request) and re-reads, proving the state lives in Postgres.
//   • LOGGED-OUT path — no auth → AuthRequiredError from the protected reads/writes (the
//     signal the public court page degrades on and the private /saved page redirects on).
//
// FLOW: start clean (unsave, idempotent) → assert not saved → SAVE → reload → present in
// getSavedCourts AND isCourtSaved true → re-SAVE is idempotent → UNSAVE → reload → gone from
// both → UNSAVE again is idempotent. Also asserts no exact lat/lng leaks in the saved list.
//
// AUTH: bearer token (the AuthGuard's `Authorization: Bearer` path — easiest to script,
// same guard the cookie path hits). Obtain one via the magic-link flow exactly as
// verify-persisted-saved-flow.ts / verify-user-saved-http.ts document:
//   curl -s -X POST $API/auth/request-link -H 'content-type: application/json' -d '{"email":"saved-audit@example.com"}'
//   # copy the ?token=... the API logs ([dev magic-link] …), then:
//   curl -s -X POST $API/auth/verify -H 'content-type: application/json' -d '{"token":"<RAW>"}'
//   AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:saved-court-toggle
//
// CLEANUP: the flow ends with the court UNSAVED, so it leaves no residual saved row for the
// test court. It never creates a folder and never touches collections.
//
// Repos are imported by RELATIVE path (tsx doesn't read the Next tsconfig `paths`).

import { getRepositories, type Repositories } from '../src/domain';
import { AuthRequiredError, HttpError } from '../src/domain/http/http-client';

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

/** Build a FRESH api-mode repository set with the bearer token — a stand-in for a reload. */
function freshRepos(token: string): Repositories {
  return getRepositories('api', { bearerToken: token });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. LOGGED-OUT — the new save/unsave/isSaved must 401 (AuthRequiredError) with no auth,
//    exactly like the other protected saved reads/writes (never a silent empty/no-op).
// ─────────────────────────────────────────────────────────────────────────────

async function verifyLoggedOut(): Promise<void> {
  console.log('\n0. Logged-out (no auth) — save/unsave/isSaved must surface AuthRequiredError');
  const anon = getRepositories('api'); // no auth context

  for (const [name, op] of [
    ['saveCourt', () => anon.saved.saveCourt(COURT_ID)],
    ['unsaveCourt', () => anon.saved.unsaveCourt(COURT_ID)],
    ['isCourtSaved', () => anon.saved.isCourtSaved(COURT_ID)],
  ] as const) {
    try {
      await op();
      expectTrue(`api-mode ${name}() w/o auth throws`, false, 'no throw');
    } catch (err) {
      expectTrue(
        `api-mode ${name}() w/o auth throws AuthRequiredError`,
        err instanceof AuthRequiredError,
        `threw ${describeError(err)}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHED save → reload → present → unsave → reload → gone (idempotent both ways).
// ─────────────────────────────────────────────────────────────────────────────

async function verifySaveUnsaveRoundTrip(token: string): Promise<void> {
  console.log('\n1. Save → reload → present → unsave → reload → gone');

  // Start clean: unsave is idempotent, so this is safe even on the first run.
  await freshRepos(token).saved.unsaveCourt(COURT_ID);

  const notSavedYet = await freshRepos(token).saved.isCourtSaved(COURT_ID);
  expectTrue(
    'precondition: court is not saved after a clean-up unsave',
    notSavedYet === false,
    `isCourtSaved → ${notSavedYet}`,
  );

  // ── SAVE ──
  await freshRepos(token).saved.saveCourt(COURT_ID);

  // ── RELOAD: fresh repo set re-reads the API ──
  const afterSaveList = await freshRepos(token).saved.getSavedCourts();
  expectTrue(
    'after SAVE + RELOAD: getSavedCourts includes the court',
    afterSaveList.some((c) => c.id === COURT_ID),
    `ids: ${afterSaveList.map((c) => c.id).join(', ')}`,
  );
  assertNoExactCoords('getSavedCourts (after save)', afterSaveList);

  const afterSaveIsSaved = await freshRepos(token).saved.isCourtSaved(COURT_ID);
  expectTrue(
    'after SAVE + RELOAD: isCourtSaved is true (seeds the Save button pressed state)',
    afterSaveIsSaved === true,
    `isCourtSaved → ${afterSaveIsSaved}`,
  );

  // ── RE-SAVE is idempotent (no duplicate, no error) ──
  await freshRepos(token).saved.saveCourt(COURT_ID);
  const afterReSave = await freshRepos(token).saved.getSavedCourts();
  const occurrences = afterReSave.filter((c) => c.id === COURT_ID).length;
  expectTrue(
    're-SAVE is idempotent (exactly one saved row for the court)',
    occurrences === 1,
    `occurrences: ${occurrences}`,
  );

  // ── UNSAVE ──
  await freshRepos(token).saved.unsaveCourt(COURT_ID);

  // ── RELOAD: gone from both the list and the membership check ──
  const afterUnsaveList = await freshRepos(token).saved.getSavedCourts();
  expectTrue(
    'after UNSAVE + RELOAD: getSavedCourts no longer includes the court',
    !afterUnsaveList.some((c) => c.id === COURT_ID),
    `ids: ${afterUnsaveList.map((c) => c.id).join(', ')}`,
  );

  const afterUnsaveIsSaved = await freshRepos(token).saved.isCourtSaved(COURT_ID);
  expectTrue(
    'after UNSAVE + RELOAD: isCourtSaved is false',
    afterUnsaveIsSaved === false,
    `isCourtSaved → ${afterUnsaveIsSaved}`,
  );

  // ── UNSAVE again is idempotent (no error) ──
  let repeatOk = true;
  try {
    await freshRepos(token).saved.unsaveCourt(COURT_ID);
  } catch (err) {
    repeatOk = false;
    expectTrue('repeat UNSAVE is idempotent (no throw)', false, describeError(err));
  }
  if (repeatOk) expectTrue('repeat UNSAVE is idempotent (no throw)', true);
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
    console.error('  Start the dependencies first (see this file\'s header).');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  console.log('Saved-court flow audit — standalone save/unsave verification');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  await verifyLoggedOut();

  const token = process.env.AUTH_BEARER_TOKEN?.trim();
  if (!token) {
    console.error('\n\x1b[33mAUTH_BEARER_TOKEN not set — skipping the authenticated flow.\x1b[0m');
    console.error('  Obtain one via the magic-link flow (see this file\'s header), then:');
    console.error('    AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:saved-court-toggle\n');
    summarize(true);
    return;
  }

  await verifySaveUnsaveRoundTrip(token);
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
    console.log('\n\x1b[33mLogged-out path verified, but the authed flow was skipped (no token).\x1b[0m\n');
    process.exit(3);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — standalone save/unsave works against the live API.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exit(1);
});
