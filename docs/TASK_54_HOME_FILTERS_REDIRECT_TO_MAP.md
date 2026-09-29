# TASK 54 — `#home-categories` shortcuts + `#home-search`'s filter modal: apply on `/map`, not on Home

**Model: Sonnet 5, reasoning effort: medium.**

## Context

Today, both filter entry points on Home narrow Home's OWN in-memory court list —
they never navigate:

- **`#home-categories`** (`HomeShortcutsRow.tsx`) — tapping a circular shortcut
  (Resorts, Sea View, Clay courts, …) toggles that value in Home's local
  `CourtFilterState` (owned by `HomeExplorer`), which re-narrows the Featured strip
  in place.
- **`#home-search`**'s filter icon opens the shared `FilterSheet` (also mounted by
  the Map screen). On Home, hitting "Show results" commits the sheet's draft into
  that same local state — again, no navigation.

Ask: both should instead **redirect to `/map` with the equivalent filter applied**
— tapping a shortcut, or applying the sheet from Home, should land the visitor on
the Map screen already filtered, not on a narrowed version of Home's own (much
shorter) list.

**Why this is a bit more than swapping an `onClick`**: `/map` today only accepts
one URL param, `?q=` (free text — this is how the Collections "By Country" strip
already links here, confirmed in `app/map/page.tsx`'s own header comment). None of
the five chip dimensions (`tags`, `surface`, `access`, `indoorOutdoor`, `scenic`)
can be seeded from the URL yet. This task widens that seed to the full
`CourtFilterState`, then points Home's two filter entry points at it.

**Map's own quick-filter row (`MapFilterBar`/`MAP_QUICK_FILTERS`) is NOT part of
this task** — it already lives on `/map` and toggles the same local
`CourtFilterState` in place; there is no reason for it to navigate to itself.
Nothing there changes.

## Part 1 — a shared `CourtFilterState` ⇄ URL mapping

### `apps/web/src/components/filters/court-filter-state.ts` — add these exports

This file already states its own purpose: one framework-free definition every
consumer derives from, so nothing drifts. Add the URL mapping here, next to
`toCourtQuery` (which this is NOT the same thing as — see the note below).

```ts
// ─────────────────────────────────────────────────────────────────────────────
// State ⇄ URL (Task 54) — lets a filter chosen on Home hand off to /map already
// applied, instead of narrowing Home's own (much shorter) in-memory list.
//
// NOT `toCourtQuery`: that function's shape is dictated by `GET /v1/courts`'s
// SINGLE-VALUE-per-dimension limitation (see its own comment above). This mapping
// is a purely CLIENT-SIDE seed for MapExplorer's own `narrowCourts`, which already
// supports multiple values per dimension today — so every dimension here may
// carry more than one value, with no "unsupported" caveat.
// ─────────────────────────────────────────────────────────────────────────────

/** One raw query value, in whatever shape Next's `searchParams` hands it back. */
type RawSearchParamValue = string | string[] | undefined;

/** Serialize a filter selection into `/map` query params (comma-joined per dimension). */
export function filterStateToSearchParams(state: CourtFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of DIMENSION_KEYS) {
    const values = state[key] as readonly unknown[];
    if (values.length > 0) params.set(key, values.map(String).join(','));
  }
  const q = state.q.trim();
  if (q) params.set('q', q);
  return params;
}

/** `filterStateToSearchParams`, joined into a ready `/map` (or `/map?...`) href. */
export function filterStateToMapHref(state: CourtFilterState): string {
  const qs = filterStateToSearchParams(state).toString();
  return qs ? `/map?${qs}` : '/map';
}

const VALID_TAGS = new Set<string>(COURT_TAGS);
const VALID_SURFACES = new Set<string>(SurfaceEnum.options);
const VALID_ACCESS = new Set<string>(AccessTypeEnum.options);
const VALID_INDOOR_OUTDOOR = new Set<string>(IndoorOutdoorEnum.options);

function splitValues(raw: RawSearchParamValue): string[] {
  if (raw === undefined) return [];
  // A repeated `?tags=a&tags=b` collapses to Next's array form; take the first
  // (matches `map/page.tsx`'s existing tolerance for a repeated `?q=`). A single
  // param can ALSO carry a comma-joined list — that's how this module itself
  // writes multiple values — so split on comma either way.
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string'
    ? first.split(',').map((v) => v.trim()).filter(Boolean)
    : [];
}

/**
 * Parse `/map`'s raw `searchParams` object back into a full `CourtFilterState`.
 * UNTRUSTED URL INPUT: every chip value is checked against its real contract enum;
 * anything unrecognized is silently DROPPED, never coerced or thrown on — the same
 * philosophy `map/page.tsx` already documents for a non-string `q`.
 */
export function parseCourtFilterSearchParams(
  raw: Record<string, RawSearchParamValue>,
): CourtFilterState {
  const tags = splitValues(raw.tags).filter((v): v is CourtTag => VALID_TAGS.has(v));
  const surface = splitValues(raw.surface).filter((v): v is Surface => VALID_SURFACES.has(v));
  const access = splitValues(raw.access).filter((v): v is AccessType => VALID_ACCESS.has(v));
  const indoorOutdoor = splitValues(raw.indoorOutdoor).filter(
    (v): v is IndoorOutdoor => VALID_INDOOR_OUTDOOR.has(v),
  );
  const scenic: boolean[] = splitValues(raw.scenic).includes('true') ? [true] : [];
  const qRaw = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const q = typeof qRaw === 'string' ? qRaw : '';

  return { tags, surface, access, indoorOutdoor, scenic, q };
}
```

`DIMENSION_KEYS`, `COURT_TAGS`, `SurfaceEnum`/`AccessTypeEnum`/`IndoorOutdoorEnum`
are all already defined/imported in this file — no new imports needed for this
part.

### `apps/web/src/components/filters/index.ts` — export the three new functions

Add `filterStateToSearchParams`, `filterStateToMapHref`, and
`parseCourtFilterSearchParams` to the existing named re-export list, alongside
`toCourtQuery` etc.

## Part 2 — `/map` accepts the full filter state from the URL, not just `q`

### `apps/web/src/app/map/page.tsx`

```tsx
import { parseCourtFilterSearchParams, repositories... } // adjust import grouping as the file already has it
```

Widen the `searchParams` type and replace the `q`-only extraction:

```tsx
export default async function MapPage({
  searchParams,
}: {
  // Next 15: `searchParams` is async and must be awaited. Every chip dimension
  // (`tags`, `surface`, `access`, `indoorOutdoor`, `scenic`) plus the free-text `q`
  // can arrive here now (Task 54) — Home's shortcut row and filter sheet both link
  // here pre-filtered instead of narrowing Home's own much smaller in-memory list.
  // Parsed by the shared, framework-free `parseCourtFilterSearchParams`
  // (components/filters), which validates every chip value against its real
  // contract enum and drops anything unrecognized — untrusted URL input is never
  // trusted blindly. Still an INITIAL value only: MapExplorer remains the single
  // owner of the live filter state (unchanged from the `q`-only behavior before
  // this task).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [courts, pins, { signedIn, viewerIsEntitled }, params] = await Promise.all([
    repositories.courts.list(),
    repositories.courts.getMapPins(),
    getViewerAuthState(),
    searchParams,
  ]);

  const initialFilters = parseCourtFilterSearchParams(params);

  return (
    <AppShell unlocked={viewerIsEntitled} signedIn={signedIn}>
      <MapExplorer
        courts={courts}
        pins={pins}
        initialFilters={initialFilters}
        viewerIsEntitled={viewerIsEntitled}
      />
    </AppShell>
  );
}
```

Update the file's own header comment (currently documents the `?q=`-only Feature
76 behavior) to describe the widened scope.

