// Court filter state — the ONE definition of what every filter chip means.
//
// Feature 73. This module is deliberately framework-free (no React, no JSX) so the
// same definitions back three different consumers without any of them re-stating a
// rule:
//
//   1. `COURT_FILTER_GROUPS` — what the FilterSheet renders (group labels, chip
//      labels, and the state key each chip toggles).
//   2. `toCourtQuery(state)` — the state → `CourtListQuery` mapping, i.e. the query
//      object `CourtRepository.list()` already accepts (plus `tags`, see below). This
//      exists NOW, before anything calls it with a server round-trip, so that moving
//      filtering to the server later is a swap of the data source, not a rewrite of
//      the UI.
//   3. `matchesCourtFilterState(court, state)` — the in-memory predicate the Map
//      screen actually narrows with today.
//
// (2) and (3) are DERIVED FROM THE SAME per-dimension descriptors below
// (`DIMENSIONS`), so the client predicate and the wire query cannot drift: adding a
// dimension means adding one descriptor, and both consumers pick it up. A dimension
// declares how it reads a court (`matches`) and how it writes a query param
// (`toQuery`) side by side, in one place, where a divergence is visible.
//
// WHY CLIENT-SIDE (for now): the Map page fetches the full published set once (~12
// courts) and narrows it in memory. Refetching on every chip toggle would make the
// sheet feel laggy for no gain. The shapes here are the hedge against that decision
// changing.

import {
  AccessType as AccessTypeEnum,
  COURT_TAGS,
  IndoorOutdoor as IndoorOutdoorEnum,
  Surface as SurfaceEnum,
} from '@tennis/contracts';
import type {
  AccessType,
  CourtSummaryDTO,
  CourtTag,
  IndoorOutdoor,
  Surface,
} from '@tennis/contracts';
import type { CourtFilter } from '@/domain/courts';

/**
 * The query object this module produces: the repository's own `CourtFilter`, plus
 * `tags`.
 *
 * WHY THE EXTENSION: Feature 72 added `?tags=` to `GET /v1/courts` (Prisma `hasSome`)
 * but did NOT add a `tags` field to the web-side `CourtFilter`, so
 * `CourtRepository.list()` cannot carry it yet — `HttpCourtRepository.list` builds its
 * query string from an explicit field list that has no `tags` entry, and
 * `MockCourtRepository.list` likewise ignores it. Widening `CourtFilter` and both
 * repositories is a repository change, which this (web-presentation) feature is scoped
 * out of.
 *
 * So the mapping is expressed HERE, in its final wire shape, and the extra field is
 * declared rather than silently dropped. Filtering runs client-side today
 * (`narrowCourts`), so nothing is lost; when the repositories are widened, `tags` moves
 * from this extension into `CourtFilter` and every call site keeps compiling.
 */
export type CourtListQuery = CourtFilter & { tags?: CourtTag[] };

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete filter selection for a court list.
 *
 * Every field corresponds ONE-TO-ONE to a `CourtFilter` / `GET /v1/courts` query
 * parameter (`tags`, `surface`, `access`, `indoorOutdoor`, `scenic`, `q`) — see
 * `toCourtQuery`. The UI is multi-select on every dimension, so the four chip
 * dimensions are arrays even where the API takes a single value today; see the
 * SINGLE-VALUE PARAM GAP note on `toCourtQuery`.
 *
 * `scenic` is a boolean-shaped dimension modelled as an array so the "Setting" group
 * can render Indoor / Outdoor / Scenic as one uniform chip row.
 */
export interface CourtFilterState {
  /** Experience vocabulary (`CourtTag`, Feature 72). Multi-value on the wire. */
  tags: CourtTag[];
  surface: Surface[];
  access: AccessType[];
  indoorOutdoor: IndoorOutdoor[];
  /** `true` present ⇒ scenic-only. Empty ⇒ unconstrained. */
  scenic: boolean[];
  /** Free-text search over name/country/region/setting. */
  q: string;
}

/** The neutral state: nothing selected, no query. */
export const EMPTY_COURT_FILTER_STATE: CourtFilterState = {
  tags: [],
  surface: [],
  access: [],
  indoorOutdoor: [],
  scenic: [],
  q: '',
};

/** The chip-bearing keys of `CourtFilterState` (everything except free text). */
export type CourtFilterChipKey = Exclude<keyof CourtFilterState, 'q'>;

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions — the single definition each consumer derives from
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One filter dimension: the values it can hold, how it reads a court, and how it
 * writes a query param. Keeping `matches` and `toQuery` adjacent is the whole point
 * — the in-memory predicate and the wire query are written together or not at all.
 */
interface FilterDimension<K extends CourtFilterChipKey> {
  readonly key: K;
  /** Does this court satisfy ONE selected value? (OR is applied across values.) */
  readonly matches: (court: CourtSummaryDTO, value: CourtFilterState[K][number]) => boolean;
  /** Write the selected values onto a `CourtFilter`. See the single-value gap note. */
  readonly toQuery: (query: CourtListQuery, values: CourtFilterState[K]) => void;
}

