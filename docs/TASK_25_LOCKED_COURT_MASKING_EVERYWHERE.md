# TASK 25 — Mask locked-court name/location everywhere a court card or map pin renders

**Model: Sonnet 5, reasoning effort: high.**

## Context

The user reported that on `/map`, both the marker tooltips and the desktop "Courts in view"
list show a **locked/premium court's real name**, unmasked. I confirmed this by reading the
current source, then asked the user to scope the fix: patch `/map` only, or change the
underlying principle so a locked court's name/location is masked **everywhere** a court card
appears. The user chose **everywhere**.

This is a deliberate, explicit reversal of part of Feature 74/79's original design. It is
**not** a security fix — read `features/home/court-display.ts`'s header comment in full before
touching anything: `GET /v1/courts` deliberately serves the real `name`/`country`/`region` to
every caller (locked or not) for SEO/indexability, and that stays true after this task. Nothing
changes in `apps/api`. This task is **presentational only**: which of those already-public
strings the CLIENT chooses to print. The one real gate — exact `lat`/`lng`, behind
`GET /v1/me/courts/:slug/exact-location` — is untouched and out of scope.

### What I found already correctly masks locked courts (do not touch, use as the reference pattern)

These already call `courtDisplay()` from `features/home/court-display.ts` and render
`display.name` / `display.location` / `display.chip` instead of the raw court fields, with
`alt=""` on the hero image (the name is announced once, as visible text, not duplicated into
alt text):

