import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type {
  CheckoutSessionDTO,
  CustomerPortalSessionDTO,
} from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { BillingService } from './billing.service';
import { CheckoutRequestClass } from './billing.dto';
import { BillingRateLimitGuard } from './billing-rate-limit.guard';

// ─────────────────────────────────────────────────────────────────────────────
// BillingController — the authed billing surface (Feature 65, intake §5.2):
//
//   POST /v1/billing/checkout → 200 CheckoutSessionDTO  { url }
//   POST /v1/billing/portal   → 200 CustomerPortalSessionDTO { url }
//
// `@UseGuards(AuthGuard)` at the class level guards BOTH routes — every request must
// carry a valid session cookie OR `Authorization: Bearer <jwt>` (the guard's two
// extractors). Missing/invalid/expired → 401 before the handler runs. `@CurrentUser()`
// supplies the `{ userId, email }` the guard attached; the service uses `userId` to
// create/reuse the Stripe Customer and stamp `client_reference_id`.
//
// The response is ONLY a hosted redirect `url` (no session id, no provider id, no
// secret — the HARD PRIVACY RULE). The web client (Feature 67) will
// `window.location = url`. No webhook and NO Entitlement grant happen here — this
// endpoint only STARTS a payment; fulfillment is Feature 66.
//
// RATE LIMITING (Feature 69, intake §10): each method adds BillingRateLimitGuard AFTER
// the class-level AuthGuard — `@UseGuards(AuthGuard, BillingRateLimitGuard)` runs auth
// first (so a 401 is never masked by a 429 and a real `userId` is always present), then
// the per-user in-memory limiter. It is applied PER METHOD (not at the class) so it is
// unmistakable that ONLY these two routes are limited; no other route (public discovery,
// auth magic-link, the Stripe webhook) is affected. checkout + portal have INDEPENDENT
// per-user budgets (the guard keys on the handler name).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** POST /v1/billing/checkout — start a hosted Stripe Checkout for the authed user. */
  @Post('checkout')
  @UseGuards(AuthGuard, BillingRateLimitGuard)
  createCheckout(
    @CurrentUser() user: AuthContext,
    @Body() body: CheckoutRequestClass,
  ): Promise<CheckoutSessionDTO> {
    return this.billing.createCheckoutSession(user.userId, body);
  }

  /**
   * POST /v1/billing/portal — open the hosted Customer Portal for the authed user.
   * Takes no body: identity comes from the session, and the customer is resolved
   * server-side from the user (never a client-supplied id — intake §5.5 scoping).
   */
  @Post('portal')
  @UseGuards(AuthGuard, BillingRateLimitGuard)
  createPortal(
    @CurrentUser() user: AuthContext,
  ): Promise<CustomerPortalSessionDTO> {
    return this.billing.createPortalSession(user.userId);
  }
}
