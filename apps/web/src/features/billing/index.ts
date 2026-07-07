// Billing feature — real payment wiring (Feature 67).
//
// Wires the Phase-1 paywall/profile/footer CTAs (previously inert placeholders) to the
// live billing endpoints: POST /v1/billing/checkout (hosted Stripe Checkout) and POST
// /v1/billing/portal (hosted Customer Portal), through the BillingRepository seam. NO
// Stripe.js, NO publishable key, NO price id in the browser — the client sends only a
// plan KEY and navigates to an opaque hosted `url`.
//
// Public surface:
//   • PaywallCheckoutButton — the paywall's primary "Unlock" CTA (starts lifetime checkout).
//   • ManageBillingButton   — opens the Customer Portal (profile row + footer restore).
//   • useBillingAction      — the shared hook both buttons use (loading/error/auth states).

export { PaywallCheckoutButton } from './PaywallCheckoutButton';
export type { PaywallCheckoutButtonProps } from './PaywallCheckoutButton';

export { ManageBillingButton } from './ManageBillingButton';
export type { ManageBillingButtonProps } from './ManageBillingButton';

export { BillingReturn } from './BillingReturn';

export {
  CheckoutStatusBanner,
  parseCheckoutStatus,
} from './CheckoutStatusBanner';
export type {
  CheckoutStatus,
  CheckoutStatusBannerProps,
} from './CheckoutStatusBanner';

export { useBillingAction } from './use-billing-action';
export type {
  BillingActionStatus,
  UseBillingActionResult,
} from './use-billing-action';
