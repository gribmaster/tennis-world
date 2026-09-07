# TASK 02 — Design v2 intake and gap analysis (DOCS ONLY, NO CODE)

Task:
Plan a full mobile-first redesign of `apps/web` against the new prototype in
`new design/tennis_world_v2_standalone.html`. Produce ONE planning document.
Write no product code in this task.

Context:
- Repo root: D:\work\tennis. Read `CLAUDE.md` first — it is the standing rulebook and
  every rule in it still applies to the redesign, especially §4 (pending/loading
  primitives), §5 (BackButton/navigation), §7 (billing), §9 (scope discipline).
- The prototype is a single standalone React-in-HTML file, phone shell 390x844.
  It covers 10 screens: Home, Map, Court Detail, Court Detail (Locked), Collections,
  Saved, Profile, Settings, Payment success, Payment failed.
- **The product logic does NOT change.** Auth, entitlements, the exact-location gate,
  Stripe checkout/portal/webhook, the repository seam and the mock/api parity contract
  all stay exactly as they are. This is a presentation-layer redesign plus the small
  set of data additions listed under DECISIONS below.

## READING THE PROTOTYPE — do this first, it matters

The file is 3.1 MB, of which ~3.05 MB is inline base64 image data. Do NOT read it
directly — it will exhaust your context. Instead run a script that strips the base64
payloads, then read the ~116 KB result:

```python
import re
src = open('new design/tennis_world_v2_standalone.html', encoding='utf-8', errors='replace').read()
stripped = re.sub(r'data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=\s]{200,}', 'data:BASE64_STRIPPED', src)
open('/tmp/design_v2_stripped.html', 'w', encoding='utf-8').write(stripped)
```

The stripped file contains everything that matters: a ~9.8 KB `<style>` block and a
~105 KB `text/babel` block holding all screen components. Two base64 images were
stripped — both are map background PNGs (home map preview, map screen). Note where they
are used; do not try to recover them.

## ALREADY-ESTABLISHED FINDINGS — verify, don't rediscover

I have already analysed the prototype. Confirm each of these against the code and the
stripped file, and correct me in the document wherever I am wrong:

1. **The design tokens are unchanged.** The prototype's `:root` palette (ink #0F0F0F,
   graphite #2A2A2A, stone #6B6B6B, mist #B8B8B6, bone #F5F2EC, ivory #FAF8F3,
   clay #B95C3A, moss #4A5D3F, gold #B89968, paper #FFFFFF) and its type scale
   (Cormorant Garamond display-xl 44/48 … caption 11/16, Inter body) are already what
   `apps/web/tailwind.config.ts` and `src/app/globals.css` define. This is a layout and
   composition redesign on an existing design system, NOT a new design system.
   Confirm this token-by-token and report any genuine divergence.

2. **Prototype components:** U, Label, SurfaceLabel, Stars, StatusBar, BottomNav,
   HomeScreen, MapScreen, CourtDetailScreen, SavedScreen, CollectionsScreen,
   ProfileScreen, SettingsScreen, PurchaseSuccessScreen, PurchaseFailedScreen,
   NavVariantsComparison, App.

3. **Data the prototype needs that the schema does not have:** per-court `labels`
   (Sea View / Beach Club / Resort / Historic / Mountains / Private / Scenic),
   `address`, a `features[]` bullet list, ratings/reviews, and a km distance for
   "Nearby courts". `model Court` currently has only surface, setting, access,
   indoorOutdoor, isScenic, isFeatured, isLocked, blurb.

4. **The API already supports** free-text `q` search and filtering by country, region,
   surface, access, indoorOutdoor, scenic, featured and collection slug
   (`apps/api/src/courts/courts.service.ts`), plus `GET /v1/courts/:slug/related`.
   Establish precisely which prototype filters and searches map onto what exists and
   which need new query support.

## DECISIONS ALREADY MADE — treat as settled, do not re-litigate

