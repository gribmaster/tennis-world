# Feature 19 — Saved Page Layout Note

**Status:** Planning only — **no implementation in this feature.** This note translates the
`saved.html` prototype, the established luxury design language in `apps/web`, the current repository
architecture, and the Phase-1 mock-first constraints into a concrete, reviewable layout for the
`/saved` screen before any code is written. It is the Saved-screen analogue of
`docs/FEATURE_11_COURT_DETAIL_LAYOUT.md` and `docs/FEATURE_13_MAP_PAGE_LAYOUT.md`.

**Reference sources:**

1. `files/saved.html` — the `SavedPage` component (lines ~757–831) plus its `App` save-state wiring,
   the `.gmap` / `.pin-pulse` CSS, and the three-tab structure (Courts · Collections · Wishlist Map).
   This is the direct visual baseline (Saved, unlike Court Detail, *does* have a dedicated prototype).
2. The luxury design language already in `apps/web` (serif display type, `eyebrow` captions,
   `CourtCard`, the `AppShell` / `AppHeader` / `BottomNavigation` chrome, `.gmap` / `.pin-pulse`
   already ported to `globals.css` by the Map feature).
3. Phase-1 mock-first discipline — `docs/PHASE_1_WEB_MOCK_FIRST.md` §3.9, §4; Architecture Plan §5,
   §9 Risk #7 (mock user returns a User-shaped object, not a boolean) and Risk #17 (`mapCoords` ≠ geo).

**The screen this note plans:** `apps/web/src/app/saved/page.tsx` — a Phase-1 screen that currently
**404s**. Two live nav targets already point at it: the desktop `AppHeader` bookmark icon and the
mobile `BottomNavigation` "Saved" tab (both resolve via `PRIMARY_NAV` / `TAB_NAV` → `/saved`). This
screen makes them land somewhere.

---

## 1. The central architectural gap (read this first)

Every other Phase-1 screen reads through an existing repository on the factory (`courts`,
`collections`, `journal`). **Saved is the first screen whose primary data — "which courts/collections
has this user saved" — has no repository wired in yet.** Today:

