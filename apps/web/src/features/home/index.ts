// Home feature — public surface.
//
// The Home page (apps/web/src/app/page.tsx) is being assembled section by section.
// Today that's just the hero; future Phase-1 features add featured destinations,
// collections, journal teaser, and the paywall CTA band as their own sections.
export { HomeHero, HOME_HERO_CONTENT } from './HomeHero';
export type {
  HomeHeroProps,
  HomeHeroContent,
  HomeHeroCta,
  HomeHeroStat,
} from './HomeHero';

export { HomeFeaturedCourts } from './HomeFeaturedCourts';
export type { HomeFeaturedCourtsProps } from './HomeFeaturedCourts';

export { HomeCollectionsTeaser } from './HomeCollectionsTeaser';
export type { HomeCollectionsTeaserProps } from './HomeCollectionsTeaser';

export { HomeJournalTeaser } from './HomeJournalTeaser';
export type { HomeJournalTeaserProps } from './HomeJournalTeaser';

export { HomeEditorsCut } from './HomeEditorsCut';
export type { HomeEditorsCutProps } from './HomeEditorsCut';

export { HomePaywallBand } from './HomePaywallBand';
export type { HomePaywallBandProps } from './HomePaywallBand';
