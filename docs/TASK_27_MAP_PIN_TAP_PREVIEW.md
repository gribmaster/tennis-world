# TASK 27 — Tap-to-preview card on /map's pins (mobile) — Feature 86, unblocked

**Model: Sonnet 5, reasoning effort: high.**

## Context

The user asked why tapping a pin on `/map` doesn't show a preview. I traced this to a real,
already-specified, deliberately-deferred feature — not something to design from scratch.

`docs/DESIGN_V2_COMPLETION_SUMMARY.md` names it explicitly: **"Deliberately NOT shipped:
Features 85/86 (Map screen chrome + pin-tap bottom sheet)... blocked on a Leaflet → Google Maps
+ Snazzy Maps migration."** And later, more specifically: **"Feature 86 in particular is a real
behavior change: today a marker click navigates straight to the court page
(`LeafletMapInner.tsx`), whereas the prototype opens a preview sheet and only navigates on an
explicit action."**

That blocker is gone — Tasks 16–24 completed the Leaflet → Google Maps migration
(`docs/MAP_PROVIDER_DECISION.md`). Feature 86 (the pin-tap preview) is now unblocked. This task
implements it.

**Canonical reference:** `new design/tennis_world_v2_standalone.html`, the `MapScreen` function
(around line 627–1002). Read it yourself before starting — it's the exact interaction and
copy the design intends: tapping a pin calls `selectPin(court)`, which shows a bottom sheet
with a compact preview (thumbnail, masked/unmasked chip + name + location, a save heart) that
expands on tap into a bigger sheet (bigger photo, tags, description, CTAs, a nearby-courts
strip). When nothing is selected, a minimal footer reads "Tap a pin to preview a court."

### This task ships a deliberately smaller slice than the full prototype — read this before building

The prototype's expanded sheet uses fields the real `/map` screen's data does not have:
`CourtSummaryDTO` (what `/map` fetches) carries no `blurb`/description and no `directionsUrl` —
those only exist on the full `CourtDTO` / the protected per-court exact-location response,
fetched today only by the Court Detail page for the ONE court being viewed. Fetching either in
bulk for every pin on the map would reopen the exact anti-scraping question already discussed
with the user for bulk exact coordinates — out of scope here. So:

- **Ship:** the COMPACT preview only — thumbnail, `courtDisplay()`-masked/unmasked chip + name
  + location, tag chips, a visual-only save heart (same non-interactive pattern `CourtCard`
  already uses — no real toggle, that's a separate future feature), a close control, and a
  "View details" link to `/courts/{slug}`.
- **Do NOT build:** the expand/collapse two-state sheet, the description snippet, the
  "Directions" button, or the "More courts nearby" strip inside the sheet. These all need data
  `/map` doesn't have today (blurb, exact-location-derived directions, distance) and are a
  natural follow-up once this ships, not part of this task. Flag them in your report as
  deferred, don't silently drop them without saying so.

### This task is additive, not a replacement — a second deliberate scope call

The prototype's mobile layout has NO persistent court list at all — only the map and the
dynamic sheet/footer. The real `/map` (per `FEATURE_13_MAP_PAGE_LAYOUT.md` §4) already has a
persistent horizontal `CourtCard` strip below the canvas on mobile, and users rely on it today
to browse without tapping every pin. Replacing it with the prototype's sheet-only layout would
be a net loss until the prototype's "Show list" fallback is also built (not part of this task).

**So: build the preview as an overlay ON TOP of the map canvas, not a replacement for the
strip below it.** `.map-canvas-wrap` is already `position: relative` (see
`MapLocateControl.tsx`'s own comment — it overlays the same canvas without changing its
dimensions); dock the new preview card to the bottom of that canvas area the same way. The
existing mobile `CourtCard` strip in `MapCourtList.tsx` stays exactly as it is, untouched, doing
exactly what it does today.

## 1. Give `CourtMapInner` a marker-click callback that can pre-empt navigation

`CourtMapInner.tsx`'s `drawMarkers()` (around line 539) currently does:

```ts
if (navigateOnClick) {
  advancedMarker.addListener('gmp-click', () => router.push(`/courts/${m.slug}`));
}
```

Add a new optional prop, `onMarkerClick?: (marker: MapMarker) => void`, to
`CourtMapInnerProps` (and forward it through `CourtMapProps` in `CourtMap.tsx`, which already
spreads `...inner` — confirm it needs no other change). When provided, it takes over — the
component stops navigating internally and lets the caller decide:

```ts
if (onMarkerClick) {
  advancedMarker.addListener('gmp-click', () => onMarkerClick(m));
} else if (navigateOnClick) {
  advancedMarker.addListener('gmp-click', () => router.push(`/courts/${m.slug}`));
}
```

Add it to the effect's dependency array alongside the other click-relevant deps. Every OTHER
caller of `CourtMap`/`CourtMapInner` (`SavedWishlistMap.tsx`, `CourtDetailLocationPreview.tsx`)
keeps using plain `navigateOnClick` — unaffected, no behavior change for them. This does not
touch the clusterer's own `onClusterClick` handling (Task 19's decision, left alone since) —
only the individual marker's `gmp-click` listener changes.

