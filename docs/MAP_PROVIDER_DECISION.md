# Map Provider Decision (Feature 74)

**Date:** 2026-07-06
**Status:** Superseded by Feature 88 (2026-09-10) — see §0. Sections 1–8 below are kept as
the historical record of the Feature 74 decision; §2 and §5 carry inline notes pointing at
what replaced them. §6 (the exact/approximate coordinate invariant) is unchanged and still
governs the current, Google-backed implementation verbatim.
**Scope:** the map surface used by `/map`, the Saved → Wishlist Map tab, and the Court Detail location preview.

---

## 0. SUPERSEDED BY FEATURE 88 (2026-09-10) — Leaflet → Google Maps

**Date:** 2026-09-10
**Status:** Implemented
**Reverses:** §2's "No Google Maps" call and §5's Leaflet tile-env matrix, below. Nothing
else in this document changed — §6 in particular is explicitly unchanged.

Feature 88 replaces the Leaflet + OSM/MapTiler engine (§1–§5 below) with the **Google
Maps JavaScript API**. The reasons Leaflet was originally chosen (§2) — no key, no
account, self-contained — are real costs this reversal accepts knowingly: Google Maps is
now key-gated and billable per load, in exchange for a maps product with a familiar,
trusted look, address/POI context Leaflet's raster tiles didn't carry, and Google's own
maintained basemap instead of an OSM/MapTiler dependency this app had to operate.

### Variant decision — Map ID + `AdvancedMarkerElement` (not JSON styles + legacy `Marker`)

Google forces a fork between two mutually exclusive setups (setting `mapId` makes a JSON
`styles` array inert — you cannot use both):

| | JSON styles + legacy `Marker` | **Map ID + `AdvancedMarkerElement` (chosen)** |
|---|---|---|
| Styling | version-controlled JSON in the repo | Cloud-console style, referenced by `mapId` — **not** in git |
| Markers | SVG data-URI icon | `AdvancedMarkerElement.content` = a real `HTMLElement` |
| Marker API status | deprecated since Feb 2024 (still functional) | current |

**Chosen: Map ID + `AdvancedMarkerElement`.** The existing markers were already DOM (a
`divIcon` HTML string for Leaflet — `.tw-map-marker`, halo span, dot span, `--mk` custom
property), and `AdvancedMarkerElement.content` takes a real `HTMLElement`, so this was a
near-1:1 port that kept the existing `.tw-map-marker*` CSS unchanged. The JSON-styles path
would have meant re-expressing those markers as SVG data URIs and losing the CSS hover rule.

**The cost, accepted knowingly:** the map's visual style now lives in the Google Cloud
Console project backing `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, not in this repository. It is
not version-controlled, not reviewable in a diff, and not restored by `git checkout`.

- **Map ID:** provisioned per environment via `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — see
  `apps/web/.env.example`. No value is committed anywhere in this repo (§3/§4 of the main
  CLAUDE.md — secrets/public keys are never committed even when, as here, the key itself
  is public-by-construction).
- **Style description:** *(operator TODO — record here once a Cloud Console style is
  actually authored and attached to the Map ID: what it looks like, who owns the Cloud
  Console project, and the date it was last changed. As of this change, no custom style
  has been authored — the Map ID resolves to Cloud Console's default styling until one
  is.)*

### The coordinate invariant — unchanged (§6 below, verbatim)

Nothing about §6 changed. Public map surfaces still plot `approxLat`/`approxLng` only via
`courtToMarker` (`apps/web/src/features/map/map-markers.ts`, untouched by this migration);
exact `lat`/`lng` still reach the client only from the protected exact-location endpoint,
for a single marker, for an entitled viewer only; `directionsUrl` is still built
server-side and the web app still never assembles a maps URL from coordinates. The Maps JS
API is Google's network, so viewport centres/zoom levels now go to Google — but the map
layer still only ever receives what its caller hands it, and this migration added no
Places, Geocoding, or Directions call anywhere.

### The locked Court Detail preview no longer mounts a live map (new in Feature 88)

Under Leaflet, `CourtDetailLocationPreview`'s locked branch rendered a real, blurred,
non-interactive map centered on the approximate geo, with zero markers. Two things about
that stopped being fine once the engine is Google's:

- **Cost.** Court Detail is the most-visited page; every mount of a locked court's preview
  would be a billable Dynamic Maps load (roughly 10,000 free/month, then roughly $7/1,000
  as of the 2025 pricing restructure — check current pricing before relying on these
  numbers) for a map that is deliberately blurred and shows nothing.
