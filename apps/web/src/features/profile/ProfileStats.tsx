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
  const cells: Array<{ value: number; label: string }> = [
    { value: savedCourtsCount, label: 'Saved Courts' },
    { value: collectionsCount, label: 'Collections' },
    { value: countriesCount, label: 'Countries' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 border-b border-hairline py-8">
      {cells.map(({ value, label }) => (
        <div key={label} className="text-center">
          <div className="display-m text-ink">{value}</div>
          <div className="eyebrow mt-1.5 text-stone">{label}</div>
        </div>
      ))}
    </div>
  );
}
