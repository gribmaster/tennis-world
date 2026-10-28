# TASK 57 — Redesign v3: Courts screen (`/map`) — card grid + map panel, guest map gate

**Model: Sonnet 5, reasoning effort: high.** This is the biggest v3 task so far: it rebuilds one screen and moves the geolocation logic.

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55 (pill nav) and TASK_56 (shared `CourtCard`) are done and are assumed.

## Goal

`/map` stops being "full-height map + list panel". In v3 it is a **card screen with a small map attached**:

- heading ("N Courts", or "Sign in to view the map" for guests) + search bar with an inline filter button;
- a grid of the shared `CourtCard` (TASK_56) — this is the main content;
- a **map preview panel**; click it and the map opens full-size in a modal;
- a status line ("Sign in to save courts & view the map" / "Free Access — Upgrade for every court" / "Full Map Access — Unlocked").

Route stays `/map`. Nav label "Courts" already done in TASK_55.

Reference (read the `CourtsScreen` / `MapScreen` functions, don't port the demo scaffolding):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`, `function CourtsScreen` (~line 352) and `.search-bar` / `.lock-overlay` / `.map-bg` in the `<style>` (~lines 57–86);
- mobile: `tennis_world_v17_standalone.html`, `function MapScreen` (~line 452).

## Decisions already made (do not re-litigate)

1. **Guests do not get the map.** A signed-out visitor sees the locked placeholder instead of the map, the list stays. Signed-in free users get the map with premium courts still masked. (`REDESIGN_V3_PLAN.md`, decision 3.)
2. **Search narrows the grid** (the app's current behaviour, also what `/map?q=` from Collections relies on). Do **not** port the prototype's search-results dropdown.
3. **The quick-filter chip row goes away.** The filter button in the search bar opens the existing shared `FilterSheet` on both mobile and desktop (it is already a bottom sheet on mobile and a centered dialog on desktop — which is what v3 shows).
4. Pricing/plan copy: nothing here mentions a price. Keep v3's strings exactly as listed below.

## Layout spec

Tokens already match; sizes below are straight from the prototypes.

### Desktop (md+)

Page container: `PageContainer` (`.container-page`), top gap ≈ 32–44px under `--nav-offset`, bottom ≈ 72px.

Two-column grid `grid-cols-[1fr_380px] gap-x-8`:

| Row | Left | Right (380px) |
|---|---|---|
| 1 (heading row, bottom-aligned, `mb-8`) | `<h1>` + link line | search bar, 380px wide |
| 2 | card grid | map panel + status card |

- `<h1>`: serif 44px, weight 400. Text: guest → `Sign in to view the map`; otherwise `{n} Court` / `{n} Courts` where `n` is the **currently visible (filtered) count**.
- Link line under it, 14px, `mt-2`, underlined, ink:
  - guest → lock glyph (11px) + `Sign in to unlock the map →`, a `PendingLink` to `/signin?redirectTo=/map`;
  - free (signed in, not entitled) → `Unlock full map access →`, opens the existing paywall: `<PaywallTrigger source="map-heading">` styled as that underlined text link (not a `btn`);
  - entitled → plain text `All courts unlocked`, 14px, `text-stone`, not a link.
- Card grid: `grid-cols-2 gap-5`, every card is the TASK_56 `CourtCard` (340px tall at md+).
- Map panel: `380 × 460`, `rounded-[16px]`, shadow `0 4px 20px rgba(15,15,15,0.12)`, `md:sticky md:top-[calc(var(--nav-offset)+16px)]` (the nav is `fixed`, so `top-5` from the prototype would slide under it).
- Status card directly under the map panel (same sticky wrapper): `mt-4`, `bg-paper`, `rounded-[12px]`, `px-[18px] py-3.5`, shadow `0 2px 12px rgba(15,15,15,0.06)`, flex `gap-2.5`: an 18px ink circle holding a bone glyph (lock 9px for guest, check 10px otherwise) + 13px / weight 500 / ink text.

### Mobile (< md)

Order top to bottom, side gutters 20px (`px-5`):

1. Search bar (`pt-4`).
2. Heading row (`pt-[22px]`, flex, gap 14, items-start): left = `<h1>` serif **30px / line-height 1.08** + link line (13px, `mt-2`, lock glyph 10px for guest); right = **map panel 148 × 140**, `rounded-[16px]`, shadow `0 2px 14px rgba(15,15,15,0.12)`, `shrink-0`.
3. Card list (`pt-[22px]`), one column, `gap-3`, 170px-tall cards.
4. Status **pill**, `sticky bottom-[18px]`, `mx-4 mt-[22px]`, same glass recipe as the nav pill (`.nav-pill`: ivory @ 85%, `blur(24px) saturate(1.5)`, `1px rgba(255,255,255,0.6)` border), `rounded-pill`, `px-5 py-[13px]`, centered, gap 8, 12px / weight 500 text, shadow `0 16px 40px rgba(15,15,15,0.18), 0 2px 10px rgba(15,15,15,0.08)`. Same 18px circle + glyph as desktop. Reuse the `.nav-pill` background/blur/border instead of retyping them; if `.nav-pill` bundles padding you don't want, split out a shared glass base class once.

`md:hidden` pill and `hidden md:flex` card are **two small text nodes** — duplicating them is fine. The map is not (see next section).

### Status strings (both sizes)

| State | Text | Glyph |
|---|---|---|
| guest | `Sign in to save courts & view the map` | lock |
| free | `Free Access — Upgrade for every court` | check |
| entitled | `Full Map Access — Unlocked` | check |

Plain text, not links.

### Search bar

One new component `features/map/MapSearchBar.tsx` (replaces `MapFilterBar`). Controlled, no state of its own (state lives in `MapExplorer`):

- pill: flex, `items-center gap-2.5`, `bg-paper`, `rounded-pill`, `px-[18px]`, `h-[50px]`, shadow `0 2px 12px rgba(15,15,15,0.1)`;
- search glyph 16px; `<input type="search">` 14px, ink, transparent, placeholder `Search courts, cities, countries` (stone), `aria-label="Search courts"`;
- when `q` is non-empty: a small clear button (✕ 14px, stone, `aria-label="Clear search"`) → `onQueryChange('')`;
- filter button: a 30px circle (28px on mobile), `aria-haspopup="dialog"`, `aria-label` = `Filters` or `Filters, N selected`; idle: transparent, stone icon; **while the sheet is open**: `bg-ink`, bone icon; when `activeCount > 0`: a 7px clay dot, `1.5px` paper border, `top-[2px] right-[2px]` (v3's dot — the existing numeric `filter-pill-badge` is not used here; keep that class, `HomeSearchBar` still uses it until TASK_58).
- Not sticky (v3 is not). Delete the old sticky bar styling.

Purely local UI: no `Pending*`, no spinner (CLAUDE.md §4 rule 10) — same as before. Keep the comment explaining that.

## The map panel — the important part

There must be **exactly one `CourtMap` instance on the page at a time while closed**, and **no Google Maps load at all for a guest** (billing + coordinate-safety posture from Feature 88 §6.1; read the header of `CourtDetailLocationPreview.tsx`). That means: do not render a mobile map and a desktop map and hide one with CSS. One map panel element, positioned by CSS grid per breakpoint (below).

One new component `features/map/MapPreviewPanel.tsx` with three states, same box, size comes from the parent slot (it fills it; `rounded-[16px] overflow-hidden`):

1. **Guest** — no `CourtMap`, no coordinates in its DOM. A static tonal gradient (reuse the `from-[#eef0ea] to-[#d9dcd2]` recipe from `CourtMap`'s `MapLoading`, or the `LockedMapPlaceholder` pattern in `CourtDetailLocationPreview`) with a frosted overlay (`bg-bone/70 backdrop-blur-[16px]` — prototype `.lock-overlay`: `blur(16px)`, `rgba(245,242,236,0.7)`), centered column, gap 10: lock glyph (22px desktop / 20px mobile) + text `Sign in to unlock the map` (12px stone; mobile `Sign in to unlock`, 10px). Not clickable (prototype: `cursor: default`).
2. **Signed in (free or entitled)** — a **non-interactive live `CourtMap`** (`interactive={false}`, `markers={visibleMarkers}`, no `onMarkerClick`) fitted to the visible markers, with a transparent full-size `<button type="button" aria-label="Open map" aria-haspopup="dialog">` laid over it that calls `onOpen`. `cursor-pointer`. The `CourtMap` already supports `interactive={false}` (zoom control off, gestures off), so no map-engine change is needed.
3. Nothing else. (No "N pins" overlay, no expand icon — not in v3.)

After building it, **look at it at 148 × 140** with real data. The photo markers/clusters were designed for a big canvas; if they look cluttered at that size, say so in the report and tell me what you'd change rather than shrinking the marker design silently.

### Expanded map modal

New `features/map/MapExpandedModal.tsx` (`'use client'`), rendered by `MapExplorer` **only while open** (conditional render, not `hidden`): the Google Maps load and the geolocation prompt both happen only when a signed-in user actually opens it.

- Desktop: `fixed inset-0 z-[200]`, backdrop `bg-ink/60`, click on backdrop closes; dialog `w-[82%] max-w-[1040px] h-[82%]`, `rounded-[20px]`, `bg-paper`, `overflow-hidden`, shadow `0 40px 100px rgba(0,0,0,0.4)`; close button top-right `18px`, 38px circle, `bg-paper`, `1px` border `rgba(184,184,182,0.4)`, ✕ 16px, `aria-label="Close map"`.
- Mobile: full screen, `bg-bone`; close button 36px circle, `bg-white/90 backdrop-blur-[8px]`, shadow `0 2px 10px rgba(0,0,0,0.15)`, `right-4`, top = `max(16px, env(safe-area-inset-top))`.
- Contents: interactive `CourtMap` filling the dialog (`markers={visibleMarkers}`, `onMarkerClick`, `focus`, `onUserInteraction`) + `MapLocateControl` + `MapCourtPreview` (mobile pin-tap sheet) — all exactly the pieces `MapExplorer` wires today, moved here.
- Pin click: desktop → `router.push('/courts/<slug>')` (as today); mobile → open `MapCourtPreview` (as today, same `window.matchMedia('(min-width: 768px)')` check at click time). `MapCourtPreview` is `fixed … z-40 md:hidden`; because it is rendered *inside* the modal's stacking context it will sit above the map. Check it does. Update its header comment (it still says it complements "the persistent horizontal CourtCard strip MapCourtList renders below the canvas" — that no longer exists).
- `MapLocateControl` sits `right-3 top-3` — that collides with the close button. Add an optional `className` prop to `MapLocateControl` and have the modal push it below the close button (`top-16`/equivalent). Don't move it for any other caller.
- a11y: `role="dialog"`, `aria-modal="true"`, `aria-label="Map"`; Esc closes; focus moves to the close button on open and returns to the panel button on close; lock background scroll while open. Follow `FilterSheet`'s implementation (it already does all of this — copy the approach; extract a shared hook only if that is genuinely trivial, otherwise duplicate the ~20 lines).
- Opening/closing is local state only: no navigation, no `Pending*`.

### Geolocation moves into the modal

Today `MapExplorer` asks the browser for the visitor's position **on page load** and flies to the nearest court. On a v3 card screen that prompt would appear for no visible reason. So:

- Move `useGeolocation`, the nearest-court auto-focus (`focusNearestCourt`, `focus` state, `focusTokenRef`, `autoFocusStartedRef`, `userTookControlRef`, `markersRef`, `NEAREST_COURT_ZOOM`) and the locate control wiring from `MapExplorer` into `MapExpandedModal`. They run once per modal mount (the existing ref guard handles Strict Mode).
- The preview panel never asks for location and never auto-focuses.

`scripts/verify-map-autofocus.ts` greps `features/map/MapExplorer.tsx` for this logic in many checks. **Re-point those checks at `MapExpandedModal.tsx`; do not delete any** (same rule Feature 88 followed). Add two checks: `MapExplorer` no longer imports `useGeolocation`; and the guest branch of `MapPreviewPanel` contains no `CourtMap`.

## Data / page changes

### `app/map/page.tsx` (server)

- Keep fetching `courts`, `pins`, `getViewerAuthState()`.
- New: when `signedIn`, also read the viewer's saved court ids (so card bookmarks start in the right state). Mirror the protected-read block in `app/collections/[slug]/page.tsx` / `app/page.tsx` (`getRepositoriesForRequest()` → `saved.getSavedCourts()`, `AuthRequiredError` → degrade, other errors rethrow). Guest → `[]`.
- Pass `signedIn` and `savedCourtIds` to `MapExplorer`. Update the header comment (it still says "standard solid bar + 72px offset").
- No other fetch changes.

### `MapExplorer` (client)

New props: `signedIn: boolean`, `savedCourtIds: string[]`. It keeps: the single `CourtFilterState`, `sheetOpen`, `visibleCourts`, `visibleMarkers`/`stateBySlug`, `handleReset`. New: `mapOpen` state.

It now renders (single DOM, layout below): heading + link, `MapSearchBar`, `FilterSheet` (unchanged), `MapPreviewPanel`, the court grid, status node(s), and `{mapOpen ? <MapExpandedModal …/> : null}`.

**Saved state must be lifted here.** `CourtCardSaveButton` keeps its own `saved` state seeded once from `initialSaved`, and this list is filtered client-side, so cards unmount and remount as the user types or filters. If `initialSaved` came straight from the server prop, bookmarking court A, filtering it away and back would show A as unsaved again. So: keep `const [savedIds, setSavedIds] = useState(() => new Set(savedCourtIds))` in `MapExplorer`, pass `initialSaved={savedIds.has(court.id)}` and `onSavedChange={(saved) => setSavedIds(…)}` (it fires on the optimistic flip and on rollback, so the set stays correct). Guests: `signedIn={false}`, empty set.

### Card grid + empty state

New `features/map/MapCourtGrid.tsx` (presentational) replacing `MapCourtList`:

- `<ul>` of `<li><CourtCard court viewerIsEntitled priority={index < 2} save={…} imageSizes="(min-width: 768px) 40vw, 100vw" /></li>`.
- Port the existing empty state from `MapCourtList` as-is (same copy: "No courts match" + the query/filters variants + "Clear filters" button, which stays purely local UI). It replaces the grid when `courts.length === 0`.
- The old "Courts in view / N places" header is dropped — the `<h1>` count replaces it.

### Grid placement (one DOM)

Use a single CSS grid on the screen wrapper, positioned with explicit `col-start`/`row-start` utilities (or a small `.courts-layout` block with `grid-template-areas` in `globals.css` — your choice, tell me which):

- mobile: `grid-cols-[1fr_148px]` → search (spans both), heading (col 1), map slot (col 2, same row as heading), list (spans both);
- md+: `grid-cols-[1fr_380px] gap-x-8` → heading (col 1, row 1, `self-end`), search (col 2, row 1, `self-end`), list (col 1, row 2), map slot (col 2, row 2, `self-start`, sticky).

The map slot wrapper contains `MapPreviewPanel` and, at md+ only, the desktop status card (so they stick together). The mobile pill lives **inside the list wrapper, after the grid** (`sticky bottom-[18px]` only works relative to its containing block, so it must share a wrapper with the cards, not be its own grid item).

## Delete / clean up

- `features/map/MapFilterBar.tsx`, `MapCourtList.tsx`, `MapCourtRow.tsx` and their `features/map/index.ts` exports (including `MAP_QUICK_FILTERS`; confirm nothing else imports it — `features/home/home-shortcuts.ts` only mentions it in a comment, leave Home alone, TASK_58 deletes it).
- `components/court/LegacyCourtCard.tsx` and its `components/court/index.ts` exports (TASK_56 kept it only for `MapCourtList`).
- `globals.css`: the whole `.map-layout`, `.map-canvas-wrap`, `.map-list-panel` block (both the base and the md+ and `max-width: 767px` rules) and `.filter-container-fix`. **Keep** `.filter-pill` and `.filter-pill-badge` (the shared `FilterSheet` and `HomeSearchBar` use them), `--nav-offset`, `.nav-pill`.
- `scripts/verify-ux-pending-states.ts`: drop `MapCourtRow` from Scenario 3's list; add `MapExplorer`/`MapPreviewPanel`'s guest sign-in link to whatever "uses `PendingLink`" check list fits. All 92 existing checks that are still meaningful must still pass.
- Fix stale comments that mention the removed things: `MapCourtPreview.tsx` header, `components/layout/Footer.tsx` line ~21 (`MapFilterBar`), `features/home/HomeSearchBar.tsx` (`MapFilterBar` references), `components/navigation/PendingCardLink.tsx` line ~10 (`MapCourtRow`).

## Do not touch

- `CourtMap` / `CourtMapInner` engine, markers, clustering, `map-markers.ts`, `geo-distance.ts`, `useGeolocation.ts`.
- `FilterSheet` and the filter model in `components/filters` (it already supports `initialFilters` / `?tags=…` from TASK_54 — those URLs must keep working on this screen).
- Court Detail's and the Saved page's own maps.
- The Collections "By Country" links (`/map?q=<country>`).
- Home. `HomeSearchBar`, shortcuts, map-preview band stay until TASK_58.
- `CourtCard` / `CourtCardSaveButton` (TASK_56). If something about them blocks this screen, tell me rather than patching.

## Honest limitation to put in the report

The guest gate is a **UX gate, not a security boundary**: `courts.list()` is a public endpoint and `approxLat`/`approxLng` still travel in the page payload to a signed-out visitor (that was already true before, and the exact location is still protected server-side). If the owner later wants a real gate, that is an API change. Don't change it here — just confirm in the report that no `CourtMap` / Maps script loads for a guest.

## Testing

**Guest** (signed out):

- Heading `Sign in to view the map`, link `Sign in to unlock the map →` → `/signin?redirectTo=/map`.
- Locked placeholder where the map is; **Network tab shows no Google Maps request**.
- List fully visible, premium courts masked (TASK_56 behaviour), bookmark shows the "Sign in to save" tooltip.
- Status text `Sign in to save courts & view the map`.

**Free user:**

- Heading `N Courts`, link `Unlock full map access →` opens the paywall modal.
- Preview map shows the visible courts' markers; clicking the panel opens the modal; the browser's location prompt appears **only then** (not on page load).
- Status `Free Access — Upgrade for every court`.

**Entitled user:** `All courts unlocked` (no link), status `Full Map Access — Unlocked`, premium courts unmasked.

**Modal:**

- Desktop: pin click navigates to Court Detail; backdrop click / ✕ / Esc close it. Locate control does not overlap ✕.
- Mobile (~390px): full screen; pin tap opens `MapCourtPreview` above the map; ✕ is below the notch.
- Close, filter, re-open: markers match the filtered list; no second geolocation prompt storm.

**Search / filters:**

- Typing narrows the grid, the `N Courts` count and the preview markers together; ✕ clears.
- Filter button opens `FilterSheet`, button turns ink while open, clay dot when filters applied.
- `/map?q=Italy` and a Task-54-style `/map?surface=Clay&scenic=true` still land pre-filtered; the heading count reflects it.
- Zero results → the existing empty state with "Clear filters".

**Saved state:** bookmark a court, type something that hides it, clear the search — it still shows as saved.

**Layout:**

- Desktop: heading and search are bottom-aligned and the search's right edge lines up with the map panel; map panel + status card stay stuck while the grid scrolls; nothing hides under the pill nav.
- Mobile: search above the heading; 148×140 map panel to the right of the heading; the status pill floats at the bottom while scrolling and rests after the last card; no horizontal scroll.
- The old double-scroll / fixed-height canvas layout is gone (page scrolls normally).

**Scripts / build:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter @tennis/web verify:map-autofocus`, `verify:ux-pending-states` — all clean/green.

## Report

List files created, changed, deleted. Confirm: the guest page loads no Maps script; geolocation is only requested inside the modal; the saved-state lift works; every `verify:map-autofocus` check is re-pointed (none deleted); and say how the markers look at 148×140. Mention anything you could only check by reading code. No git commit or push unless asked.
