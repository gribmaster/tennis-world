/* eslint-disable no-console */
//
// Feature 65 — Stripe checkout + customer-portal endpoint verification (OPT-IN).
//
// Exercises `POST /v1/billing/checkout` + `POST /v1/billing/portal` end-to-end through
// the REAL endpoints against Stripe TEST MODE. It mints genuine bearer tokens via the
// production `/v1/auth/verify` path (the same technique as verify-exact-location.ts /
// ci-issue-token.ts), then asserts the auth gate, customer create+reuse, plan handling,
// and — critically — that NO Entitlement is granted and `/v1/me` stays 'free' (no
// webhook fulfillment yet, Feature 66).
//
// ── OPT-IN / CI SAFETY (prompt task 10) ──────────────────────────────────────────────
// This harness needs live Stripe test-mode config, which CI may not have. It is NOT in
// the required CI gate. When STRIPE_SECRET_KEY is absent it SKIPS with a clear message
// and exits 0 — so a `pnpm verify:billing-checkout` in an unconfigured environment is a
// clean no-op, never a false failure. Run locally with:
//
//   # apps/api/.env (test mode):
//   STRIPE_SECRET_KEY=sk_test_…
//   STRIPE_PRICE_MONTHLY=price_…             # required
//   STRIPE_PRICE_QUARTERLY=price_…           # optional (enables the quarterly check)
//   pnpm db:up && pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api dev            # API on :3001 (loads the same .env)
//   DATABASE_URL=… NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     pnpm --filter @tennis/api verify:billing-checkout
//
// Scenarios:
//   A. no auth → 401 (both checkout + portal, AuthGuard before handler)
//   B. monthly checkout → 201 { url } (a hosted checkout.stripe.com URL); NO provider
//      id (cus_/sub_/pi_/cs_) in the body
//   C. user.stripeCustomerId is now stored (created lazily on first checkout)
//   D. second checkout REUSES the same customer (stripeCustomerId unchanged)
//   E. portal → 201 { url }
//   F. quarterly: 200 { url } if STRIPE_PRICE_QUARTERLY is set, else 400 (disabled)
//   G. unknown plan → 400 (DTO @IsIn)
//   H. NO Entitlement row was created for the user (checkout ≠ fulfillment)
//   I. /v1/me still reports membership 'free' (no webhook grant yet)
//
// CLEANUP: every user + token this script creates lives under the namespaced prefix
// `f65-…@tennis.test` (the seed creates no users). The script deletes them at the end
// (and defensively at the start). The Stripe TEST customers it creates are left in the
// test account (harmless; Stripe test data is disposable) — deleting them would need an
// extra Stripe call outside this feature's scope.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

const EMAIL_PREFIX = 'f65-';
const EMAIL_DOMAIN = '@tennis.test';

// ── Tiny assertion harness (matches verify-exact-location / verify-api-parity) ──

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

/** Recursively collect every string VALUE in a payload (for provider-id leak scans). */
function collectStringValues(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStringValues(v, acc);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value as Record<string, unknown>))
      collectStringValues(v, acc);
  return acc;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

/** POST a billing endpoint (optionally authed). Returns status + parsed body. */
async function postBilling(
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
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
  return { status: res.status, body: parsed };
}

/** GET /v1/me for the authed user. */
async function getMe(token: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  const parsed = await res.json().catch(() => undefined);
  return { status: res.status, body: parsed };
}

