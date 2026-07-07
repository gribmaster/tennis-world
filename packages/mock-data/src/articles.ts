import type { ArticleDTO } from '@tennis/contracts';
import { IMG, U } from './images';

// Journal articles. The prototypes carry no dedicated ARTICLES array; their
// editorial content lives in the `ONBOARDING` chapters of journal.html, which are
// the closest existing source. Ported here with authored slugs/categories/read
// times so the Phase-1 Journal screen has real, data-driven content.
//
// `author` (optional in the contract) is seeded as "Janet See" on every article —
// the single byline the article.html prototype uses — so the Feature 31 byline block
// on /journal/[slug] has a name to render and derive initials from.

export const ARTICLES: ArticleDTO[] = [
  {
    id: 'world-as-tennis-map',
    slug: 'the-world-as-a-tennis-map',
    title: 'The world, as a tennis map.',
    subtitle:
      'A curated atlas of the most beautiful courts on earth — from clay terraces above Lake Como to grass under English oaks.',
    category: 'Guides',
    heroImageUrl: U(IMG.como, 1800),
    readTimeMinutes: 6,
    author: 'Janet See',
    bodyRichText:
      'A curated atlas of the most beautiful courts on earth — from clay terraces above Lake Como to grass under English oaks. We map the destinations worth crossing the world for.',
    publishedAt: '2026-01-15',
  },
  {
    id: 'discover-before-you-arrive',
    slug: 'discover-before-you-arrive',
    title: 'Discover before you arrive.',
    subtitle:
      'Editorial guides, hidden resorts, and the courts only insiders know — gathered into one slow, considered feed.',
    category: 'Editorial',
    heroImageUrl: U(IMG.maldives, 1800),
    readTimeMinutes: 5,
    author: 'Janet See',
    bodyRichText:
      'Editorial guides, hidden resorts, and the courts only insiders know — gathered into one slow, considered feed. The best journeys are imagined long before they are taken.',
    publishedAt: '2026-02-02',
  },
  {
    id: 'travel-for-love-of-place',
    slug: 'travel-for-the-love-of-place',
    title: 'Travel for the love of place.',
    subtitle:
      'Save courts to wishlists. Plan trips. Ask our concierge for a bespoke recommendation.',
    category: 'Concierge',
    heroImageUrl: U(IMG.cotswolds, 1800),
    readTimeMinutes: 4,
    author: 'Janet See',
    bodyRichText:
      'Save courts to wishlists. Plan trips. Ask our concierge for a bespoke recommendation. The court is the reason; the place is the reward.',
    publishedAt: '2026-02-20',
  },
];
