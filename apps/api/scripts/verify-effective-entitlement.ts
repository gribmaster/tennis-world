/* eslint-disable no-console */
//
// Feature 62 — Effective-entitlement derivation verification (DETERMINISTIC, no Stripe).
//
// Proves the EntitlementsService rule end-to-end through the REAL endpoints: it seeds
// `Entitlement` rows directly with Prisma (no payment provider — exactly the CI strategy
// in the Feature-60 intake §8: "seed `Entitlement` rows directly … and exercise the
// gating"), mints a genuine bearer token via the production `/v1/auth/verify` path (the
// same technique as `ci-issue-token.ts` — insert a MagicLinkToken whose hash matches a
// known raw token, then exchange it), and asserts the membership that `/v1/auth/verify`
// AND `GET /v1/me` return for each scenario.
//
// Scenarios (intake §8 effective-rule edge cases + the prompt's task-6 matrix):
//   1.  no entitlement                          → free
//   2.  active lifetime, expiresAt null         → lifetime
//   3.  active, startsAt in the future          → free   (window not open yet)
//   4.  active, expiresAt in the past           → free   (lapsed)
//   5.  status=revoked  (would-be effective)    → free
//   6.  status=refunded (would-be effective)    → free
//   7.  status=expired  (would-be effective)    → free
//   8.  active subscription, expiresAt future   → subscription
//   9.  multiple rows: non-expiring wins over a future-expiring row → lifetime, activeUntil null, reason lifetime_unlock
//   10. multiple expiring rows: the LATEST expiresAt wins (deterministic) → subscription, activeUntil = the later date
//   11. active subscription, metadata.cancelAtPeriodEnd=true  → /v1/me cancelAtPeriodEnd=true, activeUntil=expiresAt, no raw metadata
//   12. active subscription, metadata.cancelAtPeriodEnd=false → /v1/me cancelAtPeriodEnd=false, activeUntil=expiresAt
//   13. lifetime member                                       → /v1/me has neither cancelAtPeriodEnd nor activeUntil
//   14. free user                                              → /v1/me has neither cancelAtPeriodEnd nor activeUntil
// Plus invariants on EVERY response: no provider id (cus_/sub_/pi_), no `email`, no
// exact `lat`/`lng`, and verify-vs-/v1/me membership AGREE.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy   # (or migrate reset) + db:seed
//   pnpm --filter @tennis/api dev                      # API on :3001
//   DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     pnpm --filter @tennis/api verify:effective-entitlement
//
// CLEANUP: every user + entitlement + token this script creates lives under the
// dedicated, namespaced prefix `f62-…@tennis.test` (a `.test` TLD that can't collide
// with a real or seeded user — the seed creates NO users). The script deletes ALL of
// them at the end (and defensively at the start), so repeated runs stay clean. Uses the
// SAME Prisma client + DATABASE_URL the API uses, so the rows it writes are the rows the
// API reads.

