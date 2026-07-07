// Billing domain — MOCK repository implementation (Feature 67, `mock` data source).
//
// There is NO mock Stripe. The prototype (mock mode) has no server, no payment
// provider, no hosted Checkout/Portal URL to redirect to — so a checkout/portal action
// is genuinely not available. Rather than fabricate a fake redirect (which would send a
// developer to a dead URL and hide that mock mode can't transact), this implementation
// throws a CLEAR "not implemented in mock mode" error.
//
// Why throw (not return null): the interface returns a non-nullable `{ url }`. A caller
// that got `null` would have to special-case it anyway; a typed, well-messaged throw is
// clearer and the client action helper already has an error branch (it surfaces a safe
// "billing isn't available" message and does NOT navigate). The mock BUILD stays fully
// stable — nothing here runs at import/build time; the error only fires if a button is
// actually clicked while the app is wired to `mock`.
//
// In practice the billing buttons matter in `api` mode (real endpoints). Mock mode keeps
// rendering the same UI; clicking a checkout/portal button there is a no-op-with-message,
// exactly as the paywall modal was inert before this feature — just now with an explicit
// reason instead of a disabled control.

import type {
  BillingPlanKey,
  CheckoutSessionDTO,
  CustomerPortalSessionDTO,
} from '@tennis/contracts';
import type { BillingRepository } from './billing.repository';

/**
 * Error thrown by the mock billing repo when a billing action is attempted in `mock`
 * mode (no payment provider exists there). A distinct class so the client action helper
 * can recognise "billing unavailable in this environment" and show a calm message
 * instead of a scary network error.
 */
export class BillingNotAvailableError extends Error {
  constructor(action: 'checkout' | 'portal') {
    super(
      `Billing ${action} is not available in mock mode — set NEXT_PUBLIC_DATA_SOURCE=api and configure the API's Stripe env.`,
    );
    this.name = 'BillingNotAvailableError';
  }
}

export class MockBillingRepository implements BillingRepository {
  async createCheckout(plan: BillingPlanKey): Promise<CheckoutSessionDTO> {
    // `plan` is intentionally unused (mock mode has no provider to price it against);
    // referenced via `void` so it isn't flagged as unused, mirroring PaywallModal's `source`.
    void plan;
    throw new BillingNotAvailableError('checkout');
  }

  async createPortalSession(): Promise<CustomerPortalSessionDTO> {
    throw new BillingNotAvailableError('portal');
  }
}
