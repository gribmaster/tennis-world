# Feature 71 — Design v2 Intake & Gap Analysis

**Status:** Planning / intake only — **no code, no schema, no contract, no config, no
asset changes in this task.** This document compares the new mobile prototype
(`new design/tennis_world_v2_standalone.html`) against the as-built `apps/web`, verifies
prior findings, and breaks the redesign into small, sequenced, independently shippable
features continuing the repo's numbering from Feature 70.

**Companions:** `CLAUDE.md` (standing rulebook — §4 pending/loading, §5 navigation, §7
billing, §8 Prisma, §9 scope discipline all apply in full), `FEATURE_28_NEW_DESIGNS_INTAKE.md`
(the prior design-intake precedent this document follows the shape of),
`PHASE_5_COMPLETION_SUMMARY.md` (as-built state through Feature 70),
`MAP_PROVIDER_DECISION.md` (Leaflet rationale, referenced heavily in §5/§6).

**Ground rule (task brief):** the product logic does not change. Auth, entitlements, the
exact-location gate, Stripe checkout/portal/webhook, the repository seam, and mock/api
parity all stay exactly as they are. This is a presentation-layer redesign plus the data
additions in D3 (tags) and D4 (reviews, collection-only).

---

## 0. How the prototype was read

The source file is 3,173,952 bytes, of which ~3.05 MB is inline base64 PNG data (two
images: the Home hero map-preview background and the Map screen background, both
`data:image/png;base64,...`, both replaced with `data:BASE64_STRIPPED` for reading). The
stripped file is 116,404 bytes: a 9.8 KB `<style>` block (`D:\tmp\design_v2_stripped.html`
lines 13–177) and a ~105 KB `text/babel` script (lines 181–1761) holding every screen
component. It was read in full, in three chunks (lines 1–710, 711–1260, 1261–1764) — no
part of the component logic was skipped. All numbers cited below (heights, radii,
font sizes, gaps) are copied verbatim from that file, with line references.

---

## 1. Confirming the ALREADY-ESTABLISHED FINDINGS

### 1.1 Design tokens — **confirmed, with one real divergence**

The prototype's `:root` block (`design_v2_stripped.html:14–26`) is byte-identical to
`apps/web/tailwind.config.ts:22–33`'s `colors` block and `apps/web/src/app/globals.css`'s
tokens: ink `#0F0F0F`, graphite `#2A2A2A`, stone `#6B6B6B`, mist `#B8B8B6`, bone `#F5F2EC`,
ivory `#FAF8F3`, clay `#B95C3A`, moss `#4A5D3F`, gold `#B89968`, paper `#FFFFFF`. All ten
values match exactly. Fonts match: Cormorant Garamond (serif/display) + Inter (sans/body),
both already self-hosted via `next/font` in the real app (the prototype loads them from
Google Fonts CDN, which is prototype-only chrome — see §4).

**Type scale — genuine divergence, not a typo.** The prototype's scale
(`design_v2_stripped.html:44–51`) is **fixed-px**:

| Token | Prototype (fixed) | `globals.css` (fluid) |
|---|---|---|
| `display-xl` | `44px / 48px`, weight 300 | `clamp(36px, 5vw, 72px)` / `1.06`, weight 300 |
| `display-l` | `32px / 38px`, weight 300 | `clamp(28px, 3.5vw, 52px)` / `1.1`, weight 300 |
| `display-m` | `24px / 30px`, weight 400 | `clamp(22px, 2.5vw, 36px)` / `1.2`, weight 400 |
| `headline` | `20px / 26px`, weight 500 | `clamp(18px, 1.8vw, 26px)` / `1.3`, weight 500 |
| `body-l` | `17px / 26px` | `clamp(15px, 1.2vw, 18px)` / `1.65` |
| `body-m` | `15px / 22px` | `clamp(14px, 1vw, 16px)` / `1.6` |
| `body-s` | `13px / 20px` | `13px / 1.55` (fixed — matches) |
| `caption` | `11px / 16px`, 0.08em, weight 500 | (same values, defined in `tailwind.config.ts:52` `fontSize.caption`, matches) |

The real app's `clamp()`-based scale is **larger at desktop widths** (e.g. `display-xl`
tops out at 72px vs. the prototype's fixed 44px) because it was tuned for the existing
desktop-responsive site (D5). The prototype is 390px-only, so it never needed to scale up.
**Recommendation:** keep the existing fluid `clamp()` definitions unchanged — they already
equal the prototype's fixed values at the 390–480px end of their range (e.g.
`clamp(36px,5vw,72px)` ≈ 36–44px in that band, `clamp(28px,3.5vw,52px)` ≈ 28–32px) and they
are what makes D5 (desktop scaling) work at all. Do not shrink `globals.css` down to the
prototype's fixed values — that would regress desktop. This is a "verify, don't copy"
case: the token *names and mobile-width values* carry over; the fluid mechanism does not
change.

No other token divergence found. Radii, shadows, and spacing in `tailwind.config.ts`
(`borderRadius.sm/md/lg/xl/pill`, `boxShadow.card`) are compatible with the prototype's
raw pixel radii (12–14px cards → `lg`/`xl`, pill buttons → `pill`); §2 calls out exact
per-screen radius mappings.

### 1.2 Prototype components — **confirmed, complete list**

Verified against the stripped file, every top-level component and its defining line:

| Component | Line |
|---|---|
| `U` (Unsplash URL helper) | 185 |
| `Label` | 268 |
| `SurfaceLabel` | 273 |
| `Stars` | 277 |
| `StatusBar` | 288 |
| `BottomNav` | 302 |
| `HomeScreen` | 330 |
| `MapScreen` | 627 |
| `CourtDetailScreen` | 1005 |
| `SavedScreen` | 1192 |
| `CollectionsScreen` | 1290 |
| `ProfileScreen` | 1376 |
| `SettingsScreen` | 1519 |
| `PurchaseSuccessScreen` | 1557 |
| `PurchaseFailedScreen` | 1614 |
| `NavVariantsComparison` | 1649 |
| `App` (root) | 1680 |

