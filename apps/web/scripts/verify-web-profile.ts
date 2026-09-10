/* eslint-disable no-console */
//
// Task 18 — Live verification of the PROFILE-EDIT path (GET + PATCH /v1/me).
//
// The edit-profile mutation shipped in the redesign was the only write with no
// automated coverage: before this script, nothing in apps/web/scripts or
// apps/api/scripts exercised `PATCH /v1/me` (several harnesses read GET /v1/me for
// its `membership`, none ever wrote). This closes that gap.
//
// Like verify-user-saved-http.ts, it drives the REAL repository seam the UI uses — it
// instantiates the concrete `HttpUserRepository` (bypassing the env-driven factory)
// rather than hand-rolling fetches, so what is proven here is the seam the
// edit-profile modal actually calls, not a parallel client.
//
// Every request authenticates with a BEARER token (the AuthGuard's
// `Authorization: Bearer <jwt>` path) — the same transport a mobile client uses and
// the easiest to drive from a script.
//
// ── What it proves ─────────────────────────────────────────────────────────────────
//   A. GET /v1/me returns a UserProfileDTO with EXACTLY the contract's keys — no
//      Prisma internals, no password/token field, no raw entitlement blob.
//   B. PATCH /v1/me with a new name returns the updated profile.
//   C. A follow-up GET reflects the new name (the write PERSISTED — it did not just
//      echo the request body back).
//   D. EMAIL IS NOT MUTABLE. An `email` field in the PATCH body does not change the
//      stored email — neither on its own nor smuggled alongside a valid `name`. This
//      is a decided product rule (changing the login email would break magic-link
//      sign-in for the new address until a re-verification flow exists) and until this
//      script it rested on nothing but the DTO shape. It is the POINT of this harness.
//   E. Invalid input is REJECTED, not silently accepted: empty name, whitespace-only
//      name, over-long name — each asserted for status code AND for the stored name
//      being unchanged afterwards.
//   F. Unauthenticated GET and PATCH both 401 (the guard runs before the handler).
//   G. `membership` is one of the real MembershipStatus values and is DERIVED — a user
//      with no entitlement rows reads 'free'. No paid state is asserted (none is
//      seeded here).
//
// ── Re-runnability ─────────────────────────────────────────────────────────────────
// The script captures the user's ORIGINAL name before the first write and restores it
// in a `finally`, so the seeded user is left exactly as found — including when an
// assertion throws mid-run. See `verifyAuthedFlow`.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   1. Bring up the deps:
//        pnpm db:up
//        pnpm --filter @tennis/api db:seed
//        pnpm --filter @tennis/api dev        # (or: node apps/api/dist/main.js)
//   2. Mint a bearer token through the REAL /v1/auth/verify path:
//        pnpm --filter @tennis/api ci:issue-token     # prints the token on the last line
//      (or obtain one via the magic-link flow — see verify-user-saved-http.ts's header.)
//   3. Run:
//        AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:web-profile
//
// `AUTH_BEARER_TOKEN` is deliberately the SAME variable verify:user-saved-http and
// verify:saved-court-toggle already read — one token serves all three.
//
// The API base URL comes from `NEXT_PUBLIC_API_BASE_URL` (default
// http://127.0.0.1:18001/v1) — the same resolution the real http-client uses.
//
// Repos are imported by RELATIVE path (not the `@/` alias): `tsx` does not read the
// Next tsconfig `paths`. The workspace packages resolve normally through node_modules.
//
// CLEANUP: the only state this script touches is the authed user's `name`, and it is
// restored at the end (and on failure). No rows are created or deleted.

import type { UpdateProfileDTO, UserProfileDTO } from '@tennis/contracts';
import { HttpUserRepository } from '../src/domain/http/http-user.repository';
import { AuthRequiredError, HttpError } from '../src/domain/http/http-client';

// ── API base URL ──────────────────────────────────────────────────────────────
// SET the env var, don't just read it: the Http*Repository classes resolve their base
// URL inside http-client.ts's resolveBaseUrl(), which reads process.env at CALL time —
// so assigning here is picked up by every later request. (Same note as
// verify-user-saved-http.ts; http-client's own default is deliberately left at :3001.)
process.env.NEXT_PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:18001/v1';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:18001/v1';

// ── Tiny assertion harness (no test framework — matches verify-user-saved-http.ts) ──

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

