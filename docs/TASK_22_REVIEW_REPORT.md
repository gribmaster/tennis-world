# TASK 22 — REPORT: independent review of Tasks 16–21

**Reviewer model: Opus 5, reasoning effort: high.** Brief: `docs/TASK_22_REVIEW_16_21_OPUS.md`.
Date: 2026-09-11.

**Scope note.** Everything the brief describes as "currently uncommitted in the working tree"
is now committed as `55221d1 google map | pin | filters | gallery`. At review time the working
tree was clean apart from the brief itself. **Nothing in the repository was modified by this
review** — per the brief's "Do not refactor anything you review", every defect below is
described rather than fixed. Harness mutation testing (§8) was run against in-memory copies of
the source, never against the files on disk.

---

## 0. What was run

| Check | Result |
|---|---|
| `pnpm --filter @tennis/web verify:map-autofocus` | **114 / 114** |
| `pnpm --filter @tennis/web verify:ux-pending-states` | **92 / 92** |
| `pnpm verify:api-parity` | **42 / 42** |
| `pnpm --filter @tennis/web typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm --filter @tennis/web build` | clean |

Live checks ran against the already-running dev API + web (`NEXT_PUBLIC_DATA_SOURCE=api`, real
key + Map ID in `apps/web/.env.local`, seeded DB, 12 courts).

Secrets: verified that no tracked file in the repository contains the real API key or Map ID;
`apps/web/.env.example` still carries the two empty shapes only.

---

## 1. Headline findings

### DEFECT 1 — the `fitBounds` max-zoom clamp silently stomps the nearest-court focus zoom

**Files:** `apps/web/src/features/map/CourtMapInner.tsx` — the clamp at lines 563–579, against
`applyFocus` at lines 596–611.

**What's wrong.** `drawMarkers()` arms a one-shot `idle` listener that clamps the viewport to
`FIT_BOUNDS_MAX_ZOOM` (6). `applyFocus()` then animates the camera to `NEAREST_COURT_ZOOM` (17)
over `CAMERA_ANIMATION_MS` (900 ms). While that animation is running the map never settles, so
the pending one-shot `idle` does not fire — it fires **after** the animation completes, observes
zoom 17 > 6, and executes `map.setZoom(6)`. The listener has no way to know that a focus request
has been applied since it was armed.

**User-visible effect on `/map`.** The visitor is centred exactly on the nearest court but left
at **zoom 6 instead of zoom 17** — a country-level view where a street-level view was intended.
Because Task 17's fix re-arms `beginProgrammaticMove()` immediately before that `setZoom`, the
stomping move is *suppressed*, so it is not even reported as an interaction. The focus token has
already been consumed, so nothing retries.

**Evidence.**

1. Observed naturally on the first `/map` load of the review session: centre
   `(45.99, 9.22)` — exactly Grand Hotel Tremezzo's `approxLat`/`approxLng`, i.e. the focus
   target — at `zoom: 6`. The `fitBounds` centre for the 12 seeded courts is `(21.73, 16.48)`,
   so this was unambiguously *the focus's centre with the clamp's zoom*.
2. Reproduced deterministically by replaying the exact sequence against the live map — arm the
   same `addListenerOnce(map, 'idle', clamp)`, then run the same `animateCamera` before that
   idle arrives:

   ```txt
   animation done: z=17.00
   CLAMP fired at z=17.00 -> setZoom(6)
   +400ms  z=6.00 c=45.99,9.22
   +800ms  z=6.00 c=45.99,9.22   (stable thereafter)
   ```

3. It is a race, not deterministic in the wild: whether it bites depends on whether geolocation
   resolves before the map's first post-`fitBounds` `idle`. Warm/cached reloads usually land
   correctly at 17 (observed repeatedly). The failing window is a cold tile load with location
   permission already granted — i.e. a returning visitor's first `/map` view.

**Why it survived prior review rounds.** It is invisible unless the *zoom* is compared against
`NEAREST_COURT_ZOOM`. Task 17 §3's manual round asked only whether the camera moves and whether
the move is animated — both of which are true in the failing case.

**Fix shape (scope as its own change).** Either:

- **(a)** keep the `MapsEventListener` handle returned by `addListenerOnce` in a ref and call
  `google.maps.event.removeListener(...)` at the top of `applyFocus()`; or
