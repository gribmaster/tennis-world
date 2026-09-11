# TASK 23 — Fix: the fitBounds max-zoom clamp can stomp the nearest-court focus zoom

**Model: Sonnet 5, reasoning effort: high.**

## Context

Confirmed defect from the Opus review of Tasks 16–21 (`docs/TASK_22_REVIEW_16_21_OPUS.md`'s
report), and independently re-confirmed here by re-reading `CourtMapInner.tsx` directly — this
is a real, logically airtight race, not a maybe.

`drawMarkers()`'s multi-marker branch arms a ONE-SHOT `idle` listener to clamp the view to
`FIT_BOUNDS_MAX_ZOOM` (6) after `fitBounds()`:

```ts
map.fitBounds(bounds, FIT_BOUNDS_PADDING_PX);
google.maps.event.addListenerOnce(map, 'idle', () => {
  const currentZoom = map.getZoom();
  if (currentZoom !== undefined && currentZoom > FIT_BOUNDS_MAX_ZOOM) {
    beginProgrammaticMove();
    map.setZoom(FIT_BOUNDS_MAX_ZOOM);
  }
});
```

This listener has no idea a focus request might land before it fires. `applyFocus()` (the
nearest-court auto-focus, or the manual locate control) can start its own 900ms animated camera
move — `animateCamera()`, driven by `map.moveCamera()` inside a `requestAnimationFrame` loop —
while the map hasn't gone idle yet since the initial `fitBounds()`. The map only reaches `idle`
once the animation itself stops requesting frames. When it does, the STALE clamp callback fires,
reads whatever zoom the focus animation landed at (17, `NEAREST_COURT_ZOOM`), sees it's greater
than 6, and calls `map.setZoom(6)` — silently overriding the focus. Because that `setZoom` is
correctly wrapped in `beginProgrammaticMove()` (Task 17's own fix), the stomp itself is
suppressed and never reported as a user interaction either — it just happens, silently.

**Confirmed live** (Opus's report): a cold `/map` load with location permission already granted
lands the visitor centred exactly on the nearest court but at zoom 6 instead of 17. It's a race,
not deterministic — whether it bites depends on whether the fitBounds `idle` and the focus
animation's own completion interleave badly. Warm/cached loads mostly land correctly, which is
exactly why this survived every prior review (Task 17's manual check only asked "does the camera
move, and is it animated?" — it does, so the check passed while sometimes landing at the wrong
zoom).

## The fix

Either of the two shapes below is acceptable — pick one and say which, same as Task 17's own
"pick one and say which" precedent:

**(a)** Keep the `MapsEventListener` handle `addListenerOnce` returns (in a ref), and
`google.maps.event.removeListener(...)` it at the top of `applyFocus()` — so a focus request
that lands cancels any still-pending clamp outright.

**(b)** Capture `const armedToken = appliedFocusTokenRef.current` at the moment the clamp is
armed, and inside the clamp's callback, bail if `appliedFocusTokenRef.current !== armedToken`
(a focus has landed since the clamp was armed). This keeps the clamp usable for LATER filter
changes that don't involve a focus, where (a) would have already thrown the listener away.

**A blanket `if (cameraAnimationRef.current !== null) return;` guard inside the clamp is NOT
sufficient** — the failing case is precisely the `idle` arriving AFTER the animation has already
finished (`cameraAnimationRef.current` is back to `null` by then), so that guard would not catch
it. Don't reach for it.

## Add harness coverage

`verify-map-autofocus.ts` currently has nothing asserting that an applied focus zoom survives a
still-pending fitBounds clamp — that's exactly why this shipped unnoticed. Add a check for
whichever fix shape you land on (e.g. that the clamp callback bails when a newer focus token has
landed, or that the listener handle is captured and removed in `applyFocus`). Report the new
count (currently 114).

## Do not touch

Everything else about the suppression-window machinery, the cluster-click-not-suppressed
decision (Task 19 §3), and the rest of `drawMarkers()`/`applyFocus()` — this is a scoped fix for
one specific race, not a rewrite of the view-control logic.

## Testing

1. Reproduce the failure first, the same way the review did: arm the clamp, then run the focus
   animation before the map's first post-fitBounds `idle` arrives, and confirm today's code
   lands at zoom 6 instead of 17.
2. Apply the fix; confirm the same sequence now lands at the real focus zoom (17).
3. Confirm the clamp still works for its OWN original purpose — a filter change that leaves many
   markers spread wide, with no focus involved, should still clamp to `FIT_BOUNDS_MAX_ZOOM`.
4. Repeat on a cold load with location permission already granted a few times, since the race
   window is timing-dependent — don't rely on a single pass.
5. `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `verify:map-autofocus` clean, count reported.

## Report

Which fix shape you chose and why; the before/after reproduction from §Testing item 1–2; the
harness check you added; and the typecheck/lint/build/harness results. No git commit or push
unless asked.