This matches the finding exactly — 16 components, 10 routable screens (Court Detail and
Court Detail Locked are the same `CourtDetailScreen` component with `unlocked` toggled,
confirmed at `App`'s screen switch, line 1746).

### 1.3 Data gaps — **confirmed via the real schema, with more precision than originally stated**

Read `apps/api/prisma/schema.prisma`'s `Court` model (lines 131–185) field-by-field. It has:
`id, slug, name, regionId, region, countryId, country, lat, lng, approxLat, approxLng,
mapLinkUrl, mapX, mapY, surface, setting, access, indoorOutdoor, isScenic, isFeatured,
isLocked, status, blurb, seedOrder, images, collections, savedBy, userCollections,
createdAt, updatedAt`.

None of the following exist anywhere in the schema, `packages/contracts/src/court.ts`, or
`packages/mock-data/src/courts.ts` — confirmed by direct read and by
`grep -rni "review|rating"` across `apps/api/src`, `packages/contracts/src`, and the
schema (zero matches other than an unrelated comment in `mailer.service.ts`):

- **`labels`** (prototype's `['Sea View','Beach Club','Resort','Scenic','Private']` chip
  list, `design_v2_stripped.html:209–215`) — closest existing thing is `setting` (a single
  free-text string, e.g. `"Lakefront"`) and the boolean flags `isScenic`/`isFeatured`. Not
  a multi-value tag list. → this is what **D3's `tags` field is for.**
- **`address`** (prototype: `'Chemin des Tamaris, 83350 Saint-Tropez, France'`) — does not
  exist. The closest is `mapLinkUrl` (Feature 71-adjacent Feature 63/`ADD_COURT_MAP_LINK_URL`
  migration) which is a full Google Maps URL, not a postal address string, and is
  **server-only / entitlement-gated** (never in `CourtSummarySchema`/`CourtSchema`).
- **`features[]`** bullet list (prototype: `['Stunning sea views','Private beach access',...]`)
  — does not exist; closest is the single `blurb` string.
- **`rating`/`reviews`** (prototype: `4.6`/`128`) — **zero scaffolding of any kind.** No
  `Review` model, no rating column, no related endpoint. This is greenfield — see D4/§3.
- **km distance for "Nearby courts"** (prototype: hardcoded `'3 km'`/`'28 km'`/etc.,
  `design_v2_stripped.html:655–658`, `1147`) — not computed anywhere server-side. The web
  already has a haversine helper (`apps/web/src/features/map/geo-distance.ts`,
  `findNearestPoint`) used for the Map screen's nearest-court auto-focus, but it operates
  client-side, from the visitor's browser geolocation, against `approxLat`/`approxLng` —
  it is not a stored/served field and was never meant to rank "nearby" from a court's own
  position (court-to-court distance, not visitor-to-court).

### 1.4 API filter/search support — **confirmed, exact param names**

`apps/api/src/courts/courts.controller.ts:31` documents the full query string; the actual
filter logic is `apps/api/src/courts/courts.service.ts:38–83`:

| Wire param | Prisma mapping | Notes |
|---|---|---|
| `q` | `OR` over `name`, `country.name`, `region.name`, `setting` (case-insensitive `contains`) | Does **not** search `blurb` |
| `country` | `country: { name: query.country }` | exact name match, not slug |
| `region` | `region: { name: query.region }` | exact name match |
| `surface` | `surface: query.surface` | enum `Clay \| Hard \| Grass` |
| `access` | `access: query.access` | enum `Resort \| Club \| Academy \| Private` |
| `indoorOutdoor` | `indoorOutdoor: query.indoorOutdoor` | enum `Indoor \| Outdoor` |
| `scenic` | `isScenic: query.scenic` | boolean |
| `featured` | `isFeatured: query.featured` | boolean |
| `collection` | `collections: { some: { collection: { slug: query.collection } } }` | by **slug**, via `CollectionCourt` join |
| `limit` | `take: query.limit` | applied post-filter |

Plus `GET /v1/courts/:slug/related?limit=4` (scored: `+2` same country, `+1` same
surface, tie-broken by `seedOrder`) and `GET /v1/courts/map` (decorative pins only, no
geo). **Confirmed exactly as stated** in the task brief — all of these exist today.

**What the prototype's filters need that isn't covered:**
- Prototype's Home/Map filter-sheet groups (`design_v2_stripped.html:347–352`,
  `641–646`): *Experience* (Sea View/Beach Club/Mountain/Historic/Scenic), *Access*
  (Resort/Private Club/Open), *Surface* (Clay/Hard/Grass/**Carpet**), *Setting*
  (Coastal/Indoor/Rooftop/Jungle/Alpine).
  - *Surface* maps directly to the existing `surface` param **except `Carpet`**, which is
    not in the `Surface` enum (`Clay | Hard | Grass` — schema.prisma:40–44). The prototype
    also defines a `chip-surface-carpet` CSS class (`design_v2_stripped.html:71`) that is
    never used by any of the 8 seed `COURTS`, so this is speculative/decorative prototype
    scope, not a real gap to close now — flag in Open Questions (§7).
  - *Access* "Private Club"/"Open" don't match the enum's `Private`/`Club` labels 1:1 (the
    prototype's Home shortcut `private` filter checks `labels.includes('Private')`, a
    **label**, not the `access` enum — see next bullet). "Open" appears nowhere in the
    real access vocabulary.
  - *Experience* (Sea View, Beach Club, Mountain, Historic, Scenic) and the Home icon
    shortcuts (`design_v2_stripped.html:337–345`) filter against the prototype's
    **`labels[]` array**, not `surface`/`access`/`setting`/`isScenic`. `isScenic` alone
    covers "Scenic"; the rest (Sea View, Beach Club, Mountains, Historic, Private) have
    **no backing field today** — this is exactly the gap **D3's `tags` field closes.**
  - *Setting* (Coastal/Indoor/Rooftop/Jungle/Alpine) partially overlaps the existing
    free-text `setting` field's actual seed values (`Lakefront`, `Cliffside`, etc. — see
    `packages/mock-data/src/courts.ts:33`, `61`) but `setting` is a single string, not a
    filterable closed set, and `Indoor` already exists as `indoorOutdoor`.
  - **Conclusion:** once `tags: string[]` exists (D3) with a `GET /v1/courts?tags=` filter
    (`some` on a Postgres array-contains, or a normalized join table — see §3), every
    Home/Map filter group is coverable: *Experience* + the "Private" bucket → `tags`;
    *Surface* → `surface` (minus speculative Carpet); *Access* → `access`; *Setting* →
    a mix of `setting`/`indoorOutdoor`/`tags`.
- **Inline search-as-you-type** (Home `design_v2_stripped.html:450–466`, Map
  `design_v2_stripped.html:722–737`) — both call the *same* `q`-style substring match the
  API already supports; no new endpoint needed, just a client-side debounce or direct
  `GET /v1/courts?q=` call (see §2 Home/Map sections for which).
- **"Search this area"** (Map, `design_v2_stripped.html:755–761`) — decorative-only button
  in the prototype (no `onClick`, no bbox logic). There is no server-side geo-bbox query
  capability (`MAP_PROVIDER_DECISION.md` explicitly rules out PostGIS/spatial queries —
  §4: "no geolocation, no PostGIS... court positions are static seed data"). Classified as
  **prototype dressing, not real behavior** — see §2 Map screen and §7 Open Questions.

---

## 2. Screen-by-screen mapping

Bottom-nav rendering (`BottomNav`, `design_v2_stripped.html:1179–1186` CSS,
component at line 302) and `StatusBar` (line 288, the fake iOS clock/battery/signal) are
shared prototype chrome, covered once here and not repeated per screen: neither survives
(§4). Every screen below already runs inside `AppShell` (`apps/web/src/components/layout`)
in the real app, which supplies the real header/footer — the prototype's per-screen
`StatusBar`/`TENNIS · WORLD` wordmark bar is redundant with that and is dropped.

### 2.1 Home (`HomeScreen`, line 330)

**Structure, top to bottom** (all numbers from the stripped file):
1. Hero image, `height:340` (line 420), `img-overlay-top` gradient (line 422/88), status
   bar, header row (wordmark + 32×32 circular avatar, `padding:'56px 20px 0'`, line 425),
   headline block bottom-left (`display-xl`, `padding` `left/right:20, bottom:20`, line 429).
2. Search bar, `height:48`, `border-radius:100` pill (CSS `.search-bar` line 62), with a
   filter icon button appended after a 1px divider (line 437–448); inline search-results
   dropdown below it when `query` is non-empty (line 450–466, each row 44×44 thumb + name +
   location + one label chip).
3. Icon shortcuts row: 7 circular filter shortcuts, `52×52` circle (CSS `.icon-shortcut-circle`
   line 132), horizontally scrollable (line 470–481).
4. Map preview band: `height:190` image (the stripped base64 PNG) with 4 static gold pin
   markers overlaid, then a solid `ivory` info bar below with title/subtitle + arrow-circle
   CTA (line 484–516) — the **whole band is one click target** to `/map`.
5. "Featured courts" horizontal carousel: cards `width:'calc(75vw)'` capped `240–292px`,
   `aspect-ratio:'2/3'`, `border-radius:14` (line 531–569); each card has a top-left label
   chip or "Premium" badge, top-right save-heart button, bottom-overlaid label+name+location.
6. "Collections" horizontal carousel: cards `width:'calc(45vw)'` capped `150–190px`,
   `aspect-ratio:'3/4'`, `border-radius:12` (line 578–590).
7. "Journal" vertical list, 3 full-width cards, image `height:160`, `border-radius:14`
   (line 594–619), gold "NEW/TRAVEL/PLACES" tag chip top-left.
8. `BottomNav`.

Also: a full-screen **filter bottom-sheet** (`filterMenuOpen` state, line 385–417) —
backdrop + sheet sliding from bottom, 4 filter groups of toggle-chips, "Clear all" +
"Show results" buttons. In the prototype `"Show results"` is a no-op comment
(`/* would apply filters in real app */`, line 411) — **decorative**, not wired to
`activeFilter`/`query` at all; only the icon-shortcut row and free-text search actually
filter `displayCourts` in this component.

**Existing components serving it:**
- `apps/web/src/features/home/HomeHero.tsx` — closest analog to the hero band, already
  uses `PendingLink` for its CTA (per CLAUDE.md §4 example). RESTRUCTURE: needs the new
  headline copy/layout, avatar, and no bell icon (prototype explicitly drops it — line 424
  comment "Header — no bell").
- `apps/web/src/features/home/HomeFeaturedCourts.tsx` — RESTRUCTURE to the 2:3 full-bleed
  card treatment with save-heart and locked/"Premium" badge (currently likely closer to
  `CourtCard`'s 4:5 default variant — confirm against `CourtCard.tsx` variants, which only
  offers `default` 4:5 and `large` 3:2, **neither matches the prototype's 2:3** — a new
  variant or a screen-local card is needed).
- `apps/web/src/features/home/HomeCollectionsTeaser.tsx` — RESTYLE (3:4 aspect + gold count
  label already close to `CollectionCard.tsx`'s treatment; confirm radius/copy).
- `apps/web/src/features/home/HomeJournalTeaser.tsx` — RESTYLE to the new tag-chip +
  serif-title card list layout.
- `apps/web/src/features/home/HomeEditorsCut.tsx` — **no equivalent section in the
  prototype at all.** DELETE or fold into Featured courts — flag in Open Questions.
- `apps/web/src/features/home/HomePaywallBand.tsx` — **no equivalent section in the
  prototype.** The prototype's paywall surface moved to Court Detail's lock CTA + Profile's
  membership card. Candidate for DELETE — flag in Open Questions (D2 still requires a
  paywall entry point to exist somewhere on Home per current CTA audits; confirm before
  deleting).
- Map preview band: **NEW** — no existing component does a clickable static-map-image
  teaser. Must **not** be a real Leaflet instance embedded twice (cost/complexity); render
  a static image (see §5 risk) with decorative pins, matching the prototype's approach
  minus the actual base64 PNG (§4 — needs a real asset decision, not the stripped one).
- Icon shortcuts row: **NEW** — no existing component; becomes the client-side entry point
  into `tags`-based filtering (D3).
- Inline search dropdown: **NEW** as an always-visible-on-Home affordance; the *logic*
  (substring match over name/location) mirrors `MapExplorer`'s `matchesQuery` almost
  exactly (`apps/web/src/features/map/MapExplorer.tsx:54–61`) and should reuse that
  pattern, not reinvent it.
- Filter bottom-sheet: **NEW** shared component (used identically on Home and Map, see
  2.2) — one `FilterSheet` component, not two.

**Data needed:** `tags` (D3) for icon-shortcut filtering and label chips; nothing else new
— `CourtSummaryDTO` already has everything else this screen touches (`name`, `country`,
`region`, `heroImageUrl`, `isLocked`, `isFeatured`). The map-preview pin counts (7/24/8/5
per continent) are decorative/static in the prototype and have no backing aggregate query
— treat as static copy or drop, do not build a continent-count endpoint for this (§7).

**Interactions — real vs. dressing:**
| Interaction | Real or dressing? |
|---|---|
| Filter-sheet open/close | Real (local UI state) — no pending primitive needed (CLAUDE.md §4 rule 10: "Modal open/close toggles... need NO API/navigation loading behavior") |
| Filter-sheet "Show results" | **Dressing in the prototype** (no-op) — in the real build this becomes a real navigation to filtered results, see below |
| Icon-shortcut toggle | Real, client-only state (no network) — no pending primitive needed, it's a local filter toggle, not navigation/mutation |
| Inline search-as-you-type | Real — becomes an API-backed query once `tags`/search move server-side, or stays client-side over the already-fetched summary list (page decides; either way each **result row** is a `PendingLink`/`PendingCardLink` to `/courts/[slug]`) |
| Save-heart on featured cards | Real mutation → **must** use the `CourtSaveButton` triad (`apps/web/src/features/court-detail/CourtSaveButton.tsx` local pending state + `aria-busy` + `InlineSpinner`), not the prototype's bare `useState` |
| Map-preview band click → `/map` | Real navigation → `PendingCardLink` (whole-band tap target, matches the "whole-card links" case in CLAUDE.md §4 table) |
| "Featured courts" / "Collections" / "Journal" card taps | Real navigation → `PendingCardLink` (court/collection/article cards) |
| "View all" links | Real navigation → `PendingLink` |

### 2.2 Map (`MapScreen`, line 627)

**Structure:** `display:flex; flexDirection:column; height:'100dvh'` (line 664) — top bar
(wordmark + list-icon, search bar, filter pills) is `flex-shrink:0` (line 702); the map
`<img>` fills `flex:'1 1 0'` (line 748); a **bottom sheet** is conditionally rendered
depending on `selected` (a tapped pin) — compact preview (`14px 16px 16px` padding, 88×72
thumb) or, when `expanded` (tap the sheet), a taller scrollable panel
(`maxHeight:'calc(70vh - 20px)'`) with feature-icon row, CTAs, and a horizontal "More
courts nearby" strip (line 950–979). With no pin selected, a minimal footer bar shows
"Tap a pin to preview a court" (line 992–996).

The map surface itself is the **stripped base64 PNG** (line 750) with **hardcoded**
absolutely-positioned pins: one open-court photo-circle pin (line 774), one
premium/locked gold-lock pin (line 795), 4 non-interactive "cluster count" bubbles (France
18 / Italy 24 / Spain 32 / Asia 8, line 823–834), and a static blue "user location" dot
(line 771) — **none of this is a real map**; it is a flat image with decorative overlays.

**Existing components serving it:** the real `/map` (`apps/web/src/app/map/page.tsx`) is
built entirely differently and much more capably than the prototype:
- `apps/web/src/features/map/MapExplorer.tsx` — the real client boundary; already does
  real filtering (`FILTER_PREDICATE`, line 44–51) over a real `CourtSummaryDTO[]`, real
  free-text search (`matchesQuery`, line 54–61), and orchestrates a **real Leaflet map**
  (`LeafletMap.tsx`/`LeafletMapInner.tsx`) plotting **real approximate geo**
  (`approxLat`/`approxLng` via `courtToMarker`, `map-markers.ts:51–63`), plus real
  browser-geolocation nearest-court auto-focus (`useGeolocation.ts`, `geo-distance.ts`).
  This is categorically more real than the prototype's static-image-with-fake-pins
  approach. **KEEP the Leaflet integration as-is; RESTRUCTURE the layout/chrome around
  it** to match the prototype's visual language (search bar style, filter pills, bottom
  sheet) — do not regress to a static image.
- `apps/web/src/features/map/MapFilterBar.tsx` — RESTYLE: swap the current always-visible
  filter-chip row for the prototype's compact pill row + a separate filter-sheet (shared
  with Home, §2.1), and change chip vocabulary from `MAP_FILTERS` (`All, Resorts, Clubs,
  Private, Indoor, Scenic`) to match the tag-driven vocabulary once D3 lands.
- `apps/web/src/features/map/MapCourtList.tsx` / `MapCourtRow.tsx` — today this is a
  **persistent side/below list panel** (`.map-list-panel`, `globals.css:368–374`, 380px
  wide on desktop, full-width below the canvas on mobile). The prototype instead shows a
  **per-pin bottom sheet** (tap a marker → preview slides up) with no persistent list
  (only a "Show list" toggle button, line 987/995, itself **decorative — no `onClick`,
  no list is ever shown**). This is the single biggest layout deviation on this screen —
  see §5 Risk Register. RESTRUCTURE: the bottom-sheet preview is **new**
  (`MapCourtRow` may be reused *inside* the expanded sheet's "More courts nearby" strip,
  since that's just a small horizontal card list), but the persistent list panel's
  UX role changes fundamentally.
- Pin-tap → bottom sheet: **NEW, and confirmed absent today** — no bottom-sheet/map-preview
  component of any kind exists anywhere in `apps/web/src` (verified by grepping
  `apps/web/src/features/map/**` for `preview|slide|sheet|drawer`; the only hits are
  Leaflet's own unrelated `movestart`/`dragstart` event names). Today's actual click
  contract, verbatim, is `apps/web/src/features/map/LeafletMapInner.tsx:224-226`:
  `marker.on('click', () => router.push(`/courts/${m.slug}`))` when `navigateOnClick` is
  true — an immediate full navigation, nothing else. This screen needs a `selected`/
  `expanded` state machine (`useState` in a client component, matching the prototype)
  that *replaces* that direct-navigate click handler with a select-into-sheet handler —
  a real behavior change to the existing click contract, flagged in §5.
- "Search this area": **dressing only** (§1.4) — no bbox query capability exists or is
  being built; render it as visual chrome or drop it (§7).
- Zoom controls (`+`/`−`, line 764–768): Leaflet's own zoom control already exists
  (`.leaflet-control-zoom`, styled in `globals.css:322–337`) — this is a **RESTYLE**, not
  new build, once the prototype's custom buttons are swapped for/reskin the existing
  Leaflet control.
- User-location blue dot (line 771): **already real** — `MapLocateControl.tsx` +
  `useGeolocation.ts` exist; confirm the marker itself renders (may need a small addition
  if today it only recenters without drawing a dot) — low-risk, RESTYLE/small addition.

**Data needed:** nothing new for markers/list (already flows via `courtToMarker`). The
bottom-sheet's expanded view needs `labels`/`tags` (D3) for its feature-icon row and
compact-preview label chip, and the "More courts nearby" strip needs *some* notion of
proximity — since there is no server-side court-to-court distance field (§1.3), either (a)
compute it client-side in-memory (haversine over the already-fetched `approxLat/approxLng`
set, same technique as `geo-distance.ts`, zero new data), or (b) drop the km number and
just show nearby courts unordered/by-country. Recommend (a) — no contract change needed.

**Pending-state primitives:** pin tap (local selection state, no primitive per CLAUDE.md
§4 rule 10) · sheet expand/collapse (local UI, no primitive) · "View details" / court rows
in "More courts nearby" → `PendingLink`/`PendingCardLink` · "Directions" button → external
link, not a pending primitive (opens Maps app, same pattern as the existing unlocked
Get-Directions `<a target="_blank">` in `CourtDetailCtaPanel.tsx:126–134`) · locked pin's
"Unlock access" → `PaywallTrigger` (existing component, not a navigation) · filter
pills/sheet → no primitive (local filter state, rule 10).

### 2.3 Court Detail — open (`CourtDetailScreen`, unlocked branch, line 1005)

**Structure:** hero gallery `height:320` (line 1014) with fade-in image swap on dot-nav
tap, back/save/share buttons overlaid, image-counter chip + "All photos" button,
dot-navigation strip. White content card `border-radius:'20px 20px 0 0'`, `marginTop:-16`
(line 1051) overlapping the hero. Inside: title + pin-icon location + surface chip
(line 1053–1060); horizontally-scrolling label-chip strip (line 1063–1069, **this is
`tags`**); truncated/expandable description ("Read more ↓", 110-char clamp, line
1081–1087); divider; **Location** 2-col grid — a 100px-tall decorative mini-map box +
address + "Open in Maps" button (line 1094–1114); **Gallery** horizontal thumbnail strip
(`72px` tall thumbs, line 1117–1124); **Nearby courts** horizontal strip (120px cards,
line 1127–1152); a **"Played here? Leave a review" card** (ivory background, star-circle
icon, "Review" button, line 1154–1166 — **this is D4**, explicitly *not* showing any
score); sticky bottom action bar (save-heart button + primary "Get directions" button,
line 1179–1186).

**Existing components — this screen is already substantially built and close to the
prototype:**
- `apps/web/src/app/courts/[slug]/page.tsx` — the server page; already resolves
  `locked`, `directionsUrl` (Feature 64), saved state, collections membership. KEEP the
  data-fetching shape; RESTRUCTURE the visual composition to match the card-over-hero
  layout.
- `apps/web/src/features/court-detail/CourtDetailGallery.tsx` — RESTYLE to the fade-in +
  dot-nav + counter-chip treatment; check whether it already supports an image index or
  needs that state added.
- `apps/web/src/features/court-detail/CourtDetailLocationPreview.tsx` — this is very
  likely the existing analog to the prototype's "Location" 2-col box; the existing one
  presumably already renders the locked/unlocked branches (mini stylized map + address vs.
  blurred/hidden) since Feature 63 (exact-location gating) predates this redesign. RESTYLE.
- `apps/web/src/features/court-detail/CourtDetailCtaPanel.tsx` — KEEP the logic
  (locked/unlocked branch, `directionsUrl`, `PaywallTrigger`, `ConsultationTrigger`,
  `CourtSaveButton`, `SaveToCollectionMenu` are ALL already correctly wired per CLAUDE.md
  §4/§7); RESTRUCTURE only the visual placement (prototype puts Save + primary CTA in a
  sticky bottom bar rather than a right-rail/inline block — confirm current placement and
  adjust layout, not logic).
- `apps/web/src/features/court-detail/CourtSaveButton.tsx` — **KEEP as-is**, it already is
  the canonical CLAUDE.md §4 triad example.
- `apps/web/src/features/court-detail/SaveToCollectionMenu.tsx` — **KEEP as-is**; already
  built (contrary to `FEATURE_28`'s plan which treated it as pending — it has since
  shipped). The prototype has no equivalent surfaced UI for this, so this is a case where
  the real app is *ahead* of the prototype; do not remove it — fold it into the redesigned
  action area.
- Nearby courts strip: reuses `CourtCard` (or a compact variant) — same "no distance
  field" situation as §2.2, same recommendation (client-side haversine or drop the number).
- "Read more/less" description toggle: **NEW**, small local `useState`, no primitive
  needed (not navigation/mutation).
- "Leave a review" card: **NEW** — D4. See §3 for the write path; this card only needs to
  open a review-submission form/modal (mirroring `ConsultationModal`'s existing
  trigger+modal pattern) — `PendingButton` or the modal-open triad per CLAUDE.md §4 rule
  10 (opening a modal needs no pending primitive; **submitting** the review inside it
  does, same shape as any other mutation).
- "Open in Maps" button in the Location box: maps to the same `directionsUrl` /
  `CourtDetailCtaPanel` external-link pattern — **KEEP** logic, RESTYLE placement.

**Data needed:** `tags` (D3) for the label-chip strip; review submission (D4, write-only).
Nothing else — `blurb`, gallery images, `isLocked`, `directionsUrl` all already flow.

### 2.4 Court Detail — locked (`CourtDetailScreen`, `isLocked` branch, line 1005–1188)

Same component, `isLocked = court.locked && !unlocked` (line 1009). Divergent rendering:
title → `"Unlock to reveal court name"` (line 1054); location line →
`"Location hidden — Premium only"` (line 1057); description → real text but
`filter:'blur(5px)'` (line 1075–1077, **the description is NOT hidden, only visually
blurred** — the real text is still in the DOM, unlike the address which is fully replaced
with `"Address hidden"`); Location box → `lock-overlay` (blur + centered lock icon +
"Unlock to reveal", line 1100); a full-width dark **"Unlock the full atlas"** CTA card
(line 1169–1176, **stale copy**: `"Unlock access — $29"`); sticky footer's primary button
becomes `"Unlock to get directions"` → `onPaywall` (line 1183–1185).

**Critical alignment check against the existing exact-location gate:** the prototype's
locked branch is **driven by a client-side prop** (`court.locked`, a boolean baked into
the demo `COURTS` array) — it has no concept of the server-verified entitlement check.
The real app's gate is server-first: `apps/api/src/me/exact-location.controller.ts` +
`exact-location.service.ts` return 403 for a non-entitled request, and
`apps/web/src/app/courts/[slug]/page.tsx` resolves `locked`/`directionsUrl` from that
protected read server-side (confirmed in `CourtDetailCtaPanel.tsx`'s header comment,
lines 20–25). **This must not change.** The redesign only changes what renders inside the
already-correct `locked` boolean — it must not introduce a client-side-only lock check.
Also: the real app's actual masking is **blurring the description text via CSS is a UI
nicety already partially true in spirit** — confirm whether the *existing* locked Court
Detail already omits/blurs `blurb`, since `CourtSchema` (contracts) does **not** mark
`blurb` as optional/omittable the way `lat`/`lng` are (`court.ts:58` — only `lat`/`lng` are
`.optional()`). If `blurb` is always sent regardless of entitlement, the prototype's
CSS-blur approach (client has the real text, just visually obscured) is **consistent with
current behavior** and safe to port as-is. If a future change ever considers *server-side*
omission of `blurb` for locked courts, that is an entitlement-model change **outside this
task's scope** — flag, don't do.

**Existing components:** same file as §2.3 — this is a **prop branch**, not a separate
component, and should stay that way (the real `page.tsx` already computes `locked` once).
RESTRUCTURE the locked-branch JSX; do not fork a second component.

**Data needed:** none beyond §2.3 — `isLocked` and the *absence* of `directionsUrl` are
already the exact signals used today.

**Interactions:** "Unlock access" / "Unlock to get directions" → `PaywallTrigger` (existing
component — **not** raw `onClick={onPaywall}` as in the prototype). Must render the real
plan model (D2) inside the triggered modal, not the prototype's stale `"$29"` string —
confirm `PaywallModal.tsx` already sources copy from `paywall-copy.ts`'s three-plan
structure (it does, per direct read: `monthly $9 / quarterly $24 / yearly $79`) so the
locked Court Detail CTA's *label* just needs updating from `"Unlock access — $29"` to
something plan-neutral (e.g. `"Unlock Full Access"`, matching the CTA panel's existing
copy at `CourtDetailCtaPanel.tsx:121`) — no new pricing copy to invent.

### 2.5 Collections (`CollectionsScreen`, line 1290)

**Structure:** header row (`display-l` title + search/filter icon pair, no back button —
top-level page); "Featured Collections" horizontal strip, cards `200×240`, `border-radius:12`
(line 1309); "By Country" horizontal strip of 72px circular country avatars (line
1335–1344, **uses the prototype's hardcoded `COUNTRIES` array** — country/court-count
pairs with no backing aggregate query, see §4); "Curated for You" vertical list, full
rows with a 96×80 thumb + save button (line 1353–1365).

**Existing components:**
- `apps/web/src/features/collections/CollectionsHero.tsx` — RESTRUCTURE (drop the "dark
  hero band" treatment per the current `/collections` page in favor of the lighter
  title+icons header row, or confirm this is an acceptable visual delta — flag as a
  judgment call, low risk).
- `apps/web/src/features/collections/CollectionsGrid.tsx` / `CollectionCard.tsx` —
  RESTYLE into the horizontal-strip + vertical-list hybrid instead of the current grid.
- "By Country" section: **NEW**. This needs a real country→court-count aggregate. The API
  has `Country`/`Region` models already (schema.prisma:112–129) and courts already carry
  `countryId` — a `GET /v1/collections/countries` (or reuse `courts.service` with a
  `groupBy`) is a small, real addition, **not** a hardcoded array. Flag as its own small
  feature (§6) rather than folding into the Collections restyle, since it is additive API
  surface, not just presentation.
- Search/filter icons in the header: **decorative in the prototype** (`Ico.search`/
  `Ico.filter`, line 1296–1297, no `onClick` at all) — dressing, not real behavior (§4/§7).

**Data needed:** country + court-count aggregate (new, small, additive — no schema
change, just a new read). Everything else (`CollectionDTO`'s `name`/`courts`/`img`/`sub`)
already exists.

**Pending primitives:** collection cards → `PendingCardLink`; country avatars →
`PendingCardLink` or `PendingLink` (small target, either is defensible — recommend
`PendingLink` since it's icon+label, not a full card); save buttons on "Curated for you"
rows → real mutation, same triad as Home's save-heart (not the prototype's bare `useState`).

### 2.6 Saved (`SavedScreen`, line 1192)

**Structure:** header (`display-l` "Saved" + subcopy), two-tab pill switcher (Courts /
Collections, `design_v2_stripped.html:1205–1210`), count + "Recently added ↓" sort
row (decorative — no `onClick`, line 1214). **Courts tab:** full-bleed image cards,
`height:170`, `border-radius:14` (line 1223), surface-chip top-left, save/unsave button
top-right, name+location+label-chips overlay bottom, plus a "Dream List" CTA card at the
end (line 1247–1258, promotes Collections). **Collections tab:** 2-col grid, `height:150`
cards (line 1266).

**Existing components:**
- `apps/web/src/features/saved/SavedTabs.tsx` — KEEP the tab-switch mechanism; RESTYLE to
  pill-button visual.
- `apps/web/src/features/saved/SavedCourtsGrid.tsx` — RESTRUCTURE from (presumably) a grid
  to the full-bleed-card vertical list the prototype uses; already wired to the real
  unsave mutation per memory (`saved-court-standalone-toggle.md`) — **KEEP the mutation
  wiring**, restyle the card only.
- `apps/web/src/features/saved/SavedCollectionsGrid.tsx` / `SavedCollectionRow.tsx` —
  RESTYLE to the 2-col image-card grid.
- `apps/web/src/features/saved/SavedEmptyState.tsx` — check against prototype (no explicit
  empty state shown in this screen's code, since the demo seeds `saved` with items) — KEEP
  and adapt visual only.
- `apps/web/src/features/saved/SavedWishlistMap.tsx` — **the prototype has no third
  "Wishlist Map" tab at all** — only Courts/Collections. CLAUDE.md's own §5 fallback table
  still lists a "Wishlist Map" concept implicitly via `UserCollectionHero`'s `/saved`
  fallback, but this component's tab itself may be **dropped** by the redesign. Flag in
  Open Questions (§7) — this is a real behavior reduction (removing a tab), not just
  restyling, and needs explicit confirmation before deleting.
- "Dream List" CTA card: **NEW**, presentational only, links to Collections.

**Data needed:** none new — `SavedCourt`/`UserCollectionDTO` already carry everything
(`labels`/`tags` for the chip row, D3, same as everywhere else).

**Pending primitives:** tab switch → local state, no primitive; court/collection cards →
`PendingCardLink`; save/unsave heart → existing mutation triad (KEEP); "Explore
collections" CTA → `PendingLink`.

### 2.7 Profile (`ProfileScreen`, line 1376)

**Structure:** header row (empty/wordmark/settings-gear); profile block (80×80 avatar +
name + "Edit profile" pill button, line 1400–1412); 3-col stats strip (`Courts saved` live
count, `Courts visited`/`Courts liked` both "Coming soon" grey — line 1414–1427);
membership card (dark, gold eyebrow, line 1431–1449 — **stale `unlocked` boolean +
"$29"/"Lifetime Member" copy**, this is exactly D2's target); "My collections" horizontal
strip; an **edit-profile modal** (bottom sheet: avatar-cycle button, Name input, Email
input, "Save changes", line 1476–1513).

**Existing components:**
- `apps/web/src/features/profile/ProfileHeader.tsx` — RESTRUCTURE to add the avatar +
  "Edit profile" button (confirm current header shape — likely simpler today, no inline
  edit trigger).
- `apps/web/src/features/profile/ProfileStats.tsx` / `ProfileStatLink.tsx` — the "Coming
  soon" / real-count split pattern **already exists** per memory
  (`profile-stats-clickable-links.md` — `ProfileStatLink` via `PendingCardLink`, Countries
  stat → `/map`). RESTYLE only; the real-vs-coming-soon logic is already correct and
  should carry over unchanged, just re-skinned to the 3-col strip with icons.
- `apps/web/src/features/profile/ProfileMembershipCard.tsx` — **already does the right
  thing** per direct read: copy is `"Choose your membership."` / `"See Membership"`, no
  stale price, correctly branches on `unlocked` and opens `PaywallTrigger`. This is **D2
  already substantially satisfied** — RESTYLE only (dark gradient background for the
  `unlocked` state per prototype line 1442, "Lifetime Member" → must become plan-aware,
  e.g. "Member since {date}" without implying a one-time lifetime purchase — small copy
  change, not a logic change).
- `apps/web/src/features/profile/ProfileMenuList.tsx` / `ProfileMenuRow.tsx` — not
  directly visible in the prototype's `ProfileScreen` (the prototype's menu rows appear
  only in `SettingsScreen`, §2.8) — confirm whether the real Profile page currently shows
  menu rows inline that the redesign moves into Settings, or whether they already live in
  Settings. Flag as a structural question if current `/profile` renders account-settings
  rows directly (would mean **moving**, not just restyling).
- Edit-profile modal: **NEW**. Must decide its data path: today, is there a `PATCH /v1/me`
  the web already calls anywhere (memory notes `/v1/me` PATCH exists — `1..80` char name
  validation, 401/400 shapes — from Feature 53)? If so, this modal is a **real,
  wireable feature** (form → existing endpoint), not decoration — confirm and treat
  accordingly (§6 feature sizing). Avatar upload/cycling has **no existing upload
  capability** anywhere in the app (Google OAuth's `avatarUrl` is read-only, sourced only
  from Google sign-in per CLAUDE.md §6) — the modal's avatar-cycle button in the prototype
  just toggles between 2 hardcoded URLs; a real upload flow is out of scope unless
  explicitly requested (flag in §7).

**Confirmed absent today:** an edit-profile UI/modal does not exist anywhere in
`apps/web/src/features/profile/` — that directory has exactly 7 files
(`ProfileHeader.tsx`, `ProfileMembershipCard.tsx`, `ProfileMenuList.tsx`,
`ProfileMenuRow.tsx`, `ProfileStatLink.tsx`, `ProfileStats.tsx`, `index.ts`), none of
which let a user edit name/email/avatar (`ProfileHeader.tsx` only renders the user's
existing data; a repo-wide grep for `edit|Edit` inside the profile feature returns zero
matches). This is genuinely new build, not a restyle of something partially there.

**Data needed:** `PATCH /v1/me` already exists for name (confirm email is/isn't editable
today — Google-linked accounts should probably not allow arbitrary email edits without
re-verification, a real product question, not just UI — flag in §7).

**Pending primitives:** "Edit profile" button opens modal → no primitive (modal open, rule
10); modal "Save changes" → real mutation → `PendingButton`; stats links → `PendingCardLink`
(existing pattern, keep); "See Membership"/"Unlock" → `PaywallTrigger` (existing); "My
collections" cards → `PendingCardLink`; settings gear → `PendingLink` to `/profile/settings`
or wherever Settings routes (see §2.8 — currently there is **no `/profile/settings` app
route** at all; this is new).

### 2.8 Settings (`SettingsScreen`, line 1519)

**Structure:** back-button + `display-m` title header (no `AppShell`-level page — this
*does* need a Back button, unlike Profile itself, since it's a nested destination reached
from Profile's gear icon); a single card with 3 rows (Subscription & Access w/ dynamic
sub-copy, Account settings, Contact us) each with a chevron, dividers between; Privacy/Terms
links row at the bottom.

**Existing components:** **there is currently no `/profile/settings` (or similarly named)
route at all** in `apps/web/src/app/**/page.tsx` — this is a genuinely **NEW** page.
- Route: needs a new page, e.g. `apps/web/src/app/profile/settings/page.tsx`. Per CLAUDE.md
  §5, this is a **nested/detail page and MUST use the shared `BackButton`** with an
  explicit `fallbackHref="/profile"` (Settings is reached only from Profile's gear icon,
  never a top-level nav destination, so it is correctly excluded from the "no Back button"
  top-level list).
- Row content: "Subscription & Access" → should link to the *existing* billing
  management surface. Confirm whether that's `ManageBillingButton.tsx` (opens Stripe
  Portal — `apps/web/src/features/billing/ManageBillingButton.tsx`) directly, or a further
  sub-page. Given D2 (billing stays subscriptions, no new billing endpoints), the
  simplest-and-correct wiring is: this row **is** (or directly contains) the existing
  `ManageBillingButton`/`PaywallCheckoutButton` depending on entitlement state — not a new
  billing surface.
- "Account settings" row: maps to the profile-edit capability (§2.7) or is redundant with
  it — clarify in §7 (don't build two separate name/email editors).
- "Contact us": likely maps to existing `mailto:` pattern used elsewhere (per
  `FEATURE_28`'s About page precedent, `hello@tennismap.app`-style link) — trivial, no new
  backend.
- Privacy/Terms links: **already real routes** (`/privacy`, `/terms` — Feature 29) — just
  wire the `href`s, no new pages.

**Data needed:** none new — this page composes existing billing/profile capability, it
does not add any.

**Pending primitives:** each row is a real navigation (or a Stripe-Portal-opening action
for "Subscription & Access") → `PendingLink` for the two static rows, and the *existing*
`ManageBillingButton`'s own pending handling (already built per CLAUDE.md §7/memory) for
the billing row — do not rebuild billing-button pending logic, reuse it.

### 2.9 Payment success (`PurchaseSuccessScreen`, line 1557)

**Structure:** hero image `height:280` fading to `bone`; check-circle icon; "WELCOME TO /
Tennis World" headline; body copy; a 4-item stat row (Countries/Courts/Exact
Locations/Curated Collections, all with **hardcoded numbers** `120+`/`1800+`, line
1578–1593 — decorative marketing copy, not live counts); primary "EXPLORE THE MAP" button;
two secondary buttons (View Saved Courts / Go to Profile); a "New here? View guide" ivory
tip row (decorative, `VIEW GUIDE →` has no destination in the prototype).

**Critical alignment vs. the existing billing flow — read this before building:** the
existing `/billing/return` (`apps/web/src/features/billing/BillingReturn.tsx`) implements
a **specific, deliberate, bounded-poll flow** (CLAUDE.md §7): it re-reads `/v1/me` up to 6
times × 2s and shows a **calm "processing" state**, never a hard success/fail split at the
instant of redirect, because the webhook may not have landed yet. The prototype's
`PurchaseSuccessScreen` is a **static, immediate** success screen with no polling concept
at all (`App`'s `handleUnlock` just flips a boolean synchronously, line 1708–1711) —
**this is prototype-simplified, not a real state machine.** The redesign must graft the
prototype's *visual design* onto the *existing* polling logic, not replace the polling
logic with the prototype's instant-success assumption. Concretely: this screen's content
renders only **after** `BillingReturn`'s poll resolves to an entitled state; the existing
"processing" interim state (spinner/calm-wait copy) is unchanged and sits *before* this
screen, not replaced by it.

**Existing components:**
- `apps/web/src/features/billing/BillingReturn.tsx` — **KEEP the polling logic
  unconditionally.** RESTRUCTURE/add the success-state visual to match the prototype
  (hero image, check-circle, stat row) as the *rendered result* of a resolved poll.
- `apps/web/src/features/billing/CheckoutStatusBanner.tsx` — check whether this already
  covers the "processing" interim state visually, or whether it's the `?status=cancelled`
  banner specifically (memory suggests the latter, given CLAUDE.md's mention of "its
  `?status=cancelled` branch"). Confirm before assuming overlap.
- Stat row: **decorative marketing copy** — hardcode as static copy (matches how
  `HomePaywallBand`/`ProfileMembershipCard` already keep copy feature-local per existing
  convention), not a data-fetch.
- "View guide" tip: **dressing** — no destination in the prototype; drop or link to
  `/about` if a guide-equivalent exists (it doesn't today) — flag in §7.

**Data needed:** none new. Uses the already-correct polled entitlement state.

**Pending primitives:** "EXPLORE THE MAP" / "View Saved Courts" / "Go to Profile" → all
real navigations → `PendingLink`/`PendingButton` per existing `BillingReturn` conventions
(confirm what it uses today and stay consistent — likely already `PendingLink` given
Feature "back-nav-pending-states" landed after billing).

### 2.10 Payment failed (`PurchaseFailedScreen`, line 1614)

**Structure:** desaturated hero `height:200`; close-circle icon (clay-colored border);
"Payment unsuccessful" headline; body copy; a reassurance card (3 rows: "Card details not
charged" / "Your courts still saved" / "Your progress not affected", each with a green
checkmark, line 1628–1637); "Try again" primary button; "Go back" secondary; "Contact
support" text link.

**Existing components:** confirm CLAUDE.md §7's `?status=cancelled` branch on
`BillingReturn` is exactly this state, or a distinct one — Stripe Checkout's cancel
redirect and an actual *payment failure* (declined card) are technically different events;
the existing code may only model "cancelled" (user backed out) rather than "failed" (card
declined). If only "cancelled" exists today, this screen's copy ("Something went wrong
with your payment... card hasn't been charged") is really describing the **cancelled**
case, and "Try again" should re-open checkout (existing `PaywallCheckoutButton`/
`useBillingAction` capability) rather than implying a new failure-detection path. This is a
copy/framing alignment, not a new capability — **KEEP** the existing cancelled-state
detection; RESTYLE its presentation to match this screen, and rename internally if the
copy no longer says "cancelled" but the underlying event still is.

**Data needed:** none new.

**Pending primitives:** "Try again" → `PendingButton` (re-triggers checkout, an async
action) using the existing `use-billing-action.ts` hook; "Go back" → `PendingLink` to
`/profile` (existing Back-fallback convention, CLAUDE.md §5 table's "Billing return →
`/profile`" fallback applies here too).

---

## 3. Data and contract work (D3 + D4)

### D3 — `tags: string[]` on Court

**Prisma:** add `tags String[] @default([])` to `model Court` in `schema.prisma`. Postgres
native array column via Prisma — no join table needed for a simple tag list with no
per-tag metadata (unlike `Collection`↔`Court`, which needs `sortOrder` and so uses a join
table; tags need neither ordering guarantees beyond array order nor cross-court tag
identity today). `@default([])` makes this **back-safe on its own** — a plain additive
column with a default needs no separate backfill step, unlike the `NOT NULL`-without-default
case CLAUDE.md §8 warns about. Author with `prisma migrate diff` against the current
schema, apply with `prisma migrate deploy` (per CLAUDE.md §8 — `migrate dev` hangs in this
shell). One new migration directory alongside the existing 6
(`20260626224118_init` … `20260723193333_add_user_google_oauth`).

**Contracts (`packages/contracts/src/court.ts`):** add `tags: z.array(z.string())` to
`CourtSummarySchema` (line 29–47) so it's present on every list/map/card read, not just
detail — the Home icon-shortcuts and Map filter chips both need it on summary rows, not
just the detail page. `CourtSchema extends CourtSummarySchema` already, so detail inherits
it automatically — no separate addition to `CourtSchema` (lines 51–59) needed.

**API:** `courts.mapper.ts`'s `courtSummarySelect`/`toCourtSummaryDTO` (and
`courtDetailSelect`/`toCourtDTO`) need `tags: true` added to the Prisma `select` and
`tags: row.tags` in the mapper functions. `courts.service.ts`'s `list()` gains a `tags`
filter param — recommend `where.tags = { hasSome: query.tags }` (Postgres array overlap;
Prisma's `hasSome` on a scalar list field) for an OR-of-tags match (any selected tag
matches), mirroring how the prototype's filter-sheet lets multiple tags be toggled
simultaneously. `courts.dto.ts`'s `parseCourtListQuery` needs a `tags` parse branch
(comma-separated query string → `string[]`, same shape as any other multi-value query
param the codebase might already use — check `parseCourtListQuery` for a precedent before
inventing a new parsing convention).

**Seed/content:** `packages/mock-data/src/courts.ts`'s 8 `COURT_SEEDS` (only 8 shown in
mock-data despite "12 courts" — **note:** the file header comment says "12 courts ported
verbatim" but only 2 were read in this session; confirm the actual count is 12 as
documented, not 8, before treating mock-data as fully enumerated) each need an authored
`tags: string[]`. The richest available source is the **already-parsed `type` field** from
each court's `content/<folder>/info.txt` (e.g. Épi Baie de Pampelonne's
`type: "FRENCH RIVIERA, clay courts · pampelonne beach · boutique hotel"`,
`content/EPI BAIE DE PAMPELONNE/info.txt:5`) — the importer script
(`apps/api/scripts/import-courts-from-content.ts:305–306`) already tokenizes this into
`typeTokens` for surface/access derivation; **extending that same parse to also emit a
`tags[]` array** (e.g. splitting on `·`/`,` and title-casing) is the natural single source
of truth, keeping content-authoring (`info.txt`) as the place tags are edited, not a second
hand-maintained list. This keeps mock-data and the importer in sync by construction rather
than by hand-copying.

**Mock↔API parity:** `verify-api-parity.ts` (Feature 47, currently the CLAUDE.md-cited "35
checks") compares mock and HTTP repository output for courts/collections/journal
byte-for-byte. Adding `tags` to the DTO **requires** adding it to both sides identically —
the harness will fail if mock-data's authored `tags` and the seeded DB's imported `tags`
ever diverge in content or ordering. This is the sharpest edge of D3: the importer-derived
tags and the hand-authored mock tags must match token-for-token, which argues for
generating the mock-data `tags` arrays *from* the same `info.txt` files (or at minimum,
copy-pasting the importer's actual output into `courts.ts` once, with a comment noting the
source) rather than hand-guessing them independently.

### D4 — Reviews (collection only, no display)

**Prisma:** new `model Review`: `id String @id @default(cuid())`, `courtId String` +
relation to `Court`, `userId String?` + relation to `User` (nullable — allow anonymous
submission if the product wants that; **flag in §7**, since the prototype's "Played here?"
card gives no indication either way and the repo has no anonymous-write precedent —
`ConsultationRequest.userId` is nullable, which is the closest existing analog and
supports allowing it), a rating value (e.g. `rating Int` 1–5, even though never displayed —
D4 says "the stored reviews are for later use", implying a rating value is still being
collected, just not shown), an optional `body String?` free-text comment, `createdAt
DateTime @default(now())`, and a moderation-friendy `status String @default("pending")`
mirroring `ConsultationRequest.status`'s existing convention (`schema.prisma:396`) so a
future admin surface can vet reviews before any future display — this is groundwork, not
a feature to build now, so keep it minimal and additive. New migration, back-safe (a
wholly new table needs no backfill).

**Contracts:** new `ReviewSchema`/`ReviewDTO` in a new `packages/contracts/src/review.ts`
(or fold into `court.ts` if the team prefers colocating with `Court` — either is
defensible; recommend a separate file since `Review` isn't a Court sub-shape, it's its own
entity with a `courtId` FK, matching how `ConsultationRequest` gets its own
`consultation.ts`). Needs only a **write-request** shape
(`CreateReviewRequestSchema`: `courtId`, `rating`, `body?`) since there is no read/display
endpoint in scope — mirroring `consultation.ts`'s pattern of a request-only DTO with no
corresponding list/read DTO.

**API:** new small module `apps/api/src/reviews/` (or nest under `courts/` — recommend a
sibling module matching `consultations/`'s precedent: its own controller/service/dto,
registered in `AppModule`) exposing `POST /v1/courts/:slug/reviews` (public — matches the
"collection only" framing; whether it requires auth is a real product question, see §7)
that resolves the court by slug (404 on miss, same pattern as `getBySlug`), validates the
rating range, and writes. **No GET endpoint** — explicitly out of scope per D4.

**Seed/content:** none required — reviews start empty; no seed data implied by "collection
only, no display."

**Web:** `apps/web/src/domain/courts/court.repository.ts` interface gains a
`submitReview(courtId, rating, body?)` method (mirroring how `consultation` submission
presumably flows — check `ConsultationModal.tsx`'s submit path as the precedent for
client → repository → API wiring) implemented in both `mock-court.repository.ts` (in-memory
no-op or console-log, matching Phase-1 mutation conventions) and `http-court.repository.ts`
(real `POST`). The "Played here?" card + review form is a new client-island component
(`features/court-detail/ReviewTrigger.tsx` + `ReviewModal.tsx`, structurally identical to
`ConsultationTrigger`/`ConsultationModal`) — **reuse that modal's a11y/portal/escape-close
conventions**, don't invent new modal plumbing.

**Mock↔API parity:** since this is a **write-only** path with no corresponding read DTO on
any list/detail response, `verify-api-parity.ts` (which compares *read* output) needs no
new comparison — there is nothing new on the wire to diff. This is the one contract change
in this task that does **not** touch the parity harness. A separate small
`verify:review-submission`-style script (new, following the existing `verify:*` naming and
prerequisites-header convention) would be the right place to test the write path itself if
the team wants one — not required by any existing aggregate command, so flag as optional
in the feature breakdown (§6).

---

## 4. Prototype-only artifacts to discard

None of the following may reach production code:

- **Phone shell chrome** — `.phone`/`.phone-inner` (`design_v2_stripped.html:32–34`), the
  390×844 device frame, border-radius-48 bezel, drop shadow. The real app has no device
  frame; it runs full-viewport in a real mobile browser.
- **Fake iOS `StatusBar`** (component line 288, CSS `.status-bar` line 37–40) — the
  hardcoded "9:41" clock + battery/signal SVGs. Never render fake OS chrome.
- **The screen-switcher tab strip** in `App` (line 1723–1736) — the pill-button row that
  lets a prototype viewer jump between the 10 screens. Pure prototype-authoring tool.
- **`NavVariantsComparison`** (line 1649) — side-by-side 5-tab-vs-4-tab comparison. Its
  *conclusion* (5 tabs, Option A) is D1, already decided; the comparison component itself
  is throwaway.
- **Hardcoded `COURTS`/`COLLECTIONS`/`COUNTRIES` arrays** (lines 208–234) — every screen
  above must source this data from the real repositories (`@/lib/repositories` →
  `CourtSummaryDTO[]`/`CollectionDTO[]`/a new country aggregate, §2.5), never from a
  literal array. This includes the specific demo values (`saved: new Set(['epi','soho'])`,
  the hardcoded `openCourt`/`premiumCourt` pin selection on Map, line 629–630) — all
  prototype demo-state, not real data modeling.
- **Unsplash URLs + `onError` fallbacks** (the `U()` helper, `IMG` map lines 186–205, and
  every `onError={e=>{e.target.src=...}}` scattered through Home/Map/CourtDetail) — the
  real app serves images through its own asset pipeline (`CourtImage` component,
  `heroImageUrl`/`images[]` from the DTO); no Unsplash dependency, no client-side
  image-fallback-swapping pattern.
- **The two stripped base64 map PNGs** — the Home map-preview background (line 486) and
  the Map screen's full background (line 750). Both were removed by the reading script and
  **must not be "recovered"** — a real asset (or the existing Leaflet tile-based rendering,
  strongly preferred for the Map screen per §2.2/§5) needs to be sourced/decided
  independently; this document does not supply or imply new binary assets.
- **`Stars` component** (line 277) and every rating/review-count render (`4.6`, `(128)`,
  and all per-court `rating`/`reviews` fields in the `COURTS` array) — D4 is explicit: no
  star ratings, average scores, or review counts anywhere in the UI. The `rating`/`reviews`
  fields in the prototype's data model do not get ported at all, even as unused schema —
  only the review *write* capability (D4) is real.
- **Stale $29/lifetime copy** — `"Unlock access — $29"` (CourtDetailScreen line 1174),
  `"One-time · Lifetime · $29"` (ProfileScreen line 1436), `"Lifetime Member"` (ProfileScreen
  line 1444). D2: replace with plan-neutral copy consistent with the existing
  `paywall-copy.ts` three-plan structure (monthly/quarterly/yearly) — none of these literal
  strings survive.
- Decorative-only interactive elements that never gained real logic in the prototype
  itself (distinct from the above — these aren't "prototype chrome," they're **unwired
  buttons the prototype itself never connected to anything**, so porting them as inert
  placeholders would be porting bugs, not features): the filter-sheet's "Show results"
  no-op (line 411/693), "Search this area" (line 756–761), Map's "Show list" toggle
  (line 986–988/995), Collections' header search/filter icons (line 1296–1297), Payment
  Success's "View guide" link (line 1606). Each either needs real wiring decided in this
  task (flagged per-screen above) or should be dropped rather than shipped as a dead click
  target — do not silently port a non-functional button as if porting fixed the prototype.

---

## 5. Risk register

1. **Exact-location gate vs. the new locked presentation.** The gate itself
   (`exact-location.controller.ts`/`.service.ts`, the 403-on-non-entitled response, the
   server-computed `locked` boolean in `page.tsx`) is untouched by this redesign — verified
   in §2.4. The risk is entirely in the *new* locked-branch JSX accidentally introducing a
   client-side-only check (e.g. checking `court.isLocked` directly in a new component
   instead of consuming the page-level `locked` prop that already accounts for
   entitlement) or accidentally sending `blurb`/`address`-equivalent fields to a locked
   client that shouldn't have them. **Mitigation:** every new locked-branch component must
   take `locked`/`directionsUrl` as props from the existing page-level computation, never
   recompute or re-derive entitlement state client-side. Since `address` doesn't exist yet
   (§1.3) and won't be added by this task (only `tags`, which is public/always-visible
   metadata, not location data), there is no new field to accidentally leak — the
   surface area for this risk is *not growing*, but the JSX restructuring itself is real
   work that must be reviewed against this specifically.

2. **Map screen vs. the existing Leaflet integration + `MAP_PROVIDER_DECISION.md`.** This
   is the single biggest structural risk in the whole redesign (§2.2). Concretely:
   - The prototype's bottom-sheet-per-pin-tap model **conflicts** with the current
     `navigateOnClick` behavior on `LeafletMapInner.tsx` (today, clicking a marker
     navigates straight to `/courts/[slug]`; the prototype instead opens an in-place
     preview sheet and only navigates on a second, explicit "View details" tap). Changing
     this is a real interaction-model change, not styling, and needs its own careful
     feature (§6) with explicit before/after click-behavior documentation, since it
     changes what "tap a pin" *does* app-wide.
     - **Desktop nuance:** the existing `.map-layout` is `flex-direction: row` at ≥768px
       with a persistent 380px list panel (`globals.css:375–389`) — the tap-to-sheet model
       is a mobile-only affordance in the prototype (390px-only source). D5 says preserve
       existing desktop behavior; the cleanest resolution is: **mobile gets the new
       bottom-sheet-on-tap model, desktop keeps the persistent list panel + a lighter-weight
       hover/click preview inline**, i.e. this is genuinely two different interaction
       models gated by breakpoint, not one component with responsive CSS. Flag for
       explicit sign-off before implementation (§7).
   - The prototype's `100dvh` flex-column full-bleed layout (line 664) is **not** what the
     existing `.map-layout` does — the real layout subtracts a fixed header/filterbar/
     bottom-nav chrome height (`--map-header: 72px`, `--map-filterbar: 69px`,
     `--map-bottom-nav`, `globals.css:354–359`) rather than letting the map claim the
     entire viewport under a floating header. Porting the prototype's true full-bleed
     feel requires either making the existing `AppHeader`/filter bar overlay-transparent
     over the map (closer to the prototype's visual) or accepting a hybrid where the map
     fills what's left below a still-solid header (closer to current behavior). This is a
     real layout decision with AppShell-wide implications (does the map screen become the
     first screen with a transparent/overlaid header?) — flag in §7, do not assume.
   - **Net recommendation:** treat the Map screen as the **highest-effort, highest-risk
     item** in the whole redesign and give it its own multi-feature slice (§6) rather than
     bundling it with other RESTYLE work.

3. **`verify:ux-pending-states` (90 checks) vs. wholesale component rewrites.** Every
   screen restructure in §2 that touches an existing navigational/async control (Home
   featured cards, Map pin taps → detail, Court Detail CTAs, Saved cards, Profile links,
   Settings rows, Billing return buttons) risks silently dropping a `PendingLink`/
   `PendingCardLink`/`PendingButton`/`useElementPending` usage during the rewrite, since
   the visual container is being rebuilt from scratch rather than incrementally edited.
   **Mitigation:** §2's per-screen "Pending primitives" subsections are the checklist;
   run `verify:ux-pending-states` after **every** feature in §6 that touches a screen
   (not just at the end), since the harness asserts against source patterns and will catch
   a regression immediately rather than after it's compounded across several features.

4. **`verify:api-parity` (35 checks per CLAUDE.md) vs. the D3 contract change.** Adding
   `tags` to `CourtSummarySchema` (§3) is the only contract change in this task that the
   parity harness *does* cover (reviews are write-only, §3 D4, and don't touch it). The
   risk is narrow but sharp: mock-data's authored `tags` and the seeded-DB's
   importer-derived `tags` must match exactly (same tokens, same order, same casing) or
   the harness fails deterministically. **Mitigation:** generate both from the same
   `info.txt` `type:` parse (§3) rather than authoring them independently by hand in two
   places.

5. **`100dvh` flex-column map layout vs. the existing `AppShell`.** Related to #2 but
   narrower: `AppShell` (mounting `NavigationPendingProvider` once, per CLAUDE.md §4) wraps
   every page including `/map` today. The prototype's Map screen assumes it *owns* the
   full `100dvh` including the bottom nav bar being part of its own flex flow (`BottomNav`
   is the last child inside the `100dvh` container, line 999). **Confirmed against the
   real `AppShell.tsx`:** it renders, in order, `NavigationPendingProvider` wrapping
   `AppHeader` → `<main>` (padded `pt-[72px]` unless `overHero`, and
   `pb-[calc(56px+safe-area)] md:pb-0`) containing `{children}` + `Footer` → `BottomNavigation`
   as a fixed-to-viewport sibling of `<main>`, hidden at `md:` and up. So the bottom nav is
   exactly the fixed/sticky sibling this risk predicted, **not** a child the page lays out
   itself — confirming `.map-layout`'s `--map-bottom-nav` height-reservation variable
   (`globals.css:356`) is compensating for real fixed-positioned chrome, not a guess. The
   prototype's `100dvh` layout math must compose with `<main>`'s existing top/bottom padding
   reservation, not duplicate or fight it — this is now a known quantity, not an unknown to
   confirm before Feature 85/86 starts.

6. **Bottom nav becoming 5 tabs (D1) is a bigger change than it first appears.** Confirmed
   directly: today's `TAB_NAV` (`apps/web/src/components/layout/nav-items.ts:23–28`) has
   only **4** items (Home, Map, Saved, Profile) — Collections is currently a **desktop-only**
   `PRIMARY_NAV` entry, never in the mobile tab bar. D1 doesn't just "add Collections to an
   existing 5-slot bar" — it's the **first time** Collections becomes a mobile bottom-tab
   destination at all. This has a knock-on for CLAUDE.md §5's explicit list of top-level
   pages that must never get a Back button (`/`, `/map`, `/collections`, `/journal`,
   `/saved`, `/profile`) — `/collections` is *already* on that list (it's already a
   top-level desktop nav destination today), so no rule-text change is needed there, but
   the *mobile* BottomNavigation component (wherever it currently reads `TAB_NAV`) must be
   updated in lockstep with `nav-items.ts`, and Journal's removal from the tab bar (staying
   only in `PRIMARY_NAV` + a Home section, per D1) must not accidentally also remove it from
   desktop nav — D1 only changes the **mobile** tab set.

---

## 6. Feature breakdown

Continuing the repo's numbering from Feature 70. Sequenced so shared primitives and data
groundwork land first, screens follow, and the highest-risk item (Map) gets isolated. Every
feature runs `pnpm --filter @tennis/web typecheck`/`build` (or the API equivalents) plus the
listed harnesses; none is described as complete without them.

| # | Goal | Files (representative) | Depends on | Harnesses | Size |
|---|---|---|---|---|---|
| 72 | **`tags` data groundwork** — Prisma migration, `CourtSummarySchema`/`CourtDTO` field, API select/mapper/filter param, mock-data authoring from `info.txt` `type:` parse, importer extended to emit tags. No UI change. | `schema.prisma`, new migration, `courts.mapper.ts`, `courts.service.ts`, `courts.dto.ts`, `packages/contracts/src/court.ts`, `packages/mock-data/src/courts.ts`, `apps/api/scripts/import-courts-from-content.ts` | none | `verify:api-parity`, API typecheck/build | M |
| 73 | **Shared `FilterSheet` + tag-driven filter chips** — one new component (`apps/web/src/components/…` or a `features/discovery/` home) replacing ad hoc filter UI, consumed by both Home and Map. Pure presentation + client filter logic, no new endpoint yet (client-side `tags` filtering over already-fetched summaries). | new `FilterSheet.tsx`, `MapFilterBar.tsx` (restyle), `MapExplorer.tsx` (predicate update) | 72 | `verify:ux-pending-states`, web typecheck/build | M |
| 74 | **Home screen redesign** — hero, search+inline results, icon shortcuts (wired to `FilterSheet`/tags), map-preview band (static asset, links to `/map`), featured-courts carousel restyle, collections teaser restyle, journal restyle. Resolve HomeEditorsCut/HomePaywallBand fate per §7 Q1. | `features/home/**`, `app/page.tsx` | 72, 73 | `verify:ux-pending-states`, web typecheck/build | L |
| 75 | **Country aggregate endpoint** — small additive API read (`GET /v1/collections/countries` or similar) backing Collections' "By Country" strip. No schema change (Country/Region already exist). | `apps/api/src/collections/*`, `packages/contracts/src/collection.ts` | none | `verify:api-parity`, API typecheck/build | S |
| 76 | **Collections screen redesign** — featured strip, By Country strip (consumes F75), curated list restyle. | `features/collections/**`, `app/collections/page.tsx` | 75 | `verify:ux-pending-states`, web typecheck/build | M |
| 77 | **Saved screen redesign** — tab pill restyle, full-bleed court cards, collections grid, Dream List CTA. Resolve Wishlist Map tab fate per §7 Q2 before starting. | `features/saved/**`, `app/saved/page.tsx` | 73 (tag chips reused on cards) | `verify:ux-pending-states`, web typecheck/build | M |
| 78 | **Court Detail redesign (unlocked)** — hero gallery restyle, tag-chip strip, description clamp, location box restyle, gallery strip, nearby-courts (client-side distance), CTA panel restructure (logic unchanged). | `features/court-detail/**` (all except SaveToCollectionMenu/CourtSaveButton, kept as-is), `app/courts/[slug]/page.tsx` | 72, 73 | `verify:ux-pending-states`, `verify:web-exact-location`, web typecheck/build | L |
| 79 | **Court Detail redesign (locked) + paywall copy update** — locked-branch JSX restructure per §2.4, replace stale $29/lifetime strings app-wide (Court Detail, Profile) with plan-neutral copy. **No entitlement/gate logic change** — explicit review-focus item. | `features/court-detail/**` (locked branch), `features/profile/ProfileMembershipCard.tsx` | 78 | `verify:web-exact-location`, `verify:ux-pending-states`, web typecheck/build | M |
| 80 | **Review submission (D4)** — Prisma `Review` model + migration, contracts write DTO, API module, repository method (mock+http), ReviewTrigger/ReviewModal (mirrors ConsultationModal), "Played here?" card on Court Detail. No display anywhere. | new `apps/api/src/reviews/*`, new migration, `packages/contracts/src/review.ts`, `domain/courts/*`, new `features/court-detail/ReviewTrigger.tsx`+modal | 78 | API typecheck/build, web typecheck/build (parity harness untouched — write-only) | M |
| 81 | **Profile screen redesign** — avatar+edit-profile trigger, stats strip restyle (keep existing coming-soon logic), membership card restyle (dark/gradient unlocked state), my-collections strip. Resolve `PATCH /v1/me` email-editability question (§7 Q4) before building the modal's email field. | `features/profile/**`, `app/profile/page.tsx` | 79 | `verify:ux-pending-states`, web typecheck/build | M |
| 82 | **Settings screen (new route)** — `/profile/settings` page with BackButton(`fallbackHref="/profile"`), 3-row card composing existing billing (`ManageBillingButton`) + profile-edit + contact, Privacy/Terms links. Resolve Account-settings-vs-Profile-edit overlap (§7 Q5) first. | new `apps/web/src/app/profile/settings/page.tsx`, new `features/settings/**` | 81 | `verify:ux-pending-states`, `verify:web-billing`, web typecheck/build | M |
| 83 | **Billing return screens redesign** — graft PurchaseSuccess/PurchaseFailed visuals onto the *existing* `BillingReturn` polling state machine and `?status=cancelled` branch. No polling/timing change. | `features/billing/BillingReturn.tsx`, `CheckoutStatusBanner.tsx` | none (independent of screens above) | `verify:web-billing`, web typecheck/build | M |
| 84 | **Bottom nav → 5 tabs (D1)** — update `nav-items.ts`'s mobile `TAB_NAV` (add Collections, drop Journal) and `BottomNavigation.tsx` (the confirmed renderer — maps `TAB_NAV` to `PendingLink`s, swaps the active tab's icon for `InlineSpinner` via `useNavigationPendingRegistry()`), keeping `PRIMARY_NAV`/desktop untouched. Do this **last** among nav-visible changes so every screen above has already been redesigned to expect Collections as a peer tab. | `apps/web/src/components/layout/nav-items.ts`, `apps/web/src/components/layout/BottomNavigation.tsx` | 74, 76, 77, 78, 81 (every screen the tab bar links to should already look right) | `verify:ux-pending-states`, web typecheck/build | S |
| 85 | **Map screen redesign — chrome only** — search bar/filter-pill restyle, zoom-control reskin, layout-math reconciliation with `AppShell`/`.map-layout` (§5 Risk #5), decide + implement the header-overlay-vs-solid question (§7 Q3). Leaflet integration, marker plotting, geolocation auto-focus all **unchanged**. | `features/map/MapFilterBar.tsx`, `map-config.ts`, `globals.css` (`.map-layout` etc.) | 72, 73 | web typecheck/build, manual Leaflet smoke check | M |
| 86 | **Map screen redesign — pin-tap bottom sheet** — the interaction-model change: marker click opens an in-place preview sheet (compact/expanded states) instead of (or before) navigating; "More courts nearby" strip with client-side distance. Explicit before/after documentation of click behavior (§5 Risk #2) required in the PR description. | `features/map/MapExplorer.tsx`, `LeafletMapInner.tsx` (click handler contract change), new bottom-sheet component | 85 | `verify:ux-pending-states`, web typecheck/build, manual click-through on both mobile-width and desktop-width | L |
| 87 | **Final QA + docs pass** — full click-through of all 10 redesigned screens on mobile and desktop widths; re-run every `verify:*` harness in one sitting; update `PHASE_5_COMPLETION_SUMMARY.md`-equivalent or a new completion summary; sweep for any remaining stale $29/lifetime/Stars/hardcoded-array remnants missed by earlier features. | docs only + fixes surfaced by QA | 72–86 | full `pnpm typecheck` + `pnpm build` + every listed `verify:*` script | M |

**Sequencing notes:** 72 (data) unblocks everything tag-related and must land first. 73
(shared filter primitive) unblocks Home/Map/Saved consistently rather than each screen
inventing its own filter chip. The Map screen is deliberately split into two features
(85 chrome, 86 interaction model) because Risk #2 is large enough that bundling it with
anything else risks an unreviewable diff. 84 (nav tab change) is sequenced **after** the
screens it links to are redesigned, so a user never sees a "Collections" tab pointing at
an unredesigned Collections page mid-rollout — though since this is normal incremental
shipping to `main` per CLAUDE.md §9/§10 (not a feature-flagged rollout), the team may
reasonably choose to ship 84 earlier if incremental visual inconsistency is acceptable;
flagged as a sequencing preference, not a hard blocker.

---

## 7. Open questions

1. **`HomeEditorsCut` and `HomePaywallBand` have no prototype equivalent (§2.1).** Delete
   them, or keep them as sections the redesigned Home retains alongside the prototype's
   new sections? *Recommendation:* keep `HomePaywallBand` (or an equivalent paywall
   touchpoint) somewhere on Home — the app should not lose its only non-Court-Detail,
   non-Profile paywall entry point as a side effect of a visual redesign the task frames as
   presentation-only. `HomeEditorsCut` has weaker justification to keep; recommend folding
   its content into the Featured-courts carousel or dropping it, but this is an editorial
   call the team should make, not an inference from the prototype's silence.

2. **Does Saved lose its "Wishlist Map" tab (§2.6)?** The prototype only has
   Courts/Collections tabs; the current app has a third `SavedWishlistMap.tsx`.
   *Recommendation:* keep it as a third tab not shown in the prototype (the prototype may
   simply not have modeled every tab), rather than silently deleting a shipped feature —
   removing user-facing functionality should be an explicit decision, not a redesign side
   effect. Flag for explicit confirmation before Feature 77 starts.

3. **Should the Map screen's header become transparent/overlaid, or stay solid (§5 Risk
   #2/#5)?** This determines whether Feature 85 changes `AppShell`'s header behavior for
   this one route or keeps the current solid-header + subtracted-height model.
   *Recommendation:* keep the solid header (lower risk, smaller diff, no `AppShell`-wide
   special-casing) and accept that the Map screen won't be pixel-identical to the
   prototype's true full-bleed feel — the existing `.map-layout` height-subtraction
   approach is a deliberate, documented pattern (`globals.css:347–359`) and overriding it
   for one screen is the kind of "unrelated" architectural change CLAUDE.md §9 warns
   against absent an explicit request.

4. **Is a signed-in user's email editable via the Profile edit modal (§2.7), especially
   for Google-linked accounts?** CLAUDE.md §6 is silent on this (it only covers linking on
   sign-in, not later edits) and allowing arbitrary email edits post-signup has real
   security/verification implications (an unverified new email would break magic-link
   sign-in for that address). *Recommendation:* Name is editable (matches the existing
   `PATCH /v1/me` capability per memory); Email is **read-only** in the redesigned modal
   for both auth methods, at least until a real re-verification flow is separately scoped
   — do not silently make email mutable as a side effect of porting the prototype's form.

5. **Does "Account settings" in Settings (§2.8) duplicate the Profile edit modal (§2.7),
   or cover something else (password/security/notifications)?** The prototype gives no
   sub-detail (it's an inert row with a chevron and no destination). *Recommendation:*
   until a real second settings surface is scoped, point "Account settings" at the same
   edit-profile capability rather than building a second, currently-empty settings page —
   avoids speculative UI (CLAUDE.md §9).

6. **Is the `Surface` enum's missing `Carpet` value (prototype CSS only, §1.4) worth
   adding?** No seed court uses it and the task's D3/D4 scope doesn't mention surface
   expansion. *Recommendation:* do not add it — it's dead CSS in the prototype
   (`chip-surface-carpet` is defined but never referenced by any of the 8 seed `COURTS`),
   not a real gap. Revisit only if new court content actually needs it.

7. **Should `Review.userId` be nullable (anonymous submission allowed), and does the
   submission endpoint require auth at all (§3 D4)?** The prototype's "Played here?" card
   gives no signal either way, and D4's brief doesn't say. *Recommendation:* require
   sign-in (consistent with `SavedCourt`/`UserCollection` needing a real user, and simpler
   moderation later) but make `userId` nullable at the schema level anyway for cheap
   future flexibility — mirrors the existing `ConsultationRequest.userId` nullable pattern
   exactly, so it's not inventing a new convention.

8. ~~Where does the mobile `BottomNavigation` component live?~~ **Resolved during this
   task, not open:** `apps/web/src/components/layout/BottomNavigation.tsx` — it maps
   `TAB_NAV` to `PendingLink`s (`pendingId={item.href}`, `spinnerPosition="none"`) and
   reads `useNavigationPendingRegistry()` directly to swap the active tab's icon for
   `InlineSpinner` while pending. It is mounted as a fixed-to-viewport sibling of `<main>`
   inside `AppShell.tsx` (hidden at `md:` and up, where `AppHeader`'s desktop nav takes
   over). Feature 84 edits this file plus `nav-items.ts`.

9. **Mock-data's actual court count — 8 or 12?** `packages/mock-data/src/courts.ts`'s
   header comment states "12 courts ported verbatim," and repo memory
   (`court-content-importer-dryrun.md`) references "12 new courts" from the `--replace`
   content-import run, but only 2 `COURT_SEEDS` entries were directly read in this session.
   Feature 72's tag-authoring work needs the true count confirmed against the live file
   before assuming full coverage — flagged so it isn't silently assumed.

---

## 8. Answers to the open questions (§7) — DECIDED, do not re-litigate

Recorded 2026-09-07. These close every question in §7. Treat them as binding for
Features 72–87.

| # | Question | Decision |
|---|---|---|
| 1 | `HomeEditorsCut` / `HomePaywallBand` | **Keep both.** Restyle to the v2 language and place them alongside the prototype's sections. The paywall band is the app's only non-Court-Detail, non-Profile checkout entry point and is not lost to a visual redesign. |
| 2 | Saved's third "Wishlist Map" tab | **Keep it** as a third tab. The prototype simply did not model every tab; a shipped feature is not deleted as a redesign side effect. |
| 3 | Map header — transparent overlay or solid | **Stay solid.** Keep the existing `.map-layout` height-subtraction pattern (`globals.css:347–359`). The Map screen will not be pixel-identical to the prototype's full-bleed feel, and that is accepted. No `AppShell`-wide special-casing for one route. |
| 4 | Is email editable in the Profile edit modal | **No — email is read-only.** Name stays editable via the existing `PATCH /v1/me`. Changing the email would break magic-link sign-in for the new address until a re-verification flow is separately scoped. |
| 5 | "Account settings" row in Settings | **Points at the same edit-profile capability** as the Profile modal. No second, empty settings surface is built (CLAUDE.md §9 — no speculative UI). |
| 6 | Add `Carpet` to the `Surface` enum | **No.** It is dead CSS in the prototype, used by no court. Revisit only when real content needs it. |
| 7 | Review auth + `userId` nullability | **Submission requires sign-in**, but `Review.userId` is **nullable** at the schema level, mirroring the existing `ConsultationRequest.userId` pattern exactly. |
| 8 | Where `BottomNavigation` lives | Resolved during the intake — `apps/web/src/components/layout/BottomNavigation.tsx`. |
| 9 | Mock-data court count | **12**, confirmed. See the correction below — it is a *different* set of 12 from `content/`. |

### Correction to §3 (D3) — tag authoring

The intake's plan to derive tags by parsing `content/*/info.txt`'s `type:` line is
**superseded**. That field is free text (`"FRENCH RIVIERA, clay courts · pampelonne beach
· boutique hotel"`), and parsing it yields an open set with one-off values and values that
duplicate `surface` / `access` / `indoorOutdoor`. A filter needs a closed set.

**The tag vocabulary is closed at ten values:** `Sea View`, `Beach Club`, `Mountains`,
`Lakeside`, `Garden`, `Historic`, `Jungle`, `Island`, `Rooftop`, `Countryside`.

It covers the Experience dimension only. Surface, access, indoor/outdoor and scenic keep
their existing fields and are rendered as chips from those fields, never duplicated as
tags. Per-court assignment is authored, grounded in each court's own record, through one
explicit mapping table shared by mock-data and the importer. See
`docs/TASK_03_FEATURE_72_TAGS.md` for the full brief.

### Correction to §1.3 / §5 Risk #4 — the two datasets

`packages/mock-data/src/courts.ts` (12 worldwide demo courts, seeded into the CI/local DB
and served in `mock` mode) and `content/*/info.txt` (12 French Riviera courts, imported
into production by `import-courts-from-content.ts`) are **different court sets**. Any
data-layer feature must author for both, or production and CI will diverge.
