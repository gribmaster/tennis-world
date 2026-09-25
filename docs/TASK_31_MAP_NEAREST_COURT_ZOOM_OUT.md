# TASK 31 — Zoom out the nearest-court auto-focus on /map

**Model: Sonnet 5, reasoning effort: low.**

## Context

`/map`'s nearest-court auto-focus (on first visit, if geolocation is granted, the map flies
to the closest court) zooms in too tight. The user wants it noticeably further out.

The zoom level lives in one place: `apps/web/src/features/map/MapExplorer.tsx`, line 64:

```ts
const NEAREST_COURT_ZOOM = 17;
```

Used at line 218 (`setFocus({ ..., zoom: NEAREST_COURT_ZOOM, ... })`) as the target zoom
for both the automatic focus on load AND the manual locate-control click
(`handleLocateClick` → `focusNearestCourt`) — it's the single shared constant for "how
close the map gets when it centers on the nearest court," not two separate values.

## Change

Google/Web Mercator zoom is logarithmic — each whole level doubles the ground distance
visible. Dropping one level (17 → 16) doubles how much area is shown, which is the standard
"noticeably further out" step and the same integer granularity every other zoom constant in
this file already uses (`MIN_ZOOM`/`MAX_ZOOM`/`FIT_BOUNDS_MAX_ZOOM` in `CourtMapInner.tsx`
are all whole numbers — don't introduce a fractional zoom here, it'd be the only one).

```ts
const NEAREST_COURT_ZOOM = 16;
```

That's the whole change. If it still doesn't look right after seeing it live, the next step
is another single-integer nudge (15), not a bigger rework — say so in the report rather than
guessing further on your own.

## Do not touch

- Anything else in `MapExplorer.tsx`/`CourtMapInner.tsx` — this is a one-constant change.
- `FIT_BOUNDS_MAX_ZOOM` (the zoom used when the map auto-fits MULTIPLE markers) — unrelated,
  that's a different code path from the single nearest-court focus.
- The manual locate-control button — it already shares this same constant, so it gets the
  same zoom-out automatically; no separate edit needed for it.

## Testing

- Grant geolocation on a fresh `/map` load — the map centers on the nearest court noticeably
  further zoomed out than before, but still clearly centered on that one court (not zoomed
  out so far it looks like nothing focused).
- Tap the manual locate control — same new zoom level.
- `pnpm typecheck` clean (trivial, but confirm nothing else referenced the old literal).

## Report

Confirm the before/after zoom values and that both the automatic focus and the manual
locate control were visually checked, not just the one code path. No git commit or push
unless asked.
