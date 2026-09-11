# TASK 22 — Independent review of Tasks 16–21 (run this with Opus)

**Model: Opus, reasoning effort: high.** This is a review pass, not a build — use a stronger
model than the implementation rounds because the point is to catch what a same-model
self-review would tend to confirm rather than question.

## Scope

Everything from the Leaflet→Google Maps migration through the marker-clustering/photo-pin
work: `docs/TASK_16_FEATURE_88_GOOGLE_MAPS.md` through `docs/TASK_21_MAP_MARKER_ATTACHMENT_BUG.md`
(read all six briefs first — they carry the invariants and decisions below in full context).
In file terms, everything currently uncommitted in the working tree plus the map feature files
they touch:

- `apps/web/src/features/map/CourtMapInner.tsx`, `CourtMap.tsx`, `map-config.ts`,
  `map-markers.ts`, `MapExplorer.tsx`, `index.ts`
- `apps/web/src/features/saved/SavedWishlistMap.tsx`
- `apps/web/src/features/court-detail/CourtDetailGallery.tsx`,
  `CourtDetailGalleryLightbox.tsx` (new), `gallery-context.tsx` (new),
  `use-horizontal-swipe.ts` (new), `CourtDetailLocationPreview.tsx`, `index.ts`
- `apps/web/src/app/courts/[slug]/page.tsx`, `apps/web/src/app/globals.css`
- `apps/web/scripts/verify-map-autofocus.ts`, `apps/web/package.json`,
  `apps/web/.env.example`

**Approach this adversarially, not confirmatory.** Every one of these files has already been
through at least one review round (by the implementer's own report and by a same-family-model
check) that came back clean. That doesn't mean it's clean — it means the easy bugs are already
caught. Assume the remaining ones, if any, are the kind that survive a same-model self-check:
subtle invariant violations, a check that passes but doesn't actually test what its name
claims, an edge case nobody ran, a library-version assumption nobody verified against the
actual installed source.

## Specific things to verify, not just "does it look right"

1. **Coordinate safety.** `map-markers.ts`/`courtToMarker` must still source `lat`/`lng` from
   `approxLat`/`approxLng` only. No Places/Geocoding/Directions call anywhere in the map
   feature. `directionsUrl` is rendered verbatim, never assembled from coordinates. Check this
   held through ALL of Tasks 18–20's edits, not just the files each task's own brief named.

2. **The masked-name invariant.** Every control whose accessible name could leak a locked
   court's real name must use `courtLabel`, never `courtName` — this now includes
   `CourtDetailGalleryLightbox`'s dialog label and its Prev/Next/Close buttons, and any
   `aria-label`/`title` on the new photo-pin and cluster-badge DOM (`markerContent`,
   `clusterContent` in `CourtMapInner.tsx`). Trace each one back to its actual data source, not
   just its variable name — a variable named `courtLabel` that was accidentally assigned
   `courtName` upstream would look right and be wrong.

3. **Variant B (Map ID + `AdvancedMarkerElement`) held everywhere new code was added.** The
   cluster renderer (`createClusterRenderer`) must construct `AdvancedMarkerElement`, never the
   legacy `Marker`/default pin. No `styles:` array anywhere (mapId makes it inert — check this
   wasn't reintroduced anywhere, including accidentally through the clusterer's own options).

4. **`CLAUDE.md` §4 (pending-state rules), rule 10 specifically** — dots, the lightbox's
   controls, the swipe gesture, and a cluster click are all purely local UI (no mutation, no
   repository call) and correctly carry no pending/disabled/spinner affordance. Confirm nothing
   added one it didn't need, and nothing that DOES need one (is there anything here that's
   secretly async?) is missing it.

5. **The suppression-window / "don't suppress a cluster click" decision (Task 19 §3).**
   `CourtMapInner.tsx`'s `beginProgrammaticMove`/`suppressUntilRef` machinery is subtle by
   design (read its own comments). Confirm the cluster click path genuinely isn't wrapped in
   suppression, that this doesn't fight with the `fitBounds`-on-load suppression that IS
   supposed to apply, and that the reasoning in Task 19 §3 (a cluster click is a real user
   gesture, same precedent as the zoom control) actually holds — argue against it if you find a
   reason it doesn't.

