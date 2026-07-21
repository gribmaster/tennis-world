/* eslint-disable no-console */
//
// Feature 68 — Stripe test-mode END-TO-END smoke (OPT-IN, HYBRID: real Stripe API + signed
// synthetic webhook). This is the ONE harness that drives the whole payment loop against a
// LIVE Stripe TEST-MODE account and the real API in a single run.
//
// Reworked (post-Feature-71 billing-plan rework) to the current recurring-subscription plan
// model — monthly/quarterly/yearly, Checkout `mode: 'subscription'` — replacing the retired
// one-time `lifetime` plan / `mode: 'payment'` flow. Plan resolution reuses the SAME
// `BillingPlanKey` contract + `resolvePlan`/`BillingConfig` production code (no duplicated
// plan-to-price mapping here).
//
// ── WHAT IS REAL vs SYNTHETIC (read this — the honesty rule, prompt tasks 3/6/13) ────────
//   REAL Stripe test-mode API calls (prove BillingService's actual Stripe integration):
//     • POST /v1/billing/checkout → the API calls stripe.checkout.sessions.create AND
//       stripe.customers.create for real; we assert the returned `url` is a genuine hosted
//       checkout.stripe.com URL and that a real `cus_…` was persisted on the User row.
//     • A second checkout proves the SAME real customer is reused.
//     • POST /v1/billing/portal → the API calls stripe.billingPortal.sessions.create for
//       real; we assert a hosted `url` comes back.
//     • We also read the created Checkout Session back from Stripe (a real retrieve) to pull
//       the customer identifier that a genuine completion would carry.
//
//   SYNTHETIC (but SIGNED with the real webhook secret) fulfillment:
//     • Stripe test mode NEVER delivers `checkout.session.completed` without a browser + a
//       test card entered on the hosted page (or the Stripe CLI `stripe trigger`), so this
//       harness cannot receive a real completion event unattended. Instead it hand-builds a
//       `checkout.session.completed` event (mode='subscription') carrying the REAL
//       session/customer id from the real session above plus a namespaced synthetic
//       subscription id, signs it with `stripe.webhooks.generateTestHeaderString` (the exact
//       HMAC the API's `constructEvent` verifies), and POSTs it to the real
//       `POST /v1/webhooks/stripe`. This is a HYBRID: real Stripe checkout objects + a signed
//       synthetic delivery. It is NOT full Stripe-CLI event delivery — for that, run:
//         stripe listen --forward-to localhost:3001/v1/webhooks/stripe
//         stripe trigger checkout.session.completed
//       (documented in the intake note; hard to automate in CI without the Stripe CLI binary).
//
// After the signed fulfillment we assert the DOWNSTREAM PRODUCT behavior, all real:
//     • an active subscription Entitlement exists (kind=subscription, anchored on the
//       synthetic subscription id — the same anchor BillingService's webhook uses),
//     • /v1/me flips 'free' → 'subscription',
//     • the protected exact-location endpoint unlocks (200) for a real seeded court,
//     • a signed synthetic customer.subscription.deleted (same subscription id) revokes it →
//       /v1/me 'free', exact-location 403 again,
//     • NO provider id (cus_/sub_/pi_/cs_) leaks in any /v1/me or exact-location response.
//
// Optionally (WEB_APP_URL set + Next running) we fetch /billing/return and assert the page
// RENDERS (a structural 200 + shell copy). We do NOT drive the client poll or assert the
// "unlocked" copy — that needs a browser session cookie the return island reads client-side,
// and the prompt forbids adding Playwright. The membership logic behind that page is already
// proven by verify-web-billing's token-gated /v1/me checks. Documented as a limitation.
//
// ── OPT-IN / CI SAFETY (prompt tasks 2/5/10) ─────────────────────────────────────────────
// Required env for a real run:
//     STRIPE_SECRET_KEY=sk_test_…        (a TEST key; a live key is refused, see below)
//     STRIPE_WEBHOOK_SECRET=whsec_…      (the SAME value the running API is configured with)
//     A Stripe price id for the chosen plan — one of:
//       STRIPE_PRICE_MONTHLY=price_…  STRIPE_PRICE_QUARTERLY=price_…  STRIPE_PRICE_YEARLY=price_…
//     NEXT_PUBLIC_API_BASE_URL / API base (defaults to http://localhost:3001/v1)
//     DATABASE_URL                        (to seed the user + read entitlements/customer id)
// Optional:
//     STRIPE_E2E_PLAN=monthly|quarterly|yearly   (which recurring plan to exercise; default 'monthly')
//     WEB_APP_URL / NEXT base            (enables the structural /billing/return render check)
//
// Gate:
//   • RUN_STRIPE_E2E unset (or !=1) AND any required Stripe env missing → SKIP cleanly, exit 0.
//     A normal CI/dev run of `verify:stripe-e2e` with no Stripe config is a green no-op — it
//     NEVER fails and NEVER fakes a pass.
//   • RUN_STRIPE_E2E=1 AND any required env missing → FAIL clearly (exit 1). "I asked for the
//     real thing and it isn't configured" must be loud, not silently skipped.
//   • Any Stripe env present (even without RUN_STRIPE_E2E) → run the real thing.
//
// SAFETY: refuses an `sk_live_…` key outright (this creates real Stripe objects; it must only
// ever touch a TEST account). Never logs a secret. The API under test MUST run with the SAME
// STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (checkout uses the key; the webhook verifies the
// synthetic signature against the secret — they must agree by construction).
//
// CLEANUP: every user/entitlement/token/event is namespaced (`f68-…@tennis.test`, event ids
// `evt_f68_…`). Deleted at the end + defensively at the start. The REAL Stripe TEST customers
// + checkout sessions this creates are left in the test account (disposable test data; the
// prior F65 harness makes the same trade-off — deleting them is out of scope). This harness
// never mutates any pre-existing real subscribed test user — it only ever touches its own
// namespaced `f68-…@tennis.test` user.
//
// SUBSCRIPTION-SPECIFIC NOTE: a real Checkout Session in `mode: 'subscription'` has no
// `payment_intent` until a hosted page actually completes payment (which this unattended
// harness cannot drive), so there is nothing to retrieve there. Revocation for a subscription
// is therefore exercised via a signed `customer.subscription.deleted` event (the same event
// StripeWebhookService uses to lapse a real subscription), not `charge.refunded` — the latter
// anchors on a PaymentIntent, which a one-time/lifetime purchase has but a bare subscription
// checkout does not.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { BillingPlanKey } from '@tennis/contracts';
import { loadBillingConfig } from '../src/billing/billing.config';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
const WEB_APP_URL =
  process.env.WEB_APP_URL?.trim() || process.env.NEXT_APP_URL?.trim() || '';