- **D1 — Bottom navigation becomes 5 tabs** (the prototype's "Option A"):
  Home · Map · Collections · Saved · Profile. Journal leaves the tab bar; it stays a
  section on Home and a destination in the desktop top nav. `nav-items.ts` is the single
  source of truth and must remain so. Note the consequence for CLAUDE.md §5's list of
  top-level pages that must NOT get a Back button.
- **D2 — Billing stays subscriptions.** monthly / quarterly / yearly through Stripe is
  correct; the prototype's "Unlock access — $29", "One-time · Lifetime · $29" and
  "Lifetime Member" strings are stale copy from an older model. Redesign the paywall,
  membership card and settings row to the real plan model. **No change to any billing
  endpoint, plan registry, webhook, entitlement rule or `/billing/return` polling
  behavior** (CLAUDE.md §7 stands in full).
- **D3 — Add a real `tags` field.** `Court` gains a persisted string-array tag field,
  with a back-safe migration, contract DTO exposure, seed/content population for the
  existing 12 courts, and filter support. Derive nothing on the fly.
- **D4 — Reviews: collection only, no display.** Add the ability for a user to submit a
  review, and the "Played here? Leave a review" card. Do NOT display star ratings,
  average scores or review counts anywhere — the prototype's `Stars` component and its
  4.6/(128) numbers are dropped. The stored reviews are for later use.
- **D5 — Desktop.** The prototype is 390 px only. Mobile is the source of truth. On
  desktop the existing responsive behavior is preserved: centered container up to
  1280 px and the existing top navigation. Flag any screen where the new mobile layout
  cannot scale up sensibly and propose the minimum desktop treatment for it.

## Requirements

1. **Inventory the current UI.** For every file under `apps/web/src/features/**`,
   `src/components/**` and `src/app/**/page.tsx`, record what it renders today and
   classify it: KEEP as-is / RESTYLE / RESTRUCTURE / NEW / DELETE under the redesign.

2. **Screen-by-screen mapping.** One subsection per prototype screen. For each:
   - the prototype's structure, top to bottom, with the real numbers (heights, radii,
     aspect ratios, gaps, font sizes) taken from the stripped file;
   - which existing components serve it and which of them survive;
   - what is genuinely new;
   - which data fields it needs and whether the API/contracts supply them today;
   - every interaction it implies (filter sheet, bottom-sheet expand/collapse, gallery
     dots, inline search results, edit-profile modal, "Search this area") and which of
     these are real behavior versus prototype dressing;
   - which CLAUDE.md §4 pending-state primitive each new navigational or async control
     must use. Be specific: name `PendingLink` / `PendingCardLink` / `PendingButton` /
     the `useElementPending` triad per control.

3. **Data and contract work.** Specify exactly what D3 and D4 require:
   the Prisma field/model shape, the migration strategy (back-safe, authored with
   `prisma migrate diff` and applied with `prisma migrate deploy` — `prisma migrate dev`
   hangs here, CLAUDE.md §8), the `@tennis/contracts` DTO changes, the seed and
   `content/*/info.txt` changes, the mock-data changes needed to keep mock↔api parity,
   and the API endpoints involved. State plainly what the parity harness will require.

4. **Prototype-only artifacts to discard.** List everything in the prototype that must
   NOT reach production: the phone shell chrome, the fake iOS `StatusBar`, the screen-
   switcher tab strip, `NavVariantsComparison`, hardcoded `COURTS`/`COLLECTIONS`/
   `COUNTRIES` arrays, Unsplash URLs and their `onError` fallbacks, the two base64 map
   PNGs, the `Stars` component, and the stale $29/lifetime copy.

5. **Risk register.** Where does the redesign collide with an existing invariant?
   Look hard at, at minimum: the exact-location gate versus the new locked-court
   presentation (blurred description, "Unlock to reveal court name", hidden address);
   the map screen versus the existing Leaflet integration and `MAP_PROVIDER_DECISION.md`;
   `verify:ux-pending-states` (90 checks) versus wholesale component rewrites;
   `verify:api-parity` (35 checks) versus any contract change; and the `100dvh`
   flex-column map layout versus the existing AppShell.

6. **Feature breakdown.** Split the work into sequenced, independently shippable
   features, continuing the repo's numbering (the last shipped was Feature 70). For each:
   a one-line goal, the files it touches, its dependencies, the `verify:*` harnesses it
   must run, and a rough size (S/M/L). Order them so that data groundwork and shared
   primitives land before screens, and so no feature leaves the app in a broken state.
   Aim for features a single focused session can finish.

7. **Open questions.** Anything you cannot resolve from the code, the prototype or the
   decisions above — list it as a numbered question with your recommended answer.
   Do not silently assume.

Do not change:
- Any source file, schema, migration, contract, config or asset. This task writes
  exactly one new markdown file and nothing else.
- No package installs, no git operations, no database work, no Stripe calls.

Testing:
None — this task produces no code. Do read enough of the existing source to make every
claim in the document verifiable, and cite file paths for the non-obvious ones.

Report back:
Write `docs/FEATURE_71_DESIGN_V2_INTAKE.md` with the sections above, in that order.

Then, in the chat, give me only:
  - the feature breakdown table (number, goal, size, dependencies),
  - anything from the ALREADY-ESTABLISHED FINDINGS list that turned out to be wrong,
  - the open questions.
