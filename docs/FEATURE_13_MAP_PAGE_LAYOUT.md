# Feature 13 — Map Page Layout Note

**Status:** Planning only — **no implementation in this feature.** This note translates the
`map.html` prototype, the established luxury design language in `apps/web`, and the Phase-1
mock-first constraints into a concrete, reviewable layout for the `/map` screen before any code is
written. It is the Map-screen analogue of `docs/FEATURE_11_COURT_DETAIL_LAYOUT.md`.

**Reference sources:**

1. `files/map.html` — the `MapPage` component (lines ~757–859) plus its `.map-layout` /
   `.gmap` / `.filter-pill` CSS and the `Nav` behavior. This is the direct visual baseline (the Map
   screen, unlike Court Detail, *does* have a dedicated prototype).
2. The luxury design language already in `apps/web` (serif display type, `eyebrow` captions,
   `meta-chip` / `filter-pill` pills, `locked-badge`, `img-overlay`, `no-scrollbar`, the `AppShell` /
   `AppHeader` / `BottomNavigation` chrome).
3. Phase-1 mock-first discipline — `docs/PHASE_1_WEB_MOCK_FIRST.md` §3.3, §4; Architecture Plan §5,
   §9 Risk #1 (no PostGIS) and Risk #17 (`mapCoords` ≠ geo).

**The screen this note plans:** `apps/web/src/app/map/page.tsx` — a **required** Phase-1 screen.
Three live CTAs already point at it and currently 404: `HomeHero` "Explore the Map", `AppHeader`
"Unlock Map", and `HomeFeaturedCourts` "View all courts". This screen makes them resolve.

---

## 1. Route, data fetching, and the server/client split

- **Route:** `apps/web/src/app/map/page.tsx` — a static App Router segment (no dynamic param).
- **Recommendation: split — a thin server page + a single client "map view" component.** Unlike
  Home and Court Detail (which are fully server-rendered), the Map screen is **inherently
  interactive**: the search box and filter chips drive which courts show in both the canvas and the
  list, and that selection changes on every keystroke / chip tap. That interactivity needs client
  state.

### 1.1 Server page (`app/map/page.tsx`) — the repository boundary
- A normal `async` server component, exactly like `app/page.tsx` and `courts/[slug]/page.tsx`.
- It is the **only** place that touches `repositories` (data-driven discipline, Phase 1 §4). It
  fetches **once, unfiltered**, and passes the full dataset down as props:
  - `repositories.courts.list()` → `CourtSummaryDTO[]` — the full published set for the list panel
    and as the source the client filters over.
  - `repositories.courts.getMapPins()` → `MapPinDTO[]` — pin positions + state for the canvas.
- Wraps the client view in `AppShell` (see §6) and passes the two arrays in as props.

```ts
// Shape only — NOT to be implemented in this feature.
export default async function MapPage() {
  const [courts, pins] = await Promise.all([
    repositories.courts.list(),
    repositories.courts.getMapPins(),
  ]);
  return (
    <AppShell unlocked={false}>
      <MapExplorer courts={courts} pins={pins} />
    </AppShell>
  );
}
```

### 1.2 Client view (`MapExplorer`, `'use client'`) — interaction only
- Holds the UI state: `query` (search string) and `activeFilter` (one of the chip values).
- Derives the filtered list **in memory from the props it was handed** — it does **not** call a
  repository (it can't; it's a client component and the repo isn't wired for the browser to call
  per-keystroke). See §2 for why this is the correct, discipline-preserving choice here.
- Renders the filter bar, the canvas, and the list panel, all reading from the same derived
  filtered list so canvas pins and list rows always agree.

