/* eslint-disable no-console */
//
// Feature 66 — Stripe webhook fulfillment verification (OPT-IN, SYNTHETIC-SIGNATURE).
//
// WHAT THIS IS (and is NOT):
// This harness exercises `POST /v1/webhooks/stripe` end-to-end through the REAL endpoint,
// using SYNTHETIC Stripe event payloads it signs itself with
// `stripe.webhooks.generateTestHeaderString(payload, secret)` — the same HMAC scheme the
// API verifies with `stripe.webhooks.constructEvent`. It proves the SIGNATURE + IDEMPOTENCY
// + FULFILLMENT paths (unsigned→400, bad-sig→400, unsupported→200 recorded, duplicate→200
// once, checkout→grant, refund→revoke, /v1/me flip, no provider-id leak).
//
// It is NOT a full Stripe API event delivery: the payloads are hand-built (not fetched from
// Stripe), and the flows chosen (lifetime unlock + refund) require NO outbound Stripe call,
// so no live Stripe account/network is touched. That means it runs with a FAKE test key
// (any `sk_test_…` string) + a chosen `STRIPE_WEBHOOK_SECRET` — do not read a green run as
// "the live Stripe integration works"; for that use the Stripe CLI
// (`stripe listen --forward-to localhost:3001/v1/webhooks/stripe` + `stripe trigger …`).
//
// ── OPT-IN / CI SAFETY (prompt task 9/13) ────────────────────────────────────────────
// NOT in the required CI gate. Two modes:
//   A. STRIPE_WEBHOOK_SECRET unset → SKIP cleanly, exit 0 (a green no-op; we do NOT fake a
//      passing integration). Also skips if STRIPE_SECRET_KEY is unset (the API's webhook
//      returns 500 "not configured", so signed events can't be verified there anyway).
//   B. STRIPE_WEBHOOK_SECRET (+ STRIPE_SECRET_KEY) set AND matching the running API's env →
//      the full synthetic-signature run below.
//
// The API under test MUST be running with the SAME STRIPE_WEBHOOK_SECRET + STRIPE_SECRET_KEY
// (constructEvent uses the secret; the service builds a Stripe client from the key). Run:
//
//   # apps/api/.env (fake values are fine for THIS harness):
//   STRIPE_SECRET_KEY=sk_test_dummy
//   STRIPE_WEBHOOK_SECRET=whsec_dummy_choose_any
//   pnpm db:up && pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   pnpm --filter @tennis/api dev            # API on :3001 (loads the same .env)
//   DATABASE_URL=… NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_dummy_choose_any \
//     pnpm --filter @tennis/api verify:stripe-webhook
//
// Scenarios:
//   A. unsigned webhook              → 400
//   B. bad-signature webhook         → 400
//   C. unsupported signed event      → 200 AND a ProcessedWebhookEvent row recorded
//   D. duplicate signed event        → 200 both times AND exactly ONE ProcessedWebhookEvent
//   E. checkout.session.completed     → ONE active lifetime entitlement for the user
//   F. duplicate checkout event      → still exactly ONE entitlement (idempotent)
//   G. /v1/me flips 'free' → 'lifetime' after the grant
//   H. exact-location becomes available (200) for a real court after the grant
//   I. refund event (charge.refunded) → the entitlement is revoked (status=refunded)
//   J. after revoke, /v1/me is 'free' again and exact-location is 403
//   K. no provider id (cus_/sub_/pi_/cs_) appears in /v1/me or the exact-location response
//
// CLEANUP: every user/entitlement/token/event this script creates is namespaced
// (`f66-…@tennis.test`, customer `cus_f66_…`, purchase ids `pi_f66_…`, event ids `evt_f66_…`).
// Deleted at the end (and defensively at the start). No Stripe test data is created (no
// outbound Stripe calls in these flows), so there is nothing to clean up on Stripe's side.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() ?? '';

const EMAIL_PREFIX = 'f66-';
const EMAIL_DOMAIN = '@tennis.test';
// A real, seeded, PUBLISHED court (also used by the parity + exact-location harnesses).
const REAL_SLUG = 'grand-hotel-tremezzo';

// ── Tiny assertion harness (matches verify-exact-location / verify-billing-checkout) ──

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

// ── Synthetic Stripe event signing ────────────────────────────────────────────────

// A Stripe client is only needed for its static `webhooks.generateTestHeaderString` — the
// same HMAC the API's `constructEvent` verifies. No network call is made here.
const stripe = new Stripe(SECRET_KEY || 'sk_test_dummy');

/** Wrap an event `type` + `object` into a minimal Stripe.Event envelope with a namespaced id. */
function makeEvent(type: string, object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `evt_f66_${randomBytes(8).toString('hex')}`,
    object: 'event',
    type,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  };
}

