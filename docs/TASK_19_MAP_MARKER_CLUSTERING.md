# TASK 19 — Google Map marker clustering (Airbnb-style)

**Model: Sonnet 5, reasoning effort: high.**

## Context

Read `CLAUDE.md` first; it binds as always. This touches
`apps/web/src/features/map/CourtMapInner.tsx` — the real Google Maps engine (Feature 88,
variant B: Map ID + `AdvancedMarkerElement`, decided and not open for reconsideration).

**Where this applies, and where it doesn't.** Clustering happens inside
`CourtMapInner`'s `drawMarkers()`, so both multi-marker mounts get it automatically with no
separate wiring: the `/map` explorer (`MapExplorer.tsx`) and the Saved Wishlist map
(`SavedWishlistMap.tsx`). The Court Detail preview mounts (`CourtDetailLocationPreview.tsx`,
both the locked-placeholder and unlocked-live-map branches) always plot exactly **one**
marker — a single point never clusters, so nothing changes there. Don't add clustering logic
anywhere else.

**Current `drawMarkers()` shape** (read it before starting): on every call it clears
`markerInstancesRef.current` (`marker.map = null` each), builds a fresh
`new AdvancedMarkerElement({...})` per point with `markerContent()` as custom DOM content, a
`gmp-click` listener that `router.push`es to `/courts/{slug}` when `navigateOnClick`, sets
`advancedMarker.map = map` directly, then either centers on the one marker, calls
`map.fitBounds()` for multiple markers (clamped to `FIT_BOUNDS_MAX_ZOOM` on the next `idle`),
or falls back to a world view. All of that — the marker creation, the `gmp-click` wiring, the
center/fitBounds/fallback branch — is still correct and should stay; clustering sits on top of
it, it doesn't replace it.

**The suppression machinery (do not break it).** `CourtMapInner` tracks a
"programmatic move" grace window (`suppressUntilRef`/`beginProgrammaticMove`) so its own
`fitBounds`/animated-focus moves aren't mistaken for the visitor grabbing the map — see the
comments around `PROGRAMMATIC_MOVE_GRACE_MS` and `clearSuppression`. `MapExplorer.tsx` uses
the resulting `onUserInteraction` callback to set `userTookControlRef.current = true`, which
permanently stands down the one-shot automatic nearest-court recentre for that mount. The
existing code has a deliberate precedent for what counts as "the user took control": *"A click
on Google's own zoom control arrives as an unsuppressed `zoom_changed` — correctly counted as
the user taking control."* A cluster click is the same kind of thing — a real, deliberate click
the visitor made — so it should be treated the same way (see §3).

**The regex-based harness** (`apps/web/scripts/verify-map-autofocus.ts`, currently 93 checks)
has several source-level assertions over `CourtMapInner.tsx`'s literal text that this change
must keep passing — read them before touching the file (search the harness for
`AdvancedMarkerElement`, `mapId: config.mapId`, `librariesPromise`, and the Places/Geocoding/
Directions forbidden-pattern check). In particular:
- `/mapId: config\.mapId,/` and `/new AdvancedMarkerElement\(/` must still both match, and
  `/\bstyles:\s*\[/` must still NOT match — so keep constructing markers with
  `new AdvancedMarkerElement(...)` exactly as now; don't switch to the legacy `Marker` class
  for anything, including the cluster badge itself (see §4).
- The forbidden-API check (`google.maps.places|Geocoder|DirectionsService`) must stay clean —
  clustering never touches those, it only groups the already-approximate points this component
  already receives.

---

## 1. Add the dependency

Use `@googlemaps/markerclusterer` — the official, Google-maintained clustering library, and
specifically the one whose `SuperClusterAlgorithm` wraps the same `supercluster` engine
Airbnb's own map clustering is built on, which is why it's the right choice for "как на
Airbnb" rather than the simpler grid-based default. This is a deliberate exception to Task
18's "no new dependency" norm: hand-rolling a density-based spatial clustering algorithm well
enough to feel like Airbnb's would be real effort to reproduce something this library already
does correctly. Add it to `apps/web/package.json` (a real dependency, not dev) and install —
nowhere else needs it.

## 2. Wire it into `drawMarkers()`

Shape, not exact code — use your judgment on the details:

- Create ONE `MarkerClusterer` instance per map, alongside map construction (where
  `advancedMarkerCtorRef.current = AdvancedMarkerElement` and `mapRef.current = map` are set
  today), holding it in a new ref (e.g. `clustererRef`). Constructing a fresh clusterer inside
  every `drawMarkers()` call would work but leaks/rebuilds the internal renderer state on every
  filter change for no reason — build once, mutate its marker set on redraw.
- In `drawMarkers()`, keep building `AdvancedMarkerElement` instances exactly as now (custom
  `markerContent()`, the `gmp-click` → `router.push` listener when `navigateOnClick`), but stop
  setting `advancedMarker.map = map` directly — hand the built instances to the clusterer
  instead (`clearMarkers()` the old set, then add the new one). The clusterer decides per-marker
  visibility (shows the real pin once it's zoomed in enough to stand alone, hides it behind a
  cluster badge otherwise) — your `gmp-click` listener, already attached at creation time,
  keeps working once a marker is shown on its own, because the clusterer only toggles `.map`,
  it never removes listeners.