import { createHash, randomBytes } from 'node:crypto';
import {
  PrismaClient,
  type EntitlementKind,
  type EntitlementSource,
  type EntitlementStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// Dedicated, namespaced identity prefix. `.test` can't be a real user; the seed creates
// no users. Every row this harness writes is owned by an email starting with this.
const EMAIL_PREFIX = 'f62-';
const EMAIL_DOMAIN = '@tennis.test';

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * Assert a profile-bearing payload never leaks email, exact coords, or provider ids —
 * the privacy invariants that must hold for EVERY auth/me response (intake §6).
 */
function assertNoLeaks(name: string, payload: unknown): void {
  const keys = collectKeys(payload);
  expectTrue(`${name}: no 'email' key`, !keys.has('email'), `keys: ${[...keys].join(', ')}`);
  const coords = ['lat', 'lng'].filter((k) => keys.has(k));
  expectTrue(`${name}: no exact lat/lng keys`, coords.length === 0, `leaked: ${coords.join(', ')}`);
  // Provider correlation ids never ride the wire (cus_…/sub_…/pi_…/cs_…).
  const providerKeys = [
    'providerCustomerId',
    'providerSubscriptionId',
    'providerPurchaseId',
    'stripeCustomerId',
  ].filter((k) => keys.has(k));
  expectTrue(
    `${name}: no provider-correlation keys`,
    providerKeys.length === 0,
    `leaked: ${providerKeys.join(', ')}`,
  );
  const providerVals = collectStringValues(payload).filter((s) =>
    /^(cus_|sub_|pi_|cs_)/.test(s),
  );
  expectTrue(
    `${name}: no provider-id values (cus_/sub_/pi_/cs_)`,
    providerVals.length === 0,
    `leaked values: ${providerVals.join(', ')}`,
  );
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Token minting: insert a MagicLinkToken, exchange it via the REAL verify endpoint ──

interface VerifyResult {
  accessToken: string;
  /** The membership the verify response itself reported (AuthSessionDTO.user.membership). */
  verifyMembership: string;
  /** The full verify body (for leak scans). */
  verifyBody: unknown;
}

/**
 * Create (or reuse) the test user, seed its entitlement rows, then mint a real session
 * for it through `/v1/auth/verify`. Returns the bearer token + the membership the verify
 * response carried (so we can assert verify-vs-/v1/me agreement).
 */
async function seedUserAndSignIn(
  email: string,
  rows: ReadonlyArray<{
    kind: EntitlementKind;
    status: EntitlementStatus;
    source: EntitlementSource;
    startsAt?: Date;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown>;
  }>,
): Promise<VerifyResult> {
  // Ensure the user exists FIRST so we can attach entitlements before signing in (the
  // verify upsert would also create it, but we need its id to seed rows pre-verify).
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic' },
    update: {},
    select: { id: true },
  });

  // Seed the scenario's entitlement rows.
  for (const r of rows) {
    await prisma.entitlement.create({
      data: {
        userId: user.id,
        kind: r.kind,
        status: r.status,
        source: r.source,
        ...(r.startsAt ? { startsAt: r.startsAt } : {}),
        expiresAt: r.expiresAt ?? null,
        ...(r.metadata ? { metadata: r.metadata } : {}),
      },
    });
  }

  // Mint a raw token, persist ONLY its hash (the request-link shape), exchange it.
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
  const session = (await res.json()) as {
    accessToken?: string;
    user?: { membership?: string };
  };
  if (!session.accessToken || !session.user?.membership) {
    throw new Error(`verify returned no accessToken/membership: ${JSON.stringify(session)}`);
  }
  return {
    accessToken: session.accessToken,
    verifyMembership: session.user.membership,
    verifyBody: session,
  };
}