## 2. `MapExplorer.tsx`: route clicks by breakpoint, hold the selected court

Add `const [selectedCourt, setSelectedCourt] = useState<CourtSummaryDTO | null>(null)`.

Add a click handler that decides navigate-vs-preview AT CLICK TIME by checking the viewport —
this avoids adding a persistent JS media-query hook just for this one decision, and keeps
desktop's existing behavior byte-for-byte unchanged:

```ts
const handleMarkerClick = useCallback(
  (marker: MapMarker) => {
    // Match the SAME breakpoint `.map-layout`'s existing `md:` classes switch on — confirm
    // the actual px value against the Tailwind config rather than assuming 768px.
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      router.push(`/courts/${marker.slug}`);
      return;
    }
    const court = visibleCourts.find((c) => c.slug === marker.slug) ?? null;
    setSelectedCourt(court);
  },
  [router, visibleCourts],
);
```

(`router` needs importing via `useRouter` from `next/navigation` — `MapExplorer` doesn't
currently import it; `CourtMapInner` already does, for reference.)

Pass `onMarkerClick={handleMarkerClick}` to `<CourtMap>` instead of `navigateOnClick` (or keep
`navigateOnClick={false}` explicitly — either is fine since `onMarkerClick` now owns the click
on both breakpoints through this one handler).

Clear `selectedCourt` when: the visible set changes such that the selected court drops out of
it (a filter change while a court is previewed — check on every `visibleCourts` change), and
via an explicit close control on the preview card itself (see below).

## 3. New component: the compact preview card

New file, e.g. `features/map/MapCourtPreview.tsx`. Rendered by `MapExplorer` only when
`selectedCourt` is set, inside `.map-canvas-wrap`, positioned absolutely and docked to the
bottom of the canvas, `md:hidden` (mobile only — desktop never sets `selectedCourt`, so this
never mounts there, but the CSS guard is cheap insurance).

Content (compact preview only, per the scope note above):
- `heroImageUrl` thumbnail, rounded corners, `object-cover`, matching the prototype's ~88×72
  proportions adapted to this app's spacing tokens (don't invent new ones — reuse whatever
  `CourtCard`/`MapCourtRow` already use for radius/shadow language).
- `courtDisplay(selectedCourt, viewerIsEntitled)` — `MapExplorer` needs `viewerIsEntitled`
  threaded in already (Task 26); use it here too so a locked court's preview masks exactly the
  same way every other surface does, and an entitled viewer sees the real name/location here
  too. Render `display.chip`, `display.name`, `display.location`.
