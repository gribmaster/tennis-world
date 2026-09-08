// Home icon-shortcut row definitions (Feature 74).
//
// The prototype's seven circular shortcuts (design_v2_stripped.html:336–344), expressed
// as REAL `CourtFilterState` values instead of the prototype's ad-hoc `matchFilter`
// switch (`c.labels.includes('Sea View')`, `c.surface==='Clay'`, …).
//
// WHY THIS SHAPE: every shortcut is a `CourtFilterOption` — the exact type the shared
// filter module (Feature 73) already uses for a chip. That means a shortcut and a
// FilterSheet chip are literally the same value in the same dimension, so toggling one
// is visible in the other with no translation layer and no second vocabulary. The row is
// a one-tap fast path INTO the shared state, precisely as `MAP_QUICK_FILTERS` is on the
// Map screen — the same pattern, one screen over.
//
// Values are typed against `CourtFilterState`, so a rename in the contract vocabulary
// (`CourtTag`, `Surface`, `AccessType`) breaks the build here rather than silently
// rendering a shortcut that matches nothing.
//
// MAPPING NOTES (prototype → real fields), the two places this is not a literal port:
//   • "Resorts" and "Private" are `access` values (`Resort` / `Private`), not tags. The
//     prototype read them off its own `labels` array, which conflated experience,
//     access and surface into one list; the real data models access as its own field.
//   • "Mountains" is the `CourtTag` value `Mountains` (plural) — the prototype's
//     shortcut id is `mountains` but its FilterSheet group listed a singular "Mountain"
//     that matched no court. The closed tag vocabulary (Feature 72) is authoritative.
// Every other shortcut is a direct `CourtTag` match.

import type { CourtFilterOption } from '@/components/filters';

/** One shortcut: the filter value it toggles plus the glyph the circle renders. */
export interface HomeShortcut {
  /** Stable id for React keys and the section-heading lookup. */
  readonly id: string;
  /** The shared-filter value this shortcut toggles. */
  readonly option: CourtFilterOption;
  /** Label under the circle, and the courts-strip heading while it is active. */
  readonly label: string;
}

export const HOME_SHORTCUTS: readonly HomeShortcut[] = [
  { id: 'resort', label: 'Resorts', option: { key: 'access', value: 'Resort', label: 'Resort' } },
  { id: 'sea', label: 'Sea View', option: { key: 'tags', value: 'Sea View', label: 'Sea View' } },
  {
    id: 'beach',
    label: 'Beach Clubs',
    option: { key: 'tags', value: 'Beach Club', label: 'Beach Club' },
  },
  {
    id: 'mountains',
    label: 'Mountains',
    option: { key: 'tags', value: 'Mountains', label: 'Mountains' },
  },
  { id: 'clay', label: 'Clay courts', option: { key: 'surface', value: 'Clay', label: 'Clay' } },
  {
    id: 'historic',
    label: 'Historic',
    option: { key: 'tags', value: 'Historic', label: 'Historic' },
  },
  {
    id: 'private',
    label: 'Private',
    option: { key: 'access', value: 'Private', label: 'Private' },
  },
];
