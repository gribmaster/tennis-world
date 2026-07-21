// paywall-copy.ts — the copy/data shown inside the Phase-1 Paywall modal.
//
// DATA SOURCE (important): a richer `PAYWALL_COPY` config already exists in
// `@tennis/mock-data` (packages/mock-data/src/paywall-copy.ts). We deliberately do
// NOT import it here: the web app's ESLint config (`apps/web/.eslintrc.json`) forbids
// any UI/feature code from importing `@tennis/mock-data` directly — UI must go through
// a domain repository via `@/lib/repositories`, and there is no paywall repository
// (and the hard rules say not to create a repository just for paywall copy). So this
// is an intentional feature-local copy object, mirroring how HomePaywallBand /
// ProfileMembershipCard / CourtDetailCtaPanel already keep their paywall copy local.
//
// PHASE 4: the real source of truth is backend/config (pricing, entitlement kind,
// promo/subscription variants). When that lands, this object should be replaced by a
// value flowing through a sanctioned boundary (e.g. a `paywall` repository method or a
// config adapter) rather than this static literal — the shape below intentionally
// matches `@tennis/mock-data`'s PAYWALL_COPY so that swap is a source change, not a
// component change.
//
// PRESENTATIONAL ONLY — no price is charged, no entitlement is read or mutated.

import type { BillingPlanKey } from '@tennis/contracts';

export interface PaywallBenefit {
  title: string;
  subtitle: string;
}

export interface PaywallPrice {
  /** Human-readable price, e.g. "$9/mo". */
  display: string;
  /** e.g. "Billed monthly". */
  cadence: string;
}

/** One of the three recurring plan choices the paywall CTA row offers. */
export interface PaywallPlanOption {
  plan: BillingPlanKey;
  /** Button label, e.g. "Monthly — $9/mo". */
  label: string;
  price: PaywallPrice;
}

export interface PaywallCopy {
  /** Gold eyebrow above the headline. */
  eyebrow: string;
  headline: string;
  /** One-line value proposition under the headline. */
  valueProp: string;
  benefits: PaywallBenefit[];
  /** The three recurring plan choices, each rendered as its own checkout CTA. */
  plans: PaywallPlanOption[];
  /** Secondary "not now" / close action label. */
  secondaryCtaLabel: string;
}

// Copy shape mirrors `@tennis/mock-data`'s PAYWALL_COPY (kept in sync by hand for
// Phase 1; sourced from it via a sanctioned boundary in Phase 4 — see header note).
export const PAYWALL_COPY: PaywallCopy = {
  eyebrow: 'Membership',
  headline: 'The world, unlocked.',
  valueProp: '120+ curated courts. Exact locations. Editorial guides. Choose your plan.',
  benefits: [
    { title: 'Exact locations', subtitle: 'Pinpoint coordinates · 120+ courts' },
    { title: 'The full atlas', subtitle: 'Every hidden destination on the map' },
    { title: 'Premium collections', subtitle: 'Coastal, Desert, Hidden, Historic' },
    { title: 'Editorial guides', subtitle: "Insider notes from those who've played" },
    { title: 'Concierge priority', subtitle: 'Skip the line on consultations' },
  ],
  plans: [
    { plan: 'monthly', label: 'Monthly', price: { display: '$9', cadence: 'Billed monthly' } },
    { plan: 'quarterly', label: 'Quarterly', price: { display: '$24', cadence: 'Billed every 3 months' } },
    { plan: 'yearly', label: 'Yearly', price: { display: '$79', cadence: 'Billed annually' } },
  ],
  secondaryCtaLabel: 'Not now',
};