> **Why not fetch per-filter through the repository?** The phase doc (§3.3) says filtering "happens
> through `courtRepository.list(filter)` … the mock repository owns the filter logic." In Phase 1
> the repositories are synchronous in-memory mocks, but the page is a **server** component and the
> filter state is **client** state — there is no sanctioned way to call a server repository on every
> keystroke without inventing an `app/api` route (forbidden, Decision #16) or a server action per
> keystroke (overkill). The resolution that honors **both** rules: the server page calls
> `repositories.courts.list()` once at the boundary; the client view does the cheap presentational
> narrowing of that already-fetched 12-item array. The narrowing predicate should mirror
> `CourtFilter` semantics (see §3) so the eventual Phase-2 swap — server page calls
> `list(filter)` with the filter pushed up via the URL — is a small, well-understood change, not a
> rewrite. **Flag this as the one place where the "repository owns filtering" guidance is
> consciously relaxed for Phase 1**, and document it in code comments.

---

## 2. Filter chips & search behavior

- **Filter chips** (prototype `filters`): **All · Resorts · Clubs · Private · Indoor · Scenic** —
  single-select, default **All**. These map directly to `CourtFilter` fields:
  | Chip | Predicate (mirrors `CourtFilter`) |
  |---|---|
  | All | _no filter_ |
  | Resorts | `access === 'Resort'` |
  | Clubs | `access === 'Club'` |
  | Private | `access === 'Private'` |
  | Indoor | `indoorOutdoor === 'Indoor'` |
  | Scenic | `isScenic === true` |
  - Render with the existing **`.filter-pill`** class. **Note:** the class already exists in
    `globals.css` and uses **`.is-active`** for the selected state (the prototype used `.active`) —
    use `is-active`. No new CSS for the chips.
- **Search** (prototype `query`): free-text over **name / country / region** (the prototype also
  includes `setting`; matching `MockCourtRepository.matchesQuery`, which searches
  name/country/region/**setting**, is the better target — mirror that). Case-insensitive
  `includes`. Combine with the active chip via **AND** (chip predicate **and** query match), exactly
  as the prototype's `filtered` memo does.
- **The filter-bar copy/labels are local presentational constants**, not court data — the chip label
  list may live as a `const` in the client component (same latitude `HomePaywallBand` takes for its
  local copy). It must **not** import `@tennis/mock-data`.
- **Active-filter echo:** the list-panel header shows the active chip name when not "All" (prototype:
  `Courts in view · {filter}`), and the count updates live (`{n} places`).

---

## 3. Map canvas approach for Phase 1

- **A stylized, non-interactive decorative background** — **not** a real map.
- Port the prototype's `.gmap` CSS gradient (water/land radial gradients + `saturate/sepia` filter)
  into `globals.css` as a component class (it is **not** present there yet — only `.filter-pill`,
  `.meta-chip`, `.pill`, `.no-scrollbar` have been ported so far). Add the faint continent labels
  ("EUROPE / ASIA / AMERICAS") and the decorative cluster bubble as static positioned text.
- **Pins** come from `MapPinDTO`: position from `pin.mapCoords` (`[x%, y%]`), styling from
  `pin.state` (`'open' | 'locked' | 'featured'`):
  - `featured` → clay (`#B95C3A`), larger, `pin-pulse` animation (port `.pin-pulse` keyframes too).
  - `locked` → graphite.
  - `open` → moss.
  - Each pin is a `<button>`/`<Link>` to `/courts/{slug}` (the pin carries `slug`).
- **Pins must reflect the active filter**: only render pins whose court is in the current filtered
  set. Since the client filters `courts` (the summaries) but positions come from `pins`, key the two
  together by `slug` (every `CourtSummaryDTO` and every `MapPinDTO` carries `slug`) — render a pin
  only if its `slug` is in the filtered summary set.

### 3.1 Coordinate safety — HARD RULES (Architecture Plan §9 Risk #17)

This is the single most important constraint on this screen.

- **Phase-1 pin placement uses `mapCoords` ONLY** — the `[x%, y%]` decorative screen position. It is
  **not geographic** and conveys no real location.
- **Never use `lat` / `lng`.** Exact coordinates are `optional` on `CourtDTO`, are **not** on
  `CourtSummaryDTO` or `MapPinDTO` at all, and are reserved for the Phase-2/Phase-4 server-side
  masking boundary. They must never reach the client or drive any pixel on this canvas.
- **Do not expose exact coordinates** anywhere in the DOM, props, data attributes, or tooltips.
- `approxLat` / `approxLng` exist on the summary but are **not used by this screen** either — the
  stylized canvas is purely `mapCoords`-driven.
- **No real map provider.** Do **not** add Mapbox, Google Maps, or Leaflet. **No geolocation.** No
  bbox/zoom geospatial querying (no PostGIS — Risk #1); `getMapPins()` ignores `bbox`/`zoom` in the
  mock and returns one pin per court.

---

## 4. List panel behavior

Driven by the **same filtered list** as the canvas (one source of truth → canvas and list never
disagree). The panel has a header + a body that switches layout by breakpoint (see §5).

- **Header:** eyebrow "Courts in view" (+ active chip echo when not "All"), then a `display-m` count
  line (`{n} places`, singular `place` for 1) — straight from the prototype.
- **Body — court entries:**
  - **Desktop (`md+`): a vertical row list.** Each row = small thumbnail + `eyebrow`
    (`country · region`) + serif name + a `surface · setting` sub-line, with a lock glyph on locked
    courts. Whole row links to `/courts/{slug}`.
  - **Mobile: a horizontal card strip.** Compact cards, horizontally scrollable (`no-scrollbar`).
  - **`CourtCard` reuse:** the phase doc and the Feature-11 precedent push hard on reusing
    `CourtCard`. It already supports `href` (→ `/courts/{slug}`), the `locked`/`featured` badges, and
    a `variant` (`default` 4:5 / `large` 3:2). **Recommendation:** use `CourtCard` for the **mobile
    card strip** (it is exactly a compact court tile). For the **desktop horizontal-thumbnail rows**,
    the prototype's row is a *different* layout (left thumbnail + stacked text + `surface · setting`
    line) that `CourtCard` does **not** express — so a small **feature-local `MapCourtRow`** is
    warranted there rather than contorting `CourtCard`. (Both are still fed `CourtSummaryDTO` and
    stay presentational.) If time-boxed, using `CourtCard` for *both* breakpoints is an acceptable
    Phase-1 simplification — prefer it over building a bespoke row if the row adds cost.
- **Empty state:** when the filtered list is empty, show the prototype's message (`No courts match
  "{filter}"`) + a "Reset filters" button that clears query + sets chip back to All. Per the design
  prompt's "beautiful, not a dead-end" rule.
- **Pin → list / list → pin highlighting (active/selected court):** the prototype does **not**
  implement hover/selected linking between a pin and its row — clicking either just navigates to the
  court. **Recommendation: match the prototype — navigation only, no selected-court state in
  Phase 1.** A "highlight the row when its pin is hovered" affordance is a reasonable *nice-to-have*
  but is **out of scope** here; note it for a later pass rather than building it now (avoid
  over-building).

---

## 5. Responsive behavior (desktop vs. mobile layout)

The prototype's `.map-layout` is the spec — **port these classes** (they are not in `globals.css`
yet):

- **Mobile (default): stacked column.** Canvas on top (`flex: 0 0 55vh`), list panel below it
  (`flex: 1`), with the list body as the **horizontal card strip**. Full height is
  `calc(100dvh − header − filter-bar)`.
- **Desktop (`md+`): side-by-side row.** Canvas fills the remaining width (`flex: 1`), list panel is
  a fixed **380px** right column with its own vertical scroll and a left hairline border; the list
  body becomes the **vertical rows**.
- **Filter/search bar:** a sticky bar under the app header (prototype: `position: sticky; top: 72`).
  Search pill on the left (max ~480px), chips in a horizontally-scrollable `no-scrollbar` row on the
  right.
- **Height math & the app shell:** the prototype assumes a 72px top nav **and** a 77px element below;
  `apps/web` uses the **72px `AppHeader`** plus a **mobile `BottomNavigation` (~56px + safe area)**
  that the standalone HTML didn't have. The map view should occupy the viewport minus header (and
  minus the mobile tab bar / its safe-area inset). Compute height from the shell's real chrome, not
  the prototype's literal `72px + 77px`. Because the canvas/list want to own the full viewport, this
  screen likely wants the `AppShell`'s standard `pt-[72px]` offset **but** a full-height inner region
  — confirm the exact height expression against `AppShell` during implementation (it may warrant a
  small prop or a page-specific wrapper rather than the default scrolling `<main>`).

---

## 6. App-shell integration

- Render inside **`AppShell`** like every other screen. **Not `overHero`** — the map screen has no
  full-bleed hero; it uses the standard solid header + content offset (same as Court Detail).
- `unlocked={false}` — hardcoded Phase-1 stand-in (no auth/entitlement yet, Decision #11), identical
  to Home and Court Detail. The header's "Unlock Map" CTA already links here; that's fine.
- The mobile `BottomNavigation` already highlights **Map** for `/map` (via `isActiveRoute`), and the
  desktop nav's **Map** link lights up — no nav-config change needed (`/map` is already in
  `PRIMARY_NAV` and `TAB_NAV`).

---

## 7. Presentational components vs. page-level data fetching

**Page-level (server, `app/map/page.tsx`):** the **only** repository boundary — `courts.list()` +
`courts.getMapPins()`, wrap in `AppShell`, hand both arrays to the client view as props. No filter
logic here.

**Client view (`MapExplorer`, the one `'use client'` boundary):** owns `query` + `activeFilter`
state, derives the filtered list, and composes the presentational pieces below. Holds **no** court
copy of its own beyond the chip-label constants.

**Reused existing components (no new ones needed for these):**
- `CourtCard` — mobile card strip (and optionally desktop rows). Already has `href`, badges, variant.
- `AppShell` / `AppHeader` / `BottomNavigation` — chrome, unchanged.
- `.filter-pill`, `.meta-chip`, `.pill`, `.no-scrollbar` — already in `globals.css`.

**Boundary rules carry over unchanged:** only the page imports `repositories`; no UI/feature
component imports `@tennis/mock-data`; new components take data via props. Keep new pieces
**feature-local** under `apps/web/src/features/map/` (mirroring `features/home`, `features/court-detail`).

---

## 8. Minimal component breakdown (identify only — DO NOT create now)

Likely feature-local components (`apps/web/src/features/map/`), built in the *implementation*
feature, not here:

| Component | Kind | Responsibility |
|---|---|---|
| `MapExplorer` | **client** (`'use client'`) | The only stateful wrapper. Holds `query` + `activeFilter`, derives the filtered list, lays out filter bar + canvas + list. |
| `MapFilterBar` | presentational (within client tree) | Search input + filter chips. Emits state changes up to `MapExplorer`. (`MapSearchBar` can fold into this — one bar — rather than being a separate component; split only if it earns its keep.) |
| `MapCanvas` | presentational | The stylized `.gmap` background + continent labels + rendered pins. Takes the filtered pins, renders `MapPin`s. |
| `MapPin` | presentational | One pin: position from `mapCoords`, style from `state`, links to `/courts/{slug}`. (May be inlined into `MapCanvas` if trivial — avoid premature splitting.) |
| `MapCourtList` | presentational | The list panel: header (count + active-filter echo), the breakpoint-switched body (mobile card strip via `CourtCard` / desktop rows), and the empty state. |
| `MapCourtRow` | presentational | *Optional* desktop row (thumbnail + text + `surface · setting`) if not reusing `CourtCard` for desktop. Drop it if `CourtCard` is used for both breakpoints. |

`MapSearchBar` from the prompt's example is intentionally **folded into `MapFilterBar`** (the
prototype has a single combined bar); list it as a candidate only if the search grows independent
behavior.

**Also required (not a component):** port `.gmap`, `.pin-pulse`, and the `.map-layout` /
`.map-canvas-wrap` / `.map-list-panel` responsive rules into `globals.css` — these are the only
map-specific styles not yet present.

---

## 9. Data availability vs. missing fields

### Available now (sufficient to build the page)
- `CourtSummaryDTO` (from `list()`): `id, slug, name, country, region, surface, setting, access,
  indoorOutdoor, isScenic, isFeatured, isLocked, heroImageUrl, mapCoords, approxLat, approxLng` —
  everything the filter predicates, the list rows, and `CourtCard` need.
- `MapPinDTO` (from `getMapPins()`): `courtId, slug, mapCoords, state` — everything the canvas pins
  need.

### Missing-but-non-blocking (do **not** add — hard rule: do not modify contracts)
| Field | Where it would help | Phase-1 workaround |
|---|---|---|
| A real-map tile / provider config | true interactive map | Out of scope by design — stylized `.gmap` canvas only. |
| Clustered/aggregated pin counts per tier | World→Region→City zoom hierarchy | `getMapPins()` returns one pin per court for the 12-court set; no clustering needed (Risk #1). |
| `mapCoords` collision/overlap handling | dense pin areas | 12 courts on the mock canvas don't collide meaningfully; ignore for Phase 1. |

Recorded only so the implementation feature doesn't rediscover them as surprises.

---

## 10. Implementation risks (call out before building)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Client/server split** — the screen is interactive (filter state) but the repository boundary is server-side. | Server page fetches once (`list()` + `getMapPins()`); a **single** `'use client'` `MapExplorer` owns state and narrows the already-fetched array. Keep the client boundary as small as possible; everything else stays server-rendered. |
| 2 | **Filtering state location** — phase doc says "the repository owns filtering," but per-keystroke state is client-side. | Consciously relax that guidance **for Phase 1 only**: filter in the client over the fetched array, using a predicate that **mirrors `CourtFilter` semantics**, so Phase 2 can lift filtering back to a server `list(filter)` call (filter pushed via URL) without a rewrite. Document the relaxation in code comments. |
| 3 | **Avoiding real coordinates** — easy to accidentally reach for `lat`/`lng`. | Pins are positioned **only** from `mapCoords`. `lat`/`lng` are absent from `CourtSummaryDTO`/`MapPinDTO` and must stay out of the client. Make this a code-review gate (§3.1). |
| 4 | **Keeping the repository boundary** — a client component must not import `repositories` or `@tennis/mock-data`. | All data enters via the server page → props. The ESLint import-boundary rule already blocks `@tennis/mock-data` / `mock-*.repository` imports; the client view receives DTO arrays only. |
| 5 | **Mobile panel complexity** — the dual canvas/list layout + height math is the fiddliest part. | Port the prototype's `.map-layout` verbatim, but compute height from the **real** `apps/web` chrome (72px header + mobile `BottomNavigation` + safe-area), not the prototype's literal `72+77`. Reconcile with `AppShell`'s scrolling `<main>` (may need a small prop/wrapper). Card strip (mobile) vs. rows (desktop) is a pure CSS breakpoint switch. |
| 6 | **Not over-building the map** — temptation to add a real provider, clustering, zoom, geolocation, or pin↔row selection state. | Hard "no" on map libraries / geolocation / PostGIS. Selected-court highlighting and clustering are explicitly **out of scope** (match the prototype: navigate-only). Build the smallest thing that reaches prototype parity. |
| 7 | **Pin/list set divergence** — canvas pins and list rows could drift if filtered independently. | Derive one filtered set in `MapExplorer`; key pins and rows by `slug`; render a pin only if its `slug` is in the filtered summary set. |

---

## 11. Phase-1 scope guardrails (for the implementation feature)

- Stylized **`.gmap` canvas only** — no real map, no provider library, no geolocation, no zoom/bbox.
- Pins placed from **`mapCoords` only**; **never** `lat`/`lng`; exact coords never exposed.
- One server page = the only repository boundary; one small `'use client'` `MapExplorer` for state.
- Filtering done client-side over the fetched array with `CourtFilter`-mirroring predicates (the one
  consciously-relaxed Phase-1 boundary — documented in code).
- Reuse `CourtCard` for the mobile strip (and optionally desktop rows); keep new pieces feature-local
  under `features/map/`.
- CTAs to `/courts/{slug}` are real links; "Unlock Map" is a no-op CTA stand-in (no paywall/auth).
- No `app/api`, no backend, no contract/repository changes, no auth/payments, no map libraries.

---

## Next implementation prompt

> **Feature 14: Implement the Map page (`/map`).**
> Build `apps/web/src/app/map/page.tsx` per `docs/FEATURE_13_MAP_PAGE_LAYOUT.md`.
> - Server page: fetch `repositories.courts.list()` + `repositories.courts.getMapPins()` once;
>   wrap a client `MapExplorer` in `AppShell unlocked={false}` (not `overHero`).
> - Create feature-local components under `apps/web/src/features/map/`: `MapExplorer`
>   (`'use client'`, owns `query` + `activeFilter`, derives the filtered set), `MapFilterBar`
>   (search + `.filter-pill` chips: All/Resorts/Clubs/Private/Indoor/Scenic), `MapCanvas` + `MapPin`
>   (stylized `.gmap` background, pins from `mapCoords`, styled by `state`, linking to
>   `/courts/{slug}`), and `MapCourtList` (header count + active-filter echo, mobile `CourtCard`
>   strip / desktop rows, empty state with reset).
> - Port `.gmap`, `.pin-pulse`, and the `.map-layout` / `.map-canvas-wrap` / `.map-list-panel`
>   responsive rules into `globals.css`; compute height from the real shell chrome (72px header +
>   mobile bottom nav + safe area).
> - HARD RULES: position pins from `mapCoords` only — never `lat`/`lng`, never expose exact coords;
>   no map library, no geolocation, no PostGIS; only the page imports `repositories`; no
>   `@tennis/mock-data` in any UI/feature component; no `app/api`, no contract/repository changes,
>   no auth/payments.
> - Verify against `files/map.html` for visual parity and confirm all three CTAs ("Explore the Map",
>   "Unlock Map", "View all courts") now resolve to `/map`.