**The Collections "By Country" strip's existing `/map?q=<country>` links need NO
change** — a bare `?q=` still parses to exactly the same result as before
(everything else empty, `q` set), confirmed by `parseCourtFilterSearchParams`
above.

### `apps/web/src/features/map/MapExplorer.tsx`

Replace the `initialQuery` prop with a full `initialFilters` prop:

```tsx
export interface MapExplorerProps {
  courts: CourtSummaryDTO[];
  pins: MapPinDTO[];
  /**
   * The filter state to START with (Task 54; previously `initialQuery`, `q`-only).
   * Supplied by `app/map/page.tsx` from the URL — see `parseCourtFilterSearchParams`.
   * Defaults to fully empty, so every entry point to /map with no query params is
   * unchanged.
   *
   * SEED ONLY, NOT A CONTROLLED VALUE: this is the initial value of this component's
   * own filter state, and nothing here writes it back to the URL or re-reads it.
   * MapExplorer stays the single owner of the live filter state — typing in the
   * search box, toggling a chip, or hitting "reset" all behave exactly as before,
   * and reset clears back to EMPTY (not back to the seed), because reset means
   * "show everything".
   */
  initialFilters?: CourtFilterState;
  viewerIsEntitled?: boolean;
}

export function MapExplorer({
  courts,
  pins,
  initialFilters,
  viewerIsEntitled = false,
}: MapExplorerProps) {
  const router = useRouter();

  const [filters, setFilters] = useState<CourtFilterState>(
    () => initialFilters ?? EMPTY_COURT_FILTER_STATE,
  );
  ...
```

