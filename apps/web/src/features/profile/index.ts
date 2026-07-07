// Profile feature — public surface.
//
// Components composed by the Profile page (apps/web/src/app/profile/page.tsx). All are
// PRESENTATIONAL — none fetch data, hold state, or import a repository / @tennis/mock-data.
// The page supplies the user + derived stats via props. (No `'use client'` boundary: the
// page has no Phase-1 interactivity — no tabs, no real modals — so it stays server-rendered.)
//
// ProfileCtaCard is intentionally NOT created: per FEATURE_21 §9, "Contact Concierge"
// stays a menu row (as in the prototype), so a separate CTA card would be redundant.

export { ProfileHeader } from './ProfileHeader';
export type { ProfileHeaderProps } from './ProfileHeader';

export { ProfileStats } from './ProfileStats';
export type { ProfileStatsProps } from './ProfileStats';

export { ProfileMembershipCard } from './ProfileMembershipCard';
export type { ProfileMembershipCardProps } from './ProfileMembershipCard';

export { ProfileMenuList } from './ProfileMenuList';

export { ProfileMenuRow } from './ProfileMenuRow';
export type { ProfileMenuRowProps } from './ProfileMenuRow';