- Keep the existing center-on-one-marker / `fitBounds`-on-many / world-fallback branch exactly
  as it is — that decides the map's *view*, which is orthogonal to how the clusterer groups
  markers *visually* at whatever zoom the view ends up at.
- Unmount cleanup: the clusterer needs to be torn down alongside the marker loop already there
  (`clustererRef.current?.setMap(null)` or equivalent) so it doesn't outlive the map instance.

## 3. Cluster click = zoom in, not navigate

`MarkerClusterer`'s default click behavior — fit the map to the clicked cluster's own bounds —
is the right baseline (that's the "click a cluster to break it apart" interaction the ask is
describing). Do **not** wrap that zoom in `beginProgrammaticMove()` to suppress it. Per the
precedent in the context section above (the zoom-control click is deliberately left
unsuppressed because it's a real user gesture), a cluster click is the same kind of thing: let
it report through the existing `center_changed`/`zoom_changed` listeners like any other
deliberate zoom action, so it correctly stands down the automatic nearest-court recentre the
same way manually zooming already does. If you find a concrete reason this reasoning doesn't
hold once you're looking at the real interaction, say so and explain the alternative you chose
instead — but the default expectation is: no new suppression code needed here at all.

## 4. Cluster badge — match the app, read as "Airbnb-style"

The existing custom markers (`markerContent()` in `CourtMapInner.tsx`, `.tw-map-marker*` in
`globals.css`) are small ringed dots in the court's state color, replacing Google's default pin
entirely — the cluster badge needs the same treatment: a custom renderer (`renderer` option on
`MarkerClusterer`) building its own `AdvancedMarkerElement` content as a plain DOM element,
never the legacy `Marker`/default pin, matching the harness constraint in §0 above.

Build it as a rounded pill/circle badge showing the count, distinct from the individual
per-court dots (a cluster isn't any one court's state — don't reuse the featured/open/locked
colors for it). Add sibling CSS next to the existing `.tw-map-marker*` rules in `globals.css`
(same `@layer`, same naming convention — e.g. `.tw-map-cluster` / `.tw-map-cluster__count`) —
don't invent a separate styling system for this one badge. A sensible starting point: solid
ink/graphite background, bone-colored bold count text, the same subtle drop shadow the
individual dots use, and the same hover/tap scale treatment
(`.tw-map-marker-icon:hover .tw-map-marker__dot { transform: scale(1.12) }`) applied to its own
class. Check what the library already does before adding your own logic for very large counts
(e.g. capping the displayed text at "99+") — don't reinvent something it already handles.

## 5. Clustering density — use the library, tune only if testing shows it's wrong

Use `SuperClusterAlgorithm` (see §1) at its library defaults first. Only adjust `radius`/
`maxZoom` if manual testing against real data shows obviously wrong grouping — don't
pre-tune blind.

**A testing note on the seed data:** the seeded courts are few (a dozen or so) and spread
across several countries, so at the zoom levels someone would normally browse `/map` at,
clusters may rarely form — you'll mostly need to zoom out toward a world/continent view to see
real clustering, or check a `/saved` Wishlist map if several saved courts happen to sit close
together. Don't conclude clustering is broken just because it doesn't trigger at a normal
country-level zoom with this little data.

---

## Do not touch

- The single-marker Court Detail preview mounts, or anything about `CourtDetailLocationPreview.tsx`.
- The coordinate model — clustering only groups the already-approximate `MapMarker` points this
  component already receives; no new Google API surface (Places/Geocoding/Directions), no
  change to `map-markers.ts`/`courtToMarker`.
- The center/fitBounds/world-fallback view logic, the animated-focus code, or the suppression
  window's existing behavior beyond what §3 describes.
- No broader visual redesign — this is the cluster badge only.

## Testing

1. `/map`, zoomed out enough to see multiple markers grouped: a cluster badge renders with the
   correct count.
2. Clicking a cluster zooms in to fit its markers (does not navigate anywhere); zooming further
   breaks it apart into the individual pins.
3. An individual pin, once visible on its own (inside or outside a former cluster), still
   navigates to `/courts/{slug}` on click.
4. The automatic nearest-court recentre still fires normally when nothing else has touched the
   map, and correctly stands down after a manual cluster click (§3) — same as it already does
   for a manual pan/zoom/zoom-control click.
5. Repeat on the Saved Wishlist map.
6. Network tab: still no Places/Geocoding/Directions request anywhere.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
8. `pnpm --filter @tennis/web verify:map-autofocus` — report old → new count. If you add
   coverage for the new clustering behavior (e.g. asserting `MarkerClusterer`/
   `SuperClusterAlgorithm` is used, or that the cluster-click path isn't wrapped in
   `beginProgrammaticMove`), say what you added; if nothing needed extending beyond the
   existing checks already listed in §0, say so.

## Report

Which algorithm/renderer you used and why; the cluster-click suppression decision from §3 (did
you leave it unsuppressed per the precedent, or find a reason not to — explain either way);
confirmation `gmp-click` still fires per-marker once a pin de-clusters; what the badge looks
like (describe it — colors/shape/size); the dependency added and its version; and the
typecheck/lint/build/harness results. No git commit or push.