- `apps/web/src/domain/index.ts` `Repositories` exposes only `courts`, `collections`, `journal`.
- `apps/web/src/domain/saved/` and `apps/web/src/domain/profile/` exist but contain only `.gitkeep`.
- `@tennis/contracts` already ships `UserProfileDTO` + `MembershipStatus` (a User-shaped stub, per
  Risk #7).
- `@tennis/mock-data` already ships `DEFAULT_MOCK_USER` and **`DEFAULT_SAVED_COURT_SLUGS`**
  (`['grand-hotel-tremezzo', 'belmond-la-residencia', 'soho-farmhouse']`).

So the data exists in mock-data; what's missing is the **sanctioned boundary** to read it through. The
phase doc (§3.9) names this repository: saved tabs are "all driven by `userRepository` mock methods."
This note recommends introducing that boundary now — minimally, read-only — rather than reaching into
`@tennis/mock-data` from the page (which the ESLint import-boundary rule forbids anyway).

See §4 for the precise minimal shape; see §11 risks for why the read-only constraint matters.

---

## 2. Route, data fetching, and the server/client split

- **Route:** `apps/web/src/app/saved/page.tsx` — a static App Router segment (no dynamic param),
  exactly like `app/collections/page.tsx` and `app/journal/page.tsx`.
- **Recommendation: split — a thin server page + one small client "tabs" component.** The page is
  mostly static content (grids of cards, a list of collections, a decorative map), but the **active
  tab is client state** (Courts / Collections / Wishlist Map switch on tap, like the prototype's
  `useState('courts')`). That single piece of interactivity is the only thing that needs `'use
  client'`. This mirrors the Map feature's pattern: server page = data boundary, one client component
  = interaction.

### 2.1 Server page (`app/saved/page.tsx`) — the repository boundary
- A normal `async` server component, exactly like the other list pages.
- It is the **only** place that touches `repositories` (data-driven discipline, Phase 1 §4). It
  fetches everything the three tabs need **once**, up front, and passes plain DTO arrays down as
  props:
  - **Saved courts:** read the saved court slugs (via the new saved/user repository — §4), then
    resolve each to a `CourtSummaryDTO`. Two acceptable shapes (decide in implementation):
    - simplest: `repositories.courts.list()` once, filter to the saved-slug set in the page (server
      side, not a component) — fine for the 12-court mock;
    - or a batch lookup if the saved repository exposes one (e.g. `getSavedCourts()` that already
      returns summaries). Prefer whichever keeps the page a thin orchestrator.
  - **Saved (user) collections:** read the user's wishlist folders (see §3.2 / §4). In Phase 1 these
    are a small fixed mock list returned by the repository.
  - **Wishlist pins:** reuse the **same** saved `CourtSummaryDTO[]` already fetched for the Courts tab
    — the map tab needs no extra fetch (pins are positioned from each summary's `mapCoords`).
- Wraps the client tabs component in `AppShell` (see §7) and passes the arrays in as props.

```ts
// Shape only — NOT to be implemented in this feature.
export default async function SavedPage() {
  const savedCourts = await repositories.saved.getSavedCourts();        // CourtSummaryDTO[]
  const savedCollections = await repositories.saved.getUserCollections(); // UserCollectionDTO[]
  return (
    <AppShell unlocked={false}>
      <SavedTabs savedCourts={savedCourts} savedCollections={savedCollections} />
    </AppShell>
  );
}
```
*(Method/repository names above are indicative — the implementation feature picks the exact surface
per §4. The point is: page fetches; components receive props.)*

### 2.2 Client tabs component (`SavedTabs`, `'use client'`) — interaction only
- Holds exactly one piece of state: `activeTab` (`'courts' | 'collections' | 'wishlist'`), default
  `'courts'`, matching the prototype.
- Renders the tab bar and switches which presentational panel is shown. It holds **no** court/
  collection copy of its own beyond the tab labels.
- It receives the already-fetched DTO arrays as props and hands them to the relevant panel. It does
  **not** call a repository and does **not** import `@tennis/mock-data`.

> **Why not make the whole page client?** Only the tab switch needs interactivity. Keep the client
> boundary as small as possible (one wrapper); the panels themselves can be plain presentational
> components rendered inside the client tree. This matches `MapExplorer`'s "one small client wrapper"
> precedent.

---

## 3. Tab behavior

The header is a `display-l` "Saved" title with a right-aligned count line (prototype: `{n} courts`),
followed by a three-tab bar with an underline indicator on the active tab (port the prototype's
bottom-border-on-active treatment; the active color is `ink`, inactive `stone`).

### 3.1 Tab 1 — Saved Courts (default)
- A responsive grid of saved courts, rendered with the **existing `CourtCard`** (see §6).
- Prototype grid: `repeat(auto-fill, minmax(260px, 1fr))`, gap 24 → in Tailwind, a
  `grid-cols-2 … lg:grid-cols-3/4` responsive grid (mobile-first; see §5).
- Cards link to `/courts/{slug}` (real navigation) and show the saved heart as **visual state only**
  (`CourtCard` already supports `showSaved` / `saved` with no onClick). **No unsave interaction in
  Phase 1** — see §11.
- Empty state when no saved courts (§3.4).

### 3.2 Tab 2 — Saved Collections (user wishlist folders)
- **Important distinction:** these are **not** the editorial `/collections` (Coastal, Desert, …).
  They are the **user's own wishlist folders** — the prototype hardcodes `Summer in Italy` (5 courts)
  and `Hidden Honeymoon` (3 courts), each shown as a horizontal **row**: a small stack of 2–3 court
  thumbnails on the left, the folder name (serif) + `{n} courts` eyebrow, and a chevron on the right.
- This is a **different card pattern from `CollectionCard`** (which is a full-bleed cover tile). The
  saved-collection row is a list-row layout, so it warrants a small feature-local component
  (`SavedCollectionRow`) rather than contorting the editorial collection card. See §6.
- Below the rows: a "+ New Collection" button. In Phase 1 this is a **labeled no-op / stub** (no
  create-folder mutation — see §11); render it for parity but wire it to nothing (or a disabled/"soon"
  affordance). Do **not** build folder creation.
- Empty state when the user has no wishlist folders (§3.4).

### 3.3 Tab 3 — Wishlist Map
- Present in the prototype, so include it. It is a **stylized, non-interactive decorative map** —
  the same `.gmap` background already ported to `globals.css` by the Map feature — with a pin per
  saved court.
- **Pins are positioned from `mapCoords` ONLY** (the `[x%, y%]` decorative screen position). The
  prototype actually fakes positions inline (`left: 22+i*10%`), but the app has real `mapCoords` on
  every `CourtSummaryDTO`, so use those. Each pin shows the `.pin-pulse` clay dot + a small label
  chip with the court name.
- A "Plan a Trip" button below (prototype wires it to the consultation modal). In Phase 1 the
  consultation modal isn't built yet → render the button as a stub / link placeholder, or omit it if
  it would be a dead control. Prefer a visible-but-inert CTA for parity; do not build the modal here.
- **HARD coordinate rules (Architecture Plan §9 Risk #17):** never use `lat`/`lng`; never expose exact
  coordinates in DOM/props/attributes; no real map provider (no Mapbox/Google/Leaflet); no
  geolocation. This is the same gate the Map feature already enforces — reuse that discipline verbatim.
- Empty state when no saved courts to plot (§3.4).

### 3.4 Empty states (all three tabs)
- Per the design prompt's "beautiful, not a dead-end" rule, every tab gets a centered empty state
  (eyebrow/`display-m` headline + `body-l` subline + a CTA back into discovery).
- The prototype gives the Courts empty copy verbatim: **"No saved courts yet."** / *"Save your
  favourites — they'll wait here for you."* Author parallel copy for Collections ("No collections
  yet…") and Wishlist ("Nothing to map yet…"), each with a CTA to `/map` or `/collections`.
- A single reusable `SavedEmptyState` (icon/headline/subline/CTA via props) covers all three (§6).
- **Note:** with `DEFAULT_SAVED_COURT_SLUGS` seeded to 3 courts, the Courts and Wishlist tabs render
  populated by default; the empty state is still required (it's the real state once unsave exists in
  Phase 4, and Collections may be empty depending on the mock). Build it; don't skip it because the
  default seed is non-empty.

---

## 4. Sourcing saved data in Phase 1 — recommended approach

**Recommendation: introduce a minimal, read-only `saved` (or `user`) repository on the factory now,
backed by `@tennis/mock-data`.** This is the principled resolution of §1 and is exactly what the phase
doc §3.9 anticipates ("driven by `userRepository` mock methods").

Concretely (for the implementation feature — **not** built here):

- Create `apps/web/src/domain/saved/` (or `…/user/`; `saved/` already exists as a `.gitkeep` folder
  and is the narrower, clearer name for this slice):
  - `saved.repository.ts` — the **interface**, typed against `@tennis/contracts` DTOs.
  - `mock-saved.repository.ts` — the mock implementation reading `DEFAULT_SAVED_COURT_SLUGS` /
    `DEFAULT_MOCK_USER` from `@tennis/mock-data` and (for saved courts) reshaping `COURTS` into
    `CourtSummaryDTO[]`. Plain TS, no React/Next, independently testable — same pattern as the other
    `mock-*.repository.ts` files.
  - `index.ts` — barrel re-exporting the interface + mock (mirrors `domain/journal/index.ts`).
- Wire it into `apps/web/src/domain/index.ts`: add `saved: SavedRepository` to the `Repositories`
  interface and `saved: new MockSavedRepository()` to the `'mock'` branch.

**Minimal interface surface (read-only for Phase 1):**

| Method | Returns | Notes |
|---|---|---|
| `getSavedCourts()` | `Promise<CourtSummaryDTO[]>` | Resolves `DEFAULT_SAVED_COURT_SLUGS` → summaries. Feeds Courts tab **and** Wishlist pins. |
| `getUserCollections()` | `Promise<UserCollectionDTO[]>` | The wishlist folders for the Collections tab. Phase-1 mock = a small fixed list. |

- **`UserCollectionDTO`:** the contract has `UserProfileDTO` but **no** wishlist-folder DTO yet. **Do
  not modify contracts in this feature.** The implementation feature must decide between (a) adding a
  small `UserCollectionDTO` to `@tennis/contracts` (a contracts change, sequenced as its own step,
  *not* part of building the page), or (b) for the very first cut, deriving the folder rows from
  already-available data. **Recommendation:** add the DTO in the implementation feature as an explicit,
  reviewed contracts change (the wishlist-folder shape is real domain data, not page chrome) — but it
  is out of scope for *this layout note*, which must not touch contracts.
- **No `getEntitlementStatus` needed here.** Saved doesn't gate on unlock (cards link out normally);
  `unlocked` is the same hardcoded `false` stand-in every page uses for the header CTA (§7).

**Why a repository and not just import mock-data in the page?** The ESLint import-boundary rule blocks
`@tennis/mock-data` and `mock-*.repository` imports outside the domain folder + `lib/repositories.ts`.
More importantly, routing saved-state through a repository is what makes the Phase-4 swap to a real
auth-backed `UserRepository` a wiring change, not a page rewrite (Risk #7). The page must read saved
state the same way it reads courts: through `repositories`.

**Explicitly rejected alternatives:**
- ❌ **Importing `@tennis/mock-data` directly in the page/components** — violates the boundary rule and
  the data-driven discipline; defeats the Phase-4 swap.
- ❌ **localStorage / client persistence of a saved set** — not needed for a read-only Phase-1 view,
  and the hard rules forbid it unless "explicitly justified and tiny." A read-only list from the mock
  repository needs no persistence. (Real save/unsave persistence is Phase 4 auth work.)
- ❌ **A client-side global save store** — over-building; there is no mutation in Phase 1, so there is
  nothing to store.

---

## 5. Responsive behavior (desktop vs. mobile)

- **Page frame:** standard `PageContainer` (the `.container-page` gutter) inside `AppShell`, with the
  page's own vertical rhythm (`py-section-lg md:py-section-xl`), like the other list pages. **Not**
  `overHero` (§7).
- **Tab bar:** horizontal, scrollable if needed on the narrowest screens (`no-scrollbar`); underline
  indicator on the active tab. Full-width on mobile, left-aligned on desktop.
- **Courts grid:** mobile-first — `grid-cols-2` on phones, widening to `sm:grid-cols-2`,
  `lg:grid-cols-3`, `xl:grid-cols-4` (reconcile with the prototype's `minmax(260px,1fr)` intent: ~2
  up on mobile, 3–4 up on desktop). Gap follows the design rhythm (≈16–24px).
- **Collections rows:** full-width stacked rows on all breakpoints; the thumbnail stack + text + chevron
  layout reads the same on mobile and desktop (rows just get more horizontal breathing room on
  desktop). Each row is a single tap target.
- **Wishlist map:** a fixed-height decorative panel (prototype: 500px) that scales down on mobile
  (e.g. `h-[60vh]` capped) — it's decorative, so exact height is flexible; keep pins within bounds.
- **Mobile tab bar clearance:** `AppShell` already adds bottom padding for the `BottomNavigation`
  (~56px + safe area); no extra handling needed.

---

## 6. Component reuse — `CourtCard` and collection patterns

- **`CourtCard` (reuse as-is):** the Courts tab grid is exactly a grid of court tiles. `CourtCard`
  already supports `href` (→ `/courts/{slug}`), the locked/featured/scenic badges, the `variant`
  (`default` 4:5), and the **visual-only** saved heart (`showSaved` + `saved`, no onClick). Use it
  directly — pass `showSaved saved` so saved courts show a filled heart, with **no** toggle wired
  (matches Phase-1 "no save mutation"). This is the third screen to reuse `CourtCard` (Home, Map, and
  Court Detail's related strip already do), so no new court-tile component is warranted.
- **Collection card patterns (do *not* reuse `CollectionCard` here):** the editorial `CollectionCard`
  is a full-bleed cover tile for `/collections`. The Saved → Collections tab needs a **list row**
  (thumbnail stack + folder name + count + chevron), which is a genuinely different layout. Build a
  small feature-local `SavedCollectionRow` rather than overloading `CollectionCard` with a row variant
  — same reasoning the Map note used for `MapCourtRow` vs. `CourtCard`.
- **`AppShell` / `AppHeader` / `BottomNavigation`** — chrome, unchanged. `/saved` is already in the
  nav config, so the tab/icon light up via `isActiveRoute` with no nav change.
- **`.gmap` / `.pin-pulse`** — already in `globals.css` (ported by the Map feature); the Wishlist tab
  reuses them. **No new global CSS expected** for this screen (confirm during implementation).

---

## 7. App-shell integration

- Render inside **`AppShell`** like every other screen. **Not `overHero`** — Saved has no full-bleed
  hero; it uses the standard solid header + `pt-[72px]` content offset (same as Collections / Journal /
  Court Detail).
- `unlocked={false}` — the same hardcoded Phase-1 stand-in every page uses (no auth/entitlement yet,
  Decision #11). Saved does not gate on unlock; this only controls the header's "Unlock Map" CTA.
- The desktop `AppHeader` bookmark icon and the mobile `BottomNavigation` "Saved" tab already target
  `/saved` (in `PRIMARY_NAV` / `TAB_NAV`) — no nav-config change needed; this page just makes them
  resolve.

---

## 8. Presentational components vs. page-level data fetching

**Page-level (server, `app/saved/page.tsx`):** the **only** repository boundary — reads saved courts
+ user collections (§4), wraps in `AppShell`, hands plain DTO arrays to the client tabs component. No
tab logic, no filtering beyond resolving the saved-slug set.

**Client wrapper (`SavedTabs`, the one `'use client'` boundary):** owns `activeTab` state, renders the
tab bar, switches panels. Holds no domain copy beyond tab labels.

**Presentational panels (no state, props only):** `SavedCourtsGrid`, `SavedCollectionsGrid` (rows),
`SavedWishlistMap`, `SavedEmptyState` — each receives its DTO array (or empty-state copy) via props
and renders. None fetch; none import `@tennis/mock-data`.

**Boundary rules carry over unchanged:** only the page imports `repositories`; no UI/feature component
imports `@tennis/mock-data`; new components take data via props. Keep new pieces **feature-local**
under `apps/web/src/features/saved/` (mirroring `features/map`, `features/court-detail`,
`features/collection-detail`).

---

## 9. Minimal component breakdown (identify only — DO NOT create now)

Likely feature-local components (`apps/web/src/features/saved/`), built in the *implementation*
feature, not here:

| Component | Kind | Responsibility |
|---|---|---|
| `SavedTabs` | **client** (`'use client'`) | The only stateful wrapper. Holds `activeTab`, renders the "Saved" header + count, the tab bar, and switches panels. Receives all DTO arrays as props. |
| `SavedCourtsGrid` | presentational | Courts tab. Responsive grid of `CourtCard`s (saved heart as visual state). Shows `SavedEmptyState` when empty. |
| `SavedCollectionsGrid` | presentational | Collections tab. List of `SavedCollectionRow`s + the stubbed "New Collection" button. Empty state when none. |
| `SavedCollectionRow` | presentational | One wishlist-folder row: thumbnail stack + serif name + `{n} courts` + chevron. (May be inlined into `SavedCollectionsGrid` if trivial — avoid premature splitting.) |
| `SavedWishlistMap` | presentational | Wishlist tab. Stylized `.gmap` panel with one `.pin-pulse` pin per saved court (positioned from `mapCoords` only) + stubbed "Plan a Trip" CTA. Empty state when none. |
| `SavedEmptyState` | presentational | Reusable empty state (icon/headline/subline/CTA via props) shared by all three tabs. |

`SavedTabs` from the prompt's example list is the client wrapper above (kept). The tab-label list and
empty-state copy are **local presentational constants** (page chrome, not domain data) — same latitude
`HomePaywallBand` / `MapFilterBar` take for local copy; they must **not** import `@tennis/mock-data`.

**Also required (not a component):** the read-only `saved` repository + factory wiring (§4) — a domain
change, sequenced before/with the page, not a UI component.

---

## 10. Data availability vs. missing fields

### Available now (sufficient to build most of the page)
- `DEFAULT_SAVED_COURT_SLUGS` + `COURTS` (via the new saved repo) → `CourtSummaryDTO[]` for the Courts
  grid and Wishlist pins (`mapCoords` present on every summary).
- `CourtSummaryDTO`: `id, slug, name, country, region, surface, setting, access, indoorOutdoor,
  isScenic, isFeatured, isLocked, heroImageUrl, mapCoords` — everything `CourtCard` and the pins need.
- `UserProfileDTO` + `DEFAULT_MOCK_USER` — available if the header/count ever needs the user (not
  strictly required for the three tabs).
- `.gmap` / `.pin-pulse` — already in `globals.css`.

### Missing-but-addressable (do **not** resolve in this layout note — hard rule: do not modify contracts)
| Gap | Where it bites | Resolution (in the *implementation* feature, sequenced separately) |
|---|---|---|
| No `saved`/`user` repository on the factory | All three tabs' data source | Add a minimal read-only `saved` repository + factory wiring (§4). This is the prerequisite step. |
| No `UserCollectionDTO` in `@tennis/contracts` | Collections tab rows | Add a small wishlist-folder DTO as an explicit, reviewed contracts change in the implementation feature — **not here.** |
| No consultation modal yet | Wishlist "Plan a Trip" CTA | Render an inert/stub CTA for parity; the modal is a separate later feature. |
| No save/unsave mutation, no folder creation | Heart toggle, "New Collection" | Out of scope by design (Phase 4 auth). Render visual-only / stub controls. |

Recorded only so the implementation feature doesn't rediscover them as surprises.

---

## 11. Implementation risks (call out before building)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Auth scope creep** — Saved feels like a "logged-in" page, tempting real auth / session / entitlement wiring. | **No auth in Phase 1** (Decision #11). The "user" is a fixed mock profile; saved state is a read-only mock list. `unlocked={false}` stays a hardcoded stand-in. The mock repo returns a User-*shaped* object so Phase 4 swaps the adapter, not the page (Risk #7). |
| 2 | **Save-mutation scope creep** — adding heart toggle / unsave / "New Collection" create. | **No save/unsave mutation, no folder creation in Phase 1.** `CourtCard`'s heart is visual-only (no onClick); "New Collection" and "Plan a Trip" are labeled stubs/no-ops. Build the read-only view only. |
| 3 | **localStorage / persistence hacks** — to "make saving feel real." | **Forbidden** unless explicitly justified and tiny — and a read-only list needs none. Saved data comes from the mock repository, full stop. No client save store, no `localStorage`. |
| 4 | **Keeping the repository boundary** — page/components reaching into `@tennis/mock-data` for the saved slugs. | All saved data enters via the new `saved` repository → the server page → props. The ESLint import-boundary rule already blocks `@tennis/mock-data` / `mock-*.repository` imports outside the domain; components receive DTO arrays only. |
| 5 | **Client/server split** — over-clienting the page because of the tabs. | One `async` server page = the only data boundary; one small `'use client'` `SavedTabs` for `activeTab`. Panels stay presentational. Keep the client boundary minimal (the Map feature's precedent). |
| 6 | **Real coordinates / map provider on the Wishlist tab** — easy to reach for `lat`/`lng` or a real map. | Pins positioned from **`mapCoords` only**; `lat`/`lng` are absent from `CourtSummaryDTO` and must stay out of the client. No Mapbox/Google/Leaflet, no geolocation. Reuse the Map feature's `.gmap` discipline as a code-review gate (Risk #17). |
| 7 | **Conflating user wishlist folders with editorial collections** — reusing `/collections` data or `CollectionCard`. | The Collections tab is the **user's wishlist folders**, a distinct concept and a distinct row layout. Use `SavedCollectionRow`, not `CollectionCard`; do not pull from `repositories.collections`. |
| 8 | **Contracts drift** — adding `UserCollectionDTO` mid-page-build. | **This layout note must not modify contracts.** Sequence the DTO addition as its own reviewed step in the implementation feature, before the Collections tab consumes it. |

---

## 12. Phase-1 scope guardrails (for the implementation feature)

- **Read-only Saved view** — no save/unsave, no folder creation, no persistence, no `localStorage`.
- **One server page = the only repository boundary**; one small `'use client'` `SavedTabs` for the
  active tab; panels are presentational and prop-fed.
- **New `saved` repository is read-only** and mock-backed (`DEFAULT_SAVED_COURT_SLUGS`), wired on the
  factory; the page reads saved state through `repositories`, never `@tennis/mock-data`.
- **Reuse `CourtCard`** (heart as visual state only) for the Courts grid; new pieces feature-local
  under `features/saved/`.
- **Wishlist map** is the stylized `.gmap` canvas with pins from **`mapCoords` only** — never
  `lat`/`lng`, never a real map provider, no geolocation.
- **Stub CTAs** ("New Collection", "Plan a Trip") render for parity but do nothing (their real
  behavior is later features).
- **No `app/api`, no backend, no auth/payments, no contract changes** in the page-build step
  (a `UserCollectionDTO` contracts addition, if taken, is a separate sequenced step).

---

## Next implementation prompt

> **Feature 20: Implement the Saved page (`/saved`).**
> Build `apps/web/src/app/saved/page.tsx` per `docs/FEATURE_19_SAVED_PAGE_LAYOUT.md`.
> - **First**, add a minimal **read-only** `saved` repository: `apps/web/src/domain/saved/`
>   (`saved.repository.ts` interface + `mock-saved.repository.ts` reading `DEFAULT_SAVED_COURT_SLUGS`
>   / `COURTS` from `@tennis/mock-data`, plain TS, no React) and wire it into
>   `apps/web/src/domain/index.ts` (`saved` on `Repositories` + the `'mock'` branch). If the
>   Collections tab needs a wishlist-folder shape, add `UserCollectionDTO` to `@tennis/contracts` as
>   an explicit, separate, reviewed step before consuming it.
> - **Server page:** fetch saved courts (`CourtSummaryDTO[]`) + user collections once; wrap a client
>   `SavedTabs` in `AppShell unlocked={false}` (not `overHero`).
> - **Create feature-local components** under `apps/web/src/features/saved/`: `SavedTabs`
>   (`'use client'`, owns `activeTab`, renders the "Saved" header + count + tab bar), `SavedCourtsGrid`
>   (responsive `CourtCard` grid, heart visual-only), `SavedCollectionsGrid` + `SavedCollectionRow`
>   (wishlist folder rows + stubbed "New Collection"), `SavedWishlistMap` (stylized `.gmap` panel,
>   pins from `mapCoords` only, stubbed "Plan a Trip"), and a shared `SavedEmptyState`.
> - **HARD RULES:** read-only (no save/unsave, no folder creation, no `localStorage`); position pins
>   from `mapCoords` only — never `lat`/`lng`, never expose exact coords; no map library, no
>   geolocation; only the page imports `repositories`; no `@tennis/mock-data` in any UI/feature
>   component; no `app/api`, no auth/payments; reuse `CourtCard` (not `CollectionCard`) and the
>   existing `.gmap` / `.pin-pulse` CSS.
> - Verify against `files/saved.html` for visual parity and confirm the desktop bookmark icon and the
>   mobile "Saved" tab now resolve to `/saved`. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.