6. **The anchor-compensation pattern** (`inline-block` + explicit `width`/`height` +
   `translateY(50%)`) — this exact bug (a `<span>`'s default `display: inline` silently
   breaking the percentage transform) was found and fixed once already (Task 17) and had to be
   re-applied twice more since (the photo pin, the cluster badge). Check EVERY new element in
   `markerContent()` and `clusterContent()` actually got it right, not just the ones the
   implementer's own report called out.

7. **The `/_next/image` optimizer sizing (`optimizedPinImageUrl`, `NEXT_IMAGE_WIDTHS` in
   `CourtMapInner.tsx`).** The implementer's report claims `next.config.mjs` doesn't override
   `images.imageSizes`, so the hardcoded `[16, 32, 48, 64, 96, 128, 256, 384]` array matches
   Next's real default bucket list. **Actually open `next.config.mjs` and check this claim
   against it** — nobody has independently verified it yet, and if Next's default ever changed
   or the config does override it, every pin's image request silently 400s or falls back
   wrong.

8. **The new `verify-map-autofocus.ts` checks (Task 18/19/20's additions, ~114 total now).**
   Read the actual assertion bodies added for clustering and photo pins, not just their count.
   A check can exist and still be too weak to catch a real regression (e.g. asserting a string
   like `MarkerClusterer` appears in the file, which would pass even if it's imported and never
   used correctly). Flag any check you think would still pass on subtly broken code.

9. **Gallery lightbox isolation.** `CourtDetailGalleryLightbox` must never call the shared
   `GalleryContext`'s `setActiveIndex` — confirm this is still true after all the edits, and
   confirm `CourtDetailGalleryStrip`'s click handler still only sets its own local
   `lightboxIndex`, never the shared index.

10. **Cluster-click behavior, for real.** Nobody has yet confirmed on screen that clicking a
    cluster actually zooms to fit its markers and does NOT navigate anywhere — the live-render
    scare earlier blocked this, and the follow-up only confirmed the map generally renders, not
    this specific interaction. If you have a working browser, check it directly. If not, at
    minimum verify from the installed `@googlemaps/markerclusterer@2.6.2` source what its
    default `onClusterClick` actually does when the option is omitted (the code relies on this
    default rather than setting one explicitly) — confirm it really is a `fitBounds`-style zoom
    and not, say, a no-op or something version-specific.

11. **Still-outstanding manual/visual checks from Task 19 §Testing and Task 20 §Testing** that
    were blocked by the browser-tooling issue: the photo pin's on-screen anchor alignment, the
    no-photo/broken-image fallback rendering, the cluster badge's visual appearance, and the
    automatic nearest-court recentre correctly standing down after a manual cluster click. Run
    these now that the app itself is confirmed to render.

12. **Dependency hygiene.** `@googlemaps/markerclusterer@^2.6.2` alongside
    `@googlemaps/js-api-loader@^2.1.1` — any peer-dependency friction, and does
    `pnpm-lock.yaml`'s actual resolution match what the code assumes about the library's API
    shape (the `Renderer` interface's 3-arg `render`, `MarkerUtils.setMap`'s branching — Task
    21's report already read some of this from source; spot-check it rather than re-deriving
    from scratch, but don't take it on faith either).

## Do not

Don't refactor anything you review — this is a review pass. If you find something wrong, report
it precisely (file, what's wrong, why it matters, what a fix would look like) rather than
silently fixing it, so the fix itself can go through its own reviewed change. Exception: if you
complete one of the outstanding manual checks in item 11 and it's fine, just say so — that's
verification, not a change.

## Report

For each numbered item above: what you checked, what you found, and — critically — anything
that's WRONG or you're not confident is right, even if it seems minor. A clean bill of health
on all twelve is a fine outcome, but say so item-by-item rather than as one blanket "all good."
If you find a real defect, don't fix it inline — describe it precisely enough that a follow-up
task can be scoped from your report alone.