- **(b)** capture `const armedToken = appliedFocusTokenRef.current` when arming the listener and
  bail inside the handler if `appliedFocusTokenRef.current !== armedToken` (a focus landed
  since). Option (b) keeps the clamp working for subsequent filter changes.

A blanket `if (cameraAnimationRef.current !== null) return;` guard is **not sufficient** — the
failing case is precisely the `idle` arriving *after* the animation has ended and the ref has
been nulled.

Add harness coverage at the same time: nothing today asserts that a focus zoom survives a
pending clamp.

---

### DEFECT 2 — `verify:map-autofocus`'s variant-B guarantee for the cluster badge is not enforced

The Task 19/20 assertions were mutation-tested by replicating their exact predicates against
mutated in-memory copies of `CourtMapInner.tsx`.

| Mutation | Caught? |
|---|---|
| Drop `renderer: createClusterRenderer(AdvancedMarkerElement),` from `new MarkerClusterer({…})` | **NO** |
| Replace it with `renderer: new DefaultRenderer()` | **NO** |
| Drop `map,` from `new MarkerClusterer({…})` | **NO** |
| Comment out `clusterer.addMarkers(advancedMarkers);` | **NO** |
| Remove `translateY(50%)` from `clusterContent()`'s wrapper | **NO** |
| Remove `display:'inline-block'` from `clusterContent()`'s wrapper | **NO** |
| Re-add direct attach under another name (`for (const mk of …) mk.map = map`) | **NO** |
| Drop the `algorithm:` option | caught |
| Remove `clusterer.clearMarkers();` | caught |
| Remove the `gmp-click` navigation listener | caught |
| Drop the pin photo's explicit `width`/`height` | caught |

Four of these matter:

**2.1 — the `renderer:` gap (serious).** The check that reads *"the cluster badge is a custom
renderer building its own AdvancedMarkerElement content (never the legacy Marker / default
pin)"* only asserts that `createClusterRenderer` **exists** and that its body returns an
`AdvancedMarkerElement`. It never asserts the renderer is passed to the clusterer. Delete the
option and the library falls back to `DefaultRenderer`, whose `render()` — confirmed in
`node_modules/@googlemaps/markerclusterer/dist/index.esm.mjs` — builds
`new google.maps.Marker({ icon: { url: 'data:image/svg+xml;base64,…' } })`: the deprecated
legacy `Marker` with an SVG data URI, i.e. **exactly variant A**. All 114 checks stay green.
This is the one check Task 19 §4 and Task 21 §3 both rely on.
*Fix:* extend the constructor-scoped regex to also require
`/renderer: createClusterRenderer\(AdvancedMarkerElement\),/`.

**2.2 — positive assertions test the raw file, not comment-stripped source.** The harness already
defines `stripComments()` and correctly applies it to the *negative* assertions, but
`clusterer.addMarkers(advancedMarkers);` and `clusterer.clearMarkers();` are matched against raw
source — so a commented-out hand-off passes. This is not hypothetical: Task 21 §1's own
bisection instruction is literally "comment out the hand-off to the clusterer", and a tree left
in that state still reports 114/114.

**2.3 — nothing covers `clusterContent()`'s anchor compensation.** The Task 17 anchor check is
hard-coded to `markerContent`'s `${size}px` wrapper. Given that this exact bug has now been
introduced and re-fixed three times (the dot, the photo pin, the cluster badge), the cluster
wrapper deserves its own assertion.

**2.4 — `NEXT_IMAGE_WIDTHS` is asserted as a literal, never cross-checked against
`next.config.mjs`.** The source comment says "Keep in sync with next.config.mjs if that default
is ever overridden there"; nothing enforces it. A cheap check would read `next.config.mjs` and
assert it does not set `images.imageSizes` (or, if it does, that the arrays match).

Also worth tightening: the "no direct `.map` assignment" negative is a literal-text match on
`advancedMarker.map = map;`, so any rename (`mk.map = map`) slips through, and nothing asserts
`map` is passed to the `MarkerClusterer` constructor at all.

---

## 2. Item-by-item findings

### Item 1 — Coordinate safety: **CLEAN**

- `courtToMarker` (`map-markers.ts:61–70`) still sources `lat`/`lng` from `court.approxLat` /
  `court.approxLng` only. Task 20 added `heroImageUrl` alongside them and touched no geo field.