Update the file's header comment's Feature-76 paragraph the same way (it
currently only describes `?q=` seeding a search string — generalize it to
describe the full filter-state seed, keeping the existing "seed only, not a
controlled value, reset still clears to empty" guarantees, which are unchanged).

## Part 3 — `#home-categories`: shortcuts become plain navigation, not local toggles

Since tapping a shortcut now LEAVES Home immediately, there is no longer a
meaningful "this shortcut is currently active" state to show on Home itself (by
the time you could see it lit, you've already navigated away) — so this becomes a
static row of links, not a controlled toggle group.

### `apps/web/src/features/home/HomeShortcutsRow.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';
import { PendingCardLink } from '@/components/navigation';
import {
  EMPTY_COURT_FILTER_STATE,
  filterStateToMapHref,
  toggleFilterValue,
} from '@/components/filters';
import { HOME_SHORTCUTS } from './home-shortcuts';

// [... GLYPHS / ShortcutGlyph unchanged ...]

export interface HomeShortcutsRowProps {
  /**
   * Home's current free-text query (Task 54) — carried into each shortcut's
   * `/map?...` link so a visitor who already typed something and then taps a
   * shortcut lands on Map with BOTH narrowings applied, not just the shortcut's.
   */
  queryText?: string;
}

export function HomeShortcutsRow({ queryText = '' }: HomeShortcutsRowProps) {
  return (
    <section className="pt-5 home-categories" id="home-categories">
      <div className="container-page">
        <div
          className="no-scrollbar flex gap-1 md:gap-3 overflow-x-auto pb-0.5 md:justify-around"
          role="group"
          aria-label="Filter courts by experience"
        >
          {HOME_SHORTCUTS.map((shortcut) => {
            const href = filterStateToMapHref(
              toggleFilterValue(
                { ...EMPTY_COURT_FILTER_STATE, q: queryText },
                shortcut.option.key,
                shortcut.option.value,
              ),
            );
            return (
              <PendingCardLink
                key={shortcut.id}
                href={href}
                ariaLabel={`${shortcut.label} — view on the map`}
                className="flex min-w-[64px] shrink-0 flex-col items-center gap-2 py-1"
              >
                <span
                  className="flex h-[52px] md:h-[70px] w-[52px] md:w-[70px] items-center justify-center rounded-pill border border-ink/10 bg-paper text-stone transition-colors"
                  style={{ boxShadow: '0 1px 4px rgba(15,15,15,0.08)' }}
                >
                  <ShortcutGlyph id={shortcut.id} className="md:w-[30px] md:h-[30px]" />
                </span>
                <span className="text-center text-[11px] md:text-[14px] leading-tight text-stone">
                  {shortcut.label}
                </span>
              </PendingCardLink>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- `state`/`onToggle` props and the whole `active`/`aria-pressed`/ink-inverted chip
  look are removed — there is no "currently selected" shortcut on Home anymore.
- `toggleFilterValue(state, shortcut.option.key, shortcut.option.value)` on an
  EMPTY seed is the same call shape `handleToggleShortcut` already used today (see
  Part 4) — it type-checks the same way, just building a throwaway one-off state
  to feed the URL serializer instead of committing it to React state.
- Update the file's header comment: the "SHARED STATE, NOT A SECOND VOCABULARY"
  and "PENDING STATES... local UI toggle" paragraphs are now WRONG (a shortcut
  tap is a real navigation, Task 54) — replace them with a short paragraph
  explaining shortcuts now link straight to `/map` with the equivalent filter
  pre-applied, using `PendingCardLink` per the "whole-tile navigates" rule
  (CLAUDE.md §4 rule 1), not a local toggle.

## Part 4 — `HomeExplorer.tsx`: wire the new behavior, remove what's now dead

### `apps/web/src/features/home/HomeExplorer.tsx`

Add `useRouter` and the new import:

```tsx
import { useRouter } from 'next/navigation';
import {
  FilterSheet,
  EMPTY_COURT_FILTER_STATE,
  countActiveFilters,
  filterStateToMapHref,
  hasAnyFilter,
  narrowCourts,
  type CourtFilterState,
} from '@/components/filters';
```

Note `isOptionSelected`, `toggleFilterValue`, and `HOME_SHORTCUTS` are dropped
from this file's imports — see below.

Replace `handleToggleShortcut` and `handleApplyFilters`:

```tsx
const router = useRouter();

// handleToggleShortcut is REMOVED — HomeShortcutsRow now builds its own /map
// hrefs directly (Task 54) and needs no callback from here.

const handleApplyFilters = useCallback(
  (next: CourtFilterState) => {
    setSheetOpen(false);
    router.push(filterStateToMapHref(next));
  },
  [router],
);
```

Update the two render call sites:

```tsx
<HomeShortcutsRow queryText={filters.q} />

{/* ... */}

<FilterSheet
  open={sheetOpen}
  state={filters}
  onApply={handleApplyFilters}
  onClose={handleCloseSheet}
  primaryCtaLabel="View on map"
/>
```

**Simplify `stripTitle` — it is now partly dead code.** Today it lights up a
shortcut's own label as the strip heading when that shortcut is "active" in local
state; after this task, NO shortcut can ever be active in Home's local state
(shortcuts navigate away instead of setting it), so that branch can never fire
again. Replace:

```tsx
const stripTitle = useMemo(() => {
  const lit = HOME_SHORTCUTS.filter((shortcut) => isOptionSelected(filters, shortcut.option));
  if (lit.length === 1 && lit[0]) return lit[0].label;
  if (isFiltered) return 'Courts';
  return 'Featured courts';
}, [filters, isFiltered]);
```

with:

```tsx
const stripTitle = isFiltered ? 'Courts' : 'Featured courts';
```

(`isFiltered` still reflects the free-text query, which is UNCHANGED by this
task — see "Do not touch" below.)

After these edits, `HOME_SHORTCUTS`, `isOptionSelected`, and `toggleFilterValue`
are no longer referenced anywhere in `HomeExplorer.tsx` — remove their imports
(a leftover unused import will fail lint/build).

**Not required by this task, but flag it in the report**: `activeCount`
(`countActiveFilters(filters)`, which feeds the badge on `#home-search`'s filter
icon) will now always read `0` on Home, since nothing in the UI ever populates a
chip dimension in Home's local state anymore — only `filters.q` can still change,
and `countActiveFilters` deliberately does not count free text. The badge simply
never shows now, which is arguably correct (nothing is "still applied" on Home
after a filter hands off to Map), but `activeCount`/the badge markup in
`HomeSearchBar.tsx` becomes vestigial. Leave it as-is for this task (removing it
touches `HomeSearchBar`'s public prop surface, which is out of scope here) — just
say so plainly in the report so it isn't mistaken for something missed.

## Do not touch

- `MapFilterBar.tsx` / `MAP_QUICK_FILTERS` — Map's own quick-filter row. It's
  already on `/map`, already toggles the shared `CourtFilterState` locally, in
  place — there's no reason for it to navigate to itself. Unchanged.
- `FilterSheet.tsx`'s draft-then-apply engine, focus trap, accessibility, and
  overall "purely local UI, feature-agnostic" design — unchanged, other than
  adding the one new optional `primaryCtaLabel` prop (see below). It still does
  not know or care whether its host's `onApply` commits locally or navigates.
- `HomeSearchBar.tsx`'s free-text inline results panel (the dropdown showing
  matching courts while typing, each linking straight to its own court page) —
  entirely unrelated to this task; still narrows Home's own array and stays on
  Home. Only the FILTER-ICON-opened sheet's apply behavior changes.
- Collections' "By Country" `/map?q=<country>` links — already compatible with
  the widened parser, no edit needed.
- `toCourtQuery` / the `GET /v1/courts` wire query and its documented
  single-value-per-dimension limitation — untouched; the new URL mapping is a
  separate, client-only concern (see Part 1's header note).
- `home-shortcuts.ts` (`HOME_SHORTCUTS` data, the `HomeShortcut` type) — the
  shortcut definitions themselves are unchanged; only how `HomeShortcutsRow`
  consumes them changes.

## One addition to the shared `FilterSheet` component

### `apps/web/src/components/filters/FilterSheet.tsx`

Add an optional label override so the primary button can say what will actually
happen on each host screen (defaults preserve Map's existing wording exactly):

```tsx
export interface FilterSheetProps {
  open: boolean;
  state: CourtFilterState;
  onApply: (next: CourtFilterState) => void;
  onClose: () => void;
  /**
   * Label for the primary commit button. Defaults to "Show results" (Map's own
   * in-place apply, unchanged). Home passes "View on map" (Task 54) since
   * applying there now NAVIGATES to /map instead of narrowing Home's own list in
   * place — the label should say what will actually happen.
   */
  primaryCtaLabel?: string;
}

export function FilterSheet({
  open,
  state,
  onApply,
  onClose,
  primaryCtaLabel = 'Show results',
}: FilterSheetProps) {
  // ...unchanged...
  return createPortal(
    // ...unchanged...
          <button type="button" onClick={handleApply} className="btn btn-primary w-full">
            {primaryCtaLabel}
          </button>
    // ...unchanged...
  );
}
```

Map's own `<FilterSheet ... />` call site is NOT touched — it keeps the default
"Show results" by omitting the new prop.

**Worth flagging, not blocking**: from Home, this button now sometimes triggers a
real page navigation rather than purely local state — CLAUDE.md §4's pending-state
convention generally wants navigation-triggering controls to show pending
feedback (`PendingButton`/similar). `FilterSheet` is shared with Map, where the
SAME button stays purely local, so it can't unconditionally become a
`PendingButton`. Note this in the report as a possible follow-up (e.g. accepting
an optional `pending` flag from the host) rather than solving it as part of this
task — Next's own route-transition indicator is the fallback in the meantime.

## Testing

- `#home-categories`: tapping any shortcut (e.g. "Sea View") navigates straight to
  `/map`, landing already filtered to that value (confirm via the Map filter
  badge/count and the visible pins/list).
- Type something in Home's search field (e.g. "France"), THEN tap a shortcut: the
  resulting `/map?...` URL carries BOTH the text query and the shortcut's filter,
  and Map shows the combined narrowing.
- `#home-search`'s filter icon still opens the same sheet on Home; picking one or
  more chips and pressing the primary button ("View on map") navigates to `/map`
  with all of them applied (multi-value per dimension works, e.g. two Experience
  tags both narrow Map with OR-within-dimension, matching the existing
  `narrowCourts` semantics).
- Opening the sheet with an empty draft and pressing the primary button navigates
  to plain `/map` (no query string) — same as pressing it with nothing selected
  today, just landing on Map instead of clearing Home's own list.
- The SAME sheet, opened from `/map` itself (`MapFilterBar`'s filter control),
  still says "Show results" and still applies in place — unchanged.
- `/map?q=<country>` links from Collections still work exactly as before.
- A hand-typed `/map?tags=NotARealTag&surface=Clay` loads without error — the
  invalid `tags` value is dropped, `surface=Clay` still applies.
- Home's own Featured-strip narrowing by free-text search (no shortcuts involved)
  is completely unchanged.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean — pay particular attention to
  the now-unused imports removed from `HomeExplorer.tsx` and `HomeShortcutsRow.tsx`.

## Report

Confirm both entry points navigate to `/map` with the correct filter(s) applied,
confirm the URL scheme round-trips (state → href → parsed-back state) for every
dimension including multi-value cases, confirm `MapFilterBar`/Map's own sheet
usage is unchanged, and confirm which now-dead code you removed vs. left in place
(`stripTitle`, the `activeCount` badge note above) and why. No git commit or push
unless asked.
