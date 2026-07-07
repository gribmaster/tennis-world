// Billing domain — repository INTERFACE (Feature 67).
//
// The contract the web billing UI depends on: START a hosted Stripe Checkout for the
// authed user, and OPEN their hosted Customer Portal. Both are PROTECTED actions that
// return only a hosted redirect `url` (the HARD PRIVACY RULE, contracts/billing.ts) —
// there is no session id, no provider id, no secret on the wire. The client just
// navigates the browser to `url`; no Stripe.js, no publishable key, no price id ever
// touches the web app (the server maps a plan KEY → price id).
//
// UI depends ONLY on this interface; the central factory (`src/domain/index.ts`)
// decides the implementation — `MockBillingRepository` (mock data source) or
// `HttpBillingRepository` (`api` data source, backed by POST /v1/billing/{checkout,portal}).
// So the mock→HTTP swap is a factory change, not a UI change (same pattern as
// courts/saved/user).
//
// AUTH: both methods hit the authed billing surface (AuthGuard). In `api` mode the
// HTTP repo carries the caller's auth transport (browser → `credentials:'include'`);
// a 401 surfaces as `AuthRequiredError` so the caller can route to sign-in — it is
// NEVER swallowed into a fake success.
//
// Signatures are typed against `@tennis/contracts` so the wire shape is defined once
// and shared by both implementations (and by the API's request DTO).

import type {
  BillingPlanKey,
  CheckoutSessionDTO,
  CustomerPortalSessionDTO,
} from '@tennis/contracts';

export interface BillingRepository {
  /**
   * Start a hosted Stripe Checkout for the authed user and the given plan key
   * (`'lifetime'` | `'subscription'`). Resolves to `{ url }` — the hosted Checkout
   * redirect the browser should navigate to. Throws `AuthRequiredError` on 401
   * (logged out / expired session); throws `HttpError` on any other non-2xx
   * (e.g. a 500 when the API's Stripe env is unconfigured, or a 400 for an unoffered
   * plan). The client never sends a price id — only the plan key (intake §5.1).
   */
  createCheckout(plan: BillingPlanKey): Promise<CheckoutSessionDTO>;

  /**
   * Open the authed user's hosted Stripe Customer Portal. Takes no argument —
   * identity comes from the session and the customer is resolved server-side (never a
   * client-supplied id). Resolves to `{ url }` — the hosted portal redirect. Throws
   * `AuthRequiredError` on 401, `HttpError` on any other non-2xx.
   */
  createPortalSession(): Promise<CustomerPortalSessionDTO>;
}
