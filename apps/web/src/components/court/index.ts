// Court display components (apps/web-local — no packages/ui, Decision #6).
//
// Reusable, data-driven, presentational court UI. These components receive court
// data via props (a CourtSummaryDTO or individual attribute values) and never
// import @tennis/mock-data, a repository, or fetch data themselves — screens supply
// the data through `@/lib/repositories`.
export { CourtCard } from './CourtCard';
export type { CourtCardProps } from './CourtCard';

export { CourtCardSaveButton, BookmarkGlyph } from './CourtCardSaveButton';
export type { CourtCardSaveButtonProps } from './CourtCardSaveButton';

export { SurfaceChip } from './SurfaceChip';
export type { SurfaceChipProps } from './SurfaceChip';

export { PremiumBadge } from './PremiumBadge';

export { CourtImage } from './CourtImage';
export type { CourtImageProps } from './CourtImage';

export { courtDisplay, courtLocation, courtCategoryTags, courtCardLabels } from './court-display';
export type { CourtDisplay } from './court-display';
