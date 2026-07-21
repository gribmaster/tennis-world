import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_CONFIG, type BillingConfig } from '../billing/billing.config';

// ─────────────────────────────────────────────────────────────────────────────
// StripeWebhookService — the ONE place a Stripe event fulfils or revokes an
// Entitlement (Feature 66, intake §5.3 / §2.3). Public, signature-verified, idempotent.
//
// RESPONSIBILITIES (kept centralized + testable — prompt task 8):
//   1. Verify the `Stripe-Signature` header against the RAW body + STRIPE_WEBHOOK_SECRET
//      (constructEvent). A bad/missing signature → 400 BEFORE any DB work; the raw
//      Stripe error is logged, never returned.
//   2. Idempotency: record `event.id` in ProcessedWebhookEvent FIRST, inside the same
//      transaction as the write. A duplicate delivery hits the PK (P2002) and is a 200
//      no-op — no double-grant. `Entitlement.providerPurchaseId @unique` is the second
//      anchor (upsert), so even a distinct event for the same purchase can't double-grant.
//   3. Fulfil / revoke: create/update/revoke Entitlement rows per event type.
//
// EFFECTIVE-ACCESS DERIVATION IS NOT HERE. This service only WRITES Entitlement rows;
// "is the user premium?" stays in EntitlementsService (read-only, Feature 62). A row
// written here with status=active/expired/refunded is picked up by the next /v1/me read.
//
// STRIPE CLIENT: lazy singleton built from BillingConfig (same idiom as BillingService),
// so the module boots with no Stripe env and only builds a client when a real event
// arrives. `apiVersion` omitted → the account's pinned version (Stripe's default).
//
// PRIVACY: provider ids (cus_/sub_/pi_/cs_) are written ONLY to server-only Entitlement
// columns + a minimal `metadata` blob (event id + type). They are NEVER surfaced by any
// DTO — EntitlementsService doesn't even select them. No secret is ever persisted.
//
// `customer.subscription.updated` (Feature 71) keeps a subscription entitlement's
// `status`/`expiresAt` in sync with Stripe's own subscription lifecycle (dunning, cancel-
// at-period-end, plan/period changes) WITHOUT inventing a new billing policy: it reuses the
// exact same "live status → active, lapsed status → expired" split that
// `checkout.session.completed`/`invoice.paid`/`customer.subscription.deleted` already
// encode, and the SAME time-window rule in EntitlementsService (`expiresAt > now`) that
// already makes `cancel_at_period_end=true` fall off access at the right moment — no early
// revoke is needed, `status` legitimately stays `active` until Stripe's period end.
// ─────────────────────────────────────────────────────────────────────────────

/** Provider tag for the ProcessedWebhookEvent ledger (shared table, future IAP/CRM differ). */
const PROVIDER = 'stripe';

/** The event types this feature fulfils/revokes. Everything else is a recorded 200 no-op. */
const SUPPORTED_EVENTS = new Set<Stripe.Event['type']>([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
]);

/**
 * Stripe subscription statuses that mean "the subscription is currently paid up" — the
 * entitlement stays/becomes active with `expiresAt` = current_period_end (Feature-66/70
 * rule, unchanged): `trialing` counts too since Stripe already treats a trial as access-
 * granting. `active` covers the `cancel_at_period_end=true` case as well — Stripe keeps
 * `status='active'` right up to the period end, so no special-casing is needed: the
 * existing time-window rule in EntitlementsService already drops access the moment
 * `expiresAt` passes, which IS `current_period_end`.
 */
const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing']);

/**
 * Stripe subscription statuses that mean "no longer owed access" — mirrors the existing
 * `customer.subscription.deleted` → `expired` policy (onSubscriptionDeleted). Applied here
 * too so a status transition to one of these via `customer.subscription.updated` (which
 * Stripe sends before/instead of a `.deleted` event for some paths, e.g. `unpaid` after
 * exhausting retries, or `incomplete_expired` when the first payment never completes)
 * revokes access the same way. No new policy invented — same target state, same reason.
 */
