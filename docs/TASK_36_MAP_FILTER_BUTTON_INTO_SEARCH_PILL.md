# TASK 36 — /map: move the Filters button into the search pill, like Home's search bar

**Model: Sonnet 5, reasoning effort: medium.**

## Context

On Home (`HomeSearchBar.tsx`), the filter control lives **inside** the search pill itself:
one rounded field containing, left to right, the search glyph → input → (clear button when
non-empty) → a 1px divider → the filter icon button (with its active-count badge). One
visual unit, no separate button.

On `/map` (`MapFilterBar.tsx`), the search field and the Filters button are **two separate
elements**: a search pill (`max-w-[480px]`) and, next to it in the same flex row, a group
containing the quick-filter chips PLUS a standalone "Filters" button. That button is styled
with the exact same `.filter-pill` class as the quick-filter chips themselves (border,
13px, pill radius — see `globals.css` `.filter-pill`), so visually it reads as just another
chip sitting in the same crowded row as the real quick-filter chips — which is the
"наезжает на другие фильтры" the user is seeing.

**The fix, per the user's explicit instruction: mirror Home's structure.** Move the Filters
button out of the chip row and into the search pill, the same way Home does it. This is a
structural change (where the button lives), **not** a full visual reskin — Map's search
pill keeps its own established look (bordered, `bg-ivory`, `h-11`); only Home's own
"button embedded in the pill, after a divider" pattern is what's being copied.

## 1. `MapFilterBar.tsx` — restructure

**Current** (relevant excerpt):

```tsx
<div className="mx-auto block container-page items-center gap-3 md:flex">
  <div className="pill mb-3 flex h-11 max-w-[480px] flex-1 items-center gap-2.5 border border-hairline bg-ivory px-4 md:mb-0">
    {/* search glyph + input only */}
  </div>
  <div className="flex min-w-0 shrink-0 items-center gap-2">
    <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto" role="group" aria-label="Quick filters">
      {/* MAP_QUICK_FILTERS chips */}
    </div>
    <button ... className="filter-pill shrink-0 gap-2">
      <FilterGlyph /><span>Filters</span>{badge}
    </button>
  </div>
</div>
```

**New structure** — two stacked rows at every width (search pill, then quick chips below
it — not side-by-side on desktop anymore, since nothing needs to share the pill's row once
the button moves inside it):

```tsx
<div className="mx-auto container-page">
  <div className="pill flex h-11 max-w-[480px] items-center gap-2.5 border border-hairline bg-ivory px-4">
    <span className="shrink-0 text-stone"><SearchGlyph /></span>
    <input
      type="search"
      value={state.q}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search courts, cities, countries…"
      aria-label="Search courts"
      className="body-m w-full min-w-0 border-none bg-transparent text-ink outline-none placeholder:text-stone"
    />
    {/* Divider + filter button — copied structure from HomeSearchBar.tsx. */}
    <span aria-hidden className="h-5 w-px shrink-0 bg-mist/50" />
    <button
      type="button"
      onClick={onOpenSheet}
      aria-haspopup="dialog"
      aria-label={activeCount > 0 ? `Filters, ${activeCount} selected` : 'Filters'}
      className="flex shrink-0 items-center gap-1.5 p-1.5 text-ink transition-opacity hover:opacity-70"
    >
      <FilterGlyph />
      {activeCount > 0 ? (
        <span aria-hidden className="filter-pill-badge">{activeCount}</span>
      ) : null}
    </button>
  </div>

  <div
    className="no-scrollbar mt-3 flex gap-2 overflow-x-auto"
    role="group"
    aria-label="Quick filters"
  >
    {MAP_QUICK_FILTERS.map((option) => { /* unchanged chip rendering */ })}
  </div>
</div>
```

Points to get right, don't gloss over:

- **The visible "Filters" text label is dropped.** Home's embedded button is icon +
  optional badge only, no text — the accessible name comes entirely from `aria-label`. This
  is a deliberate, direct consequence of "make it the same as Home," not an oversight —
  don't try to keep the label and just move the button, that wouldn't match Home's actual
  pattern.
- **Drop `max-w-[480px]`'s role as a width-sharing constraint.** It existed so the pill
  wouldn't crowd the adjacent chips+button group when they shared one row. Now nothing
  shares that row. Whether to keep `max-w-[480px]` (so the pill still doesn't stretch to the
  full container on wide desktop) or drop it (full-width, closer to Home's own uncapped
  pill) is a visual call — **check both against this page's actual desktop layout** (the
  list-panel/canvas split, unlike Home's simpler single-column layout) and keep whichever
  looks intentional, not stretched or oddly narrow. Note which you picked and why in the
  report.
- **Quick-filter chips now always get their own full-width row**, at every breakpoint —
  today they only got their own visual space next to a shrink-0 button on desktop and
  stacked below the pill on mobile (`md:flex`/block split); simplify to one consistent
  two-row layout at all widths rather than keeping the old `md:flex` branching for a
  side-by-side arrangement that no longer applies. Re-check that the `sticky top-[72px]`
  bar's total height still looks right now that it's unconditionally two rows instead of
  conditionally one-or-two.
- Keep the quick-filter chips' own rendering (`.filter-pill`/`is-active` classes, `onClick`,
  `aria-pressed`) completely unchanged — only their container/position moves, not their
  markup.
- `FilterGlyph`/`SearchGlyph` already exist in this file — reuse them, don't duplicate.

## Do not touch

- `HomeSearchBar.tsx` — the reference pattern, not part of this task.
- `MapExplorer.tsx`'s use of `<MapFilterBar state=... onQueryChange=... onToggleOption=...
  activeCount=... onOpenSheet=... />` — the prop interface is unchanged, only the internal
  JSX of `MapFilterBar` itself moves things around. No parent-side edit needed.
- `MAP_QUICK_FILTERS`, `isOptionSelected`, `optionId`, `FilterSheet` — untouched.
- Map's own pill visual style (`border border-hairline bg-ivory`, `h-11`) — keep it as-is;
  this task copies Home's STRUCTURE (button inside the pill, after a divider), not Home's
  colors/shadow/height.
- No clear-button addition. Home's pill shows a clear (✕) control once the query is
  non-empty; Map's pill has never had one and this task doesn't add it — the user's ask was
  specifically about the filter button's placement, not full parity with every Home
  affordance. If that's wanted too, it's a separate, explicit follow-up.

## Testing

- Desktop and mobile: the search pill now visibly contains the filter icon (with its badge
  when `activeCount > 0`) after a small divider, same visual pattern as Home's search bar,
  no separate "Filters" pill-button sitting next to the quick chips anymore.
- Quick-filter chips render on their own row below the search pill, no longer crowded
  against a button — confirm the original "наезжает" (overlap/crowding) is actually gone at
  a few widths (narrow mobile, tablet, wide desktop), not just at one.
- Clicking the filter icon still opens the same `FilterSheet` (`onOpenSheet` unchanged).
- Toggling a quick chip still updates `CourtFilterState` exactly as before (`onToggleOption`
  unchanged) and stays in sync with the sheet.
- Active-chip count badge still shows on the filter icon when `activeCount > 0`, matching
  Home's badge treatment (same `.filter-pill-badge` class, now on a plain icon button
  instead of a `.filter-pill`-styled one — confirm it still looks right on the new,
  border-less button).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

State which choice you made for `max-w-[480px]` (kept vs dropped) and why, based on how it
actually looked on Map's real desktop layout. Confirm the "Filters" text label was
intentionally dropped (not left in by accident) and that the crowding/overlap the user
reported is visually gone, not just structurally rearranged. No git commit or push unless
asked.
