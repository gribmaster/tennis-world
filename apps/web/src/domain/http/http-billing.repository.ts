// Billing domain — HTTP repository implementation (Feature 67, `api` data source).
//
// Implements the SAME `BillingRepository` interface as `MockBillingRepository`, backed
// by the PROTECTED authed billing endpoints (Feature 65):
//   createCheckout(plan)     → POST /v1/billing/checkout  { plan }  → { url }
//   createPortalSession()    → POST /v1/billing/portal    (no body) → { url }
//
// Thin adapter over the shared http-client's `postJson` (same as every other HTTP repo —
// it never calls `fetch` directly). The response is ONLY a hosted redirect `url` (no
// session id, no provider id, no secret — the HARD PRIVACY RULE). The web app never sees
// a Stripe price id or publishable key; it sends only the plan KEY and navigates to `url`.
//
// AUTH TRANSPORT: the constructor takes optional `HttpAuthOptions` and forwards them on
// every request. A browser island passes `auth: 'include'` (send the httpOnly session
// cookie — the browser can't read it from JS, so it lets fetch attach it); a server
// caller would pass `cookie`; the verification script a `bearerToken`. With NO auth the
// endpoints 401 → `AuthRequiredError`.
//
// 401 BEHAVIOR (prompt task 2/4/5): a 401 throws `AuthRequiredError` (from the
// http-client) — NOT swallowed into a fake redirect. The client action helper catches it
// and routes to /signin?redirectTo=<current path>. Any OTHER non-2xx (e.g. a 500 when the
// API's Stripe env is unconfigured, or a 400 for an unoffered plan) throws `HttpError`,
// which the caller surfaces as a safe error state WITHOUT navigating.
//
// Response typing follows the "type assertion, not zod" choice documented in the other
// HTTP repositories; the DTO TYPES come from `@tennis/contracts`.

import type {
  BillingPlanKey,
  CheckoutRequestDTO,
  CheckoutSessionDTO,
  CustomerPortalSessionDTO,
} from '@tennis/contracts';
import type { BillingRepository } from '../billing/billing.repository';
import { postJson, type HttpAuthOptions } from './http-client';

export class HttpBillingRepository implements BillingRepository {
  constructor(private readonly auth: HttpAuthOptions = {}) {}

  /**
   * POST /v1/billing/checkout with `{ plan }` — start a hosted Stripe Checkout. Returns
   * `{ url }` (the hosted redirect). Throws `AuthRequiredError` on 401, `HttpError` on
   * any other non-2xx. Only the plan KEY is sent — never a price id (intake §5.1).
   */
  async createCheckout(plan: BillingPlanKey): Promise<CheckoutSessionDTO> {
    // Typed as the contract request body so the payload can't drift from `{ plan }`.
    const body: CheckoutRequestDTO = { plan };
    return postJson<CheckoutSessionDTO>('/billing/checkout', body, this.auth);
  }

  /**
   * POST /v1/billing/portal with NO body — open the hosted Customer Portal. Identity
   * comes from the session; the customer is resolved server-side (never a client id).
   * Returns `{ url }`. Throws `AuthRequiredError` on 401, `HttpError` on any other non-2xx.
   */
  async createPortalSession(): Promise<CustomerPortalSessionDTO> {
    // The endpoint takes no request body; `postJson` still sets the method + auth. We
    // pass an empty object rather than a payload so no unexpected field is sent (the
    // global ValidationPipe would reject an unknown field, but portal has no DTO — an
    // empty body is the correct "no input" shape).
    return postJson<CustomerPortalSessionDTO>('/billing/portal', {}, this.auth);
  }
}
