// Home feature — public surface (v3 "Atlas", TASK_58).
//
// `app/page.tsx` is a SERVER component and the single repository boundary; it picks the
// hero's 4 slides server-side and renders `<HomeHero slides={…} />` followed by
// `<HomeMembership viewerIsEntitled={…} />` inside one shared wrapper (the membership
// section's floating mobile CTA needs to be that wrapper's last child — see
// `HomeMembership`'s own header). Everything v2 Home had beyond this — search, shortcut
// row, featured/editor's-cut strips, collections/journal teasers, the map-preview band —
// was removed from Home in this task (REDESIGN_V3_PLAN.md decision 1).
export { HomeHero } from './HomeHero';
export type { HomeHeroProps, HomeHeroSlide } from './HomeHero';

export { HomeMembership } from './HomeMembership';
export type { HomeMembershipProps } from './HomeMembership';
