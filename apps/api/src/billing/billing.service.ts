import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import Stripe from 'stripe';
import type {
  CheckoutSessionDTO,
  CustomerPortalSessionDTO,
} from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_CONFIG, type BillingConfig } from './billing.config';
import type { CheckoutRequestClass } from './billing.dto';
import { resolvePlan } from './billing.types';

// ─────────────────────────────────────────────────────────────────────────────
// BillingService — Stripe Checkout + Customer Portal for the authed user
// (Feature 65, intake §5.2). Server-side ONLY: the Stripe secret key never leaves
// this process, and a response carries only a hosted redirect `url` — no session id,
// no `cus_`/`sub_`/`pi_`/`cs_`, no secret (the HARD PRIVACY RULE, contracts/billing.ts).
//
// SCOPE (prompt task 14): this feature creates NO Entitlement, marks NO user premium,
// and adds NO webhook. Checkout only STARTS a payment; fulfillment (the Entitlement
// grant) arrives later via the signature-verified webhook (Feature 66). So `/v1/me`
// stays 'free' after a checkout here until that webhook lands.
//
// STRIPE CLIENT (lazy singleton): built on first use from `BillingConfig`, not at
// construction — so the module boots with NO Stripe env (lint/typecheck/build/dev and
// the non-Stripe harnesses need no key), and a request with missing config fails
// cleanly (§9) instead of the app failing to start. `apiVersion` is intentionally
// omitted so the SDK uses the account's pinned version (Stripe's recommended default).
//
// CUSTOMER REUSE (task 6): one Stripe Customer per User, stored on
// `User.stripeCustomerId` (@unique). Created lazily on the first checkout/portal call
// and reused on every subsequent call — the row is the single source of truth, and a
// concurrent double-create is reconciled below.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  /** Lazily-built Stripe client (see `getStripe`). Undefined until first use. */
  private stripe: Stripe | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_CONFIG) private readonly config: BillingConfig,
  ) {}

  /**
   * POST /v1/billing/checkout — start a hosted Stripe Checkout for the authed user.
   *
   *   - resolve the plan key → Stripe price id + mode (server-side registry; a
   *     disabled subscription plan is a clean 400, task 5).
   *   - create/reuse the user's Stripe Customer, persisting `stripeCustomerId`.
   *   - create a Checkout Session (customer, mode, one server-priced line item,
   *     success/cancel URLs, `client_reference_id = userId`, metadata userId+plan).
   *   - return `{ url }` — the hosted redirect only. NO Entitlement is created.
   */
  async createCheckoutSession(
    userId: string,
    body: CheckoutRequestClass,
  ): Promise<CheckoutSessionDTO> {
    // Missing secret key / lifetime price → the billing surface is misconfigured on
    // the SERVER, not a client error → 500 (task 9). Guarded before any Stripe call.
    this.assertConfigured();

    // Map the plan KEY to a price id + mode (never a client-supplied price). A
    // recognised-but-unoffered plan (subscription price unset) is a 400.
    const resolution = resolvePlan(body.plan, this.config);
    if (!resolution.ok) {
      throw new BadRequestException(resolution.reason);
    }
    const { priceId, mode } = resolution.resolved;

    const user = await this.loadUser(userId);
    const customerId = await this.ensureStripeCustomer(user);

    let session: Stripe.Checkout.Session;
    try {
      session = await this.getStripe().checkout.sessions.create({
        customer: customerId,
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        // Belt-and-braces for the future webhook (intake §5.3): the fulfillment path
        // maps `customer` → User via stripeCustomerId, and `client_reference_id` is a
        // fallback. Metadata is echoed back on the session for triage.
        client_reference_id: userId,
        metadata: { userId, plan: body.plan },
      });
    } catch (err) {
      throw this.toStripeHttpError('create Checkout Session', err);
    }

    if (!session.url) {
      // A created session with no hosted URL is a Stripe-side anomaly, not a client
      // error — surface a safe 502 (task 9) rather than returning an empty `url`.
      this.logger.error(
        `Checkout Session ${session.id} created without a redirect URL (user ${userId}).`,
      );
      throw new BadGatewayException('Could not start checkout. Please try again.');
    }

    return { url: session.url };
  }

  /**
   * POST /v1/billing/portal — open the hosted Stripe Customer Portal for the authed
   * user. We CREATE the customer lazily if missing (task 7, recommended): "Subscription
   * & Purchases" should work for a signed-in user even before any purchase, and it
   * keeps `stripeCustomerId` consistent with the checkout path. Returns `{ url }`.
   *
   * The customer is ALWAYS resolved from the session's user — never a client-supplied
   * id — so a user can only ever open their OWN portal (intake §5.5 scoping).
   */
  async createPortalSession(
    userId: string,
  ): Promise<CustomerPortalSessionDTO> {
    this.assertConfigured();

    const user = await this.loadUser(userId);
    const customerId = await this.ensureStripeCustomer(user);

    let session: Stripe.BillingPortal.Session;
    try {
      session = await this.getStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: this.config.portalReturnUrl,
      });
    } catch (err) {
      throw this.toStripeHttpError('create Customer Portal Session', err);
    }

    if (!session.url) {
      this.logger.error(
        `Portal Session created without a URL for customer ${customerId} (user ${userId}).`,
      );
      throw new BadGatewayException(
        'Could not open the billing portal. Please try again.',
      );
    }

    return { url: session.url };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Server-misconfig guard: no secret key / no lifetime price → 500 (task 9). */
  private assertConfigured(): void {
    if (!this.config.configuredForCheckout) {
      this.logger.error(
        'Billing is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_LIFETIME missing).',
      );
      throw new InternalServerErrorException('Billing is not configured.');
    }
  }

  /**
   * Load the authed user's billing-relevant fields. A valid token whose User row is
   * gone is a STALE identity → 401 (the same rule MeService uses), not a 404.
   */
  private async loadUser(
    userId: string,
  ): Promise<{ id: string; email: string; name: string | null; stripeCustomerId: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, stripeCustomerId: true },
    });
    if (!user) {
      throw new UnauthorizedException('Session is no longer valid.');
    }
    return user;
  }

  /**
   * Create-or-reuse the user's Stripe Customer and persist `stripeCustomerId`.
   *
   *   - already has an id → reuse it (no Stripe call, no write).
   *   - otherwise create a Stripe Customer (email + userId metadata for support/
   *     reconciliation) and store the id on the User row.
   *
   * CONCURRENCY: `stripeCustomerId` is `@unique`. If two requests race and both create
   * a customer, the second `update` hits the unique constraint (P2002); we re-read the
   * row and reuse whichever id won, so we never return a customer id that isn't the
   * one persisted. (The orphaned Stripe customer created by the loser is harmless and
   * left for later reconciliation — deleting it isn't in scope here.)
   */
  private async ensureStripeCustomer(user: {
    id: string;
    email: string;
    name: string | null;
    stripeCustomerId: string | null;
  }): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    let customer: Stripe.Customer;
    try {
      customer = await this.getStripe().customers.create({
        email: user.email,
        name: user.name ?? undefined,
        // Reverse link for support/reconciliation; the authoritative link is the
        // `stripeCustomerId` column, resolved by the webhook (Feature 66).
        metadata: { userId: user.id },
      });
    } catch (err) {
      throw this.toStripeHttpError('create Stripe Customer', err);
    }

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customer.id },
      });
      return customer.id;
    } catch (err) {
      // A concurrent request already stored a customer id (unique violation) — reuse
      // the persisted one so the row stays the single source of truth.
      if (this.isUniqueViolation(err)) {
        const fresh = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { stripeCustomerId: true },
        });
        if (fresh?.stripeCustomerId) {
          return fresh.stripeCustomerId;
        }
      }
      throw err;
    }
  }

  /** Prisma P2002 = unique-constraint violation (the concurrent-create race). */
  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    );
  }

  /**
   * Lazily build (and cache) the Stripe client from config. Called only AFTER
   * `assertConfigured`, so `stripeSecretKey` is non-empty here. `apiVersion` is
   * omitted so the SDK uses the account's pinned version.
   */
  private getStripe(): Stripe {
    if (!this.stripe) {
      this.stripe = new Stripe(this.config.stripeSecretKey);
    }
    return this.stripe;
  }

  /**
   * Map a thrown Stripe error to a SAFE HTTP exception (task 9): log the raw detail
   * internally, but never leak Stripe's message/secrets to the client. A Stripe API
   * error becomes a 502 (upstream provider failure); anything else a generic 500.
   */
  private toStripeHttpError(action: string, err: unknown): Error {
    const detail = err instanceof Error ? err.message : String(err);
    this.logger.error(`Stripe failure while trying to ${action}: ${detail}`);
    if (err instanceof Stripe.errors.StripeError) {
      return new BadGatewayException(
        'The payment provider is currently unavailable. Please try again.',
      );
    }
    return new InternalServerErrorException('Could not process the billing request.');
  }
}
