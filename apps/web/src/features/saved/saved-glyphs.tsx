// saved-glyphs — the three tab/stat icons shared between `SavedTabs` (tab chips) and
// `ProfileStats` (TASK_61): court, collection and map. Previously defined locally inside
// `SavedTabs.tsx`; moved here so Profile's stats row can draw the SAME glyphs instead of
// a fourth copy. Each takes an optional `size` (default 18, SavedTabs' original fixed
// size) so ProfileStats can request its own 14/15px pair.

/** The prototype's `Ico.court(18)` — a tennis-court plan glyph. */
export function CourtGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="6" y1="4" x2="6" y2="20" strokeDasharray="2 2" />
      <line x1="18" y1="4" x2="18" y2="20" strokeDasharray="2 2" />
    </svg>
  );
}

/** The prototype's `Ico.collect(18)` — a 2×2 grid glyph. */
export function CollectGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

/** The third tab/stat has no prototype icon; this is this app's own. */
export function MapGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
