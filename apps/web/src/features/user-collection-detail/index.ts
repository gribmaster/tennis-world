// User-collection detail feature — public surface (Feature 33; rename wired in Feature 37).
//
// The pieces composed by the user wishlist-folder detail page
// (apps/web/src/app/saved/collections/[slug]/page.tsx). The hero, grid, and empty state
// are server-renderable and data-driven: they receive a UserCollectionDTO /
// CourtSummaryDTO[] via props and never fetch, import a repository, or import
// @tennis/mock-data — the page supplies the data.
//
// The ONE interactive piece is <UserCollectionRename>, a 'use client' island the hero
// mounts in its title slot. It calls the MOCK-ONLY `repositories.saved.renameUserCollection`
// seam (Feature 34, in-memory) — no backend/auth/persistence. Per-card Remove is still
// omitted (later-feature work).
export { UserCollectionHero } from './UserCollectionHero';
export type { UserCollectionHeroProps } from './UserCollectionHero';

export { UserCollectionRename } from './UserCollectionRename';
export type { UserCollectionRenameProps } from './UserCollectionRename';

export { UserCollectionCourtsGrid } from './UserCollectionCourtsGrid';
export type { UserCollectionCourtsGridProps } from './UserCollectionCourtsGrid';

export { UserCollectionEmptyState } from './UserCollectionEmptyState';
