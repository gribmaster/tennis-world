// ProfileStats — the three-cell stat row (Saved Courts · Collections · Countries).
//
// PRESENTATIONAL ONLY: the three counts are DERIVED server-side in the page from the
// saved repository (saved courts length, wishlist-folder length, distinct-country
// count) and passed in as plain numbers — never hardcoded. Phase 1 §3.10 already
// established that all three of THIS app's cells show real, derived counts, unlike v3's
// reference prototype, which has only one live stat (`Courts saved`) and two inert
// "Coming soon" placeholders it has no data for — TASK_61 decision 2 keeps the three real
// stats, no "Soon" placeholders.
//
// Each cell is a whole-cell link (ProfileStatLink → PendingCardLink) to the matching
// listing page, with an icon (TASK_61) drawn from the SAME glyphs `SavedTabs`' tab chips
// use (`@/features/saved/saved-glyphs`) — Courts → `CourtGlyph`, Collections →
// `CollectGlyph`, Countries → `MapGlyph`. Collections and Countries deep-link into the
// Saved page's matching tab via its `?tab=` search param (Task 44) — Collections opens
// Saved's Collections tab (the "Your Folders" section reads the SAME
// getSavedCollections() data this stat counts), and Countries opens Saved's Wishlist Map
// tab (which plots this visitor's own saved courts — the same courts countriesCount is
// derived from) instead of the unrelated browse-everything /map screen.

import { CourtGlyph, CollectGlyph, MapGlyph } from '@/features/saved';
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
  // Labels + icons are local page chrome (not domain data); the VALUES come from props.
  const cells: Array<{
    value: number;
    label: string;
    href: string;
    ariaLabel: string;
    icon: (props: { size?: number }) => React.ReactElement;
  }> = [
    {
      value: savedCourtsCount,
      label: 'Saved Courts',
      href: '/saved',
      ariaLabel: 'View saved courts',
      icon: CourtGlyph,
    },
    {
      value: collectionsCount,
      label: 'Collections',
      href: '/saved?tab=collections',
      ariaLabel: 'View collections',
      icon: CollectGlyph,
    },
    {
      value: countriesCount,
      label: 'Countries',
      href: '/saved?tab=wishlist',
      ariaLabel: 'View countries',
      icon: MapGlyph,
    },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 divide-x divide-hairline rounded-lg bg-paper py-4 md:mt-7 md:rounded-[14px] md:py-[18px]">
      {cells.map(({ value, label, href, ariaLabel, icon }) => (
        <ProfileStatLink
          key={label}
          href={href}
          value={value}
          label={label}
          ariaLabel={ariaLabel}
          icon={icon}
        />
      ))}
    </div>
  );
}
