# TASK 24 — Close the mutation-testing gaps in the Task 19 clustering harness checks

**Model: Sonnet 5, reasoning effort: high.**

## Context

The Opus review of Tasks 16–21 (`docs/TASK_22_REVIEW_16_21_OPUS.md`'s report) mutation-tested
`verify-map-autofocus.ts`'s Task 19/20 checks against deliberately broken copies of
`CourtMapInner.tsx` and found several mutations that should fail the harness but don't. I
independently re-confirmed the two most serious ones by re-reading the actual check bodies —
they're real gaps, not a misreading.

## 1. The most serious gap: nothing asserts the cluster renderer is actually wired in

Two existing checks (`verify-map-autofocus.ts`, the Task 19 section) look related but don't
cover this:

- One (around the `createClusterRenderer` name) only asserts that function exists and that its
  body returns `new AdvancedMarkerElement({ position: cluster.position, ...`.
- Another only asserts `new MarkerClusterer(` appears once and isn't re-created inside
  `drawMarkers()`.
- A third extracts the `new MarkerClusterer({...})` constructor call and asserts it does NOT
  contain `onClusterClick:` (Task 19 §3's suppression decision) — but never asserts it DOES
  contain `renderer:` or `map:`.

None of them asserts the constructor call actually PASSES `renderer: createClusterRenderer(...)`
as an option. Delete that one option (or swap it for
`renderer: new DefaultRenderer()`, the library's own default) and all existing checks stay
green — even though the app would then silently fall back to the library's default renderer,
which builds a legacy `google.maps.Marker` with an SVG data-URI icon: exactly variant A, the
thing Feature 88 §1 and every review since has treated as decided-against. This is the one
check Task 19 §4 and Task 21 §3 both lean on being real, and it isn't currently enforced.

**Fix:** extend the constructor-scoped assertion to also require the exact option
(`/renderer: createClusterRenderer\(AdvancedMarkerElement\),/` against the same extracted
`ctorCall` string the `onClusterClick` check already isolates) — and, while there, also assert
`map,` (or `map: map,`) is present as a constructor option, since the same mutation-testing pass
found dropping that option uncaught too.

## 2. Positive assertions test raw source, not `stripComments()` — a commented-out line passes

The harness already has a `stripComments()` helper and correctly uses it for the file's negative
assertions (e.g. the "no leftover Leaflet import" check), but the two clustering hand-off
assertions —

```ts
/clusterer\.addMarkers\(advancedMarkers\);/.test(courtMapInner)
```

and the `clusterer.clearMarkers();` one — test the **raw** `courtMapInner` string. A
commented-out hand-off (`// clusterer.addMarkers(advancedMarkers);`) still matches the regex, so
it still passes. This isn't hypothetical: Task 23's own bisection technique (temporarily
commenting out the clusterer hand-off to test a hypothesis) would leave the tree in a state this
harness reports as 114/114 clean. **Fix:** wrap both in `stripComments(courtMapInner)` the same
way the file's negative checks already do.

## 3. The negative "no direct attach" check is name-specific, not shape-specific

```ts
!/advancedMarker\.map = map;/.test(stripComments(courtMapInner))
```

only catches direct attachment written with the exact variable name `advancedMarker`. Reintroduce
it under a different name (e.g. `for (const mk of advancedMarkers) mk.map = map;`) and the check
still passes, even though every marker is once again bypassing the clusterer entirely. **Fix:**
broaden the pattern to catch the shape regardless of identifier — something like
`/\w+\.map = map;/` scoped to `drawMarkers()`'s body (not the whole file, since `mapRef.current =
map;` and similar legitimate assignments elsewhere shouldn't trip it) — or, more simply, assert
the ONLY three `.map =`/`.map:` assignments in `drawMarkers()` are the ones this task's own fix
expects (the clusterer hand-off and nothing else). Use your judgment on the tightest version
that doesn't produce false positives against legitimate code.

## 4. `clusterContent()`'s anchor compensation has no dedicated check

The existing Task 17 anchor check is hard-coded to `markerContent()`'s `${size}px` wrapper. This
exact class of bug (a `<span>`'s default `display: inline` silently breaking the
`translateY(50%)` math) has now had to be fixed or re-applied three times across this codebase's
history (the original dot, the photo pin, the cluster badge) — the cluster badge's own wrapper
deserves its own assertion rather than relying on the pattern having been copied correctly by
eye. Note from the review: `clusterContent()`'s wrapper currently gets away without explicit
`width`/`height` because its child `.tw-map-cluster` is `display: flex` (block-level), which
happens to produce a correct 0px offset today — but that's fragile (changing `.tw-map-cluster` to
`inline-flex` would silently reintroduce the bug, and nothing would catch it). Add a check for
the wrapper's `inline-block` + `translateY(50%)` pattern in `clusterContent()` specifically, not
just `markerContent()`.

## 5. `NEXT_IMAGE_WIDTHS` isn't cross-checked against `next.config.mjs`

The source comment says "keep in sync with `next.config.mjs` if that default is ever
overridden there" — nothing enforces it. The Opus review confirmed the claim is TRUE today
(`next.config.mjs` only sets `images.remotePatterns`, and Next 15.5.19's real
`imageConfigDefault.imageSizes` is byte-identical to the hardcoded array), but that's exactly the
kind of fact that silently rots. Add a cheap check: read `next.config.mjs` and assert it does not
set `images.imageSizes` (or, if it ever legitimately needs to, that the two arrays still match).

## Do not touch

The application code (`CourtMapInner.tsx`) itself — this task is harness-only. If you find
yourself wanting to change app code to make a check pass, stop and reconsider the check instead;
the app code was already independently verified correct on these points.

## Testing

For each of the five checks you add or tighten: confirm it now CATCHES the exact mutation the
review used to find the gap (temporarily apply that mutation in a scratch copy, confirm the
harness fails, revert). Then confirm the harness is clean (114+N/114+N) against the real,
unmutated source. Report the new total count and, for each of the five items, which mutation you
verified it now catches.

## Report

The five checks added/tightened, the mutation each one now catches (verified, not assumed), the
new harness count, and confirmation `pnpm typecheck`/`lint`/`build` stay clean (this task
shouldn't touch app code, but verify anyway). No git commit or push unless asked.