/**
 * OR within a dimension, AND across dimensions.
 *
 * OR-within matches how a chip row conventionally reads (each extra chip WIDENS the
 * results) and mirrors the API's own `tags` semantics, which are `hasSome` for
 * exactly this reason (`apps/api/src/courts/courts.service.ts` — the ten tag values
 * are largely mutually exclusive per court, so AND would return nothing). Applying
 * the same rule to surface/access/setting keeps one mental model across the sheet.
 * AND-across is likewise standard: picking Clay + Resort means clay AND resort.
 */
const DIMENSIONS: { [K in CourtFilterChipKey]: FilterDimension<K> } = {
  tags: {
    key: 'tags',
    matches: (court, tag) => court.tags.includes(tag),
    // The ONLY multi-value param the API accepts today (Feature 72, `hasSome`).
    toQuery: (query, values) => {
      if (values.length > 0) query.tags = [...values];
    },
  },
  surface: {
    key: 'surface',
    matches: (court, surface) => court.surface === surface,
    toQuery: (query, values) => {
      if (values.length === 1) query.surface = values[0];
    },
  },
  access: {
    key: 'access',
    matches: (court, access) => court.access === access,
    toQuery: (query, values) => {
      if (values.length === 1) query.access = values[0];
    },
  },
  indoorOutdoor: {
    key: 'indoorOutdoor',
    matches: (court, value) => court.indoorOutdoor === value,
    toQuery: (query, values) => {
      if (values.length === 1) query.indoorOutdoor = values[0];
    },
  },
  scenic: {
    key: 'scenic',
    matches: (court, value) => court.isScenic === value,
    toQuery: (query, values) => {
      if (values.length === 1) query.scenic = values[0];
    },
  },
};

const DIMENSION_KEYS = Object.keys(DIMENSIONS) as CourtFilterChipKey[];

// ─────────────────────────────────────────────────────────────────────────────
// State → query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a `CourtFilterState` into the query object `CourtRepository.list()` accepts.
 *
 * SINGLE-VALUE PARAM GAP (deliberate, documented, not silent):
 * `tags` is the only dimension the API accepts as multi-value (`?tags=a,b` → Prisma
 * `hasSome`). `surface`, `access` and `indoorOutdoor` (and `scenic`) each take exactly
 * ONE value (`apps/api/src/courts/courts.service.ts`). The UI is multi-select on all
 * of them.
 *
 * What this helper does about it: a dimension with exactly ONE selected value maps
 * straight through. A dimension with TWO OR MORE selected values is NOT sent — the
 * param is omitted and the dimension is reported in `unsupported`. Omitting WIDENS the
 * server result (it returns a superset), so a caller can still apply the exact
 * multi-value rule client-side (`narrowCourts`) over that superset and the user sees
 * the right courts. The alternative — sending an arbitrary one of the selected values
 * — would make the server return a SUBSET, permanently hiding matching courts that no
 * client pass could recover. A superset is recoverable; a subset is not. That is the
 * whole reason for the choice.
 *
 * Closing the gap properly means widening the API's `surface`/`access`/`indoorOutdoor`
 * params to lists (the same `hasSome`-shaped change Feature 72 made for `tags`). That
 * is an API change and out of this feature's scope; until then `unsupported` names
 * precisely what a caller must still narrow itself.
 */
export function toCourtQuery(state: CourtFilterState): {
  query: CourtListQuery;
  /** Dimensions whose multi-select could not be expressed on the wire (see above). */
  unsupported: CourtFilterChipKey[];
} {
  const query: CourtListQuery = {};
  const unsupported: CourtFilterChipKey[] = [];

  for (const key of DIMENSION_KEYS) {
    const values = state[key];
    if (key !== 'tags' && values.length > 1) unsupported.push(key);
    // `toQuery` is keyed to its own dimension; the mapped-type lookup is sound but TS
    // cannot correlate `key` across the two indexed accesses inside a loop.
    (DIMENSIONS[key].toQuery as (q: CourtListQuery, v: readonly unknown[]) => void)(query, values);
  }

  const q = state.q.trim();
  if (q) query.q = q;

  return { query, unsupported };
}

// ─────────────────────────────────────────────────────────────────────────────
// State → client predicate (derived from the SAME dimensions)
// ─────────────────────────────────────────────────────────────────────────────

/** Free-text match over name/country/region/setting — the fields `q` searches. */
export function matchesCourtQuery(court: CourtSummaryDTO, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return (
    court.name.toLowerCase().includes(q) ||
    court.country.toLowerCase().includes(q) ||
    court.region.toLowerCase().includes(q) ||
    court.setting.toLowerCase().includes(q)
  );
}

