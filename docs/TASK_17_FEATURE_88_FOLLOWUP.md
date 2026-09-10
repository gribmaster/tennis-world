# TASK 17 / FEATURE 88 — follow-up: hardening fix + the manual verification round

**Model: Sonnet 5, reasoning effort: high.**

Task:
Feature 88 (Leaflet → Google Maps, variant B) is implemented and reviewed. Three items
remain: one real defect found in review, one unanswered question about your own harness
rewrite, and the manual browser round that could not run before because there was no API
key. A real key and Map ID are now in `apps/web/.env.local`.

Context: `docs/TASK_16_FEATURE_88_GOOGLE_MAPS.md` (the original brief) binds in full,
including its "Do not change" list. `CLAUDE.md` §3 (secrets), §4, §9 bind as always.

---

## 1. DEFECT — the programmatic-move suppression window can clear mid-animation

`CourtMapInner.tsx` registers `map.addListener('idle', clearSuppression)`, and
`clearSuppression` sets `suppressUntilRef.current = 0` unconditionally. Two paths break
because of it:

**Path A — the focus animation.** `applyFocus` calls `beginProgrammaticMove()` and then
`animateCamera`, which calls `map.moveCamera(...)` on every frame for `CAMERA_ANIMATION_MS`
(900 ms). Every one of those frames fires `center_changed` and `zoom_changed`. If the Maps
API emits `idle` at any point between frames, `clearSuppression` zeroes the window and every
remaining frame of *our own* animation is then reported through `reportIfNotProgrammatic` as
a genuine user gesture — so `onUserInteraction` fires and `MapExplorer` sets
`userTookControlRef.current = true`.

**Path B — the fitBounds zoom clamp.** In `drawMarkers`, the `points.length > 1` branch calls
`fitBounds` and registers `google.maps.event.addListenerOnce(map, 'idle', …)` to clamp the
zoom. That `idle` runs `clearSuppression` too, and the clamp's own `map.setZoom(FIT_BOUNDS_MAX_ZOOM)`
then fires an *unsuppressed* `zoom_changed` — again reported as a user gesture.

**Why it is not visible today:** the automatic focus runs at most once per mount
(`autoFocusStartedRef`) and has already completed by the time the flag is wrongly set, and
the manual locate control is deliberately exempt from the flag. So nothing observable
misbehaves right now. Fix it anyway — it is a live trap for the next change that reads
`userTookControlRef`, and the whole point of that machinery is that it reports the truth.

**Fix.** Either approach is acceptable; pick one and say which:

- Make `clearSuppression` a no-op while a camera animation is in flight
  (`if (cameraAnimationRef.current !== null) return;`), **and** re-arm
  `beginProgrammaticMove()` immediately before the clamp's `setZoom` in `drawMarkers`; or
- Replace the boolean-ish time window with an explicit programmatic-move depth counter that
  `animateCamera` and the clamp both increment/decrement, with `idle` clearing only when the
  counter is zero.

Do not solve it by removing the `idle` listener — it is the self-healing backstop for a
no-op move that never fires `idle`, and `verify:map-autofocus` asserts it exists.

**Add coverage.** The harness currently asserts that `idle` clears the window. Extend it to
assert the *guard* as well, so this cannot silently regress. Report the new count.

---

## 2. ACCOUNT FOR THE HARNESS COUNT

Your report said: 78 before, 90 after, made of "6 new module/rename checks + 8 new Feature 88
checks". 78 + 6 + 8 = 92, not 90. So two Leaflet-era checks were dropped or merged and the
report did not say which.

Merging two checks into one can be perfectly legitimate. Silently losing a requirement is not.
Identify the two, state for each whether it was merged (and into which check) or removed (and
why the requirement it covered is still covered elsewhere). If either turns out to be a real
loss, restore it.

---

## 3. THE MANUAL BROWSER ROUND — now unblocked

`apps/web/.env.local` now holds a real `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Run all seven checks from `TASK_16` §Testing and report
each one individually with what you actually observed — not "as expected":

1. `/map` — markers render at approximate positions; changing a filter re-plots without
   re-creating the map; clicking a marker navigates to `/courts/{slug}`.
2. `/map` nearest-court focus — granted → the camera moves to the nearest court and the move
   is *animated*, not an instant jump (this is the `flyTo` replacement; say how it reads);
   denied → the viewport is untouched; **pan the map while the permission prompt is open →
   the automatic recentre stands down.**
3. `/saved` → Wishlist Map tab — saved courts plotted, markers navigate.
4. Court Detail **locked** — the placeholder renders, no live map mounts, no exact coordinate
   in the payload or the DOM, "Unlock to reveal" intact. Confirm in the network tab that the
   locked page issues **no** request to Google at all.
5. Court Detail **unlocked, not entitled** — approximate marker, zoom 6.
6. Court Detail **entitled** — exact marker at zoom 17; "Open in Maps" uses the server's
   `directionsUrl` verbatim.
7. Network tab across all of the above — **no exact coordinate reaches any Google endpoint**
   other than as the single entitled marker's own position.

Prerequisites: Postgres up, API running, seeded. For check 6 you need a signed-in user with
an active `Entitlement` — use the technique in `apps/api/scripts/verify-exact-location.ts`.

---

## 4. VERIFY THE MARKER ANCHOR VISUALLY

`markerContent` compensates for `AdvancedMarkerElement`'s bottom-center anchoring with
`wrapper.style.transform = 'translateY(50%)'`, standing in for Leaflet's
`iconAnchor: [size/2, size/2]`. The technique is right, but Google also applies its own
transforms to the marker container, so this can only be judged on screen.

Zoom in on a known court and confirm the dot sits *on* the point rather than above or below
it. If it is off, fix the anchor properly rather than nudging the pixel value until it looks
close — say what the real offset was.

---

## Secrets

The API key and Map ID live in `apps/web/.env.local` **only**. That file is gitignored; keep
it that way. **MUST NOT** write either value into `.env.example`, any file under `docs/`, any
source file, a commit message, or a log line (`CLAUDE.md` §3). `.env.example` keeps the empty
shapes it already has.

## Do not change

Everything in `TASK_16`'s "Do not change" list still applies. Beyond the §1 fix and the §2
accounting, do not refactor the map feature further, and do not start the map-screen visual
redesign. No git commit or push.

## Report

The fix chosen for §1 and why; the two checks accounted for in §2; all seven manual results
from §3 with what you saw; the anchor verdict from §4; and the harness counts
(`verify:map-autofocus` old → new, `verify:ux-pending-states` 92, `verify:api-parity` 42/42)
plus typecheck, lint and build.