- Grepped the **whole** of `apps/web/src` — not only the six files the harness reads — for
  `google.maps.places`, `Geocoder`, `DirectionsService`, `DistanceMatrix`, and hand-assembled
  `maps.google.com` / `google.com/maps` URLs. Zero hits.
- `directionsUrl` is rendered verbatim at `CourtDetailLocationPreview.tsx:264` and `:330`.
  Nothing assembles a directions URL from coordinates.
- Confirmed at runtime: of the 17 Google requests `/map` issues, all are JS modules,
  `mapConfigs:batchGet`, `GetViewportInfo` (viewport/tile data) and `gen_204` logging — no
  Places, Geocoding or Directions endpoint.
- `verify:api-parity` 42/42 (public payloads still carry no `lat`/`lng` key at any depth).

### Item 2 — Masked-name invariant: **CLEAN**, verified live on the locked reading

Each accessible name was traced to its actual data source rather than to its variable name:

- `gallery-context.tsx:117` → `courtLabel: courtLabel ?? courtName`; `page.tsx:442` passes
  `courtLabel={maskedControlName}` (`'this court'`) on the locked branch. So `courtLabel`
  genuinely carries the mask; it is not `courtName` under another name.
- `CourtDetailGalleryLightbox` destructures `{ slides, courtName, courtLabel }` and uses
  `courtLabel` for the dialog label and all three buttons; `courtName` appears only in
  `activeAlt`.
- `markerContent()` sets `title`/`aria-label` from its `name` argument, which is `m.name`. On
  Court Detail the locked branch passes `courtName={maskedControlName}` (`page.tsx:525`), so
  even the marker that branch does not build would be masked.
- `clusterContent()`'s `title`/`aria-label` are `` `${count} courts` `` — no court data is in
  scope in that function at all.

**Live, on the locked `/courts/grand-hotel-tremezzo`:**

```txt
h1                = "Unlock to reveal court name"
dialog aria-label = "this court photo 5 of 5"
buttons           = "Close this court photos"
                    "Previous this court photo"
                    "Next this court photo"
img alt           = "Grand Hotel Tremezzo court image 5"   (correct — an alt describes the photo)
```

Scanning the dialog's markup with `alt="…"` stripped found **no** occurrence of the real court
name.

On `/map` and the Saved Wishlist the real name is shown, which is correct and pre-existing
(`CourtCard` shows it too) — the mask is a Court-Detail-only surface.

**Minor, non-blocking:** `"Previous this court photo"` / `"Close this court photos"` read
awkwardly. `maskedControlName` composes well for `"Save this court"` but not for these
possessive forms.

### Item 3 — Variant B everywhere: **CLEAN in the shipped code, UNENFORCED by the harness**

- `createClusterRenderer` returns `new AdvancedMarkerElement({…})`.
- Grepping `apps/web/src/features/**` and `globals.css`: no `styles:` array anywhere, no
  `new google.maps.Marker` anywhere.
- `MarkerClustererOptions` (read from the installed `.d.ts`) has no `styles` field, so the
  clusterer cannot reintroduce one accidentally.
- Verified live: `renderingType: "VECTOR"`, `isAdvancedMarkersAvailable: true`, and cluster
  badges rendered as `<gmp-advanced-marker>` elements carrying `.tw-map-cluster`.
- **But** the harness does not actually hold this for the cluster badge — see Defect 2.1.

### Item 4 — `CLAUDE.md` §4 rule 10: **CLEAN**

Dots, lightbox controls, the swipe gesture and cluster clicks are all synchronous local state,
and all correctly carry no pending/disabled/spinner affordance. Nothing added one that did not
need it. Nothing here is secretly async: the cluster click is a synchronous `map.fitBounds`, the
swipe is pure pointer math, the lightbox only swaps an index.

Two observations, neither a rule violation:

1. A **marker click does navigate**
   (`advancedMarker.addListener('gmp-click', () => router.push(…))`) with no pending affordance.
   This is pre-existing from the Leaflet era and is not a React `<Link>`/`<button>` that rule 9
   covers — but it is the one navigational control in the app with no pending feedback, and
   `verify:ux-pending-states` makes no assertion about it either way.
2. `verify:ux-pending-states` makes **no** source assertions over
   `court-detail/CourtDetailGallery*.tsx` at all (zero matches for `Gallery`/`Lightbox`). Task
   18 §Testing item 7 asked for this to be stated rather than silently skipped: the new lightbox
   currently has no harness coverage of its "purely local UI" property.