const LAPSED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'canceled',
  'unpaid',
  'incomplete_expired',
]);

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  /** Lazily-built Stripe client (see `getStripe`). Undefined until first use. */
  private stripe: Stripe | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_CONFIG) private readonly config: BillingConfig,
  ) {}

  /**
   * Handle one raw webhook request. `rawBody` is the exact bytes Stripe signed (captured
   * by `rawBody: true` in main.ts); `signature` is the `Stripe-Signature` header.
   *
   * Contract (task 4):
   *   - webhook not configured (no secret)      → 500 (safe message), before any Stripe call
   *   - missing/invalid signature or empty body → 400 (safe message), before any DB work
   *   - duplicate event                         → 200 no-op (idempotent)
   *   - accepted event (supported or not)       → 200 quickly (recorded either way)
   *
   * We DELIBERATELY do not throw on an unsupported or unresolvable-but-well-formed event
   * (it's recorded and 200'd) so Stripe does not retry forever — only a genuine internal
   * bug (unexpected DB failure) escapes as a 500 that Stripe may legitimately retry.
   */
  async handleEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    // Server-misconfig guard — the webhook can't verify anything without its secret.
    // A 500 here is correct: it's OUR misconfiguration, not the caller's fault. (We keep
    // the message generic; the log has the detail.)
    if (!this.config.configuredForWebhook) {
      this.logger.error(
        'Stripe webhook received but not configured (STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY missing).',
      );
      throw new InternalServerErrorException('Webhook is not configured.');
    }

    // 1. Verify signature over the RAW body. Any failure (missing header, empty/absent
    //    raw body, bad signature, malformed JSON) is a client-side 400 — we never touch
    //    the DB for an unverified payload. The raw Stripe error is logged, not returned.
    const event = this.verifySignature(rawBody, signature);

    // 2. Idempotency + fulfillment in ONE transaction. Record the event id FIRST; if it
    //    already exists (P2002 on the PK) the whole thing is a no-op 200.
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { id: event.id, provider: PROVIDER, type: event.type },
        });
        // The create above committed us to processing this event exactly once. Do the
        // fulfillment/revocation write in the SAME transaction, so a mid-way failure
        // rolls BOTH back and Stripe's retry re-processes cleanly (§2.3).
        await this.processEvent(tx, event);
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        // The event id already exists → we've processed this delivery before. No-op 200.
        this.logger.log(`Duplicate Stripe event ${event.id} (${event.type}) — no-op.`);
        return { received: true };
      }
      // A real internal failure (DB down, unexpected shape mid-write). Let it surface as
      // a 500 so Stripe RETRIES — the transaction rolled back, so a retry is safe.
      this.logger.error(
        `Failed to process Stripe event ${event.id} (${event.type}): ${describe(err)}`,
      );
      throw new InternalServerErrorException('Could not process the webhook.');
    }

    return { received: true };
  }

  // ── Signature verification ────────────────────────────────────────────────────

  /**
   * `stripe.webhooks.constructEvent(rawBody, signature, secret)` — verifies the HMAC in
   * `Stripe-Signature` against the raw bytes and parses the event. Anything wrong (no
   * body, no signature, tampered payload, replayed-too-late timestamp) throws; we map ALL
   * of it to a single safe 400 and log the real reason internally (task 6 — no leak).
   */
  private verifySignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    if (!rawBody || rawBody.length === 0) {
      // No raw body reached us — either not sent, or a parser consumed it. Client-side 400.
      this.logger.warn('Stripe webhook rejected: missing/empty raw request body.');
      throw new BadRequestException('Invalid webhook payload.');
    }
    if (!signature) {
      this.logger.warn('Stripe webhook rejected: missing Stripe-Signature header.');
      throw new BadRequestException('Missing signature.');
    }
    try {
      return this.getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        this.config.stripeWebhookSecret,
      );
    } catch (err) {
      // Bad signature / tampered body / wrong secret. Log the detail; return a safe 400.
      this.logger.warn(`Stripe webhook signature verification failed: ${describe(err)}`);
      throw new BadRequestException('Invalid signature.');
    }
  }

  // ── Event routing ───────────────────────────────────────────────────────────

  /**
   * Route a verified event to its handler. Unsupported types are a recorded 200 no-op
   * (already recorded by the caller's `create`) — we don't throw, so Stripe won't retry
   * events we simply don't act on. Every handler is idempotent on top of the event-id
   * ledger (they upsert by providerPurchaseId / update by providerSubscriptionId).
   */
  private async processEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    if (!SUPPORTED_EVENTS.has(event.type)) {
      this.logger.log(`Recorded unsupported Stripe event ${event.id} (${event.type}) — no-op.`);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(tx, event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await this.onInvoicePaid(tx, event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(tx, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(tx, event.data.object);
        break;
      case 'charge.refunded':
        await this.onChargeRefunded(tx, event.data.object);
        break;
      case 'charge.dispute.created':
        await this.onDisputeCreated(tx, event.data.object);
        break;
      default:
        // Unreachable given SUPPORTED_EVENTS; keeps the switch exhaustive.
        this.logger.log(`No handler for supported event ${event.type} — no-op.`);
    }
  }

  // ── A. checkout.session.completed → grant ─────────────────────────────────────

  /**
   * A completed Checkout Session fulfils the purchase. Two shapes:
   *   - mode 'payment'      → a one-time lifetime unlock (kind=lifetime_unlock, expiresAt=null)
   *   - mode 'subscription' → a subscription (kind=subscription, expiresAt=period end)
   *
   * User resolution (intake §5.3): prefer `client_reference_id` (we stamp it = userId at
   * session creation), else map `customer` (cus_…) → User.stripeCustomerId. An unresolvable
   * session is LOGGED and no-op'd (recorded, 200) — we don't 500 a well-formed event.
   */
  private async onCheckoutCompleted(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const customerId = stringId(session.customer);
    const userId = await this.resolveUserId(tx, session.client_reference_id, customerId);
    if (!userId) {
      this.logger.warn(
        `checkout.session.completed ${session.id}: could not resolve a User ` +
          `(client_reference_id=${session.client_reference_id ?? 'null'}, customer=${customerId ?? 'null'}). No-op.`,
      );
      return;
    }

    if (session.mode === 'subscription') {
      const subscriptionId = stringId(session.subscription);
      // The purchase anchor for a subscription checkout is the subscription id (renewals
      // update the SAME row); fall back to the session id if somehow absent.
      const purchaseId = subscriptionId ?? session.id;
      const expiresAt = await this.resolveSubscriptionEnd(subscriptionId);
      await this.upsertEntitlement(tx, {
        userId,
        kind: 'subscription',
        purchaseId,
        customerId,
        subscriptionId,
        expiresAt,
        metadata: this.baseMetadata(session.id, 'checkout.session.completed'),
      });
      this.logger.log(`Granted subscription entitlement to user ${userId} (session ${session.id}).`);
      return;
    }

    // mode 'payment' (or unset) → lifetime unlock. Anchor on the PaymentIntent if present
    // (the durable purchase id), else the session id.
    const paymentIntentId = stringId(session.payment_intent);
    const purchaseId = paymentIntentId ?? session.id;
    await this.upsertEntitlement(tx, {
      userId,
      kind: 'lifetime_unlock',
      purchaseId,
      customerId,
      subscriptionId: null,
      expiresAt: null,
      metadata: this.baseMetadata(session.id, 'checkout.session.completed'),
    });
    this.logger.log(`Granted lifetime entitlement to user ${userId} (session ${session.id}).`);
  }

  // ── B. invoice.paid / invoice.payment_succeeded → renew ───────────────────────

  /**
   * A paid subscription invoice — the initial charge OR a renewal. Push the subscription
   * entitlement's `expiresAt` forward to the new period end and keep it active. Resolve
   * the row by providerSubscriptionId (the stable anchor across renewals); if it doesn't
   * exist yet (e.g. the invoice arrived before checkout.session.completed) we create it,
   * so access is granted either way.
   */
  private async onInvoicePaid(
    tx: Prisma.TransactionClient,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const subscriptionId = stringId(readInvoiceSubscription(invoice));
    if (!subscriptionId) {
      // A non-subscription invoice (e.g. a one-off). Nothing to renew — no-op.
      this.logger.log(`invoice ${invoice.id}: no subscription — no-op.`);
      return;
    }
    const customerId = stringId(invoice.customer);
    const userId = await this.resolveUserId(tx, null, customerId);
    if (!userId) {
      this.logger.warn(
        `invoice ${invoice.id}: could not resolve a User (customer=${customerId ?? 'null'}). No-op.`,
      );
      return;
    }

    const expiresAt = await this.resolveSubscriptionEnd(subscriptionId);
    await this.upsertEntitlement(tx, {
      userId,
      kind: 'subscription',
      // Anchor on the subscription id so renewals update the SAME purchase row.
      purchaseId: subscriptionId,
      customerId,
      subscriptionId,
      expiresAt,
      // A renewal re-activates a previously-lapsed row and clears any stale revocation.
      reactivate: true,
      metadata: this.baseMetadata(invoice.id ?? subscriptionId, 'invoice.paid'),
    });
    this.logger.log(
      `Renewed subscription entitlement for user ${userId} (subscription ${subscriptionId}).`,
    );
  }

  // ── C. customer.subscription.updated → sync ───────────────────────────────────

  /**
   * A subscription's status, `cancel_at_period_end`, or `current_period_end` changed —
   * this fires for cancel-at-period-end toggles, plan changes, dunning transitions
   * (`active` → `past_due`), and terminal statuses Stripe sometimes reports here instead
   * of (or before) a `customer.subscription.deleted` event. Matched by
   * `providerSubscriptionId`; an unknown subscription (e.g. it belongs to a customer with
   * no entitlement row yet) is a no-op — there's nothing to sync.
   *
   * Policy (reuses the existing rules — no new billing policy):
   *   - live status (`active`/`trialing`) → keep/restore `active`, sync `expiresAt` to the
   *     current `current_period_end`. This is ALSO the `cancel_at_period_end=true` path:
   *     Stripe keeps `status='active'` until the period actually ends, so no extra branch
   *     is needed — EntitlementsService's existing `expiresAt > now` window already drops
   *     access exactly at period end. `cancel_at_period_end` itself is stashed in
   *     `metadata` (display-only; see class header) since the schema has no dedicated
   *     column and this step does not add one.
   *   - lapsed status (`canceled`/`unpaid`/`incomplete_expired`) → same effect as
   *     `onSubscriptionDeleted`: flip to `expired`.
   *   - any other status (`past_due`, `incomplete`, `paused`) → access-affecting rules for
   *     these aren't defined anywhere else in the codebase either; we conservatively leave
   *     `status` untouched (Stripe's own dunning/retry flow governs what happens next) but
   *     still refresh `expiresAt`/metadata so a later read reflects the latest period info.
   */
  private async onSubscriptionUpdated(
    tx: Prisma.TransactionClient,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const existing = await tx.entitlement.findFirst({
      where: { providerSubscriptionId: subscription.id },
      select: { id: true, status: true },
    });
    if (!existing) {
      this.logger.log(
        `subscription ${subscription.id} updated: no matching entitlement — no-op.`,
      );
      return;
    }

    const periodEnd = readSubscriptionPeriodEnd(subscription);
    const expiresAt = periodEnd ? new Date(periodEnd * 1000) : null;
    const metadata = this.baseMetadata(subscription.id, 'customer.subscription.updated', {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      subscriptionStatus: subscription.status,
    });

    if (LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      await tx.entitlement.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          expiresAt,
          metadata,
          // A live status is, by definition, not revoked — clear any stale audit so a
          // dunning recovery (past_due → active) reads as a clean active row again.
          revokedAt: null,
          revokedReason: null,
        },
      });
      this.logger.log(
        `subscription ${subscription.id} updated (status=${subscription.status}, ` +
          `cancel_at_period_end=${String(subscription.cancel_at_period_end)}) — entitlement synced active.`,
      );
      return;
    }

    if (LAPSED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      if (existing.status !== 'active') {
        // Already lapsed/revoked (e.g. the .deleted event beat this one, or a retry) —
        // no-op, matching onSubscriptionDeleted's "only flip active rows" guard.
        return;
      }
      await tx.entitlement.update({
        where: { id: existing.id },
        data: {
          status: 'expired',
          revokedAt: new Date(),
          revokedReason: 'subscription_deleted',
          metadata,
        },
      });
      this.logger.log(
        `subscription ${subscription.id} updated (status=${subscription.status}) — entitlement expired.`,
      );
      return;
    }

    // Transitional status (past_due/incomplete/paused/…) — no access-rule change, but
    // keep expiresAt/metadata current so it's accurate the moment status resolves.
    await tx.entitlement.update({
      where: { id: existing.id },
      data: { expiresAt, metadata },
    });
    this.logger.log(
      `subscription ${subscription.id} updated (status=${subscription.status}) — ` +
        'transitional status, entitlement status left unchanged.',
    );
  }

  // ── D. customer.subscription.deleted → lapse ──────────────────────────────────

  /**
   * A cancelled/ended subscription. Flip the matching entitlement to `expired` so it is no
   * longer effective (EntitlementsService only counts status='active'), stamping the audit
   * fields. Matched by providerSubscriptionId. Unknown subscription → no-op (nothing to revoke).
   */
  private async onSubscriptionDeleted(
    tx: Prisma.TransactionClient,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const result = await tx.entitlement.updateMany({
      where: { providerSubscriptionId: subscription.id, status: 'active' },
      data: {
        status: 'expired',
        revokedAt: new Date(),
        revokedReason: 'subscription_deleted',
      },
    });
    this.logger.log(
      `subscription ${subscription.id} deleted — expired ${result.count} entitlement row(s).`,
    );
  }

  // ── E. charge.refunded / charge.dispute.created → revoke ──────────────────────

  /**
   * A refunded charge. Revoke the entitlement whose providerPurchaseId is the charge's
   * PaymentIntent (the same anchor we grant lifetime unlocks under). status=refunded so
   * effective access drops immediately. Matched only when the charge is fully refunded —
   * a partial refund of a one-time unlock is ambiguous, so we still revoke (a refund of a
   * lifetime purchase means the access is no longer owed); documented in the intake note.
   */
  private async onChargeRefunded(
    tx: Prisma.TransactionClient,
    charge: Stripe.Charge,
  ): Promise<void> {
    const paymentIntentId = stringId(charge.payment_intent);
    await this.revokeByPurchase(tx, paymentIntentId, 'refunded', 'refund', charge.id);
  }

  /**
   * A dispute/chargeback opened on a charge. Same effect as a refund — revoke the
   * entitlement (status=revoked, reason=chargeback). Matched by the charge's PaymentIntent.
   */
  private async onDisputeCreated(
    tx: Prisma.TransactionClient,
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const paymentIntentId = stringId(dispute.payment_intent);
    await this.revokeByPurchase(tx, paymentIntentId, 'revoked', 'chargeback', dispute.id);
  }

  // ── Entitlement write helpers (centralized — task 8) ──────────────────────────

  /**
   * Create-or-update an active entitlement keyed on `providerPurchaseId @unique`. Re-
   * delivery of the same purchase is a no-op update (idempotent second anchor, §2.3). The
   * `reactivate` flag (renewals) re-activates a lapsed row and clears its revocation audit.
   */
  private async upsertEntitlement(
    tx: Prisma.TransactionClient,
    args: {
      userId: string;
      kind: 'lifetime_unlock' | 'subscription';
      purchaseId: string;
      customerId: string | null;
      subscriptionId: string | null;
      expiresAt: Date | null;
      reactivate?: boolean;
      metadata: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const {
      userId,
      kind,
      purchaseId,
      customerId,
      subscriptionId,
      expiresAt,
      reactivate,
      metadata,
    } = args;

    await tx.entitlement.upsert({
      where: { providerPurchaseId: purchaseId },
      create: {
        userId,
        kind,
        status: 'active',
        source: 'stripe_web',
        startsAt: new Date(),
        expiresAt,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        providerPurchaseId: purchaseId,
        metadata,
      },
      update: {
        // Idempotent refresh. We keep userId/kind/source stable; a renewal moves expiresAt
        // and (when reactivate) restores active status + clears the revocation audit.
        expiresAt,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        metadata,
        ...(reactivate
          ? { status: 'active' as const, revokedAt: null, revokedReason: null }
          : {}),
      },
    });
  }

  /**
   * Revoke the entitlement matching `purchaseId` (a PaymentIntent id) for a refund/dispute.
   * Only flips rows still `active` (audit stays truthful; a re-delivered refund is a no-op).
   */
  private async revokeByPurchase(
    tx: Prisma.TransactionClient,
    purchaseId: string | null,
    status: 'refunded' | 'revoked',
    reason: 'refund' | 'chargeback',
    sourceEventObjectId: string,
  ): Promise<void> {
    if (!purchaseId) {
      this.logger.warn(
        `${reason} event ${sourceEventObjectId}: no payment_intent to match an entitlement. No-op.`,
      );
      return;
    }
    const result = await tx.entitlement.updateMany({
      where: { providerPurchaseId: purchaseId, status: 'active' },
      data: { status, revokedAt: new Date(), revokedReason: reason },
    });
    this.logger.log(
      `${reason} on purchase ${purchaseId} — revoked ${result.count} entitlement row(s).`,
    );
  }

  // ── Resolution + Stripe helpers ───────────────────────────────────────────────

  /**
   * Resolve the owning User id. Prefer the `client_reference_id` we stamped at checkout
   * (= userId) — but VERIFY it points at a real User (a forged/stale value must not create
   * a dangling entitlement). Fall back to `customer` (cus_…) → User.stripeCustomerId. Null
   * when neither resolves.
   */
  private async resolveUserId(
    tx: Prisma.TransactionClient,
    clientReferenceId: string | null | undefined,
    customerId: string | null,
  ): Promise<string | null> {
    if (clientReferenceId) {
      const byRef = await tx.user.findUnique({
        where: { id: clientReferenceId },
        select: { id: true },
      });
      if (byRef) return byRef.id;
    }
    if (customerId) {
      const byCustomer = await tx.user.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      if (byCustomer) return byCustomer.id;
    }
    return null;
  }

  /**
   * Best-effort resolution of a subscription's current period end. If the webhook payload
   * doesn't carry the subscription object (it usually carries only the id), retrieve it
   * from Stripe. On any failure we return null (a null expiry means "no known end" — the
   * row is still granted active; a later invoice.paid will stamp the real end). We never
   * fail the whole webhook over a missing expiry.
   */
  private async resolveSubscriptionEnd(subscriptionId: string | null): Promise<Date | null> {
    if (!subscriptionId) return null;
    try {
      const sub = await this.getStripe().subscriptions.retrieve(subscriptionId);
      const end = readSubscriptionPeriodEnd(sub);
      return end ? new Date(end * 1000) : null;
    } catch (err) {
      this.logger.warn(
        `Could not retrieve subscription ${subscriptionId} for period end: ${describe(err)}. Granting with null expiry.`,
      );
      return null;
    }
  }

  /**
   * Minimal, secret-free metadata: which Stripe object + event drove this write, plus any
   * caller-supplied EXTRA fields (e.g. `cancelAtPeriodEnd` — display-only, coarse booleans/
   * enums, never a provider id — the same privacy bar as the rest of this blob).
   */
  private baseMetadata(
    objectId: string,
    eventType: string,
    extra?: Record<string, Prisma.InputJsonValue>,
  ): Prisma.InputJsonValue {
    return { stripeObjectId: objectId, eventType, ...extra };
  }

  /** Prisma P2002 = unique-constraint violation (duplicate event id, or purchase race). */
  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }

  /**
   * Lazily build (and cache) the Stripe client from config. Only called AFTER the
   * `configuredForWebhook` guard, so `stripeSecretKey` is non-empty. `apiVersion` omitted
   * so the SDK uses the account's pinned version.
   */
  private getStripe(): Stripe {
    if (!this.stripe) {
      this.stripe = new Stripe(this.config.stripeSecretKey);
    }
    return this.stripe;
  }
}

