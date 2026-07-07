// Collections feature — public surface.
//
// Small, feature-local presentational components composed by the Collections page
// (apps/web/src/app/collections/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props.
export { CollectionsHero } from './CollectionsHero';
export type { CollectionsHeroProps } from './CollectionsHero';

export { CollectionsGrid } from './CollectionsGrid';
export type { CollectionsGridProps } from './CollectionsGrid';

export { CollectionCard } from './CollectionCard';
export type { CollectionCardProps } from './CollectionCard';
