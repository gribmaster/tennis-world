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
// listing page. There is no dedicated "countries" route in the app, so Countries
// points at /map — the existing browse-all-courts screen — rather than an invented one.

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
    { value: collectionsCount, label: 'Collections', href: '/collections', ariaLabel: 'View collections' },
    { value: countriesCount, label: 'Countries', href: '/map', ariaLabel: 'View countries' },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 divide-x divide-hairline rounded-lg bg-paper py-4">
      {cells.map(({ value, label, href, ariaLabel }) => (
        <ProfileStatLink key={label} href={href} value={value} label={label} ariaLabel={ariaLabel} />
      ))}
    </div>
  );
}
