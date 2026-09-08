# TASK 09 / FEATURE 76 — Collections screen redesign

**Model: Opus 5, reasoning effort: high.**

Task:
Rebuild `/collections` to the v2 prototype: a featured strip, the "By Country" circular
strip backed by Feature 75's endpoint, and a "Curated for You" list.

Context:
- Read `CLAUDE.md` first — §4 (pending/loading) and §5 (navigation) bind here. Then
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.5 and §8.
- Prototype: `CollectionsScreen` in `new design/tennis_world_v2_standalone.html`. Strip the
  base64 first — recipe in `docs/TASK_07_FEATURE_74_HOME.md`.
- Feature 75 shipped `GET /v1/countries` plus `apps/web/src/domain/countries/`. Consume that
  repository through the existing factory; do not add a second way to reach it.
- Existing screen: `app/collections/page.tsx` (server component, the only repository
  boundary) + `features/collections/` — `CollectionsHero`, `CollectionsGrid`,
  `CollectionCard`. All three are presentational and stay that way.

## TWO PROTOTYPE ELEMENTS THAT HAVE NO BACKING — do not build them

1. **The save/bookmark control on the "Curated for You" rows.** The prototype puts a
   bookmark button on each editorial collection. **There is no such capability in this
   product.** `SavedRepository.getSavedCollections()` returns `UserCollectionDTO[]` — the
   user's OWN collections, which they create and fill with courts. Bookmarking an editorial
   `Collection` has no model, no endpoint and no repository method.
   Omit the control. Do not wire it to `createUserCollection`, which means something else
   entirely, and do not render an inert button. Leave a comment saying why it is absent.

2. **The search and filter glyphs in the screen header.** The prototype draws them; they
   have no behavior there. Either give them real behavior using the shared `FilterSheet`
   from Feature 73, or omit them. **Do not render a decorative control that does nothing** —
   `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` exists because inert CTAs were a real problem on
   this project. State which you chose and why. Omitting is a perfectly good answer; a
   collections list has no filter dimension that `FilterSheet` currently models.

## Requirements

Take every number from the stripped prototype. Use existing tokens and `globals.css`
primitives; no new palette, type scale or button system.

1. **Featured strip.** Horizontally scrolling cards at the prototype's dimensions: image,
   bottom gradient, the "N COURTS" eyebrow pill, serif name, subtitle, and the circular
   arrow affordance. Whole card navigates to `/collections/{slug}` ⇒ `PendingCardLink`.

2. **"By Country" strip.** Circular images with the country name and "N courts" beneath,
   from Feature 75's `GET /v1/countries`. Fetch it in `page.tsx` alongside the collections —
   the page stays the ONLY repository boundary.
   **Destination:** each country navigates to `/map?q=<country name>` (URL-encoded).
   `GET /v1/courts`'s free-text `q` already searches the country name, so this works today
   with no new filter dimension and no change to Feature 73's shared filter module.
   That requires `/map` to honour the parameter, which it does not today:
   - `app/map/page.tsx` must read `searchParams` and pass an initial query down.
   - `MapExplorer` must seed its `q` from that initial value instead of always starting
     empty, while remaining the single state owner. Everything else about the map stays
     untouched — no layout change, no Leaflet change, no filter-module change.
   Keep this addition minimal and say in your report exactly what you changed on the map.
   Each country card navigates ⇒ `PendingCardLink`.

3. **"Curated for You" list.** The prototype's horizontal rows: thumbnail, name, subtitle,
   court count. Whole row navigates ⇒ `PendingCardLink`. No save control (see above).

4. **Reconcile with what exists.** `CollectionsHero`, `CollectionsGrid` and `CollectionCard`
   predate the prototype. Decide per component: restyle, repurpose into one of the three new
   sections, or delete. If you delete one, check every importer first — `CollectionCard` in
   particular may be used by Home's collections teaser (Feature 74). Report the decision and
   its reason for each.

5. **Empty and thin states.** A country with one court must read correctly ("1 court", not
   "1 courts"). An empty collections list must not render a bare heading.

6. **Pending primitives.** Every card and row here navigates, so §4 rule 1 applies:
   `PendingCardLink` for whole-card links, `PendingLink` for row/CTA links. No raw `<Link>`
   where a primitive covers the case (§4 rule 9). Nothing on this screen is an async
   mutation, so no `PendingButton` and no spinner should appear at all — if you find
   yourself adding one, re-read what the control does.

7. **`/collections` is a top-level nav route** — it must NOT get a Back button (§5). It also
   becomes a bottom-tab destination in Feature 84, so it has to stand on its own as a
   landing surface.

Do not change:
- `apps/web/src/components/filters/**` — the shared filter module (Features 73/74).
- Anything under `apps/api/**`, `packages/contracts/**`, the schema, migrations or seed.
  Feature 75 delivered the data; this feature only consumes it.
- `features/map/**` beyond the minimal `q` seeding in requirement 2. The map redesign is a
  later feature and is blocked on the Leaflet → Google Maps migration.
- `features/home/**` — unless requirement 4 forces a shared-component change, in which case
  keep it to the minimum and say so.
- `AppShell`, `AppHeader`, `BottomNavigation`, `nav-items.ts` — the tab bar is Feature 84.
- Auth, entitlements, billing, the exact-location gate.
- No package installs. No carousel or slider library — these strips are overflow-scroll rows.
- No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks, must stay green.
- `pnpm --filter @tennis/web verify:map-autofocus` — requirement 2 touches `MapExplorer`'s
  initial state, and this harness is what proves the nearest-court auto-focus still works.
- `pnpm verify:api-parity` — should still be 42/42; you are not changing the API, so a
  change here means something went wrong.
- Manual: `/collections` at 390px and desktop; every card reaches its target; a country card
  lands on `/map` with that country's courts actually filtered; back-navigation from a
  country returns to `/collections`; singular/plural counts read correctly.

Report back:
1. What you did with the header search/filter glyphs, and why.
2. Exactly what changed in `app/map/page.tsx` and `MapExplorer` for the `q` seeding.
3. The per-component decision for `CollectionsHero` / `CollectionsGrid` / `CollectionCard`,
   and every importer you checked before deleting anything.
4. Confirmation that no save/bookmark control was rendered on collection rows.
5. Every pending primitive used, and confirmation that no spinner appears on this screen.
6. Files changed, and pass/fail counts for all four harnesses.