// ── Module-private pure helpers (no `this`; keeps the class lean + unit-testable) ──

/** A Stripe field is often `string | { id } | null`. Normalize to the id string or null. */
function stringId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' ? value.id : null;
}

/** Error → safe string for logs (never surfaced to the client). */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Read the subscription id off an invoice across Stripe API-version shapes. Older shapes
 * expose `invoice.subscription`; newer ones nest it under `invoice.parent`. We read
 * defensively (the SDK type may not include both) and return whatever is present.
 */
function readInvoiceSubscription(
  invoice: Stripe.Invoice,
): string | { id?: string } | null | undefined {
  const flat = (invoice as { subscription?: string | { id?: string } | null }).subscription;
  if (flat) return flat;
  const parent = (invoice as { parent?: { subscription_details?: { subscription?: string | { id?: string } } } })
    .parent;
  return parent?.subscription_details?.subscription ?? null;
}

/**
 * Read `current_period_end` (unix seconds) off a subscription across API-version shapes.
 * Older shapes put it on the subscription; newer ones put it on the first item. Returns
 * null when neither is present.
 */
function readSubscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const flat = (sub as { current_period_end?: number }).current_period_end;
  if (typeof flat === 'number') return flat;
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  return typeof item?.current_period_end === 'number' ? item.current_period_end : null;
}