const FORCE = process.env.RUN_STRIPE_E2E === '1';

// Which recurring plan this run exercises (task 2). Default 'monthly'; override via
// STRIPE_E2E_PLAN. Validated against the SAME BillingPlanKey contract production code uses —
// an unrecognised value is a hard config error, not a silent fallback.
const RAW_PLAN = process.env.STRIPE_E2E_PLAN?.trim() || 'monthly';
const PLAN_PARSE = BillingPlanKey.safeParse(RAW_PLAN);
const PLAN: BillingPlanKey = PLAN_PARSE.success ? PLAN_PARSE.data : 'monthly';

// Reuse the production billing config reader — the SAME per-plan price map BillingService
// resolves against — rather than re-declaring a plan→env-var mapping here.
const billingConfig = loadBillingConfig(process.env);
const PLAN_PRICE = billingConfig.prices[PLAN];

const EMAIL_PREFIX = 'f68-';
const EMAIL_DOMAIN = '@tennis.test';
// A real, seeded, PUBLISHED court (shared with the parity / exact-location / webhook harnesses).
const REAL_SLUG = 'grand-hotel-tremezzo';

// ── Tiny assertion harness (matches verify-stripe-webhook / verify-billing-checkout) ──

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];
let skipped = 0;

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}
function skip(name: string, why: string): void {
  skipped += 1;
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name}`);
  console.log(`        ${why}`);
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

// ── Stripe client (REAL test-mode calls) + synthetic signing ────────────────────────

// Built from the real test key. Used for a real session retrieve AND for the static
// `webhooks.generateTestHeaderString` (the signed synthetic delivery).
const stripe = new Stripe(SECRET_KEY || 'sk_test_dummy');

/** Wrap an event `type` + `object` into a minimal Stripe.Event envelope with a namespaced id. */
function makeEvent(type: string, object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `evt_f68_${randomBytes(8).toString('hex')}`,
    object: 'event',
    type,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  };
}

/** Serialize + sign an event with the REAL webhook secret and POST it to the webhook. */
async function postSignedWebhook(
  event: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${API_BASE}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

// ── Token minting: insert a MagicLinkToken, exchange it via the REAL verify endpoint ──

async function seedUserAndSignIn(email: string): Promise<{ userId: string; token: string }> {
  const user = await prisma.user.upsert({
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
    throw new Error(`POST /auth/verify → ${res.status}\n${await res.text().catch(() => '')}`);
  }
  const session = (await res.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error('verify returned no accessToken');
  return { userId: user.id, token: session.accessToken };
}

/** POST a billing endpoint (authed). Returns status + parsed body. */
async function postBilling(
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

async function getMe(token: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

async function getExactLocation(
  token: string,
  slug: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/me/courts/${encodeURIComponent(slug)}/exact-location`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

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
    typeof dto?.url === 'string' &&
      /^https:\/\/[a-z0-9.-]*stripe\.com/i.test(dto.url as string),
    `url: ${String(dto?.url)}`,
  );
  const leaked = collectStringValues(dto).filter((s) => /^(cus_|sub_|pi_|cs_)/.test(s));
  expectTrue(
    `${name}: no provider-id values (cus_/sub_/pi_/cs_)`,
    leaked.length === 0,
    `leaked: ${leaked.join(', ')}`,
  );
}