### Item 5 — Suppression window / cluster click: **the decision holds** (but see Defect 1)

Confirmed from the installed source that omitting `onClusterClick` yields:

```js
const defaultOnClusterClickHandler = (_, cluster, map) => {
  if (cluster.bounds) map.fitBounds(cluster.bounds);
};
```

invoked from the library's own `gmp-click` listener, entirely outside `beginProgrammaticMove()`.
The cluster click therefore reports through the ordinary, unsuppressed
`center_changed`/`zoom_changed` listeners, exactly as Task 19 §3 intended.

The `fitBounds`-on-load suppression still applies and does not fight it:
`map.addListener('idle', clearSuppression)` is registered at mount, **before** `drawMarkers()`'s
one-shot clamp, so on each idle the general listener clears the window and the clamp then
re-arms before its own `setZoom`. The comment at lines 571–575 describes the real ordering
accurately.

**Task 19 §3's reasoning was argued against and could not be broken.** A cluster click is a
deliberate viewport move; treating it like the zoom-control precedent is right. Verified live
(Item 11) that it genuinely stands the auto-recentre down.

Two residual notes, both judgment calls rather than defects:

- A cluster click landing *inside* an armed grace window (during the 900 ms focus animation, or
  within 1500 ms of a filter change) is suppressed and will not stand the recentre down.
  Harmless today — by then the one-shot focus has already been consumed — but it is the same
  "live trap" shape Task 17 §1 fixed.
- `defaultOnClusterClickHandler` calls `fitBounds` with **no padding**, so pins near the edge of
  the resulting view are half-clipped (pin content extends well past its anchor point).
  Cosmetic; passing a padded `onClusterClick` would fix it at the cost of re-opening §3.

### Item 6 — Anchor compensation: measured on screen, not read

Each rendered element's box centre was compared against its `<gmp-advanced-marker>` host's
bottom edge (where `AdvancedMarkerElement` anchors `content`):

| Element | wrapper box | host box | centre − anchor |
|---|---|---|---|
| Photo pin, `featured`/`exact` (56 px) | 56×56, `inline-block`, `translateY(28px)` | 56 | **dY = 0.00, dX = 0.00** |
| Cluster badge (32 px) | 32×32, `inline-block`, `translateY(16px)` | 32 | **dY = 0.00, dX = 0.00** |
| Photo pin, `open`/`locked` (44 px) | 44×44, `inline-block`, `translateY(22px)` | **45** | **dY = −1.00**, dX = 0.00 |

The pattern is right everywhere, with one measured **1 px upward offset** on the plain
(non-halo) pins: the host box comes out 45 px for a 44 px inline-block, i.e. the inline-block
picks up 1 px of baseline leading inside its block-level host, and `translateY(50%)` resolves
from the *content* box rather than the host box. At a 40 px pin this is not visually
perceptible — a note, not a fix.

`clusterContent()` omits explicit `width`/`height`, which initially looks like the Task 17 bug
re-introduced. **It is not:** `.tw-map-cluster` is `display: flex` (block-level), so the
inline-block wrapper's height is exactly its child's 32 px with no line-box leading — measured
dY = 0. **But it is fragile:** changing `.tw-map-cluster` to `inline-flex` would silently
reintroduce the offset, and per Defect 2.3 no harness check would catch it.

### Item 7 — `/_next/image` optimizer sizing: **the implementer's claim is TRUE**, verified against the file

- `apps/web/next.config.mjs` sets only `images.remotePatterns`. It does **not** override
  `images.imageSizes`.
- Next 15.5.19's `imageConfigDefault` (read from
  `node_modules/next/dist/shared/lib/image-config.js`) is
  `imageSizes: [16, 32, 48, 64, 96, 128, 256, 384]` — byte-identical to `NEXT_IMAGE_WIDTHS`.
- The optimizer validates `w ∈ deviceSizes ∪ imageSizes`, so a 40 px pin (target 80 → snaps to
  96) and a 44 px pin (target 88 → 96) both land on a legal bucket.
- `images.qualities` is `undefined` by default in this version, so `q=70` is accepted. (Next
  only enforces a quality allow-list when `images.qualities` is set — worth knowing before any
  Next 16 bump.)
- Confirmed live: pins request `/_next/image?url=/placeholders/renith-r-…jpg&w=96&q=70` and
  decode at `naturalWidth: 96`.

