// Paywall copy as a config export (Phase 1 §3.6). Benefits ported verbatim from
// profile.html's Paywall component. The $29 price point lives here as data so
// Phase 4's real pricing/entitlement logic can swap the source without touching
// any component.

export interface PaywallBenefit {
  title: string;
  subtitle: string;
}

export const PAYWALL_COPY = {
  headline: 'Unlock The Tennis World Map',
  price: {
    amount: 29,
    currency: 'USD',
    display: '$29',
    cadence: 'One-time · Lifetime',
  },
  primaryCtaLabel: 'Unlock Full Access',
  secondaryCtaLabel: 'Request Consultation',
  benefits: [
    { title: 'Exact locations', subtitle: 'Pinpoint coordinates · 120+ courts' },
    { title: 'The full atlas', subtitle: 'Every hidden destination on the map' },
    { title: 'Premium collections', subtitle: 'Coastal, Desert, Hidden, Historic' },
    { title: 'Editorial guides', subtitle: "Insider notes from those who've played" },
    { title: 'Concierge priority', subtitle: 'Skip the line on consultations' },
    { title: 'Lifetime access', subtitle: 'One payment · every future destination' },
  ] satisfies PaywallBenefit[],
} as const;
