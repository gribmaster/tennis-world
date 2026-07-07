// Court display components (apps/web-local — no packages/ui, Decision #6).
//
// Reusable, data-driven, presentational court UI. These components receive court
// data via props (a CourtSummaryDTO or individual attribute values) and never
// import @tennis/mock-data, a repository, or fetch data themselves — screens supply
// the data through `@/lib/repositories`.
export { CourtCard } from './CourtCard';
export type { CourtCardProps } from './CourtCard';

export { CourtMeta } from './CourtMeta';
export type { CourtMetaProps } from './CourtMeta';

export { CourtImage } from './CourtImage';
export type { CourtImageProps } from './CourtImage';
