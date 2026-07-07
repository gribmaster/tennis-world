/* eslint-disable no-console */
//
// Feature 69 — Billing rate-limit verification (per-user, in-memory limiter).
//
// Drives the REAL `POST /v1/billing/checkout` + `POST /v1/billing/portal` endpoints and
// asserts the Feature-69 per-user rate limiter: unauth still 401, under-limit reaches the
// existing billing behavior, the (N+1)th request 429s, checkout and portal have
// INDEPENDENT budgets, two users have INDEPENDENT counters, and the webhook + public
// courts are NOT limited by it.
//
// ── STRIPE-INDEPENDENT (runs in required CI, unlike verify:billing-checkout) ──────────
// The limiter runs BEFORE the billing service, so this harness needs NO Stripe config.
// It asserts the STATUS DISTINCTION, not a Stripe URL:
//   - "under limit" = the request is NOT 429 (it reaches the billing service). With no
//     Stripe env that's a 500 "Billing is not configured"; with Stripe test env it's a
//     200 { url }. Either way it is NOT rate-limited — that's what we assert.
//   - "over limit"  = 429 with the safe message + a Retry-After header.
// So it is deterministic with or without Stripe and safe to keep in the required gate.
//
// ── DETERMINISM (task 4) ──────────────────────────────────────────────────────────────
// The limiter is IN-MEMORY in the running API and its window is long (default 600s), so a
// counter set on one run would still be "hot" on a re-run minutes later. To stay
// deterministic and self-contained, EVERY user this script mints is uniquely namespaced
// per run (`f69-<runId>-…@tennis.test`), so its per-user counter always starts empty
// regardless of prior runs. The script also reads the configured limits from the env it
// shares with the API (falling back to the documented defaults) so it sends exactly
// `limit` allowed requests then one more.
//
// PREREQUISITE: the API under test must run with the SAME billing rate-limit env this
// script reads (or all defaults on both sides) so "limit" agrees. Point the two knobs
// low (e.g. BILLING_CHECKOUT_RATE_LIMIT_MAX=3) for a faster run; the script adapts.
//
// CLEANUP: every user is under the `f69-<runId>-…@tennis.test` prefix (the seed creates
// no users); deleted at the end and defensively at the start (all `f69-…` from any run).

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// Per-run id so each user's in-memory counter starts fresh (see header).
const RUN_ID = randomBytes(4).toString('hex');
const EMAIL_PREFIX = 'f69-';
const EMAIL_DOMAIN = '@tennis.test';
const runEmail = (label: string): string =>
  `${EMAIL_PREFIX}${RUN_ID}-${label}${EMAIL_DOMAIN}`;

// The limits the script must match the API on. Read from the shared env, defaulting to
// the documented Feature-69 defaults. `positiveInt` mirrors billing.config's parser so a
// bad value here falls back exactly as the API would.
function positiveInt(raw: string | undefined, fallback: number): number {
  const v = raw?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
const CHECKOUT_MAX = positiveInt(process.env.BILLING_CHECKOUT_RATE_LIMIT_MAX, 5);
const PORTAL_MAX = positiveInt(process.env.BILLING_PORTAL_RATE_LIMIT_MAX, 10);

// ── Tiny assertion harness (matches verify-billing-checkout) ──────────────────────────

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function expectTrue(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** SHA-256 hex — mirrors AuthService.sha256 (must stay in lockstep with the API). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ── Token minting: insert a MagicLinkToken, exchange it via the REAL verify endpoint ──

async function seedUserAndSignIn(email: string): Promise<string> {
  await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic' },
    update: {},
    select: { id: true },
  });

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

interface BillingResponse {
  status: number;
  body: unknown;
  retryAfter: string | null;
}

/** POST a billing endpoint (optionally authed). Returns status + parsed body + header. */
async function postBilling(
  path: string,
  token?: string,
  body?: unknown,
): Promise<BillingResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const parsed = await res.json().catch(() => undefined);
  return {
    status: res.status,
    body: parsed,
    retryAfter: res.headers.get('retry-after'),
  };
}

/** A checkout POST for a token — the body is a valid lifetime plan. */
const checkout = (token: string): Promise<BillingResponse> =>
  postBilling('/billing/checkout', token, { plan: 'lifetime' });
/** A portal POST for a token — no body. */
const portal = (token: string): Promise<BillingResponse> =>
  postBilling('/billing/portal', token);

/** True when a response is "reached the billing service" (i.e. NOT rate-limited). */
const notLimited = (r: BillingResponse): boolean => r.status !== 429;

