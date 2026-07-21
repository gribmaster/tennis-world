// Paywall copy as a config export (Phase 1 §3.6). Benefits ported verbatim from
// profile.html's Paywall component. NOTE: the real product now sells recurring
// Monthly/Quarterly/Yearly plans (Feature 67) — the actual plan prices/labels live in
// `apps/web/src/features/paywall/paywall-copy.ts` (the web app intentionally does not
// import this package export for paywall UI; see that file's header note). This export
// is kept for back-compat but no longer names a one-time/lifetime price point.

export interface PaywallBenefit {
  title: string;
  subtitle: string;
}

export const PAYWALL_COPY = {
  headline: 'Unlock The Tennis World Map',
  price: {
    display: 'Choose your membership',
    cadence: 'Monthly · Quarterly · Yearly',
  },
  primaryCtaLabel: 'Unlock Full Access',
  secondaryCtaLabel: 'Request Consultation',
  benefits: [
    { title: 'Exact locations', subtitle: 'Pinpoint coordinates · 120+ courts' },
    { title: 'The full atlas', subtitle: 'Every hidden destination on the map' },
    { title: 'Premium collections', subtitle: 'Coastal, Desert, Hidden, Historic' },
    { title: 'Editorial guides', subtitle: "Insider notes from those who've played" },
    { title: 'Concierge priority', subtitle: 'Skip the line on consultations' },
  ] satisfies PaywallBenefit[],
} as const;