- Tag chips from `selectedCourt.tags` (empty array renders nothing — same pattern
  `CourtDetailTagStrip`/`CourtMeta` already use elsewhere; don't fabricate a fallback).
- A visual-only save heart — same non-interactive pattern as `CourtCard`'s `showSaved`/`saved`
  props (no real toggle; a later feature wires it, exactly like every other visual-only heart
  in this codebase).
- A close control (✕) that clears `selectedCourt`.
- "View details" — a `PendingCardLink` (or the whole card, matching `CourtCard`'s own
  whole-card-links-out pattern) to `/courts/{selectedCourt.slug}` — this is a navigation, so it
  gets the pending primitive per CLAUDE.md §4 rule 1, not a plain `<Link>`.

Tapping a DIFFERENT pin while one is already selected just replaces `selectedCourt` (matches
the prototype's `selectPin` always overwriting, never toggling/stacking).

Check the preview card's position against `MapLocateControl`'s (both live inside the same
relatively-positioned `.map-canvas-wrap`) — they must not visually collide on a small mobile
viewport where the canvas is only `55vh` tall.

## Do not touch

- Desktop: `MapCourtList`'s desktop branch, `MapCourtRow.tsx`, the persistent right-column list
  panel — no changes. Desktop marker clicks still navigate immediately, same as today, just
  routed through the new shared `onMarkerClick` callback instead of the old `navigateOnClick`
  boolean directly.
- Mobile: the existing horizontal `CourtCard` strip inside `MapCourtList.tsx` — untouched, stays
  exactly as it renders today. This task is additive only (see scope note above).
- The clusterer, `onClusterClick`, the fitBounds/focus-zoom-clamp logic in `CourtMapInner.tsx`
  (Tasks 19/23) — unrelated, leave alone.
- `courtDisplay()`/`courtToMarker()`/the entitlement threading from Tasks 25/26 — consume
  `courtDisplay()` and the `viewerIsEntitled` prop `MapExplorer` already receives; do not modify
  either.
- `SavedWishlistMap.tsx`, `CourtDetailLocationPreview.tsx` — both keep using plain
  `navigateOnClick`, unaffected by the new optional `onMarkerClick` prop.
- No new fetches. This task renders only fields already present on the `CourtSummaryDTO[]`
  `/map` already has in memory — no per-court blurb/exact-location/directions fetch, per the
  scope note above.

## Testing

- Mobile viewport: tap a pin → the preview card appears docked to the bottom of the canvas,
  the existing horizontal strip below is still there and unaffected, `MapLocateControl` is
  still usable and doesn't visually collide with the new card.
- A LOCKED court's preview shows the masked chip/name/location for a non-entitled viewer, and
  the real ones for an entitled viewer (reuse the same test setup Task 26 used to flip
  membership) — confirms `courtDisplay()`/`viewerIsEntitled` actually reached this new surface.
- Tap "View details" → navigates to `/courts/{slug}` with the pending-state affordance, same as
  every other whole-card link in this app.
- Tap the close control → the preview card disappears, the pin remains on the map.
- Tap a second, different pin while the first is still previewed → the card updates to the new
  court instead of stacking or staying stuck on the first.
- Change a filter such that the previewed court drops out of `visibleCourts` → the preview
  closes rather than showing a now-invisible court's card.
- Desktop viewport: clicking a pin still navigates immediately to `/courts/{slug}`, exactly as
  before this task — no preview card ever appears, list panel behavior is unchanged. Cluster
  clicks still zoom in without navigating (Task 19's behavior, unaffected).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm you read the prototype's `MapScreen` before building, and list explicitly what you
deliberately left out of scope per this brief (expand/collapse sheet, description, Directions,
nearby strip) so it's visible for a future follow-up rather than looking like an oversight.
Confirm each testing bullet above was actually exercised, not assumed — mobile AND desktop
viewports, locked AND unlocked courts, entitled AND non-entitled viewer. No git commit or push
unless asked.
