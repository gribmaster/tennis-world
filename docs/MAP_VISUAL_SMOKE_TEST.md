# Map Visual Layer — Smoke Test & Fix

> ⚠️ **SUPERSEDED by Feature 74 (2026-07-06).** The abstract, provider-free
> `StylizedMapCanvas` described below (CSS `.gmap` sea + inline SVG landmass *blobs*,
> pins positioned from non-geographic `mapCoords`) has been **removed**. All three map
> surfaces (`/map`, Saved → Wishlist Map, Court Detail location preview) now render a
> **real Leaflet tile map** with markers plotted at each court's real *approximate* geo
> (`approxLat`/`approxLng`). The tile provider is env-driven (OpenStreetMap for dev; a
> proper provider such as MapTiler for production). `StylizedMapCanvas.tsx`,
> `MapCanvas.tsx`, and `MapPin.tsx` were deleted.
>
> **See `docs/MAP_PROVIDER_DECISION.md`** for the current design, the tile env vars, the
> exact-vs-approximate coordinate rule, and the Feature 74 verification result.
>
> The section below is retained as the historical record of the *earlier* attempt to make
> the abstract canvas legible — it is NOT the current behavior.

---

**Date:** 2026-07-06
**Data source:** `NEXT_PUBLIC_DATA_SOURCE=api` (web on `127.0.0.1:18000`, API on `127.0.0.1:18001`, Postgres on `15432`)
**Scope (historical):** the stylized (non-interactive, provider-free) map visual layer formerly used by `/map`, the Saved → Wishlist Map tab, and the Court Detail location preview.

---

## 1. Issue observed

During manual smoke testing (auth / collections / add-to-collection all working), **no map was visible anywhere**. `/map` rendered as an almost-empty warm block with a few floating pins and barely-legible continent labels — the map "sea" was indistinguishable from the page background, and there was no land, structure, or contrast to read as a map. The same faint `.gmap` backdrop was reused by the Saved wishlist map, and the Court Detail location preview showed an unrelated flat gradient box.

### Root cause

The `.gmap` background in `globals.css` was a **faithful but visually weak port** of the `files/map.html` prototype:

- The "land/water" were **tiny fixed-pixel radial gradients** (80–200px) scattered on a large canvas → sparse faint blobs, not continents.
- The base `linear-gradient(#e8e2d0 → #d8d2c0)` sits **within a few % of the page's `bone` (#F5F2EC)** → no edge, no figure/ground.
- `filter: saturate(0.6) sepia(0.1)` desaturated the already-pale tones further.
- The per-consumer tonal wash (`from-bone/20 to-bone/40`) washed it out even more.

Net effect: technically painting, but reads as an **empty block with pins**. See `docs/assets/map-visual-smoke/01-before-empty-block.png` (exact `.gmap` values, rendered in isolation).

The map data path was **never** the problem: in `api` mode `/courts/map` returns valid `MapPinDTO`s with `mapCoords` (and no `lat`/`lng`), so pins rendered — which is precisely why the symptom was "empty block *with* pins."

---

## 2. Fix

A reusable **`StylizedMapCanvas`** visual layer (`apps/web/src/features/map/StylizedMapCanvas.tsx`), shared by all three surfaces:

- **Sea:** `.gmap` reworked into a clean warm bone→stone radial wash with real presence (no more tiny blobs / sepia).
- **Land + graticule:** an **inline, hand-drawn SVG** of abstract landmass silhouettes (deliberately *not* real coastlines) plus a faint muted-stone graticule grid, scaled to fill the canvas. Pure CSS/SVG — **no image, no tiles, no map library**.
- **Labels:** faint serif continent captions (decorative, not data), suppressible via `showLabels={false}` for compact previews.
- **Pins on top:** the component renders whatever pins the caller passes as `children`, always above the backdrop.

Luxury/minimal language preserved: warm bone/ivory sea, muted graphite/stone land + lines, restrained clay/moss/graphite pin accents.

### Files changed