- `features/home/HomeFeaturedCourts.tsx`
- `features/home/HomeSearchBar.tsx` (inline search results)
- `features/home/HomeEditorsCut.tsx`
- `features/court-detail/CourtDetailNearbyStrip.tsx` ("Nearby courts" on Court Detail)
- `features/saved/SavedCourtsGrid.tsx` (Saved page's Courts tab)

Court Detail's own page (`app/courts/[slug]/page.tsx`) already masks the court's **own** name
via a separate, deliberately-not-reused `courtLabel`/`courtName` split (Feature 79) driven by
real entitlement, not `isLocked` — also correct, also not this task's concern.

### What actually bypasses masking (the bug, confirmed by reading each file)

1. **`components/court/CourtCard.tsx`** — the shared generic tile used across the app. Renders
   `court.name` (an `<h3>`) and `[court.country, court.region].join(' · ')` directly, plus
   `alt={court.name}` on the image and `ariaLabel={court.name}` on the wrapping
   `PendingCardLink`. Only a "Locked" badge is shown — the name itself is never masked. This
   one component being wrong fans out to every screen that mounts it:
   - `features/map/MapCourtList.tsx` (the mobile horizontal strip under "Courts in view")
   - `features/collection-detail/CollectionCourtsGrid.tsx` (editorial Collection Detail page)
   - `features/user-collection-detail/UserCollectionCourtsGrid.tsx` (a user's own wishlist
     folder detail page)

2. **`features/map/MapCourtRow.tsx`** — the desktop "Courts in view" row the user named
   explicitly. It does not use `CourtCard` at all; it independently re-renders `court.name` and
   `[court.country, court.region].join(' · ')`, plus `alt={court.name}` and
   `ariaLabel={court.name}`. Only a lock glyph icon is shown — no masking whatsoever.

3. **`features/map/map-markers.ts`**'s `courtToMarker()` — sets `name: court.name`
   unconditionally on every `MapMarker`. That `name` flows into
   `features/map/CourtMapInner.tsx`'s `markerContent()` (around line 109), which sets
   `wrapper.title = name` and `wrapper.setAttribute('aria-label', name)` — i.e. it is literally
   the marker's hover tooltip and accessible name. This is the other half of what the user
   named explicitly ("в поинтах показывает название корта"). `courtToMarker()` is shared by
   **both** map surfaces in the app — confirmed via its two call sites:
   - `features/map/MapExplorer.tsx` (`/map`)
   - `features/saved/SavedWishlistMap.tsx` (the map on the Saved page)

   So fixing `courtToMarker()` once fixes both.

### What stays visible on a locked card, deliberately (do not mask these)

Per the established pattern (see Court Detail's locked branch and its own comment: "the surface
chip and the tag chips stay VISIBLE… they tell a visitor what kind of court this is while the
name, the place and the description stay behind the membership"), a locked court's `surface`,
`setting`, `access`, `tags`, and the hero photo itself are NOT masked anywhere — only the
identifying **name** and **country/region** are. Do not touch `components/court/CourtMeta.tsx`
or any component's rendering of surface/tag chips.

## 1. Relocate `courtDisplay` to `components/court/` — it is no longer Home-only

`courtDisplay()`/`courtLocation()`/`CourtDisplay` currently live in
`features/home/court-display.ts`. That was fine while only Home used it, but it is already
imported cross-feature by `saved/SavedCourtsGrid.tsx` and
`court-detail/CourtDetailNearbyStrip.tsx`, and this task adds `components/court/CourtCard.tsx`
as an importer. `components/court/` is a shared, feature-agnostic primitives directory that
features import FROM — a shared component reaching INTO `features/home/` to get this logic
would invert that dependency direction.

**Do this:**
- Move the module to `components/court/court-display.ts` (same exports: `CourtDisplay`,
  `courtDisplay`, `courtLocation`). Keep its header comment — the "presentation, not a gate"
  rationale is load-bearing documentation, not boilerplate; adapt only the "why this module
  exists" framing if needed since it's no longer Home-specific.
- Export it from `components/court/index.ts` alongside `CourtCard`/`CourtMeta`/`CourtImage`.
- Update every existing importer to the new path: `features/home/HomeFeaturedCourts.tsx`,
  `features/home/HomeSearchBar.tsx`, `features/home/HomeEditorsCut.tsx`,
  `features/court-detail/CourtDetailNearbyStrip.tsx`, `features/saved/SavedCourtsGrid.tsx`.
- Delete the old `features/home/court-display.ts`. Do not leave a re-export shim — fix the
  imports directly, there are only five of them plus the three new ones this task adds.

## 2. Fix `components/court/CourtCard.tsx`

Call `courtDisplay(court)` and render `display.name` / `display.location` in place of
`court.name` / `[court.country, court.region].join(' · ')`. Set the hero image's `alt=""`
(matching every other already-correct card — the name is announced once, as the visible text
block, not duplicated into alt text) instead of `alt={court.name}`. Set
`ariaLabel={display.name}` on the `PendingCardLink` wrap instead of `ariaLabel={court.name}`.
Leave the "Locked"/"Featured" badge logic untouched.

## 3. Fix `features/map/MapCourtRow.tsx`

Same shape of fix: `courtDisplay(court)`, render `display.name` / `display.location`,
`alt=""` on the thumbnail, `ariaLabel={display.name}` on `PendingCardLink`. Leave the
`surface`/`setting` sub-line and the lock glyph untouched.

## 4. Fix `features/map/map-markers.ts`'s `courtToMarker()`

Mask `name` when the court is locked, using the same `courtDisplay()` helper so the marker
tooltip can never drift from what a card says for the same court:

```ts
import { courtDisplay } from '@/components/court/court-display'; // adjust to the real relocated path

export function courtToMarker(
  court: CourtSummaryDTO,
  stateBySlug?: Map<string, MapMarkerState>,
): MapMarker {
  return {
    id: court.id,
    slug: court.slug,
    name: courtDisplay(court).name,
    lat: court.approxLat,
    lng: court.approxLng,
    state: stateBySlug?.get(court.slug) ?? courtState(court),
    heroImageUrl: court.heroImageUrl,
  };
}
```

Update the interface doc-comment on `MapMarker.name` (currently "Court name — the marker's
accessible title/tooltip") to note it is the masked display name for a locked court, not
necessarily the real one. No change needed in `CourtMapInner.tsx` itself — `markerContent()`
already just prints whatever `name` it's given into `title`/`aria-label`, which is exactly
right once the input is masked upstream.

Double check `features/map/index.ts`'s re-export of `courtToMarker` still resolves after the
import path change in step 1.

## Do not touch

- `apps/api` — no server-side change. `GET /v1/courts` keeps serving real `name`/`country`/
  `region` to everyone; that is intentional and unrelated to this task.
- The exact-location gate (`GET /v1/me/courts/:slug/exact-location`) and anything under
  `directionsUrl` — untouched, unrelated.
- `app/courts/[slug]/page.tsx`'s own `courtLabel`/`courtName` masking (Feature 79) — it is a
  parallel, deliberately separate mechanism driven by real entitlement rather than `isLocked`.
  Do not merge it with `courtDisplay()`.
- `components/court/CourtMeta.tsx`, and any rendering of `surface`/`setting`/`access`/`tags` —
  these stay visible on locked cards everywhere, per the established pattern.
- The already-correct components listed above (`HomeFeaturedCourts`, `HomeSearchBar`,
  `HomeEditorsCut`, `CourtDetailNearbyStrip`, `SavedCourtsGrid`) — only their import path
  changes (step 1); their rendering logic is already right.
- `CourtMapInner.tsx`'s `markerContent()` / clustering / photo-pin code from Tasks 19–24 —
  no change needed there; it already just renders whatever `name` and `heroImageUrl` it's
  handed.

## Testing

For each surface below, verify a LOCKED court shows "Premium Court" / "Unlock to reveal
location" (or whatever `courtDisplay()` currently returns) and an UNLOCKED court shows its real
name/location, unchanged:

- Home: featured strip, inline search results, Editor's Cut — should be unchanged (already
  correct; just confirm the import-path move didn't break them — `pnpm typecheck`/build is
  the real test here).
- `/map`: the map markers' hover tooltip/title text AND accessible name (`aria-label`) for a
  locked court's pin; the desktop "Courts in view" list (`MapCourtRow`); the mobile horizontal
  "Courts in view" strip (`CourtCard` inside `MapCourtList`).
- Saved page: the wishlist map's pins (`SavedWishlistMap` → same `courtToMarker()`); the Courts
  tab grid — should be unchanged (already correct).
- Collection Detail page (`/collections/[slug]`): the court grid (`CollectionCourtsGrid` →
  `CourtCard`).
- A user's wishlist folder detail page: the court grid (`UserCollectionCourtsGrid` →
  `CourtCard`).
- Court Detail page's "Nearby courts" strip — should be unchanged (already correct).
- Confirm `pnpm typecheck`, `pnpm lint`, `pnpm build` all stay clean after the file move in
  step 1 — an import-path relocation is exactly the kind of change that silently breaks a
  stray importer typecheck won't catch if you miss updating it, so also grep the whole
  `apps/web/src` tree for `court-display` and `features/home/court-display` to confirm nothing
  still points at the deleted path.

## Report

Which of the 4 sections you touched, the final location of `court-display.ts` and every file
whose import you updated, confirmation each of the testing bullets above was actually checked
(not assumed), and that `pnpm typecheck`/`lint`/`build` are clean. No git commit or push unless
asked.