/** Assert a billing response body is exactly `{ url }` with a plausible hosted URL. */
function assertUrlDto(name: string, body: unknown): void {
  const dto = body as Record<string, unknown> | undefined;
  const keys = Object.keys(dto ?? {}).sort();
  expectTrue(
    `${name}: body is exactly { url }`,
    JSON.stringify(keys) === JSON.stringify(['url']),
    `keys: ${keys.join(', ')}`,
  );
  expectTrue(
    `${name}: url is a stripe.com https URL`,
    typeof dto?.url === 'string' && /^https:\/\/[a-z0-9.]*stripe\.com/i.test(dto.url as string),
    `url: ${String(dto?.url)}`,
  );
  // No provider correlation id ever rides the payload (privacy rule).
  const leaked = collectStringValues(dto).filter((s) => /^(cus_|sub_|pi_|cs_)/.test(s));
  expectTrue(`${name}: no provider-id values (cus_/sub_/pi_/cs_)`, leaked.length === 0, `leaked: ${leaked.join(', ')}`);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────────

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
  console.log('Feature 65 — Stripe checkout + customer-portal endpoint verification');
  console.log(`API base: ${API_BASE}\n`);

  // OPT-IN GATE: no Stripe secret → skip cleanly (exit 0). CI without Stripe passes.
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    console.log(
      '\x1b[33mSKIPPED\x1b[0m — STRIPE_SECRET_KEY is not set. This harness is opt-in and\n' +
        '          needs Stripe TEST-MODE config (see the header of this file).\n' +
        '          Set STRIPE_SECRET_KEY + STRIPE_PRICE_MONTHLY (and run the API with the\n' +
        '          same env) to exercise checkout/portal. Exiting 0 (not a failure).\n',
    );
    process.exit(0);
  }

  const hasQuarterlyPrice = Boolean(process.env.STRIPE_PRICE_QUARTERLY?.trim());

  await preflight();
  await cleanup();

  console.log('Scenarios');

  // A. No auth → 401 (both endpoints).
  {
    const checkout = await postBilling('/billing/checkout', undefined, { plan: 'monthly' });
    expectTrue('A no-auth checkout → 401', checkout.status === 401, `got ${checkout.status}`);
    const portal = await postBilling('/billing/portal', undefined);
    expectTrue('A no-auth portal → 401', portal.status === 401, `got ${portal.status}`);
  }

  // The main flow: one user through checkout ×2 + portal, asserting customer reuse.
  const email = `${EMAIL_PREFIX}buyer${EMAIL_DOMAIN}`;
  const token = await seedUserAndSignIn(email);

  // B. monthly checkout → 201 { url }.
  {
    const { status, body } = await postBilling('/billing/checkout', token, { plan: 'monthly' });
    expectTrue('B monthly checkout → 201', status === 201, `got ${status}: ${JSON.stringify(body)}`);
    assertUrlDto('B monthly checkout', body);
  }

  // C. stripeCustomerId is now stored on the user.
  const afterFirst = await prisma.user.findUnique({
    where: { email },
    select: { stripeCustomerId: true },
  });
  expectTrue(
    'C stripeCustomerId stored after first checkout',
    typeof afterFirst?.stripeCustomerId === 'string' && afterFirst.stripeCustomerId.startsWith('cus_'),
    `stripeCustomerId: ${String(afterFirst?.stripeCustomerId)}`,
  );

  // D. second checkout reuses the SAME customer (id unchanged).
  {
    const { status } = await postBilling('/billing/checkout', token, { plan: 'monthly' });
    expectTrue('D second checkout → 201', status === 201, `got ${status}`);
    const afterSecond = await prisma.user.findUnique({
      where: { email },
      select: { stripeCustomerId: true },
    });
    expectTrue(
      'D second checkout reuses the same stripeCustomerId',
      afterSecond?.stripeCustomerId === afterFirst?.stripeCustomerId,
      `first=${String(afterFirst?.stripeCustomerId)} second=${String(afterSecond?.stripeCustomerId)}`,
    );
  }

  // E. portal → 201 { url }.
  {
    const { status, body } = await postBilling('/billing/portal', token);
    expectTrue('E portal → 201', status === 201, `got ${status}: ${JSON.stringify(body)}`);
    assertUrlDto('E portal', body);
  }

  // F. quarterly: 200 if configured, else clean 400.
  {
    const { status, body } = await postBilling('/billing/checkout', token, { plan: 'quarterly' });
    if (hasQuarterlyPrice) {
      expectTrue('F quarterly checkout → 201 (price configured)', status === 201, `got ${status}: ${JSON.stringify(body)}`);
      if (status === 201) assertUrlDto('F quarterly checkout', body);
    } else {
      expectTrue(
        'F quarterly checkout → 400 (price NOT configured, disabled plan)',
        status === 400,
        `got ${status}: ${JSON.stringify(body)}`,
      );
    }
  }

  // G. unknown plan → 400 (DTO @IsIn).
  {
    const { status } = await postBilling('/billing/checkout', token, { plan: 'enterprise' });
    expectTrue('G unknown plan → 400', status === 400, `got ${status}`);
  }

  // H. NO Entitlement row was created (checkout ≠ fulfillment).
  {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const count = user
      ? await prisma.entitlement.count({ where: { userId: user.id } })
      : -1;
    expectTrue('H no Entitlement row created by checkout', count === 0, `entitlement rows: ${count}`);
  }

  // I. /v1/me still 'free' (no webhook grant yet).
  {
    const { status, body } = await getMe(token);
    const membership = (body as { membership?: string } | undefined)?.membership;
    expectTrue('I /v1/me → 200', status === 200, `got ${status}`);
    expectTrue(
      "I /v1/me membership is still 'free' (no fulfillment yet)",
      membership === 'free',
      `membership: ${String(membership)}`,
    );
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
    '\n\x1b[32mVERIFICATION PASSED — checkout/portal work, customer is reused, and no entitlement is granted (checkout ≠ fulfillment).\x1b[0m\n',
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
