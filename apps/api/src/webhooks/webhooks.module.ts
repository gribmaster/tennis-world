import { Module } from '@nestjs/common';
import { BILLING_CONFIG, loadBillingConfig } from '../billing/billing.config';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

// ─────────────────────────────────────────────────────────────────────────────
// WebhooksModule — the PUBLIC, signature-verified Stripe webhook (Feature 66).
//
// A dedicated module (NOT folded into BillingModule) because the surfaces have opposite
// auth boundaries: BillingController is `@UseGuards(AuthGuard)` on every route, while the
// webhook is deliberately UNGUARDED (Stripe posts server-to-server; the signature is the
// auth). Keeping them apart makes that boundary obvious and stops the guard from ever
// leaking onto the webhook.
//
// PROVIDERS:
//   - BILLING_CONFIG        : re-provided from the SAME env-reading factory BillingModule
//                             uses (`loadBillingConfig`). It carries the Stripe secret +
//                             the new `stripeWebhookSecret`. Re-providing (rather than
//                             importing BillingModule) keeps this module from depending on
//                             BillingService/AuthModule — it needs only config + Prisma.
//                             Both modules read the same process.env, so the value matches.
//   - StripeWebhookService  : verifies the signature, records the event for idempotency,
//                             and writes/revokes Entitlement rows in one transaction.
//
// PrismaService is global (PrismaModule), so the service gets it with no import here.
// This module does NOT import EntitlementsModule: effective-access DERIVATION stays in
// EntitlementsService (read-only); the webhook only WRITES Entitlement rows.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  controllers: [StripeWebhookController],
  providers: [
    { provide: BILLING_CONFIG, useFactory: () => loadBillingConfig() },
    StripeWebhookService,
  ],
})
export class WebhooksModule {}
