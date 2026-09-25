// ProfileStats — the three-cell stat row (Saved Courts · Collections · Countries).
//
// PRESENTATIONAL ONLY: the three counts are DERIVED server-side in the page from the
// saved repository (saved courts length, wishlist-folder length, distinct-country
// count) and passed in as plain numbers — never hardcoded (the prototype's literal
// 67/'Coming soon' stats are NOT reproduced here; Phase 1 §3.10 already established that
// all three of THIS app's cells show real, derived counts, unlike the v2 prototype's
// ProfileScreen, which has only one live stat (`Courts saved`) and two inert "Coming
// soon" placeholders (`Courts visited`/`Courts liked`) it has no data for. TASK_14 says
// keep the EXISTING logic — this file's three-live-stat behavior is exactly that;
// restyled only to the prototype's rounded paper-card geometry (`new design/
// tennis_world_v2_standalone.html` lines 1414-1427: `background:paper`, `borderRadius:12`,
// `padding:'16px 0'`, hairline `borderRight` dividers between cells).
//
// Each cell is a whole-cell link (ProfileStatLink → PendingCardLink) to the matching
// listing page. Collections and Countries deep-link into the Saved page's matching tab
// via its `?tab=` search param (Task 44) — Collections opens Saved's Collections tab
// (the "Your Folders" section reads the SAME getSavedCollections() data this stat
// counts), and Countries opens Saved's Wishlist Map tab (which plots this visitor's own
// saved courts — the same courts countriesCount is derived from) instead of the
// unrelated browse-everything /map screen.

import { ProfileStatLink } from './ProfileStatLink';

export interface ProfileStatsProps {
  savedCourtsCount: number;
  collectionsCount: number;
  countriesCount: number;
}

export function ProfileStats({
  savedCourtsCount,
  collectionsCount,
  countriesCount,
}: ProfileStatsProps) {
  // Labels are local page chrome (not domain data); the VALUES come from props.
  const cells: Array<{ value: number; label: string; href: string; ariaLabel: string }> = [
    { value: savedCourtsCount, label: 'Saved Courts', href: '/saved', ariaLabel: 'View saved courts' },
    { value: collectionsCount, label: 'Collections', href: '/saved?tab=collections', ariaLabel: 'View collections' },
    { value: countriesCount, label: 'Countries', href: '/saved?tab=wishlist', ariaLabel: 'View countries' },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 divide-x divide-hairline rounded-lg bg-paper py-4">
      {cells.map(({ value, label, href, ariaLabel }) => (
        <ProfileStatLink key={label} href={href} value={value} label={label} ariaLabel={ariaLabel} />
      ))}
    </div>
  );
}
