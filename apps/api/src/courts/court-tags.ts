import type { CourtTag } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Court "Experience" tag vocabulary — the API-side runtime mirror (Feature 72).
//
// `@tennis/contracts` owns the canonical definition (`CourtTag` / `COURT_TAGS` /
// `orderCourtTags` in packages/contracts/src/enums.ts), but apps/api may only
// import that package TYPE-ONLY (CLAUDE.md §9 — its package `main` points at TS
// source, which `node dist/main.js` cannot `require` at runtime). So the VALUES
// are mirrored here exactly as `courts.dto.ts` already mirrors SURFACES /
// ACCESS_TYPES / INDOOR_OUTDOOR. The `satisfies` guard below makes any drift in
// the value set a compile error rather than a silent parity failure.
//
// ORDER IS PART OF THE CONTRACT: mock and API must emit identical arrays or
// `verify:api-parity` fails on ordering alone, so every read normalizes through
// `orderCourtTags` rather than trusting whatever order the DB row happens to hold.
// ─────────────────────────────────────────────────────────────────────────────

export const COURT_TAGS = [
  'Sea View',
  'Beach Club',
  'Mountains',
  'Lakeside',
  'Garden',
  'Historic',
  'Jungle',
  'Island',
  'Rooftop',
  'Countryside',
] as const satisfies readonly CourtTag[];

/**
 * Normalize a stored tag list to the canonical vocabulary order, dropping
 * duplicates and any value outside the closed vocabulary. Mirrors
 * `orderCourtTags` in @tennis/contracts.
 */
export function orderCourtTags(tags: readonly string[]): CourtTag[] {
  const present = new Set(tags);
  return COURT_TAGS.filter((tag) => present.has(tag));
}
