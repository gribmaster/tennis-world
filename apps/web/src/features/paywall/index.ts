// Paywall feature — shared, cross-screen UI (Home / Court Detail / Profile / Footer).
//
// Opens an accessible modal describing membership. Its primary CTA now starts a REAL
// hosted Stripe Checkout (Feature 67 — via the billing feature's PaywallCheckoutButton):
// the browser navigates to a hosted `url`. There is still NO Stripe.js, NO publishable
// key, NO price id in the browser, and NO client-side entitlement mutation — only a plan
// KEY is sent; fulfillment happens server-side via the webhook. The modal chrome
// (copy/benefits/price display) stays presentational.
//
// Public surface: drop a <PaywallTrigger> wherever an "Unlock"/membership CTA is needed.
// It owns its own open/close state and renders the <PaywallModal>.
export { PaywallTrigger } from './PaywallTrigger';
export type { PaywallTriggerProps } from './PaywallTrigger';

export { PaywallModal } from './PaywallModal';
export type { PaywallModalProps } from './PaywallModal';

export { PAYWALL_COPY } from './paywall-copy';
export type { PaywallCopy, PaywallBenefit, PaywallPrice } from './paywall-copy';