- **Terms.** Google Maps Platform Terms of Service require attribution/branding/logo
  notices to stay visible, legible, and never obscured or modified. Blurring the *entire*
  map surface — the whole point of the locked treatment — necessarily blurs Google's
  required attribution and logo along with it, for both Dynamic and Static Maps content.

Given both, the locked preview now renders a **non-Google decorative placeholder** — a
static tonal gradient (`LockedMapPlaceholder` in `CourtDetailLocationPreview.tsx`), in the
same spirit as the pre-Feature-74 `StylizedMapCanvas` treatment, still blurred behind the
same lock glyph + "Unlock to reveal" CTA. No map, no coordinate, no third-party request,
no cost, and nothing to obscure. This decision was proposed and confirmed with the project
owner before implementation, per Feature 88's brief.

### What changed, file-by-file

- `apps/web/src/features/map/LeafletMapInner.tsx` → `CourtMapInner.tsx` (the engine: Maps
  JS API + `AdvancedMarkerElement`, loaded via `@googlemaps/js-api-loader`).
- `apps/web/src/features/map/LeafletMap.tsx` → `CourtMap.tsx` (the same SSR-safe
  `next/dynamic({ ssr: false })` wrapper, renamed to match).
- `apps/web/src/features/map/map-config.ts` — now resolves
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` instead of the old
  `NEXT_PUBLIC_MAP_PROVIDER` / `_TILE_URL` / `_ATTRIBUTION` trio (§5 below, superseded).
- `apps/web/src/features/map/map-markers.ts`, `geo-distance.ts`, `useGeolocation.ts`,
  `MapLocateControl.tsx`, `MapFilterBar.tsx`, `MapCourtList.tsx`, `MapCourtRow.tsx` —
  **untouched**. None of them were Leaflet-specific.
- `apps/web/src/features/court-detail/CourtDetailLocationPreview.tsx` — unlocked branches
  now render `CourtMap`; locked branches render `LockedMapPlaceholder` (above), not a map.
- `apps/web/src/app/globals.css` — `.leaflet-container` / `.leaflet-control-zoom` /
  `.leaflet-control-attribution` rules replaced with Google's own DOM hooks
  (`.gm-style` implicitly, `.gm-bundled-control`); the attribution rule was dropped
  deliberately, not ported (see the Terms point above).
- `apps/web/package.json` — `leaflet` + `@types/leaflet` removed; `@googlemaps/js-api-loader`
  + `@types/google.maps` added.
- `apps/web/scripts/verify-map-autofocus.ts` — re-pointed at the renamed files and
  re-expressed against the Google API; the behavioural half (`geo-distance.ts` and its
  fixtures) is untouched.

### `flyTo` → composed camera animation

Leaflet's `flyTo` animated pan *and* zoom together over 0.9s; Google's `panTo` animates
pan only, and there is no built-in combined animated camera move. `CourtMapInner`
implements one: a `requestAnimationFrame` loop calling `map.moveCamera({ center, zoom })`
each frame over the same 900ms, eased (`easeOutCubic`) — the documented pattern for a
composed Google Maps camera move. This preserves the "the map moved you here" feel rather
than silently downgrading to an instant jump.

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

> **⚠ SUPERSEDED (Feature 88, 2026-09-10) — see §0.** The "No Google Maps" call below was
> the Feature 74 project owner's decision at the time and was reversed by a later, explicit
> decision (also the project owner's) recorded in §0. It is kept here verbatim as the
> historical record of why Leaflet was chosen originally; it is no longer the operative
> rule. The Mapbox and geolocation/PostGIS calls immediately below were NOT reversed and
> still hold — this app uses no Mapbox and no PostGIS, and Feature 74's own later geo
> additions (nearest-court auto-focus) use only in-memory `navigator.geolocation`, never a
> spatial database.

- ~~**No Google Maps** — heavyweight, key-gated, and its look/licensing is wrong for an
  editorial product.~~ **Reversed by Feature 88 — see §0.**
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

> **⚠ SUPERSEDED (Feature 88, 2026-09-10) — see §0.** `NEXT_PUBLIC_MAP_PROVIDER`,
> `NEXT_PUBLIC_MAP_TILE_URL`, and `NEXT_PUBLIC_MAP_ATTRIBUTION` below no longer exist —
> `map-config.ts` no longer reads them, and they were removed from
> `apps/web/.env.example`/`.env.local`. Google has no tile URL and draws its own
> attribution, so there is nothing left for these three to configure. The current env
> surface is two vars: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
> `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` — see §0 and `apps/web/.env.example`. The table and
> examples immediately below are kept as the historical record of how tile provider
> selection worked under Leaflet; they describe no live code path.

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