| File | Change |
|---|---|
| `apps/web/src/features/map/StylizedMapCanvas.tsx` | **New.** Reusable decorative map surface (`.gmap` sea + inline SVG land/graticule + labels + `children` pins). |
| `apps/web/src/app/globals.css` | Reworked `.gmap` from the near-flat sepia/tiny-blob gradient to a warm bone→stone sea wash (the SVG now supplies the "map content"). `.map-layout` / `.map-canvas-wrap` / `.pin-pulse` unchanged. |
| `apps/web/src/features/map/MapCanvas.tsx` | Now composes `StylizedMapCanvas` (dropped its duplicated backdrop/labels/wash); still renders the cluster bubble + `MapPin`s (positioned from `mapCoords` only). |
| `apps/web/src/features/map/index.ts` | Export `StylizedMapCanvas` + type. |
| `apps/web/src/features/saved/SavedWishlistMap.tsx` | Reuses `StylizedMapCanvas` in place of the bare `.gmap` div; pin placement + "Plan a Trip" unchanged. |
| `apps/web/src/features/court-detail/CourtDetailLocationPreview.tsx` | Reuses `StylizedMapCanvas` (`showLabels={false}`) instead of the flat gradient box, for both locked (blurred map behind the lock/CTA) and unlocked (map + centered marker) states. |

No changes to: API, contracts/DTOs, Prisma schema, repositories, `app/api` (none exist), or any real map provider. No new dependency.

---

## 3. Manual result notes (all in `api` mode)

Verified against the **real running app** driven via headless Chrome (CDP), not just static analysis.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `/map` visible stylized background | ✅ warm sea + land silhouettes + graticule + labels | `02-after-map-all.png` |
| 2 | Pins on top of background | ✅ clay/graphite/moss pins + "12" cluster bubble | `02-after-map-all.png` |
| 3 | Search/filter keeps pins + list in sync | ✅ click **Scenic** → header "COURTS IN VIEW · SCENIC", **"9 places"**, cluster **"9"**, **9 pins** (read back live: `{places:"9 places", pins:9}`) | `03-after-map-scenic-filter.png` |
| 4 | Court cards / list panel work | ✅ real court rows from the API repository | `02` / `03` |
| 5 | Saved → Wishlist Map same stylized style | ✅ same cartography, 4 saved courts plotted from `mapCoords` with name captions | `06-saved-wishlist-map.png` |
| 6 | Court Detail location preview present | ✅ unlocked = map + centered marker + Get Directions; locked = **blurred map** behind lock glyph + "Unlock Full Access" | `04-court-detail-unlocked.png`, `05-court-detail-locked.png` |
| 7 | Public API still masks exact coords | ✅ see §4 | parity harness + DOM spot-checks |

Screenshots live in `docs/assets/map-visual-smoke/`.

### Automated checks (all green)

```
pnpm --filter @tennis/web lint         → ✔ No ESLint warnings or errors
pnpm --filter @tennis/web typecheck    → ✔ (tsc --noEmit, clean)
pnpm --filter @tennis/web build        → ✔ compiled; /map, /saved, /courts/[slug] all build
pnpm --filter @tennis/web verify:api-parity → ✔ 35/35 PASS  (run with NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18001/v1)
```

---

## 4. Coordinate-safety confirmation (no exact `lat`/`lng` exposed)

The fix is UI-only, but this was re-verified end to end:

- **`verify:api-parity`** asserted the security invariants, all PASS:
  - `courts.getMapPins: no exact lat/lng keys (masking)`
  - `courts.getMapPins: pins have only courtId/slug/mapCoords/state`
  - `courts.list / getBySlug / getRelated: no exact lat/lng keys (masking)`
- **Protected saved endpoint:** `GET /v1/me/saved-courts` returned each saved court with `mapCoords` present and **`lat`/`lng` absent** (checked directly during the wishlist smoke).
- **Rendered DOM spot-checks** (`/courts/[slug]` unlocked + locked, and `/saved` wishlist): the served HTML contained **no** `"lat"` / `"lng"` / `lat=` / `lng=` (`hasLatLng: false` in every case).
- **Pin placement:** every pin (map canvas, wishlist map) is positioned exclusively from `mapCoords`. `StylizedMapCanvas` receives **no** coordinate at all — it paints only the backdrop and renders caller-supplied pins as `children`. The Court Detail preview marker is centered decoration, never positioned from a coordinate.

## 5. Confirmation: no real map provider added

**No Mapbox, Google Maps, Leaflet, geolocation, PostGIS, or any map/tile provider was added.** The map is entirely CSS + inline SVG. No new dependency, no `app/api` route, no backend endpoint, no contract/schema change. No `@tennis/mock-data` import in any UI/feature component. The add-to-collection flow was exercised (Collections tab / court-page "Add to Collection" button intact) and is unaffected.
