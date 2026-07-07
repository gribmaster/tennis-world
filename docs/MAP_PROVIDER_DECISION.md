# Map Provider Decision (Feature 74)

**Date:** 2026-07-06
**Status:** Implemented
**Scope:** the map surface used by `/map`, the Saved → Wishlist Map tab, and the Court Detail location preview.

---

## 1. Why the abstract map was removed

Phase 1 shipped a **provider-free, decorative** map surface (`StylizedMapCanvas`): a CSS
`.gmap` gradient "sea" plus an inline hand-drawn SVG of abstract landmass *blobs*, with
pins positioned from a non-geographic `[x%, y%]` `mapCoords` value. It was deliberately
NOT a real map (no tiles, no library, no geolocation) — see `docs/MAP_VISUAL_SMOKE_TEST.md`
for the earlier iteration that tried to make those blobs read better.

It still looked wrong. User feedback was blunt: *"the current map looks awful… it is just
abstract blobs with markers… we need a real map."* No amount of SVG polish makes abstract
silhouettes read as a premium cartographic product, and `mapCoords` positions have no
relationship to where a court actually is, so the "map" conveyed nothing true.

Feature 74 replaces it with a **real tile map** that plots courts at their real
(approximate) geographic positions.

## 2. Why Leaflet

- **No API key, no account, MIT-licensed, ~40 KB.** It renders any XYZ raster tile source,
  so the tile *provider* is a runtime/env choice — not a code dependency. We can start on
  free OpenStreetMap tiles for dev and point production at a proper provider without
  touching component code.
- **Self-contained / CSP-friendly.** Leaflet + its CSS are bundled from `node_modules`
  (no external script/stylesheet), so nothing but the tile images is fetched cross-origin.
- **Framework-agnostic + easy to isolate for SSR.** Leaflet touches `window`/`document` at
  import time, so it is loaded through `next/dynamic({ ssr: false })` (see
  `apps/web/src/features/map/LeafletMap.tsx`). No React wrapper library (react-leaflet) was
  added — the imperative Leaflet API is small enough that a thin `LeafletMapInner` client
  component is simpler and lighter than another dependency.

### Explicitly NOT chosen (per Feature 74 hard rules)

- **No Google Maps** — heavyweight, key-gated, and its look/licensing is wrong for an
  editorial product.
- **No Mapbox (for now)** — capable, but token-gated and heavier than we need today. Leaflet
  keeps the door open (a Mapbox raster style is just another tile URL) without committing us.
- **No geolocation, no PostGIS** — the app never asks for the user's location, and court
  positions are static seed data grouped by country/region (no spatial DB, no bbox queries).

## 3. Why OpenStreetMap tiles are for local/dev ONLY

The default tile source (`https://{s}.tile.openstreetmap.org/...`) is OSM's **public,
volunteer-funded** tile CDN. Its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
forbids heavy/commercial use, offers **no SLA**, throttles bulk traffic, and can change or
disappear. It is perfect for local development and demos and **must not back production**.

So OSM is the *default* (zero-config dev experience) but is fully overridable by env, and the
production recommendation below is to point at a provider you control.

## 4. Production recommendation

Use a **proper tile provider with a custom style and your own key** — our default
recommendation is **[MapTiler](https://www.maptiler.com/)** (generous free tier, a
map-styling editor, OSM-derived data, straightforward XYZ raster endpoints). A restrained,
low-saturation MapTiler style matches the app's editorial/luxury language far better than raw
OSM's bright default cartography.

Any XYZ raster provider works (Stadia Maps, Thunderforest, a self-hosted style, or a Mapbox
raster style if that rule is later relaxed). The only requirements: an XYZ `{z}/{x}/{y}`
template URL, correct attribution, and — for keyed providers — the key baked into the tile
URL via env. **Never commit a real production key.**

## 5. How the tile env vars work

The tile source is resolved entirely from `NEXT_PUBLIC_MAP_*` env by
`apps/web/src/features/map/map-config.ts` (`getMapTileConfig()`), read at render time by the
Leaflet layer. All three are `NEXT_PUBLIC_` because tile URLs and attribution are inherently
public (Leaflet fetches tiles client-side).

| Env var | Purpose | Dev default (when unset) |
|---|---|---|
| `NEXT_PUBLIC_MAP_PROVIDER` | Informational provider label (`osm`, `maptiler`, …). | `osm` |
| `NEXT_PUBLIC_MAP_TILE_URL` | Leaflet XYZ tile template. Provider key (if any) is baked in here. | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Attribution HTML shown in the map corner. | `© OpenStreetMap contributors` |

**Local / dev (default — free, keyless):**

```dotenv
NEXT_PUBLIC_MAP_PROVIDER=osm
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_MAP_ATTRIBUTION=© OpenStreetMap contributors
```

**Production (recommended — a keyed provider):**

```dotenv
NEXT_PUBLIC_MAP_PROVIDER=maptiler
NEXT_PUBLIC_MAP_TILE_URL=https://api.maptiler.com/maps/YOUR_STYLE/{z}/{x}/{y}.png?key=YOUR_KEY
NEXT_PUBLIC_MAP_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
```