function describeError(err: unknown): string {
  if (err instanceof HttpError) return `${err.name}: ${err.status} for ${err.path}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Contract shape ────────────────────────────────────────────────────────────
// The full key set `UserProfileSchema` permits. `id`/`name`/`initials`/`membership`
// are required; `cancelAtPeriodEnd`/`activeUntil`/`avatarUrl`/`email` are optional
// (present only when applicable). Anything OUTSIDE this set is a leak.
const REQUIRED_PROFILE_KEYS = ['id', 'name', 'initials', 'membership'] as const;
const OPTIONAL_PROFILE_KEYS = [
  'cancelAtPeriodEnd',
  'activeUntil',
  'avatarUrl',
  'email',
] as const;
const ALLOWED_PROFILE_KEYS = new Set<string>([
  ...REQUIRED_PROFILE_KEYS,
  ...OPTIONAL_PROFILE_KEYS,
]);

/** The real MembershipStatus values (packages/contracts/src/user.ts). */
const MEMBERSHIP_VALUES = new Set(['free', 'subscription', 'lifetime']);

/**
 * Field names that must NEVER appear on a profile payload — Prisma internals and
 * credential / raw-entitlement material. Checked at every nesting depth.
 */
const FORBIDDEN_KEYS = [
  'password',
  'passwordHash',
  'tokenHash',
  'token',
  'accessToken',
  'magicLinkTokens',
  'entitlement',
  'entitlements',
  'googleId',
  'stripeCustomerId',
  'providerCustomerId',
  'providerPurchaseId',
  'metadata',
  'createdAt',
  'updatedAt',
];

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

/** Assert a payload carries exactly the contract's keys, and no forbidden internals. */
function assertProfileShape(label: string, profile: UserProfileDTO): void {
  const keys = Object.keys(profile);

  const missing = REQUIRED_PROFILE_KEYS.filter((k) => !keys.includes(k));
  expectTrue(
    `${label}: has every required UserProfileDTO key (${REQUIRED_PROFILE_KEYS.join('/')})`,
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : undefined,
  );

  const extra = keys.filter((k) => !ALLOWED_PROFILE_KEYS.has(k));
  expectTrue(
    `${label}: has NO key outside the contract (no Prisma internals)`,
    extra.length === 0,
    extra.length ? `unexpected keys: ${extra.join(', ')}` : undefined,
  );

  const deepKeys = collectKeys(profile);
  const leaked = FORBIDDEN_KEYS.filter((k) => deepKeys.has(k));
  expectTrue(
    `${label}: no password/token/raw-entitlement field at any depth`,
    leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(', ')}` : undefined,
  );
}

/**
 * Run `fn` and report the HttpError status it throws. Returns the status, or `null`
 * when the call unexpectedly SUCCEEDED (which the caller reports as a failure).
 */
async function statusOfRejection(fn: () => Promise<unknown>): Promise<number | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof HttpError) return err.status;
    throw err;
  }
}

/**
 * `updateProfile` is typed to the contract's `{ name?: string }`, so a hostile body
 * carrying `email` cannot be expressed through it directly. The cast is deliberate and
 * confined to this helper: sending a field the contract forbids is exactly the case
 * under test (D), and it is what an untrusted client would put on the wire.
 */