function assertNoProviderLeak(name: string, body: unknown): void {
  const leaked = collectStringValues(body).filter((s) =>
    /^(cus_|sub_|pi_|cs_|whsec_|sk_)/.test(s),
  );
  expectTrue(
    `${name}: no provider-id/secret values leaked`,
    leaked.length === 0,
    `leaked: ${leaked.join(', ')}`,
  );
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
  await prisma.processedWebhookEvent.deleteMany({ where: { id: { startsWith: 'evt_f68_' } } });
}

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET /courts → ${res.status}`);
  } catch (err) {
    console.error('\n\x1b[31mCannot reach the API for verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/courts`);
    console.error(`  Reason: ${describeError(err)}\n`);
    console.error('  Start the dependencies first (with the SAME Stripe test env):');
    console.error('    pnpm db:up && pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)\n');
    process.exit(2);
  }
}

// ── Env gate (task 2) ────────────────────────────────────────────────────────────────

/** Return the list of MISSING required env vars for a real run. */
function missingRequiredEnv(): string[] {
  const missing: string[] = [];
  if (!SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!PLAN_PARSE.success) missing.push(`STRIPE_E2E_PLAN (invalid value: ${RAW_PLAN})`);
  else if (!PLAN_PRICE) missing.push(`STRIPE_PRICE_${PLAN.toUpperCase()}`);
  return missing;
}

