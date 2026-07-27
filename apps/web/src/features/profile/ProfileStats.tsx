// ProfileStats — the three-cell stat row (Saved Courts · Collections · Countries),
// ported from profile.html's stats grid.
//
// PRESENTATIONAL ONLY: the three counts are DERIVED server-side in the page from the
// saved repository (saved courts length, wishlist-folder length, distinct-country
// count) and passed in as plain numbers — never hardcoded (the prototype's literal
// 12 / 3 / 8 are discarded; Phase 1 §3.10). No repository, no @tennis/mock-data, no state.
//
// VISUAL: a grid-cols-3 of centered cells, each a display-m number over an eyebrow
// label, with a hairline divider beneath the row. Three short numbers fit across even
// on the narrowest screens, matching the prototype (no responsive reflow).
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
    <div className="grid grid-cols-3 gap-2 border-b border-hairline py-8">
      {cells.map(({ value, label, href, ariaLabel }) => (
        <ProfileStatLink key={label} href={href} value={value} label={label} ariaLabel={ariaLabel} />
      ))}
    </div>
  );
}