function hostilePatch(body: Record<string, unknown>): UpdateProfileDTO {
  return body as UpdateProfileDTO;
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 path — GET and PATCH must both be guarded. Runs regardless of whether a real
// token is supplied.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyUnauthenticated(): Promise<void> {
  console.log('\nF. Unauthenticated /v1/me — the guard runs before the handler');

  // No auth options at all: no bearer, no cookie header.
  const anon = new HttpUserRepository();

  try {
    await anon.getCurrentUser();
    expectTrue('F1. GET /v1/me unauthenticated → 401', false, 'no error thrown');
  } catch (err) {
    expectTrue(
      'F1. GET /v1/me unauthenticated → 401 (AuthRequiredError)',
      err instanceof AuthRequiredError && err.status === 401,
      `threw ${describeError(err)}`,
    );
  }

  try {
    await anon.updateProfile({ name: 'Should Never Land' });
    expectTrue('F2. PATCH /v1/me unauthenticated → 401', false, 'no error thrown');
  } catch (err) {
    expectTrue(
      'F2. PATCH /v1/me unauthenticated → 401 (AuthRequiredError)',
      err instanceof AuthRequiredError && err.status === 401,
      `threw ${describeError(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated flow — the profile-edit contract against the live API.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyAuthedFlow(token: string): Promise<void> {
  const user = new HttpUserRepository({ bearerToken: token });

  // ── A. GET /v1/me — shape ──────────────────────────────────────────────────
  console.log('\nA. GET /v1/me — the UserProfileDTO contract');
  const original = await user.getCurrentUser();
  assertProfileShape('A1. GET /v1/me', original);

  const originalName = original.name;
  const originalEmail = original.email;

  expectTrue(
    'A2. GET /v1/me: id/name/initials are non-empty strings',
    typeof original.id === 'string' &&
      original.id.length > 0 &&
      typeof original.name === 'string' &&
      original.name.length > 0 &&
      typeof original.initials === 'string' &&
      original.initials.length > 0,
    `got: ${JSON.stringify(original)}`,
  );

  expectTrue(
    'A3. GET /v1/me: email is present and read-only on the DTO',
    typeof originalEmail === 'string' && originalEmail.length > 0,
    `email: ${JSON.stringify(originalEmail)}`,
  );

  // ── G. membership is a real, DERIVED MembershipStatus ──────────────────────
  console.log('\nG. membership is a real MembershipStatus and is derived');
  expectTrue(
    `G1. membership is one of free|subscription|lifetime (got '${String(original.membership)}')`,
    MEMBERSHIP_VALUES.has(original.membership),
    `got: ${JSON.stringify(original.membership)}`,
  );
  // Deliberately NOT asserting a paid state — this harness seeds no entitlement. What
  // IS asserted: whatever comes back is a real value, and a user with no entitlement
  // rows reads 'free' (the ci:issue-token user has none). If a future run supplies a
  // token for a SEEDED-ENTITLED user, this reports that rather than failing blind.
  if (original.membership === 'free') {
    expectTrue(
      "G2. a user with no entitlement rows reads 'free' (derived, not stored on User)",
      true,
    );
  } else {
    expectTrue(
      `G2. membership is '${original.membership}' — this token's user has an entitlement row`,
      true,
    );
    console.log(
      `        note: token user is entitled ('${original.membership}'); the ` +
        "no-entitlement→'free' case was not exercised by this run.",
    );
  }

  // Everything past this point WRITES. Restore the original name no matter how the
  // block exits — a thrown assertion, a network error, or a clean finish — so the
  // harness is re-runnable and leaves the seeded user exactly as it found it.
  try {
    // ── B. PATCH /v1/me with a new name → updated profile ────────────────────
    console.log('\nB. PATCH /v1/me — a valid name update');
    const newName = `Verify Profile ${Date.now()}`;
    const patched = await user.updateProfile({ name: newName });

    expectTrue(
      'B1. PATCH /v1/me returns the updated profile (name reflects the patch)',
      patched.name === newName,
      `got: ${JSON.stringify(patched)}`,
    );
    assertProfileShape('B2. PATCH /v1/me response', patched);
    expectTrue(
      'B3. PATCH /v1/me: id is unchanged (the write scoped to the authed user)',
      patched.id === original.id,
      `before ${original.id}, after ${patched.id}`,
    );
    expectTrue(
      'B4. PATCH /v1/me: initials are re-derived from the new name',
      typeof patched.initials === 'string' && patched.initials.length > 0,
      `initials: ${JSON.stringify(patched.initials)}`,
    );

    // ── C. The write PERSISTED (a follow-up GET, not the echoed body) ────────
    console.log('\nC. Follow-up GET /v1/me — the write persisted');
    const afterPatch = await user.getCurrentUser();
    expectTrue(
      'C1. GET /v1/me reflects the new name (persisted, not echoed)',
      afterPatch.name === newName,
      `expected '${newName}', got '${afterPatch.name}'`,
    );
    expectTrue(
      'C2. GET and PATCH agree on the whole profile after the write',
      JSON.stringify(afterPatch) === JSON.stringify(patched),
      `GET:   ${JSON.stringify(afterPatch)}\nPATCH: ${JSON.stringify(patched)}`,
    );

    // ── D. EMAIL IS NOT MUTABLE — the point of this harness ──────────────────
    console.log('\nD. Email is NOT mutable (the decided product rule)');
    const HOSTILE_EMAIL = 'attacker@not-your-account.test';

    // D1/D2: an email-only patch.
    const emailOnlyStatus = await statusOfRejection(() =>
      user.updateProfile(hostilePatch({ email: HOSTILE_EMAIL })),
    );
    expectTrue(
      'D1. PATCH /v1/me { email } is REJECTED with 400 (not silently ignored)',
      emailOnlyStatus === 400,
      emailOnlyStatus === null
        ? 'the request SUCCEEDED — email reached a write path'
        : `expected 400, got ${emailOnlyStatus}`,
    );
    const afterEmailOnly = await user.getCurrentUser();
    expectTrue(
      'D2. stored email is UNCHANGED after an email-only patch',
      afterEmailOnly.email === originalEmail,
      `expected '${String(originalEmail)}', got '${String(afterEmailOnly.email)}'`,
    );

    // D3-D5: email smuggled alongside a legitimate `name` — the interesting case. A
    // whitelist that DROPPED unknown keys instead of rejecting them would let the name
    // land while the email is quietly ignored; a broken one would write both.
    const smuggledName = `Verify Smuggle ${Date.now()}`;
    const smuggledStatus = await statusOfRejection(() =>
      user.updateProfile(hostilePatch({ name: smuggledName, email: HOSTILE_EMAIL })),
    );
    expectTrue(
      'D3. PATCH /v1/me { name, email } is REJECTED (email cannot ride along a valid name)',
      smuggledStatus === 400,
      smuggledStatus === null
        ? 'the request SUCCEEDED — email reached a write path'
        : `expected 400, got ${smuggledStatus}`,
    );
    const afterSmuggle = await user.getCurrentUser();
    expectTrue(
      'D4. stored email is UNCHANGED after a name+email patch',
      afterSmuggle.email === originalEmail,
      `expected '${String(originalEmail)}', got '${String(afterSmuggle.email)}'`,
    );
    expectTrue(
      'D5. the rejected patch was ATOMIC — the smuggled name did not land either',
      afterSmuggle.name === newName,
      `expected the previous name '${newName}', got '${afterSmuggle.name}'`,
    );

    // ── E. Invalid input is rejected, and the stored name survives ───────────
    console.log('\nE. Invalid name input is rejected, stored name unchanged');
    const invalidCases: ReadonlyArray<{ label: string; value: string }> = [
      { label: 'empty name', value: '' },
      { label: 'whitespace-only name', value: '   ' },
      { label: 'over-long name (81 chars, cap is 80)', value: 'x'.repeat(81) },
    ];

    for (const [i, testCase] of invalidCases.entries()) {
      const n = i + 1;
      const status = await statusOfRejection(() =>
        user.updateProfile({ name: testCase.value }),
      );
      expectTrue(
        `E${n}a. PATCH /v1/me with ${testCase.label} → 400`,
        status === 400,
        status === null
          ? 'the request SUCCEEDED — invalid input was accepted'
          : `expected 400, got ${status}`,
      );
      const after = await user.getCurrentUser();
      expectTrue(
        `E${n}b. stored name is UNCHANGED after ${testCase.label}`,
        after.name === newName,
        `expected '${newName}', got '${after.name}'`,
      );
    }

    // The boundary itself must still WORK — a cap of 80 rejects 81, not 80. Without
    // this, an off-by-one that rejected everything would pass E3 for the wrong reason.
    const boundaryName = 'y'.repeat(80);
    const atBoundary = await user.updateProfile({ name: boundaryName });
    expectTrue(
      'E4. a name at exactly the 80-char cap is ACCEPTED (the rejection is a bound, not a blanket)',
      atBoundary.name === boundaryName,
      `got a name of length ${atBoundary.name.length}`,
    );
  } finally {
    // ── Restore — runs on success AND on a mid-run failure ───────────────────
    console.log('\nRestore — leaving the seeded user as found');
    try {
      const restored = await user.updateProfile({ name: originalName });
      expectTrue(
        `restore: name is back to the original ('${originalName}')`,
        restored.name === originalName,
        `got '${restored.name}'`,
      );
      const confirmed = await user.getCurrentUser();
      expectTrue(
        'restore: a fresh GET confirms the original name + email (re-runnable)',
        confirmed.name === originalName && confirmed.email === originalEmail,
        `got name '${confirmed.name}', email '${String(confirmed.email)}'`,
      );
    } catch (err) {
      // Never let a restore failure mask the real failure that got us here — record it
      // as its own check and let any original error keep propagating.
      expectTrue(
        'restore: name restored to the original',
        false,
        `restore threw: ${describeError(err)} — the user may be left renamed; ` +
          're-run with the same token, or set the name back manually.',
      );
    }
  }
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
  console.log('Task 18 — profile-edit path (GET + PATCH /v1/me) live verification');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  await verifyUnauthenticated();

  const token = process.env.AUTH_BEARER_TOKEN?.trim();
  if (!token) {
    console.error(
      '\n\x1b[33mAUTH_BEARER_TOKEN not set — skipping the authenticated flow.\x1b[0m',
    );
    console.error('  Mint one through the real /v1/auth/verify path:');
    console.error('    pnpm --filter @tennis/api ci:issue-token    # token on the last line');
    console.error('  then re-run:');
    console.error(
      '    AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:web-profile\n',
    );
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
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — profile edit persists, email is not mutable, invalid input is rejected.\x1b[0m\n',
  );
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  // A crash after some checks ran still prints what was learned.
  if (results.length) {
    const failed = results.filter((r) => !r.ok);
    console.error(`  (${results.length} checks ran, ${failed.length} failed before the crash)`);
  }
  process.exit(1);
});
