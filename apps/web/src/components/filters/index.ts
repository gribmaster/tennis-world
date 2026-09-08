// Shared court-filter surface (Feature 73).
//
// Feature-agnostic on purpose: the Map screen consumes this today and Home (Feature
// 74) will consume the SAME `FilterSheet` unchanged. Nothing here imports anything
// screen-specific, and nothing here fetches — the filter STATE lives in whichever
// client boundary owns the screen (e.g. `features/map/MapExplorer.tsx`), and the data
// still comes from that screen's own server page.
export { FilterSheet } from './FilterSheet';
export type { FilterSheetProps } from './FilterSheet';

export {
  COURT_FILTER_GROUPS,
  EMPTY_COURT_FILTER_STATE,
  clearFilterChips,
  countActiveFilters,
  hasAnyFilter,
  isOptionSelected,
  matchesCourtFilterState,
  matchesCourtQuery,
  narrowCourts,
  optionId,
  toCourtQuery,
  toggleFilterValue,
} from './court-filter-state';
export type {
  CourtFilterChipKey,
  CourtFilterGroup,
  CourtFilterOption,
  CourtFilterState,
  CourtListQuery,
} from './court-filter-state';
