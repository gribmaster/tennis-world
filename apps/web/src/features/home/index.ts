// Home feature — public surface (v2, Feature 74).
//
// The page (`apps/web/src/app/page.tsx`) is a SERVER component and the single repository
// boundary; it renders the hero and then hands every fetched array to `HomeExplorer`, the
// screen's one `'use client'` boundary. The section components below are consumed BY
// HomeExplorer, not by the page — they are exported here so the feature's surface stays
// legible and testable, not because the page mounts them directly.
export { HomeHero, HOME_HERO_CONTENT } from './HomeHero';
export type { HomeHeroProps, HomeHeroContent, HomeHeroCta } from './HomeHero';

export { HomeExplorer } from './HomeExplorer';
export type { HomeExplorerProps } from './HomeExplorer';

export { HomeSearchBar } from './HomeSearchBar';
export type { HomeSearchBarProps } from './HomeSearchBar';

export { HomeShortcutsRow } from './HomeShortcutsRow';
export type { HomeShortcutsRowProps } from './HomeShortcutsRow';

export { HOME_SHORTCUTS } from './home-shortcuts';
export type { HomeShortcut } from './home-shortcuts';

export { HomeFeaturedCourts } from './HomeFeaturedCourts';
export type { HomeFeaturedCourtsProps } from './HomeFeaturedCourts';

export { HomeCourtSaveHeart } from './HomeCourtSaveHeart';
export type { HomeCourtSaveHeartProps } from './HomeCourtSaveHeart';

export { HomeCollectionsTeaser } from './HomeCollectionsTeaser';
export type { HomeCollectionsTeaserProps } from './HomeCollectionsTeaser';

export { HomeJournalTeaser } from './HomeJournalTeaser';
export type { HomeJournalTeaserProps } from './HomeJournalTeaser';

export { HomeEditorsCut } from './HomeEditorsCut';
export type { HomeEditorsCutProps } from './HomeEditorsCut';

export { HomePaywallBand } from './HomePaywallBand';
export type { HomePaywallBandProps } from './HomePaywallBand';

export { courtDisplay, courtLocation } from './court-display';
export type { CourtDisplay } from './court-display';
