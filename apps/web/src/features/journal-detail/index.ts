// Journal-detail feature — public surface.
//
// Small, feature-local presentational components composed by the Journal Detail page
// (apps/web/src/app/journal/[slug]/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props.
export { ArticleHero } from './ArticleHero';
export type { ArticleHeroProps } from './ArticleHero';

export { ArticleMeta } from './ArticleMeta';
export type { ArticleMetaProps } from './ArticleMeta';

export { ArticleBody } from './ArticleBody';
export type { ArticleBodyProps } from './ArticleBody';

export { ArticleByline } from './ArticleByline';
export type { ArticleBylineProps } from './ArticleByline';

export { ArticleRelated } from './ArticleRelated';
export type { ArticleRelatedProps } from './ArticleRelated';