// ── Cleanup ───────────────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  // Delete ALL f69- users (from this and any prior crashed run) — safe, they're fixtures.
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
  }
  await prisma.magicLinkToken.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } },
  });
  if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

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
  console.log('Feature 69 — Billing rate-limit verification');
  console.log(`API base: ${API_BASE}`);
  console.log(`Run id: ${RUN_ID}   checkoutMax=${CHECKOUT_MAX}  portalMax=${PORTAL_MAX}`);
  console.log(
    '(the API MUST run with the same BILLING_*_RATE_LIMIT_MAX env, or all defaults on both sides)\n',
  );

  await preflight();
  await cleanup();

  console.log('Scenarios');

  // A. No auth → 401 (auth runs BEFORE the limiter; a 401 is never masked by a 429).
  {
    const c = await postBilling('/billing/checkout', undefined, { plan: 'lifetime' });
    expectTrue('A no-auth checkout → 401 (not 429)', c.status === 401, `got ${c.status}`);
    const p = await postBilling('/billing/portal', undefined);
    expectTrue('A no-auth portal → 401 (not 429)', p.status === 401, `got ${p.status}`);
  }

  // B. Under-limit checkout reaches billing behavior (NOT 429) for the first CHECKOUT_MAX.
  //    Then the (CHECKOUT_MAX+1)th is 429. Fresh per-run user → counter starts at 0.
  const buyerToken = await seedUserAndSignIn(runEmail('buyer'));
  {
    let allUnderLimitOk = true;
    let firstBad = '';
    for (let i = 1; i <= CHECKOUT_MAX; i += 1) {
      const r = await checkout(buyerToken);
      if (!notLimited(r)) {
        allUnderLimitOk = false;
        firstBad = `request #${i} was 429 (expected under limit)`;
        break;
      }
    }
    expectTrue(
      `B first ${CHECKOUT_MAX} checkouts NOT rate-limited (reach billing service)`,
      allUnderLimitOk,
      firstBad,
    );

    const over = await checkout(buyerToken);
    expectTrue(
      `B checkout #${CHECKOUT_MAX + 1} → 429`,
      over.status === 429,
      `got ${over.status}: ${JSON.stringify(over.body)}`,
    );
    expectTrue(
      'B 429 body carries the safe message (no internal counters)',
      typeof (over.body as { message?: unknown })?.message === 'string' &&
        /too many billing requests/i.test((over.body as { message: string }).message) &&
        !/\d/.test((over.body as { message: string }).message),
      `message: ${JSON.stringify((over.body as { message?: unknown })?.message)}`,
    );
    expectTrue(
      'B 429 sets a positive Retry-After header',
      over.retryAfter !== null && Number(over.retryAfter) >= 1,
      `Retry-After: ${String(over.retryAfter)}`,
    );
  }

  // C. Portal has an INDEPENDENT budget for the SAME user: even though checkout is now
  //    exhausted for `buyer`, portal is still allowed up to PORTAL_MAX, then 429s.
  {
    let allUnderLimitOk = true;
    let firstBad = '';
    for (let i = 1; i <= PORTAL_MAX; i += 1) {
      const r = await portal(buyerToken);
      if (!notLimited(r)) {
        allUnderLimitOk = false;
        firstBad = `portal request #${i} was 429 (checkout exhaustion must not affect portal)`;
        break;
      }
    }
    expectTrue(
      `C portal independent of checkout — first ${PORTAL_MAX} portals NOT limited`,
      allUnderLimitOk,
      firstBad,
    );
    const over = await portal(buyerToken);
    expectTrue(
      `C portal #${PORTAL_MAX + 1} → 429`,
      over.status === 429,
      `got ${over.status}`,
    );
  }

  // D. A DIFFERENT user has independent counters: fresh user's first checkout is NOT 429,
  //    even though `buyer` is fully rate-limited.
  {
    const otherToken = await seedUserAndSignIn(runEmail('other'));
    const r = await checkout(otherToken);
    expectTrue(
      'D second user checkout NOT limited (per-user counters are independent)',
      notLimited(r),
      `got ${r.status}`,
    );
  }

  // E. The Stripe webhook is NOT rate-limited by this limiter. A signature-less POST is a
  //    400 (bad/absent signature), NEVER a 429 — even after many rapid calls.
  {
    let saw429 = false;
    let lastStatus = 0;
    for (let i = 0; i < CHECKOUT_MAX + PORTAL_MAX + 5; i += 1) {
      const res = await fetch(`${API_BASE}/webhooks/stripe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: `evt_f69_${RUN_ID}_${i}`, type: 'noop' }),
      });
      lastStatus = res.status;
      if (res.status === 429) saw429 = true;
    }
    expectTrue(
      'E webhook never 429s (not rate-limited by the billing limiter)',
      !saw429,
      `saw a 429; last status ${lastStatus}`,
    );
  }

  // F. Public /v1/courts is unaffected — hammering it never 429s (no global limiter).
  {
    let saw429 = false;
    for (let i = 0; i < CHECKOUT_MAX + 5; i += 1) {
      const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
      if (res.status === 429) saw429 = true;
    }
    expectTrue('F public /v1/courts never 429s (limiter is billing-only)', !saw429);
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
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — billing endpoints are per-user rate-limited (429 over budget),\n' +
      'checkout/portal budgets are independent, users are independent, and the webhook +\n' +
      'public courts are unaffected.\x1b[0m\n',
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