See `apps/web/.env.example` for the same matrix inline. Switching providers is an env change
and a redeploy — no code change.

## 6. Exact vs approximate coordinate rule (unchanged, and enforced)

The most important invariant survives intact. Courts have TWO real-geo coordinate pairs:

- **`approxLat` / `approxLng`** — an intentionally imprecise (~town-level) position. **Always
  public.** These are what every public map surface plots.
- **`lat` / `lng`** — the exact position. **Never in a public response.** The public Prisma
  selects (`courts.mapper.ts`) don't even *fetch* them, so the public payloads are
  structurally incapable of leaking them. They are available ONLY through the protected,
  entitlement-gated endpoint `GET /v1/me/courts/:slug/exact-location`.

How Feature 74 respects this:

- **`/map` and the Saved Wishlist Map** plot markers from `approxLat`/`approxLng` only (via
  `courtToMarker` in `map-markers.ts`). The Leaflet layer never receives exact coords.
- **Court Detail — locked/free viewer:** the map is centered on `approxLat`/`approxLng`,
  rendered **blurred and non-interactive** behind the "Unlock to reveal exact location" CTA.
  No exact coordinate is sent to a locked viewer.
- **Court Detail — entitled viewer:** the exact `lat`/`lng` arrive ONLY from the protected
  exact-location endpoint (a premium, authenticated read) and are used to plot the single
  precise marker; the server-built `directionsUrl` wires "Get Directions". This is the one
  path on which exact coords legitimately reach the client, exactly as the endpoint intends.

The `verify:api-parity` harness continues to assert, at every nesting depth, that public
responses contain **no** `lat`/`lng` key while **requiring** `approxLat`/`approxLng` — and it
still passes 35/35 (the approx keys were already allowed; no harness change was needed).

## 7. Manual verification result (2026-07-06, `api` mode)

Web on `127.0.0.1:18000`, API on `127.0.0.1:18001`, Postgres on `15432`,
`NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_MAP_PROVIDER=osm`.

### Automated gates — all green

```
pnpm --filter @tennis/web lint          → ✔ No ESLint warnings or errors
pnpm --filter @tennis/web typecheck     → ✔ tsc --noEmit, clean
pnpm --filter @tennis/web build         → ✔ 16 routes; /map + /courts/[slug] build with the
                                            lazy Leaflet chunk (no SSR "window is not defined")
pnpm verify:api-parity                  → ✔ 35/35 PASS (masking + approx-present invariants)
```

### Real-app checks (driven against the running dev server)

| # | Check | Result |
|---|---|---|
| 1 | `/map` returns 200 and renders the real map frame (`.tw-map-frame` / `map-canvas-wrap`) + Leaflet loading state | ✅ |
| 2 | `/map` payload carries `approxLat`/`approxLng` for the courts (14×), **no** `lat`/`lng` keys | ✅ no exact leak |
| 3 | Leaflet + the OSM tile URL are inlined into a **lazy** browser chunk (`LeafletMapInner`), not the shared bundle | ✅ |
| 4 | OSM tiles reachable (`a.tile.openstreetmap.org/2/1/1.png` → 200) | ✅ |
| 5 | Unlocked court (`grand-hotel-tremezzo`): approx marker; approx coords present, exact `45.9876,9.2233` **absent** | ✅ no exact leak |
| 6 | Locked court (`hotel-punta-tragara`): **blurred** approx map + "Unlock to reveal exact location" + "Unlock Full Access"; approx `40.55,14.24` present, exact `40.5489,14.2412` **absent** | ✅ no exact leak |
| 7 | `/saved` (logged out) still 307-redirects to `/signin?redirectTo=%2Fsaved` (auth unbroken) | ✅ |
| 8 | `/`, `/collections`, `/journal`, `/about` still 200 (no regressions) | ✅ |

### Deferred to the operator (needs an authenticated session)

- **Saved → Wishlist Map with real saved courts:** requires a logged-in session (magic-link
  dev flow: `POST /v1/auth/request-link` → grab `token=` from the API dev log → `/verify`).
  It reuses the **same** `LeafletMap` + `courtToMarker` path proven on `/map`, over the same
  `CourtSummaryDTO` shape (which carries `approxLat`/`approxLng` and masks exact coords), and
  the `/saved` route builds successfully — so this is expected-good, just not driven headless
  here.
- **Entitled exact-location preview:** requires a signed-in user with a seeded `Entitlement`
  (see `apps/api/scripts/verify-exact-location.ts` for the seed technique, and
  `apps/web/scripts/verify:web-exact-location` with `ENTITLED_BEARER_TOKEN`). The wiring is
  covered by that harness; the visual exact-marker path is exercised by the same component.

## 8. What did NOT change

No Google Maps, no Mapbox, no geolocation, no PostGIS. No new backend endpoint (approx coords
were already on the public DTOs). No `apps/web/app/api` route. No contract/schema/migration
change. No exact `lat`/`lng` in any public response. No `@tennis/mock-data` import in a UI
component. Auth, collections, add-to-collection, and Stripe are untouched.
