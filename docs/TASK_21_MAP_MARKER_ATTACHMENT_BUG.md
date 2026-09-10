# TASK 21 — Markers/clusters report `.map` set but never attach to the DOM

**Model: Sonnet 5, reasoning effort: high.**

## Context

This follows Task 20's report: on `/map`, no individual pins or cluster badges render on
screen (and map tiles looked blank at world zoom), even though DevTools fiber inspection shows
`CourtMapInner` receiving all 12 markers correctly and constructing every
`AdvancedMarkerElement` with correct content. The concrete finding was: every marker's `.map`
property reads as truthy, but its `content`'s underlying `<gmp-advanced-marker>` custom element
is never actually connected to the document (`content.isConnected === false`, confirmed via a
deep shadow-DOM search). Reproduces identically in `next dev` and a clean `next build && next
start`, ruling out a Strict Mode double-effect race.

**I read `CourtMapInner.tsx` as it stands now (Task 19's clustering wiring + Task 20's photo
pins, both in the working tree, neither committed nor screen-verified before now) and want to
record what that review does and doesn't establish, so this task doesn't re-walk ground
already covered:**

- Task 20's own change (`markerContent()`'s dot→photo swap, the `/_next/image` optimizer URL,
  the `img.onerror` fallback) is self-contained: it only changes what DOM goes *into* a marker's
  `content`, not how that marker gets attached to the map. Nothing in it touches
  `clustererRef`, `.map` assignment, or map construction.
- The one thing Task 20 did NOT introduce, but that the report's symptom equally affects, is
  `clusterContent()` / `createClusterRenderer()` — the cluster badge. That function builds a
  plain text badge with **no image, no `heroImageUrl`, nothing Task 20 touched at all** — and
  per the report it fails to attach exactly the same way the photo pins do. That's a strong,
  independently-checkable signal: the one thing an all-text cluster badge and a photo pin
  share is that **both now reach the map only through `clustererRef.current.addMarkers(...)`**
  instead of a direct `advancedMarker.map = map` assignment (which is exactly what
  `drawMarkers()` did before Task 19, and reportedly worked — Task 16/17 had it manually
  verified on screen). That structural coincidence is the strongest evidence pointing at the
  clusterer hookup itself, not at either task's own content changes — but it's evidence, not a
  confirmed root cause. Don't skip the bisection in §1 on the strength of this reasoning alone.

**What I could not do:** I don't have a working shell on this machine right now (the same
`device_bash` mount issue from earlier in this project), and the built-in browser tool
available to me can't reach a local dev server at all — so unlike the last several rounds, I
was not able to independently reproduce or narrow this myself before handing it back. This
brief is source-review-only; treat its hypotheses as starting points for your own live
debugging, not conclusions.

---

## 1. Bisect first — confirm the clusterer is actually the cause before going further

Comment out (or feature-flag) the hand-off to the clusterer and temporarily restore direct
assignment — `for (const m of advancedMarkers) m.map = map;` in place of
`clusterer.addMarkers(advancedMarkers)` — and load `/map` again.

- **If markers now render fine (tiles included):** the clusterer hookup is confirmed as the
  cause. Move to §2 with that certainty instead of a hunch.
- **If markers/tiles are STILL blank even without the clusterer:** the cause is something else
  entirely — unrelated to Task 19 — and blaming the clusterer would send the next round of
  work in the wrong direction. In that case look at map-container sizing at the moment
  `new google.maps.Map(container, {...})` runs (a zero-height/width container at construction
  time is the single most common cause of exactly this symptom pair — blank tiles AND
  overlay-based content, which is what both tiles and `AdvancedMarkerElement` rendering are
  built on, never painting) — check `container.getBoundingClientRect()` right before
  `new Map(...)`, and check whether anything in the `.map-layout`/`.map-canvas-wrap`/
  `.tw-map-surface` CSS chain (recent edits: the Task-18 desktop width cap, Task 19/20's
  changes) could leave it sized 0 at that exact moment on this particular load path.

## 2. If the clusterer is confirmed: check the installed package's actual source, not memory

`@googlemaps/markerclusterer@^2.6.2` is what's installed
(`node_modules/@googlemaps/markerclusterer`). Read its shipped `.d.ts`/source directly rather
than relying on general familiarity with the library — behavior has changed across its major
versions and getting this from the actual installed code is worth more than a remembered API
shape. Specifically look for:

- How it decides a marker is an `AdvancedMarkerElement` vs. a legacy `Marker` before setting
  `.map` (however it does that instanceof/duck-type check, confirm it's checking against the
  *same* `google.maps.marker.AdvancedMarkerElement` constructor reference this file imported
  via `importLibrary('marker')` — this file caches that constructor in
  `advancedMarkerCtorRef`/passes it to `createClusterRenderer`, so if the library's own internal
  check resolves `google.maps.marker.AdvancedMarkerElement` a different way, a mismatch here is
  a real, sharp edge some clusterer versions have had).
- Whether `render()`/`addMarkers()` need the map to have a ready projection
  (`mapCanvasProjection`) before it can compute cluster positions, and whether that's already
  guarded internally (e.g. deferred to the map's `idle` event) or whether THIS code is calling
  `drawMarkers()` (and therefore `clusterer.addMarkers()`) too early — immediately in the same
  `.then()` callback as `new Map(...)`, before the map has necessarily fired its first `idle`.
  If the library doesn't already guard this itself, try deferring the first `drawMarkers()`
  call (or at least the clusterer hand-off) to the map's first `idle` event and see if that
  changes anything.
- The `Renderer.render()` signature it actually declares — if it's
  `render(cluster, stats, map)` (three args) and expects the renderer itself to be the one
  setting `.map` on what it returns (rather than the library doing it afterward for you),
  `createClusterRenderer`'s current `render(cluster, _stats)` (two args, and it never sets
  `.map` on the marker it returns) would be exactly this bug for the cluster badge specifically
  — confirm from the installed types which model it actually is before changing it.

## 3. Whatever the fix, keep it consistent with the existing invariants

Don't lose, while fixing this:

- `new AdvancedMarkerElement(...)` must still be how every marker (individual and cluster) gets
  built — `verify:map-autofocus` asserts this by source regex.
- The cluster-click-not-suppressed decision from Task 19 §3 (default `onClusterClick` left
  unwrapped in `beginProgrammaticMove()`) — don't reintroduce suppression while fixing
  attachment unless the fix genuinely requires it, and say so if it does.
- Task 20's photo-pin content itself (the ring color, halo, `/_next/image` sizing, the
  `onerror` fallback) — none of that should need to change; this bug is about attachment, not
  the content each marker carries.

## Testing

Once markers actually render: re-run everything Task 20's report couldn't complete — the
on-screen anchor check, the no-photo/broken-image fallback, and the cluster-badge visual check
— plus Task 19's own original manual checks (cluster click zooms and doesn't navigate; zooming
further de-clusters; the automatic nearest-court recentre still works and correctly stands down
after a manual cluster click). `pnpm typecheck`/`lint`/`build` and
`pnpm --filter @tennis/web verify:map-autofocus` clean, with the count reported.

## Report

What the bisection in §1 showed; the confirmed root cause (not a guess) with the specific
installed-package detail that explains it; the fix; and the full re-run of Task 19's and
Task 20's manual checks that couldn't be completed before. No git commit or push.