Two forward-looking notes: (a) nothing enforces the "keep in sync" comment — see Defect 2.4;
(b) `heroImageUrl` resolves to local `/placeholders/…` today, but if production DB images ever
become remote hosts they would need `remotePatterns` entries. The `onerror` handler would catch
the resulting 400 and fall back, so it degrades gracefully rather than breaking.

### Item 8 — New harness checks: see Defect 2

The count is real (114, up from 93) and the Task 20 checks are mostly tight — the
`onerror`-once regex, the photo `inline-block` check and the `gmp-click` check all caught their
mutations. Five of the Task 19 checks are weaker than their descriptions claim.

### Item 9 — Gallery lightbox isolation: **CLEAN**, verified live

- `CourtDetailGalleryLightbox` destructures `{ slides, courtName, courtLabel }` only —
  `setActiveIndex` is never pulled out of context.
- `CourtDetailGalleryStrip`'s `onClick={() => setLightboxIndex(i)}` writes only its own local
  state. It reads `activeIndex` for `isActive`/`aria-current` but never writes it.
- **Live proof:** set the hero to slide 3, opened the lightbox at thumbnail 5, pressed Next
  (→ 1/5, wraparound), ArrowLeft (→ 5/5, wraparound), then Escape. The hero counter read
  `3 / 5` before, during and after. Focus returned to the triggering thumbnail
  (`"Show this court image 3"`) after a real mouse click + real Escape key;
  `body.style.overflow` was locked while open and restored on close.

**Robustness nit:** `onClose={() => setLightboxIndex(null)}` is a fresh function on every render
and sits in the big effect's dependency array, so any parent re-render while the lightbox is
open runs the cleanup (which calls `previouslyFocused.current?.focus?.()`) and then re-enters
the effect. Focus ends up correct but flickers out of and back into the dialog. A `useCallback`
on the strip side would remove it.

### Item 10 — Cluster-click behaviour: **CONFIRMED ON SCREEN**

Zoomed out until a 3-court cluster formed, then clicked it with a real mouse click at its screen
position:

- `location.pathname`: `/map` → `/map` — **it does not navigate.**
- zoom `3 → 8.67`, centre → `(44.78, 8.17)` — a real `fitBounds` on the cluster's own bounds.
- The cluster disappeared and exactly the three grouped courts appeared as individual pins:
  Grand Hotel Tremezzo, Monte-Carlo Country Club, Hotel du Cap-Eden-Roc.

The library-source half the brief also asked for is confirmed above (Item 5):
`defaultOnClusterClickHandler` is `map.fitBounds(cluster.bounds)` in
`@googlemaps/markerclusterer@2.6.2` — a real zoom, not a no-op and not version-ambiguous.

### Item 11 — Outstanding manual/visual checks: **all run, all pass**

- **Photo-pin anchor on screen** — measured in Item 6: 0 px for halo pins and the cluster badge,
  1 px for plain pins.
- **Cluster badge visual** — solid ink circular pill, 32 px, bone bold count text, same drop
  shadow as the pins; clearly distinct from the state-coloured photo rings. Rendered `"3"` and
  `"5"` correctly. The `99+` cap is implemented but untestable with 12 seeded courts.
- **State signal survives the photo swap** — confirmed visually: Lake Como shows a clay ring
  plus pulsing halo (`featured`), Capri a graphite ring (`locked`).
- **Broken-image fallback** — forced a pin's `img.src` to a missing file. `onerror` swapped in
  `/placeholders/ben-hershey-K9HgyI3qmqA-unsplash.jpg` at `w=96` and it decoded
  (`naturalWidth: 96`). Forced a *second* failure: the `usedFallback` guard held — no re-swap,
  no loop. (A twice-failed image leaves a broken glyph, which is the right trade against an
  infinite retry.)
- **Individual pin still navigates after de-clustering** — clicked Grand Hotel Tremezzo →
  `/courts/grand-hotel-tremezzo`.
- **Automatic recentre stands down after a manual cluster click** — delayed
  `navigator.geolocation.getCurrentPosition` by 25 s, remounted `MapExplorer` via client-side
  nav (deliberately without touching the map directly, since a manual `setZoom` would itself
  report as user interaction and contaminate the test), waited for the natural `fitBounds` world
  view (zoom 2, centre `(25.37, 16.48)`), clicked the cluster while the geolocation request was
  still in flight (`geoResolved: false`), then let it resolve. Final state: zoom 6.39 at the
  cluster's bounds — **the map did not jump to the nearest court.**

