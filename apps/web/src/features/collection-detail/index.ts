// Collection Detail feature — public surface.
//
// Small, feature-local components composed by the Collection Detail page
// (apps/web/src/app/collections/[slug]/page.tsx). None of them fetch data or
// import a repository / @tennis/mock-data — the page supplies everything via props.
export { CollectionDetailHero } from './CollectionDetailHero';
export type { CollectionDetailHeroProps } from './CollectionDetailHero';

// TASK_60 (v3): the client shell that owns the shared hero-heart/bar-heart save state.
export { CollectionDetailShell } from './CollectionDetailShell';
export type { CollectionDetailShellProps, CollectionMapCta } from './CollectionDetailShell';

export { CollectionCourtsGrid } from './CollectionCourtsGrid';
export type { CollectionCourtsGridProps } from './CollectionCourtsGrid';
