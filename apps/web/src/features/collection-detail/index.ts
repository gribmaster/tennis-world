// Collection Detail feature — public surface.
//
// Small, feature-local presentational components composed by the Collection Detail
// page (apps/web/src/app/collections/[slug]/page.tsx). None of them fetch data or
// import a repository / @tennis/mock-data — the page supplies everything via props.
export { CollectionDetailHero } from './CollectionDetailHero';
export type { CollectionDetailHeroProps } from './CollectionDetailHero';

export { CollectionCourtsGrid } from './CollectionCourtsGrid';
export type { CollectionCourtsGridProps } from './CollectionCourtsGrid';