/** Serialize + sign an event and POST it to the webhook. Returns status + parsed body. */
async function postWebhook(
  event: Record<string, unknown>,
  opts: { signed: boolean; badSignature?: boolean } = { signed: true },
): Promise<{ status: number; body: unknown }> {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.signed) {
    const sig = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: opts.badSignature ? `${WEBHOOK_SECRET}_tampered` : WEBHOOK_SECRET,
    });
    headers['stripe-signature'] = sig;
  }
  const res = await fetch(`${API_BASE}/webhooks/stripe`, {
    method: 'POST',
    headers,
    body: payload,
  });
  const body = await res.json().catch(() => undefined);
  return { status: res.status, body };
}

// ── Fixture builders ───────────────────────────────────────────────────────────────

/** Create the test user with a known stripeCustomerId; return { userId, customerId }. */
async function seedUser(email: string): Promise<{ userId: string; customerId: string }> {
  const customerId = `cus_f66_${randomBytes(6).toString('hex')}`;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, authProvider: 'magic', stripeCustomerId: customerId },
    update: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return { userId: user.id, customerId };
}

/** Mint a real bearer token for the user via the production `/v1/auth/verify` path. */
async function signIn(email: string): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  await prisma.magicLinkToken.create({
    data: { email, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  if (!res.ok) throw new Error(`POST /auth/verify → ${res.status}\n${await res.text().catch(() => '')}`);
  const session = (await res.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error(`verify returned no accessToken`);
  return session.accessToken;
}

async function getMe(token: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

async function getExactLocation(token: string, slug: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}/me/courts/${encodeURIComponent(slug)}/exact-location`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

function assertNoProviderLeak(name: string, body: unknown): void {
  const leaked = collectStringValues(body).filter((s) => /^(cus_|sub_|pi_|cs_|whsec_|sk_)/.test(s));
  expectTrue(`${name}: no provider-id/secret values leaked`, leaked.length === 0, `leaked: ${leaked.join(', ')}`);
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
  // Namespaced webhook-event ledger rows (evt_f66_…).
  await prisma.processedWebhookEvent.deleteMany({ where: { id: { startsWith: 'evt_f66_' } } });
}

async function preflight(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET /courts → ${res.status}`);
  } catch (err) {
    console.error('\n\x1b[31mCannot reach the API for verification.\x1b[0m');
    console.error(`  Tried: ${API_BASE}/courts`);
    console.error(`  Reason: ${describeError(err)}\n`);
    console.error('  Start the dependencies first (with the SAME Stripe env):');
    console.error('    pnpm db:up && pnpm --filter @tennis/api db:seed');
    console.error('    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)\n');
    process.exit(2);
  }
}

async function main(): Promise<void> {
  console.log('Feature 66 — Stripe webhook fulfillment verification (synthetic signature)');
  console.log(`API base: ${API_BASE}\n`);

  // OPT-IN GATE (mode A): no webhook secret (or no secret key) → skip cleanly, exit 0.
  if (!WEBHOOK_SECRET || !SECRET_KEY) {
    console.log(
      '\x1b[33mSKIPPED\x1b[0m — STRIPE_WEBHOOK_SECRET and/or STRIPE_SECRET_KEY not set.\n' +
        '          This harness is opt-in and needs both (the same values the API runs with)\n' +
        '          to sign + verify synthetic events. It does NOT hit the live Stripe API, so\n' +
        '          fake test values are fine (see the header). Exiting 0 (not a failure).\n',
    );
    process.exit(0);
  }

  await preflight();
  await cleanup();

  console.log('Scenarios');

  const email = `${EMAIL_PREFIX}buyer${EMAIL_DOMAIN}`;
  const { userId, customerId } = await seedUser(email);
  const token = await signIn(email);
  const purchaseId = `pi_f66_${randomBytes(6).toString('hex')}`;
  const sessionId = `cs_f66_${randomBytes(6).toString('hex')}`;

  // A. unsigned → 400.
  {
    const { status } = await postWebhook(makeEvent('checkout.session.completed', {}), { signed: false });
    expectTrue('A unsigned webhook → 400', status === 400, `got ${status}`);
  }

  // B. bad signature → 400.
  {
    const { status } = await postWebhook(
      makeEvent('checkout.session.completed', {}),
      { signed: true, badSignature: true },
    );
    expectTrue('B bad-signature webhook → 400', status === 400, `got ${status}`);
  }

  // C. unsupported signed event → 200 AND recorded.
  {
    const evt = makeEvent('customer.updated', { id: customerId, object: 'customer' });
    const { status } = await postWebhook(evt);
    expectTrue('C unsupported event → 200', status === 200, `got ${status}`);
    const recorded = await prisma.processedWebhookEvent.findUnique({ where: { id: evt.id as string } });
    expectTrue('C unsupported event recorded in ProcessedWebhookEvent', recorded !== null);
  }

  // D. duplicate signed event → 200 both times, exactly one ProcessedWebhookEvent.
  {
    const evt = makeEvent('customer.updated', { id: customerId, object: 'customer' });
    const first = await postWebhook(evt);
    const second = await postWebhook(evt);
    expectTrue('D duplicate event → 200 both', first.status === 200 && second.status === 200, `${first.status}/${second.status}`);
    const count = await prisma.processedWebhookEvent.count({ where: { id: evt.id as string } });
    expectTrue('D duplicate event recorded exactly once', count === 1, `count: ${count}`);
  }

  // E. checkout.session.completed (lifetime) → one active lifetime entitlement.
  const checkoutEvent = makeEvent('checkout.session.completed', {
    id: sessionId,
    object: 'checkout.session',
    mode: 'payment',
    customer: customerId,
    client_reference_id: userId,
    payment_intent: purchaseId,
  });
  {
    const { status } = await postWebhook(checkoutEvent);
    expectTrue('E checkout.session.completed → 200', status === 200, `got ${status}`);
    const ents = await prisma.entitlement.findMany({ where: { userId } });
    expectTrue('E one active lifetime entitlement created', ents.length === 1 && ents[0]?.kind === 'lifetime_unlock' && ents[0]?.status === 'active', `ents: ${JSON.stringify(ents.map((e) => ({ k: e.kind, s: e.status })))}`);
    expectTrue('E entitlement anchored on providerPurchaseId', ents[0]?.providerPurchaseId === purchaseId, `providerPurchaseId: ${ents[0]?.providerPurchaseId}`);
  }

  // F. duplicate checkout event → still exactly one entitlement.
  {
    // Re-send the SAME event id → 200 no-op (event ledger). Also send a DISTINCT event id
    // carrying the SAME purchase id → still one row (providerPurchaseId upsert anchor).
    await postWebhook(checkoutEvent);
    const distinct = makeEvent('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      mode: 'payment',
      customer: customerId,
      client_reference_id: userId,
      payment_intent: purchaseId,
    });
    await postWebhook(distinct);
    const count = await prisma.entitlement.count({ where: { userId } });
    expectTrue('F duplicate checkout → still exactly one entitlement', count === 1, `count: ${count}`);
  }

  // G. /v1/me flips to 'lifetime'.
  {
    const { status, body } = await getMe(token);
    const membership = (body as { membership?: string } | undefined)?.membership;
    expectTrue('G /v1/me → 200', status === 200, `got ${status}`);
    expectTrue("G /v1/me membership is 'lifetime' after grant", membership === 'lifetime', `membership: ${String(membership)}`);
    assertNoProviderLeak('G /v1/me', body);
  }

  // H. exact-location becomes available (200) for a real court.
  {
    const { status, body } = await getExactLocation(token, REAL_SLUG);
    expectTrue('H exact-location → 200 after grant', status === 200, `got ${status}`);
    assertNoProviderLeak('H exact-location', body);
  }

  // I. refund (charge.refunded) → entitlement revoked (status=refunded).
  {
    const evt = makeEvent('charge.refunded', {
      id: `ch_f66_${randomBytes(6).toString('hex')}`,
      object: 'charge',
      payment_intent: purchaseId,
      customer: customerId,
      refunded: true,
    });
    const { status } = await postWebhook(evt);
    expectTrue('I charge.refunded → 200', status === 200, `got ${status}`);
    const ent = await prisma.entitlement.findFirst({ where: { userId } });
    expectTrue('I entitlement status is refunded', ent?.status === 'refunded', `status: ${ent?.status}`);
    expectTrue('I revokedReason = refund, revokedAt set', ent?.revokedReason === 'refund' && ent?.revokedAt !== null, `reason: ${ent?.revokedReason}`);
  }

  // J. after revoke, /v1/me is 'free' again and exact-location is 403.
  {
    const me = await getMe(token);
    const membership = (me.body as { membership?: string } | undefined)?.membership;
    expectTrue("J /v1/me is 'free' after revoke", membership === 'free', `membership: ${String(membership)}`);
    const exact = await getExactLocation(token, REAL_SLUG);
    expectTrue('J exact-location → 403 after revoke', exact.status === 403, `got ${exact.status}`);
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
    '\n\x1b[32mVERIFICATION PASSED — signature gate, idempotency, lifetime grant, /v1/me flip, and refund revocation all hold (synthetic signatures; not a live Stripe delivery).\x1b[0m\n',
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
