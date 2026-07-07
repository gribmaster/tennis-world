// Court Detail feature — public surface.
//
// Small, feature-local presentational components composed by the Court Detail page
// (apps/web/src/app/courts/[slug]/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props.
export { CourtDetailGallery } from './CourtDetailGallery';
export type { CourtDetailGalleryProps } from './CourtDetailGallery';

export { CourtDetailLocationPreview } from './CourtDetailLocationPreview';
export type { CourtDetailLocationPreviewProps } from './CourtDetailLocationPreview';

export { CourtDetailCtaPanel } from './CourtDetailCtaPanel';
export type { CourtDetailCtaPanelProps } from './CourtDetailCtaPanel';

export { SaveToCollectionMenu } from './SaveToCollectionMenu';
export type { SaveToCollectionMenuProps } from './SaveToCollectionMenu';

export { CourtSaveButton } from './CourtSaveButton';
export type { CourtSaveButtonProps } from './CourtSaveButton';
