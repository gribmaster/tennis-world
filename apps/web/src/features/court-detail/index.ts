// Court Detail feature — public surface.
//
// Small, feature-local components composed by the Court Detail page
// (apps/web/src/app/courts/[slug]/page.tsx). None of them fetch data or import a
// repository / @tennis/mock-data — the page supplies everything via props, including the
// `locked` / `directionsUrl` entitlement result it derives once (Feature 64).
export {
  CourtDetailGalleryProvider,
  CourtDetailGalleryHero,
  CourtDetailGalleryStrip,
} from './CourtDetailGallery';
export type {
  CourtDetailGalleryProps,
  CourtDetailGalleryProviderProps,
  CourtDetailGalleryHeroProps,
} from './CourtDetailGallery';

export { CourtDetailGalleryLightbox } from './CourtDetailGalleryLightbox';
export type { CourtDetailGalleryLightboxProps } from './CourtDetailGalleryLightbox';

// NO LONGER RENDERED (Feature 79). CourtDetailFramedGallery, CourtDetailCtaPanel and
// CourtDetailLocationPreview's `variant="rail"` were the PRE-v2 locked page's pieces.
// Feature 78 moved the unlocked page off them and Feature 79 moved the locked page off
// them too, so nothing in the app imports these three any more. They are left in place
// deliberately: deleting them is not this feature's job (CLAUDE.md §9 — touch only what
// the task requires). A follow-up may remove them once no one wants the old reading back.
export { CourtDetailFramedGallery } from './CourtDetailFramedGallery';
export type { CourtDetailFramedGalleryProps } from './CourtDetailFramedGallery';

export { CourtDetailLocationPreview } from './CourtDetailLocationPreview';
export type { CourtDetailLocationPreviewProps } from './CourtDetailLocationPreview';

export { CourtDetailCtaPanel } from './CourtDetailCtaPanel';
export type { CourtDetailCtaPanelProps } from './CourtDetailCtaPanel';

export { SaveToCollectionMenu } from './SaveToCollectionMenu';
export type { SaveToCollectionMenuProps } from './SaveToCollectionMenu';

export { CourtSaveButton, useCourtSaveState } from './CourtSaveButton';
export type {
  CourtSaveButtonProps,
  CourtSaveState,
  UseCourtSaveStateOptions,
} from './CourtSaveButton';

// ── v2 redesign: the shell + sections shared by BOTH readings of the page ───────────────
// Feature 78 built these for the unlocked page; Feature 79 put the locked page on the same
// shell (renamed from CourtDetailUnlockedShell), so the two readings share one hero,
// gallery, Back control and sticky footer and can only differ where the prototype does.
export { CourtDetailShell } from './CourtDetailShell';
export type { CourtDetailShellProps } from './CourtDetailShell';

export { CourtDetailTagStrip } from './CourtDetailTagStrip';
export type { CourtDetailTagStripProps } from './CourtDetailTagStrip';

export { CourtDetailDescription } from './CourtDetailDescription';
export type { CourtDetailDescriptionProps } from './CourtDetailDescription';

export { CourtDetailNearbyStrip } from './CourtDetailNearbyStrip';
export type { CourtDetailNearbyStripProps } from './CourtDetailNearbyStrip';

export { CourtDetailShareButton } from './CourtDetailShareButton';
export type { CourtDetailShareButtonProps } from './CourtDetailShareButton';

// ── Feature 80: review SUBMISSION (collection only — nothing displays a review) ─────────
// The "Played here?" card + the dialog it opens. Mounted on the UNLOCKED branch only.
export { CourtDetailReviewCard } from './CourtDetailReviewCard';
export type { CourtDetailReviewCardProps } from './CourtDetailReviewCard';

export { ReviewModal } from './ReviewModal';
export type { ReviewModalProps } from './ReviewModal';

export { REVIEW_COPY } from './review-copy';
export type { ReviewCopy } from './review-copy';

// ── v2 redesign (Feature 79), LOCKED reading of the page ────────────────────────────────
export { CourtDetailBlurredDescription } from './CourtDetailBlurredDescription';
export type { CourtDetailBlurredDescriptionProps } from './CourtDetailBlurredDescription';

export { CourtDetailUnlockCard } from './CourtDetailUnlockCard';
