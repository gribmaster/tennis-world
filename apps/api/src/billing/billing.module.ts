import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BILLING_CONFIG, loadBillingConfig } from './billing.config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingRateLimitService } from './billing-rate-limit.service';
import { BillingRateLimitGuard } from './billing-rate-limit.guard';

// ─────────────────────────────────────────────────────────────────────────────
// BillingModule — Stripe checkout + customer portal (Feature 65, intake §5.2).
//
// PROVIDERS:
//   - BILLING_CONFIG : a single, env-derived BillingConfig value (factory reads
//                      process.env once at wiring; dotenv has already populated it in
//                      main.ts). Injected by BillingService so it never re-parses env.
//                      Holds the SERVER-ONLY Stripe secret + price ids + redirect URLs.
//   - BillingService : create/reuse the Stripe Customer, build Checkout/Portal
//                      sessions, map Stripe failures to safe HTTP errors.
//
// Imports AuthModule because the controller's `@UseGuards(AuthGuard)` needs the
// AuthGuard (and, transitively, AuthService + AUTH_CONFIG) which AuthModule provides
// and EXPORTS — same pattern as MeModule. PrismaService is global (PrismaModule), so
// BillingService gets it without an explicit import.
//
// NO EntitlementsModule import: this feature never reads or grants entitlements —
// checkout only STARTS a payment; the Entitlement grant is the webhook's job
// (Feature 66). No controller-level entitlement gate here (a free user must be able to
// open checkout).
//
// RATE LIMITING (Feature 69, intake §10): BillingRateLimitService (an in-memory,
// per-user, dependency-free limiter) + BillingRateLimitGuard are provided here and the
// guard is applied per-method on the controller (checkout + portal only). Both read the
// same BILLING_CONFIG (rate-limit knobs). No global guard, no APP_GUARD — nothing outside
// these two routes is affected.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    { provide: BILLING_CONFIG, useFactory: () => loadBillingConfig() },
    BillingService,
    BillingRateLimitService,
    BillingRateLimitGuard,
  ],
})
export class BillingModule {}