async function main(): Promise<void> {
  console.log('Feature 68 — Stripe test-mode E2E smoke (hybrid: real Stripe API + signed webhook)');
  console.log(`API base: ${API_BASE}`);
  console.log(`Plan under test: ${PLAN}\n`);

  const missing = missingRequiredEnv();
  const anyStripeEnv = Boolean(SECRET_KEY || WEBHOOK_SECRET || PLAN_PRICE);

  // Gate (task 2). RUN_STRIPE_E2E=1 forces a real run and turns missing env into a hard fail.
  if (missing.length > 0) {
    if (FORCE) {
      console.error(
        `\x1b[31mRUN_STRIPE_E2E=1 but required Stripe env is missing:\x1b[0m ${missing.join(', ')}\n` +
          '  This flag DEMANDS a real Stripe test-mode run — refusing to skip. Provide:\n' +
          '    STRIPE_SECRET_KEY=sk_test_…  STRIPE_WEBHOOK_SECRET=whsec_…\n' +
          `    STRIPE_PRICE_${PLAN.toUpperCase()}=price_…  (or set STRIPE_E2E_PLAN to a plan you HAVE configured)\n` +
          '  (and run the API with the SAME STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET).\n',
      );
      process.exit(1);
    }
    // No force + missing env → clean skip (green no-op). We do NOT fake a pass.
    console.log(
      '\x1b[33mSKIPPED\x1b[0m — this OPT-IN E2E smoke needs live Stripe TEST-MODE config:\n' +
        `          missing: ${missing.join(', ')}\n` +
        (anyStripeEnv
          ? '          (some Stripe env is set, but not all of the above — supply the rest.)\n'
          : '') +
        '          Set them (+ run the API with the SAME secret key + webhook secret), or set\n' +
        '          RUN_STRIPE_E2E=1 to force a hard failure when they are absent. Exiting 0.\n',
    );
    process.exit(0);
  }

  // SAFETY: this harness creates REAL Stripe objects — refuse a LIVE key outright.
  if (SECRET_KEY.startsWith('sk_live_')) {
    console.error(
      '\x1b[31mRefusing to run against a LIVE Stripe key (sk_live_…).\x1b[0m\n' +
        '  This smoke creates real customers + checkout sessions and posts synthetic events;\n' +
        '  it must ONLY ever touch a Stripe TEST account. Use an sk_test_… key.\n',
    );
    process.exit(1);
  }

  await preflight();
  await cleanup();

  console.log('Scenarios (REAL Stripe test-mode API + signed synthetic webhook)');

  const email = `${EMAIL_PREFIX}buyer${EMAIL_DOMAIN}`;
  const { userId, token } = await seedUserAndSignIn(email);

  // ── 1. REAL checkout → hosted url + real customer persisted ─────────────────────────
  let firstCustomerId: string | null = null;
  let checkoutUrl: string | null = null;
  {
    const { status, body } = await postBilling('/billing/checkout', token, { plan: PLAN });
    expectTrue(
      `1 ${PLAN} checkout → 201 (real Stripe checkout.sessions.create, mode=subscription)`,
      status === 201,
      `got ${status}: ${JSON.stringify(body)}`,
    );
    assertUrlDto(`1 ${PLAN} checkout`, body);
    checkoutUrl = (body as { url?: string } | undefined)?.url ?? null;

    const afterFirst = await prisma.user.findUnique({
      where: { email },
      select: { stripeCustomerId: true },
    });
    firstCustomerId = afterFirst?.stripeCustomerId ?? null;
    expectTrue(
      '1 real Stripe customer persisted (cus_…)',
      typeof firstCustomerId === 'string' && firstCustomerId.startsWith('cus_'),
      `stripeCustomerId: ${String(firstCustomerId)}`,
    );
  }

  // ── 2. Second checkout reuses the SAME real customer ────────────────────────────────
  {
    const { status } = await postBilling('/billing/checkout', token, { plan: PLAN });
    expectTrue('2 second checkout → 201', status === 201, `got ${status}`);
    const afterSecond = await prisma.user.findUnique({
      where: { email },
      select: { stripeCustomerId: true },
    });
    expectTrue(
      '2 second checkout reuses the same real customer',
      afterSecond?.stripeCustomerId === firstCustomerId,
      `first=${String(firstCustomerId)} second=${String(afterSecond?.stripeCustomerId)}`,
    );
  }

  // ── 3. REAL portal → hosted url ─────────────────────────────────────────────────────
  {
    const { status, body } = await postBilling('/billing/portal', token);
    expectTrue(
      '3 portal → 201 (real Stripe billingPortal.sessions.create)',
      status === 201,
      `got ${status}: ${JSON.stringify(body)}`,
    );
    assertUrlDto('3 portal', body);
  }

  // ── 4. Pre-fulfillment: /v1/me is still 'free' (checkout ≠ fulfillment) ─────────────
  {
    const { status, body } = await getMe(token);
    const membership = (body as { membership?: string } | undefined)?.membership;
    expectTrue('4 /v1/me → 200', status === 200, `got ${status}`);
    expectTrue(
      "4 /v1/me is still 'free' before webhook fulfillment",
      membership === 'free',
      `membership: ${String(membership)}`,
    );
    const exact = await getExactLocation(token, REAL_SLUG);
    expectTrue(
      '4 exact-location → 403 before fulfillment (not entitled)',
      exact.status === 403,
      `got ${exact.status}`,
    );
  }

  // ── 5. Pull the REAL customer id from the real checkout session ─────────────────────
  // The real session id is embedded in the hosted URL (…/c/pay/cs_test_…#…). We retrieve
  // the session from Stripe to confirm its real customer. A subscription-mode Checkout
  // Session has no payment_intent until a hosted page actually completes payment (which
  // this unattended harness cannot drive), so the fulfillment anchor below is the
  // subscription id instead — a namespaced synthetic one, since Stripe never allocates a
  // real `sub_…` without a completed payment either. The customer + session ids ARE real.
  const realCustomerId = firstCustomerId as string;
  let realSessionId = extractSessionId(checkoutUrl);
  {
    if (realSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(realSessionId);
        expectTrue(
          '5 retrieved the REAL checkout session from Stripe',
          session.id === realSessionId && stringId(session.customer) === realCustomerId,
          `session=${session.id} customer=${String(stringId(session.customer))}`,
        );
      } catch (err) {
        expectTrue('5 retrieved the REAL checkout session from Stripe', false, describeError(err));
      }
    } else {
      // Couldn't parse the session id out of the hosted URL — fall back to a synthetic
      // session id. The customer is still the real one; fulfillment still resolves the user.
      realSessionId = `cs_f68_${randomBytes(6).toString('hex')}`;
      skip(
        '5 retrieved the REAL checkout session from Stripe',
        `could not parse a cs_… id from the hosted URL (${String(checkoutUrl)}); using a synthetic session id. Customer is still real.`,
      );
    }
  }
  // Anchor for the subscription grant: a namespaced synthetic subscription id — the same
  // anchor StripeWebhookService uses for a subscription checkout (providerSubscriptionId /
  // providerPurchaseId = the subscription id).
  const syntheticSubscriptionId = `sub_f68_${randomBytes(6).toString('hex')}`;

  // ── 6. Signed synthetic checkout.session.completed (mode=subscription) → real fulfillment ─
  const checkoutEvent = makeEvent('checkout.session.completed', {
    id: realSessionId,
    object: 'checkout.session',
    mode: 'subscription',
    customer: realCustomerId, // the REAL customer → webhook resolves the user by it too
    client_reference_id: userId,
    subscription: syntheticSubscriptionId,
  });
  {
    const { status } = await postSignedWebhook(checkoutEvent);
    expectTrue(
      '6 signed checkout.session.completed → 200 (real webhook, real signature)',
      status === 200,
      `got ${status}`,
    );
    const ents = await prisma.entitlement.findMany({ where: { userId } });
    expectTrue(
      '6 one active subscription entitlement created',
      ents.length === 1 &&
        ents[0]?.kind === 'subscription' &&
        ents[0]?.status === 'active',
      `ents: ${JSON.stringify(ents.map((e) => ({ k: e.kind, s: e.status })))}`,
    );
    expectTrue(
      '6 entitlement anchored on the subscription id',
      ents[0]?.providerPurchaseId === syntheticSubscriptionId &&
        ents[0]?.providerSubscriptionId === syntheticSubscriptionId,
      `providerPurchaseId: ${ents[0]?.providerPurchaseId} providerSubscriptionId: ${ents[0]?.providerSubscriptionId}`,
    );
  }

  // ── 7. Duplicate signed delivery → still exactly one entitlement (idempotent) ───────
  {
    await postSignedWebhook(checkoutEvent);
    const count = await prisma.entitlement.count({ where: { userId } });
    expectTrue('7 duplicate delivery → still exactly one entitlement', count === 1, `count: ${count}`);
  }

  // ── 8. /v1/me flips to 'subscription' + exact-location unlocks + no leak ────────────
  {
    const { status, body } = await getMe(token);
    const membership = (body as { membership?: string } | undefined)?.membership;
    expectTrue('8 /v1/me → 200', status === 200, `got ${status}`);
    expectTrue(
      "8 /v1/me flips 'free' → 'subscription' after fulfillment",
      membership === 'subscription',
      `membership: ${String(membership)}`,
    );
    assertNoProviderLeak('8 /v1/me', body);

    const exact = await getExactLocation(token, REAL_SLUG);
    expectTrue('8 exact-location → 200 after fulfillment', exact.status === 200, `got ${exact.status}`);
    assertNoProviderLeak('8 exact-location', exact.body);
  }

  // ── 9. Signed synthetic customer.subscription.deleted → revoke; /v1/me 'free',
  //      exact-location 403 ────────────────────────────────────────────────────────────
  // A subscription checkout has no PaymentIntent to anchor a `charge.refunded` revoke on
  // (that anchor belongs to a one-time purchase); ending a subscription is expressed as
  // `customer.subscription.deleted` — the SAME event StripeWebhookService uses to lapse a
  // real cancelled/ended subscription — matched by providerSubscriptionId.
  {
    const deletedEvent = makeEvent('customer.subscription.deleted', {
      id: syntheticSubscriptionId,
      object: 'subscription',
      customer: realCustomerId,
      status: 'canceled',
    });
    const { status } = await postSignedWebhook(deletedEvent);
    expectTrue('9 signed customer.subscription.deleted → 200', status === 200, `got ${status}`);

    const ent = await prisma.entitlement.findFirst({ where: { userId } });
    expectTrue('9 entitlement revoked (status=expired)', ent?.status === 'expired', `status: ${ent?.status}`);

    const me = await getMe(token);
    const membership = (me.body as { membership?: string } | undefined)?.membership;
    expectTrue("9 /v1/me is 'free' again after revoke", membership === 'free', `membership: ${String(membership)}`);

    const exact = await getExactLocation(token, REAL_SLUG);
    expectTrue('9 exact-location → 403 after revoke', exact.status === 403, `got ${exact.status}`);
  }

  // ── 10. Optional: /billing/return renders (structural; needs Next running) ──────────
  console.log('\nOptional web /billing/return render check');
  if (!WEB_APP_URL) {
    skip(
      'GET /billing/return renders (structural)',
      'set WEB_APP_URL (or NEXT_APP_URL) to the running Next origin to run this. The return ' +
        "page's membership logic is already proven by verify:web-billing's token-gated /v1/me checks.",
    );
  } else {
    try {
      const res = await fetch(`${WEB_APP_URL.replace(/\/$/, '')}/billing/return`, {
        headers: { accept: 'text/html' },
      });
      const html = await res.text().catch(() => '');
      expectTrue(
        'GET /billing/return → 200 and renders the confirming shell',
        res.ok && /Confirming your membership/i.test(html),
        `status ${res.status}; shell copy ${/Confirming your membership/i.test(html) ? 'present' : 'absent'}`,
      );
      // We deliberately do NOT drive the client poll / assert "unlocked" copy here: that
      // state is rendered client-side from /v1/me using the browser session cookie the
      // island reads, which this Node fetch has no way to carry. Documented limitation.
    } catch (err) {
      skip('GET /billing/return renders (structural)', `Next not reachable: ${describeError(err)}`);
    }
  }

  await cleanup();
  summarize();
}

// ── Small pure helpers ────────────────────────────────────────────────────────────────

/** A Stripe field is often `string | { id } | null`. Normalize to the id string or null. */
function stringId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' ? value.id : null;
}

/** Extract a `cs_…` Checkout Session id from a hosted checkout URL, or null. */
function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/cs_(test|live)_[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}   Skipped: ${skipped}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log(
    `\n\x1b[32mVERIFICATION PASSED — real Stripe test-mode checkout/portal/customer (${PLAN}, ` +
      'mode=subscription) + signed-webhook fulfillment, /v1/me flip, exact-location unlock, and ' +
      'subscription-cancellation revoke all hold (hybrid: real Stripe API objects + signed ' +
      'synthetic delivery — NOT full Stripe CLI event delivery).\x1b[0m\n',
  );
  if (skipped) {
    console.log(
      `\x1b[33mNote:\x1b[0m ${skipped} optional check(s) skipped (e.g. WEB_APP_URL unset). Not a failure.\n`,
    );
  }
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
