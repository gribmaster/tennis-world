// Journal feature — public surface.
//
// Small, feature-local presentational components composed by the Journal page
// (apps/web/src/app/journal/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props.
export { JournalHero } from './JournalHero';
export type { JournalHeroProps } from './JournalHero';

export { JournalGrid } from './JournalGrid';
export type { JournalGridProps } from './JournalGrid';

export { ArticleCard } from './ArticleCard';
export type { ArticleCardProps } from './ArticleCard';