/** Does one court satisfy the whole state? OR within a dimension, AND across them. */
export function matchesCourtFilterState(
  court: CourtSummaryDTO,
  state: CourtFilterState,
): boolean {
  for (const key of DIMENSION_KEYS) {
    const values = state[key] as readonly unknown[];
    if (values.length === 0) continue;
    const matches = DIMENSIONS[key].matches as (c: CourtSummaryDTO, v: unknown) => boolean;
    if (!values.some((value) => matches(court, value))) return false;
  }
  return matchesCourtQuery(court, state.q);
}

/** Narrow an already-fetched set. The in-memory counterpart of `toCourtQuery`. */
export function narrowCourts(
  courts: readonly CourtSummaryDTO[],
  state: CourtFilterState,
): CourtSummaryDTO[] {
  return courts.filter((court) => matchesCourtFilterState(court, state));
}

// ─────────────────────────────────────────────────────────────────────────────
// State helpers
// ─────────────────────────────────────────────────────────────────────────────

/** How many chips are currently selected (free text is not a chip, so not counted). */
export function countActiveFilters(state: CourtFilterState): number {
  return DIMENSION_KEYS.reduce((total, key) => total + state[key].length, 0);
}

/** Is anything at all narrowing the list (chips or free text)? */
export function hasAnyFilter(state: CourtFilterState): boolean {
  return countActiveFilters(state) > 0 || state.q.trim().length > 0;
}

/** Immutably toggle one value in one chip dimension. */
export function toggleFilterValue<K extends CourtFilterChipKey>(
  state: CourtFilterState,
  key: K,
  value: CourtFilterState[K][number],
): CourtFilterState {
  const values = state[key] as readonly unknown[];
  const next = values.includes(value)
    ? values.filter((existing) => existing !== value)
    : [...values, value];
  return { ...state, [key]: next } as CourtFilterState;
}

/** Clear every chip dimension, PRESERVING the free-text query (the search bar owns it). */
export function clearFilterChips(state: CourtFilterState): CourtFilterState {
  return { ...EMPTY_COURT_FILTER_STATE, q: state.q };
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups — what the sheet renders
// ─────────────────────────────────────────────────────────────────────────────

/** One selectable chip: the dimension it toggles, its value, and its label. */
export interface CourtFilterOption<K extends CourtFilterChipKey = CourtFilterChipKey> {
  readonly key: K;
  readonly value: CourtFilterState[K][number];
  readonly label: string;
}

export interface CourtFilterGroup {
  /** Uppercase group label rendered above the chips. */
  readonly label: string;
  readonly options: readonly CourtFilterOption[];
}

/**
 * The four groups, in render order. Every value is imported from the contract
 * vocabularies — never retyped as a string literal — so a value added to `CourtTag`,
 * `Surface`, `AccessType` or `IndoorOutdoor` appears here with no edit to this file
 * or to the sheet.
 *
 * DIVERGENCE FROM THE PROTOTYPE — deliberate, do not "fix" back:
 *   • No `Carpet` surface. The prototype ships a `chip-surface-carpet` CSS class that
 *     no court uses; adding `Carpet` to the `Surface` enum was DECIDED against
 *     (FEATURE_71_DESIGN_V2_INTAKE §8 Q6).
 *   • Access reads `Resort / Club / Academy / Private` — the real `AccessType` enum —
 *     not the prototype's "Private Club" / "Open" labels, which match no field.
 *   • The prototype's "Setting" group (Coastal / Rooftop / Jungle / Alpine) mixes
 *     experience values into a group with no backing field. Setting here means the two
 *     fields that actually exist: `indoorOutdoor` + `isScenic`. Rooftop and Jungle live
 *     in Experience, where they are real `CourtTag` values.
 * Every chip below filters on a real `CourtSummaryDTO` field. There are no decorative
 * chips.
 */
export const COURT_FILTER_GROUPS: readonly CourtFilterGroup[] = [
  {
    label: 'Experience',
    options: COURT_TAGS.map((tag) => ({ key: 'tags' as const, value: tag, label: tag })),
  },
  {
    label: 'Surface',
    options: SurfaceEnum.options.map((surface) => ({
      key: 'surface' as const,
      value: surface,
      label: surface,
    })),
  },
  {
    label: 'Access',
    options: AccessTypeEnum.options.map((access) => ({
      key: 'access' as const,
      value: access,
      label: access,
    })),
  },
  {
    label: 'Setting',
    options: [
      ...IndoorOutdoorEnum.options.map((value) => ({
        key: 'indoorOutdoor' as const,
        value,
        label: value,
      })),
      // `isScenic` is a boolean field, so its chip is the single value `true`.
      { key: 'scenic' as const, value: true, label: 'Scenic' },
    ],
  },
];

/** Is this option currently selected in `state`? */
export function isOptionSelected(state: CourtFilterState, option: CourtFilterOption): boolean {
  return (state[option.key] as readonly unknown[]).includes(option.value);
}

/** A stable React key / DOM id fragment for an option (`key` + value are unique). */
export function optionId(option: CourtFilterOption): string {
  return `${option.key}:${String(option.value)}`;
}
