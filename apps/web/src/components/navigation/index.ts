// Navigation-pending primitives (apps/web-local — no packages/ui, Decision #6).
//
// Small, composable pieces that give element-level "this exact thing was clicked"
// pending/loading feedback for navigation AND async mutations, without a full-page
// loader/overlay and without a large global state library. See each file's header
// comment for the reasoning behind its specific approach.
export { NavigationPendingProvider, useNavigationPendingRegistry } from './NavigationPendingProvider';

export { useElementPending } from './useElementPending';

export { useInAppHistory } from './useInAppHistory';

export { PendingLink } from './PendingLink';
export type { PendingLinkProps } from './PendingLink';

export { PendingCardLink } from './PendingCardLink';
export type { PendingCardLinkProps } from './PendingCardLink';

export { PendingButton } from './PendingButton';
export type { PendingButtonProps } from './PendingButton';

export { BackButton } from './BackButton';
export type { BackButtonProps } from './BackButton';