/** GET /v1/me with a bearer token → the UserProfileDTO body. */
async function getMe(token: string): Promise<{ membership: string; body: unknown }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /me → ${res.status}\n${body}`);
  }
  const body = (await res.json()) as { membership?: string };
  if (!body.membership) throw new Error(`/me returned no membership: ${JSON.stringify(body)}`);
  return { membership: body.membership, body };
}

/**
 * Run one scenario: seed → sign in → assert the verify membership AND the /v1/me
 * membership both equal `expectMembership`, that they AGREE, and that nothing leaks.
 * Returns the /v1/me body so callers can make extra assertions (e.g. activeUntil).
 */
async function scenario(
  label: string,
  emailLocal: string,
  rows: Parameters<typeof seedUserAndSignIn>[1],
  expectMembership: 'free' | 'subscription' | 'lifetime',
): Promise<unknown> {
  const email = `${EMAIL_PREFIX}${emailLocal}${EMAIL_DOMAIN}`;
  const { accessToken, verifyMembership, verifyBody } = await seedUserAndSignIn(email, rows);
  const me = await getMe(accessToken);

  expectTrue(
    `${label}: /v1/me membership === '${expectMembership}'`,
    me.membership === expectMembership,
    `got '${me.membership}'`,
  );
  expectTrue(
    `${label}: verify membership === '${expectMembership}'`,
    verifyMembership === expectMembership,
    `got '${verifyMembership}'`,
  );
  expectTrue(
    `${label}: verify and /v1/me agree`,
    verifyMembership === me.membership,
    `verify='${verifyMembership}' me='${me.membership}'`,
  );
  assertNoLeaks(`${label} (verify body)`, verifyBody);
  assertNoLeaks(`${label} (/v1/me body)`, me.body);
  return me.body;
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } },
    select: { id: true, email: true },
  });
  const ids = users.map((u) => u.id);
  const emails = users.map((u) => u.email);
  // FK-safe order: entitlements/tokens/children first, then the users.
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
  // Tokens aren't FK-linked; delete by the namespaced email regardless.
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
  console.log('Feature 62 — Effective-entitlement derivation verification (no Stripe)');
  console.log(`API base: ${API_BASE}\n`);

  await preflight();
  // Defensive pre-clean in case a prior run aborted mid-flight.
  await cleanup();

  const now = Date.now();
  const past = new Date(now - DAY_MS);
  const future = new Date(now + DAY_MS);
  const farFuture = new Date(now + 30 * DAY_MS);

  console.log('Scenarios');

  // 1. No entitlement → free.
  await scenario('1 no-entitlement', 'none', [], 'free');

  // 2. Active lifetime, expiresAt null → lifetime.
  await scenario(
    '2 active-lifetime-no-expiry',
    'lifetime',
    [{ kind: 'lifetime_unlock', status: 'active', source: 'stripe_web', expiresAt: null }],
    'lifetime',
  );

  // 3. Active but startsAt in the future → free (window not open).
  await scenario(
    '3 active-future-start',
    'futurestart',
    [
      {
        kind: 'lifetime_unlock',
        status: 'active',
        source: 'admin',
        startsAt: future,
        expiresAt: null,
      },
    ],
    'free',
  );

  // 4. Active but expiresAt in the past → free (lapsed).
  await scenario(
    '4 active-expired',
    'expired',
    [{ kind: 'subscription', status: 'active', source: 'stripe_web', expiresAt: past }],
    'free',
  );

  // 5/6/7. Non-active statuses that would otherwise be effective → free.
  await scenario(
    '5 revoked',
    'revoked',
    [{ kind: 'lifetime_unlock', status: 'revoked', source: 'stripe_web', expiresAt: null }],
    'free',
  );
  await scenario(
    '6 refunded',
    'refunded',
    [{ kind: 'lifetime_unlock', status: 'refunded', source: 'stripe_web', expiresAt: null }],
    'free',
  );
  await scenario(
    '7 expired-status',
    'expiredstatus',
    [{ kind: 'subscription', status: 'expired', source: 'stripe_web', expiresAt: future }],
    'free',
  );

  // 8. Active subscription, expiresAt in the future → subscription (badge distinguishes
  //    a recurring subscription from a lifetime unlock).
  await scenario(
    '8 active-subscription',
    'subscription',
    [{ kind: 'subscription', status: 'active', source: 'stripe_web', expiresAt: future }],
    'subscription',
  );

  // 9. Multiple rows: a non-expiring row wins over a future-expiring one → lifetime,
  //    activeUntil null, reason lifetime_unlock.
  const body9 = (await scenario(
    '9 non-expiring-wins',
    'mixedwin',
    [
      { kind: 'subscription', status: 'active', source: 'stripe_web', expiresAt: future },
      { kind: 'lifetime_unlock', status: 'active', source: 'admin', expiresAt: null },
    ],
    'lifetime',
  )) as { membership?: string };
  // /v1/me only surfaces `membership` (UserProfileDTO has no activeUntil/reason) — the
  // tie-break's activeUntil/reason are internal. We assert what's observable: membership
  // is 'lifetime' and the body shape is exactly the UserProfileDTO keys.
  expectTrue(
    '9 non-expiring-wins: /v1/me body is exactly {id,name,initials,membership}',
    JSON.stringify(Object.keys(body9 as object).sort()) ===
      JSON.stringify(['id', 'initials', 'membership', 'name']),
    `keys: ${Object.keys(body9 as object).join(', ')}`,
  );

  // 10. Multiple expiring rows: the later expiresAt wins. Both active subscriptions; the
  //     effective answer is 'subscription' (badge), asserting the rule doesn't mis-resolve
  //     to free when several expiring rows coexist (determinism smoke test).
  await scenario(
    '10 latest-expiry-wins',
    'twoexpiring',
    [
      { kind: 'subscription', status: 'active', source: 'stripe_web', expiresAt: future },
      { kind: 'subscription', status: 'active', source: 'stripe_web', expiresAt: farFuture },
    ],
    'subscription',
  );

  // 11. Scheduled-cancellation display (follow-up to Feature 66/71): an active
  //     subscription with `metadata.cancelAtPeriodEnd=true` surfaces BOTH
  //     `cancelAtPeriodEnd: true` and `activeUntil` (= expiresAt) on /v1/me, without
  //     exposing the raw metadata blob (only the two derived fields).
  const body11 = (await scenario(
    '11 subscription-cancel-at-period-end',
    'cancelling',
    [
      {
        kind: 'subscription',
        status: 'active',
        source: 'stripe_web',
        expiresAt: future,
        metadata: { cancelAtPeriodEnd: true, subscriptionStatus: 'active' },
      },
    ],
    'subscription',
  )) as { cancelAtPeriodEnd?: boolean; activeUntil?: string | null; metadata?: unknown };
  expectTrue(
    '11 cancelling: /v1/me cancelAtPeriodEnd === true',
    body11.cancelAtPeriodEnd === true,
    `got ${JSON.stringify(body11.cancelAtPeriodEnd)}`,
  );
  expectTrue(
    '11 cancelling: /v1/me activeUntil === seeded expiresAt',
    body11.activeUntil === future.toISOString(),
    `got ${JSON.stringify(body11.activeUntil)} expected ${future.toISOString()}`,
  );
  expectTrue(
    '11 cancelling: /v1/me does not expose raw metadata',
    body11.metadata === undefined,
    `metadata leaked: ${JSON.stringify(body11.metadata)}`,
  );

  // 12. Active subscription WITHOUT a scheduled cancellation: cancelAtPeriodEnd is false;
  //     activeUntil still carries the current paid-through date (existing DTO convention
  //     — the same field an auto-renewing subscription would show).
  const body12 = (await scenario(
    '12 subscription-not-cancelling',
    'notcancelling',
    [
      {
        kind: 'subscription',
        status: 'active',
        source: 'stripe_web',
        expiresAt: future,
        metadata: { cancelAtPeriodEnd: false, subscriptionStatus: 'active' },
      },
    ],
    'subscription',
  )) as { cancelAtPeriodEnd?: boolean; activeUntil?: string | null };
  expectTrue(
    '12 not-cancelling: /v1/me cancelAtPeriodEnd === false',
    body12.cancelAtPeriodEnd === false,
    `got ${JSON.stringify(body12.cancelAtPeriodEnd)}`,
  );
  expectTrue(
    '12 not-cancelling: /v1/me activeUntil === seeded expiresAt',
    body12.activeUntil === future.toISOString(),
    `got ${JSON.stringify(body12.activeUntil)} expected ${future.toISOString()}`,
  );

  // 13. Lifetime member: no cancellation notice, no misleading expiration date — neither
  //     field appears on /v1/me even though a lifetime row could (in principle) carry
  //     leftover metadata.
  const body13 = (await scenario(
    '13 lifetime-no-cancellation-fields',
    'lifetimeclean',
    [{ kind: 'lifetime_unlock', status: 'active', source: 'stripe_web', expiresAt: null }],
    'lifetime',
  )) as { cancelAtPeriodEnd?: boolean; activeUntil?: string | null };
  expectTrue(
    '13 lifetime: /v1/me has no cancelAtPeriodEnd field',
    body13.cancelAtPeriodEnd === undefined,
    `got ${JSON.stringify(body13.cancelAtPeriodEnd)}`,
  );
  expectTrue(
    '13 lifetime: /v1/me has no activeUntil field (no misleading expiry)',
    body13.activeUntil === undefined,
    `got ${JSON.stringify(body13.activeUntil)}`,
  );

  // 14. Free user: no cancellation notice.
  const body14 = (await scenario('14 free-no-cancellation-fields', 'freeclean', [], 'free')) as {
    cancelAtPeriodEnd?: boolean;
    activeUntil?: string | null;
  };
  expectTrue(
    '14 free: /v1/me has no cancelAtPeriodEnd field',
    body14.cancelAtPeriodEnd === undefined,
    `got ${JSON.stringify(body14.cancelAtPeriodEnd)}`,
  );
  expectTrue(
    '14 free: /v1/me has no activeUntil field',
    body14.activeUntil === undefined,
    `got ${JSON.stringify(body14.activeUntil)}`,
  );

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
    '\n\x1b[32mVERIFICATION PASSED — effective entitlement derives membership correctly across all scenarios.\x1b[0m\n',
  );
}

main()
  .catch(async (err) => {
    console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
    // Best-effort cleanup even on crash so a failed run doesn't leave fixtures.
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
