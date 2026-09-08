// Collections feature — public surface.
//
// Small, feature-local presentational components composed by the Collections page
// (apps/web/src/app/collections/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props.
//
// Feature 76 rebuilt this screen to the v2 prototype (header + three sections):
//   • CollectionsHero          — restructured: light title + subtitle, no dark band.
//   • FeaturedCollectionsStrip — new: the horizontal featured strip, built on
//                                CollectionCard (restyled to the prototype's 200×240 card).
//   • CountriesStrip           — new: the "By Country" circular strip, backed by the real
//                                `GET /v1/countries` aggregate (Feature 75).
//   • CuratedCollectionsList   — new: the "Curated for You" row list. It REPLACES the v1
//                                `CollectionsGrid`, which was deleted (its only importer
//                                was the page, which now composes these sections instead).
export { CollectionsHero } from './CollectionsHero';
export type { CollectionsHeroProps } from './CollectionsHero';

export { FeaturedCollectionsStrip } from './FeaturedCollectionsStrip';
export type { FeaturedCollectionsStripProps } from './FeaturedCollectionsStrip';

export { CountriesStrip } from './CountriesStrip';
export type { CountriesStripProps } from './CountriesStrip';

export { CuratedCollectionsList } from './CuratedCollectionsList';
export type { CuratedCollectionsListProps } from './CuratedCollectionsList';

export { CollectionCard } from './CollectionCard';
export type { CollectionCardProps } from './CollectionCard';
