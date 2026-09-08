# TASK 06 / FEATURE 73 — Shared FilterSheet + tag-driven filter chips

**Model: Opus 5, reasoning effort: high.**

Task:
Replace the Map screen's single-select six-chip filter with the prototype's multi-dimensional
filter model: a quick-filter chip row plus a bottom-sheet with grouped, multi-toggle chips.
Build it as ONE shared component that Feature 74 will reuse on Home without modification.

Context:
- Read `CLAUDE.md` first — §4 (pending/loading), §9 (scope discipline) bind here.
  Then `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §1.4, §2.1, §2.2 and §8 (the decisions table).
- Prototype: `new design/tennis_world_v2_standalone.html`. **Strip the base64 before reading
  it** — the file is 3.1 MB, ~3.05 MB of it inline PNG:
  ```python
  import re
  src = open('new design/tennis_world_v2_standalone.html', encoding='utf-8', errors='replace').read()
  open('/tmp/d.html','w',encoding='utf-8').write(
      re.sub(r'data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=\s]{200,}', 'data:STRIPPED', src))
  ```
  The filter sheet is duplicated verbatim in `HomeScreen` and `MapScreen` — that duplication
  is exactly what this feature exists to collapse into one component.
- Feature 72 shipped `Court.tags` (closed ten-value `CourtTag` vocabulary in
  `packages/contracts/src/enums.ts`) plus a `GET /v1/courts?tags=` filter. This feature is
  the first consumer.

## What already exists — build on it, do not replace it

- `apps/web/src/app/map/page.tsx` fetches the full published court set and pin list and
  passes them down. **It is the single data boundary. Do not add fetching anywhere else.**
- `apps/web/src/features/map/MapExplorer.tsx` is the single `'use client'` stateful
  boundary. It holds `query` + `activeFilter`, derives `visibleCourts` through a `useMemo`
  over `FILTER_PREDICATE`, and feeds both the list and the markers from that same filtered
  set. **Preserve that architecture** — one state owner, in-memory narrowing, list and
  markers never diverging.
- `apps/web/src/features/map/MapFilterBar.tsx` is presentational and controlled, owning no
  state. Keep it that way.
- `.filter-pill` in `globals.css` (line ~206) is the existing chip style.

## Filtering stays client-side — and why

Keep narrowing in memory over the already-fetched array. With ~12 courts, refetching on
every chip toggle would be slower and would make the sheet feel laggy. **But** the filter
state must be shaped so that moving to the server later is a swap of the data source, not a
rewrite of the component:

- Define a `CourtFilterState` type whose fields correspond one-to-one to the API's query
  parameters (`tags`, `surface`, `access`, `indoorOutdoor`, `scenic`, `q`).
- Write a `toCourtQuery(state)` helper NOW that converts that state into the query object
  `CourtRepository.list()` already accepts, and use it as the single definition of what each
  filter means.
- The client predicate must be derived from the same definition, so the two can never drift.
- **`tags` is the only dimension the API accepts as multi-value today** (Feature 72,
  `hasSome`); `surface`, `access` and `indoorOutdoor` each take a single value
  (`courts.service.ts`). The UI is multi-select for all of them. Handle this honestly:
  document the gap in the helper, and make `toCourtQuery` do something defensible and
  explicit for a multi-select on a single-value param rather than silently dropping it.
  Say in your report what you chose and why.

## The filter groups — every chip must actually filter

Four groups, all grounded in real fields. No speculative chips.

| Group | Values | Backing field |
|---|---|---|
| Experience | the ten `CourtTag` values, in vocabulary order | `tags` |
| Surface | Clay, Hard, Grass | `surface` |
| Access | Resort, Club, Academy, Private | `access` |
| Setting | Indoor, Outdoor, Scenic | `indoorOutdoor` + `isScenic` |

Import the vocabularies from `@tennis/contracts` (`COURT_TAGS`, `Surface`, `AccessType`,
`IndoorOutdoor`) — do not retype the values as string literals in the component. If a value
is ever added to an enum, this UI should pick it up without an edit.

**No `Carpet`** — the prototype's `chip-surface-carpet` CSS is dead (intake §7 Q6, decided).
The prototype's "Private Club"/"Open" access labels and its Coastal/Rooftop/Jungle/Alpine
"Setting" group do not correspond to real fields — use the table above, not the prototype's
labels, and note the divergence in a comment so the next reader doesn't "fix" it back.

## Requirements

1. **`FilterSheet` component.** Modal bottom sheet, built once, feature-agnostic (it must
   not import anything map-specific). Prototype geometry, read the real values from the
   stripped file: top corner radius, the 36x4 mist handle, the "Filters" title, the
   underlined "Clear all", the 11px uppercase 0.08em stone group labels, chip padding/radius,
   the active chip inverting to ink-on-bone, and the full-width primary "Show results"
   button. Use the existing design tokens and `globals.css` primitives — extend
   `.filter-pill` or add one sibling class if needed; **do not introduce a new palette,
   new type scale, or a second button system.**

2. **Draft-then-apply.** The sheet edits a DRAFT copy of the filter state; nothing changes
   behind the sheet while it is open. "Show results" commits the draft and closes; dismissing
   (backdrop, Escape, close control) discards it. "Clear all" empties the draft only. This
   is the prototype's behavior — confirm it against `pendingFilters` in the stripped file.

3. **Quick-filter chip row** in `MapFilterBar`, replacing the current single-select
   `MAP_FILTERS`. It shows a small curated subset as a fast path, reflects state chosen in
   the sheet, and sits alongside a control that opens the sheet. Show the count of active
   filters on that control when any are set. Removing the old `MAP_FILTERS` /
   `MapFilter` exports is expected — update `features/map/index.ts` accordingly and check
   for other importers before deleting.

4. **Wire into `MapExplorer`.** It keeps owning the state — now `CourtFilterState` plus the
   sheet's open/closed flag. Both the list and the markers keep deriving from the one
   filtered set. Preserve the existing nearest-court auto-focus behavior untouched.

5. **Empty state.** Multi-dimensional filters make "no results" reachable in a way the old
   six chips rarely did. Handle it: a calm message with a way to clear the filters, not a
   blank panel.

6. **Pending-state rules — read this before writing a single control.** Per `CLAUDE.md` §4
   rule 10, filter chips, the sheet's open/close, and the tab-like controls here are
   **purely local UI**. They do NOT get `PendingButton`, `PendingLink`, `useElementPending`
   or a spinner — adding one would be wrong. The rule's other clauses still bind: no
   full-page overlay for the sheet (it is a scoped modal, not a blocking loader), and any
   control that *does* navigate keeps its existing primitive. State in your report which
   controls you judged local and why.

7. **Accessibility.** The sheet is a modal: labelled dialog role, focus moved in on open and
   restored on close, focus trapped while open, Escape closes, background scroll locked.
   Chips are toggle buttons with `aria-pressed`. Groups are labelled. None of this is
   optional — the prototype models none of it and it is on you to add.

8. **Small fix while you are here:** `.filter-pill:hover` and `.filter-pill.is-active`
   currently resolve to identical styling, so hovering an inactive chip makes it look
   selected. Give hover its own lighter treatment. This is in scope because it is the exact
   element being restyled; do not wander further into `globals.css`.

Do not change:
- Any API, contract, schema, migration or seed file. This is a web-only feature.
- `apps/web/src/app/map/page.tsx`'s data fetching, or any repository.
- The Home screen — `features/home/**` and `app/page.tsx` are Feature 74. Build `FilterSheet`
  so Home can consume it unchanged, but do not wire it there.
- The Leaflet integration, marker plotting, `map-markers.ts`, `map-config.ts`, or the
  geolocation auto-focus. The map surface itself is Features 85/86.
- The map screen's layout, header, or `.map-layout` height model — decided: the header stays
  solid (intake §8, Q3).
- No package installs. No new dependency for the sheet, focus trap or animation — compose it
  from what is already here.
- No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck` and `build`.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks, must stay green. This is
  the harness most likely to catch a mistake in this feature.
- `pnpm --filter @tennis/web verify:map-autofocus` — proves requirement 4 didn't disturb the
  auto-focus.
- `pnpm lint`.
- Manual pass at 390px and at desktop width: every group toggles, "Clear all" empties the
  draft only, dismissing discards, "Show results" applies, the count badge is right, the
  empty state appears and recovers, and keyboard-only operation works (Tab into the sheet,
  Escape out).

Report back:
1. The `CourtFilterState` shape and the `toCourtQuery` mapping, and how you handled
   multi-select on the API's single-value params.
2. How the client predicate and `toCourtQuery` are kept from drifting.
3. Which controls you classified as purely local UI under §4 rule 10, and why.
4. What you did for focus trap, Escape, scroll lock and labelling.
5. What replaced `MAP_FILTERS` / `MapFilter`, and every file that imported them.
6. The quick-filter subset you chose for the chip row, and your reasoning.
7. Files changed, and pass/fail counts for every check above — naming any you could not run.
