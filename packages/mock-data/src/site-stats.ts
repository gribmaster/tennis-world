// Home hero copy as DATA, not JSX (Phase 1 §3.2). The stat string is ported
// verbatim from home.html's hero. Phase 1 reads this so the hero is data-driven.

export const SITE_STATS = {
  heroStatLine: '50 countries · 1,000 courts · endless inspiration',
  heroHeadline: 'A curated atlas of the world’s most beautiful tennis courts.',
  heroCtaLabel: 'Explore the Map',
} as const;
