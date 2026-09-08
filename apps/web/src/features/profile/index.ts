// Profile feature — public surface.
//
// Composed by the Profile page (apps/web/src/app/profile/page.tsx) and the Settings page
// (apps/web/src/app/profile/settings/page.tsx). Most components are PRESENTATIONAL —
// none fetch data or import a repository / @tennis/mock-data; the page supplies the user
// + derived stats via props. Feature 81/82 added a couple of small client islands that
// OWN their own local UI state (mirroring PaywallTrigger/ConsultationTrigger, the
// pre-existing pattern in this feature): `ProfileEditTrigger` (the "Edit profile" pill —
// owns the modal's open state + the save mutation), `SettingsAccountRow` (the same
// modal, opened from the Settings screen's "Account settings" row instead), and
// `EditProfileModal` itself (the dialog's focus-trap/scroll-lock mechanics). Everything
// else stays server-rendered.
//
// `ProfileMenuList`/`ProfileMenuRow` (the old Profile-screen settings list) are RETIRED
// (Feature 81/82): the v2 prototype moves that list into the new Settings screen, whose
// rows are `SettingsMenuCard`/`SettingsAccountRow` instead — see that page's header
// comment for where every old row ended up. ProfileCtaCard is intentionally NOT created
// either: per FEATURE_21 §9, "Contact Concierge" stays a menu row (now on Settings), so
// a separate CTA card would be redundant.

export { ProfileHeader } from './ProfileHeader';
export type { ProfileHeaderProps } from './ProfileHeader';

export { ProfileStats } from './ProfileStats';
export type { ProfileStatsProps } from './ProfileStats';

export { ProfileStatLink } from './ProfileStatLink';
export type { ProfileStatLinkProps } from './ProfileStatLink';

export { ProfileMembershipCard } from './ProfileMembershipCard';
export type { ProfileMembershipCardProps } from './ProfileMembershipCard';

export { ProfileCollectionsStrip } from './ProfileCollectionsStrip';
export type { ProfileCollectionsStripProps } from './ProfileCollectionsStrip';

export { ProfileEditTrigger } from './ProfileEditTrigger';
export type { ProfileEditTriggerProps } from './ProfileEditTrigger';

export { EditProfileModal } from './EditProfileModal';
export type { EditProfileModalProps } from './EditProfileModal';

export { SettingsMenuCard } from './SettingsMenuCard';
export type { SettingsMenuCardProps } from './SettingsMenuCard';

export { SettingsAccountRow } from './SettingsAccountRow';
export type { SettingsAccountRowProps } from './SettingsAccountRow';