**Not run live, stated plainly:** the Saved Wishlist map and the entitled/exact Court Detail
marker both need a signed-in (and for the latter, entitled) session, which was not set up. Both
are covered by code path — `SavedWishlistMap.tsx:48` calls `courtToMarker(court)` so
`heroImageUrl` flows automatically, and `CourtDetailLocationPreview` sets it on both hand-built
marker literals — but neither was seen on screen. The unlocked-but-not-entitled Court Detail
preview was also not seen (the court opened was locked; that branch correctly mounted **no**
live map and issued **no** Google request, per Feature 88 §6.1).

### Item 12 — Dependency hygiene: **CLEAN**

- `@googlemaps/markerclusterer@2.6.2` declares **no peer dependencies at all** (only
  `@types/google.maps` as a *dev* dependency), so there is no friction with
  `@googlemaps/js-api-loader@^2.1.1`.
- `pnpm-lock.yaml` resolves it to `fast-equals@5.4.2`, `supercluster@8.0.1`,
  `@types/supercluster@7.1.3` — all installed and matching what the code assumes.

The two API-shape assumptions Task 21 flagged, spot-checked against the installed source:

- `Renderer.render(cluster, stats, map)` is declared 3-arg, but `renderClusters()` itself calls
  `MarkerUtils.setMap(cluster.marker, map)` after invoking the renderer. So
  `createClusterRenderer`'s 2-arg `render(cluster, _stats)` that never sets `.map` is
  **correct** — Task 21 §2's third hypothesis is disproven by the shipped code, not merely by
  the fix happening to work.
- `MarkerUtils.isAdvancedMarker` uses `marker instanceof google.maps.marker.AdvancedMarkerElement`
  — the global, not the cached constructor. Verified live that they are the same object
  (`customElements.get('gmp-advanced-marker') === AdvancedMarkerElement`), and cluster badges
  rendered, so the `instanceof` path resolves correctly under `importLibrary`.

**Worth knowing for later:** `SuperClusterAlgorithm.calculate` uses
`deepEqual(input.markers, this.markers)` (fast-equals) to decide whether to re-cluster. The
current `clearMarkers()` → `addMarkers()` pattern sidesteps it entirely (both comparisons hit a
length mismatch and exit fast). Anyone "optimising" that into a single `addMarkers` on a changed
set would be deep-comparing arrays of DOM custom elements — slow at best.

**Also noted:** the console logs
`<gmp-advanced-marker>: Please use addEventListener with 'gmp-' events instead of addListener.`
on every `/map` load. It comes from both `CourtMapInner`'s own
`advancedMarker.addListener('gmp-click', …)` and the clusterer's internal
`cluster.marker.addListener('gmp-click', …)`. Functional today, deprecated. The app's half is a
one-line change; the library's half is not, so silencing it fully is not available.

---

## 3. One false alarm, recorded so it is not re-chased

Partway through the live round, `/map` loads appeared with a blank basemap and zero markers
attached — `.map` truthy but `content.isConnected === false`, i.e. **Task 21's exact symptom**.

It is **not** an application bug. A clusterer-free probe `AdvancedMarkerElement` constructed by
hand failed identically; the map canvas was stuck at its default 1024×768 while its container
was 772×1074; `requestAnimationFrame` never fired (a `Runtime.evaluate` timeout); and
`document.visibilityState === "hidden"`. The Chrome window had been backgrounded by the
automation, which suspends Google's render loop. Foregrounding the window restored tiles,
markers and clusters immediately.

This is worth recording because it is indistinguishable from the real Task 21 bug at a glance,
and it may well account for some of that round's confusion.

---

## 4. Suggested follow-up scoping

1. **Task 23a (behaviour)** — fix the clamp-vs-focus race (Defect 1), plus a harness check that
   the focus zoom survives an armed clamp.
2. **Task 23b (harness)** — close the five mutation-testing gaps in Defect 2: chiefly the
   `renderer:` / `map:` wiring assertions, `stripComments` on positive assertions, and
   cluster-wrapper anchor coverage.
3. **Optional / cosmetic** — the 1 px plain-pin anchor offset; `fitBounds` padding on cluster
   click; the lightbox `onClose` `useCallback`; the `"Previous this court photo"` phrasing; the
   `addListener` deprecation warning.
