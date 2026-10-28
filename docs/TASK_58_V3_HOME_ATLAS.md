# TASK 58 — Redesign v3: Home / "Atlas" (hero carousel + membership)

**Model: Sonnet 5, reasoning effort: medium.** Mostly deletion plus two new components.

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55–57 are done and assumed.

## Goal

`/` becomes exactly the v3 Atlas screen, in this order:

1. a **floating, inset hero card** with a court carousel and the giant "ATLAS" title;
2. a **membership section** (lock/check icon, title, copy, four feature rows, CTA);
3. on **mobile only**, a floating "Unlock the Map" / "Explore the Map" pill at the bottom.

Everything else that is on Home today goes away. The Footer stays (it is outside `<main>`; untouched).

Reference (read `HomeScreen` in each; don't port the demo scaffolding):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`, `function HomeScreen` (~line 273);
- mobile: `tennis_world_v17_standalone.html`, `function HomeScreen` (~line 346).

## Decisions already made (do not re-litigate)

- Home = exactly v3. Search, shortcut row, map-preview band, Featured, Editor's Cut, collections teaser, journal teaser and the paywall band are removed from Home (`REDESIGN_V3_PLAN.md`, decision 1).
- **Pricing copy stays on our real model** (recurring: monthly / quarterly / yearly). v3's "One-time payment. No subscription." / "forever" / "$29" must **not** appear. No billing, Stripe or plan changes (decision 2). The strings to use are listed below.
- Journal is reachable from the Footer only (decision 4).
- This task **supersedes TASK_53 and TASK_54 for Home**: the map-preview band and the Home filter→`/map` redirect are deleted, not adapted.

## 1. Hero card

### Geometry

| | Mobile (< md) | Desktop (md+) |
|---|---|---|
| Wrapper | margin `18px 16px 0` | `max-w-[1240px]`, centered, `px-10`, top margin 36px |
| Card | `rounded-[28px]`, height 480 | `rounded-[32px]`, height 600, shadow `0 24px 64px rgba(15,15,15,0.18)` |
| Crest mark | top 26, centered, 32px | top 36, centered, 36px |
| "ATLAS" | 60px, **left-aligned** at 18px, starting at 50% height (no vertical centering) | 76px, **centered** both ways |
| Place pill + dots | bottom 18 | bottom 36 |

- "ATLAS": serif, weight 500, `leading-[0.92]`/`0.95`, tracking `0.01em`, white. It is the page `<h1>`.
- Crest mark: two crossed racket outlines, white 1.2–1.3px stroke. Copy the SVG from the prototype (`<svg viewBox="0 0 40 40">` with the two rotated `ellipse`+`line` groups).
- Overlay: the same gradient `CourtCard` uses (`linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)`).
- Gap between the bottom of the pill nav and the top of the hero card: **≈18px mobile, ≈36px desktop**. `AppShell` already reserves `--nav-offset` (72/88px) for non-`overHero` pages, so Home **stops passing `overHero`** and you only add the small remainder as a top margin. Measure in the browser and adjust.

### Carousel behaviour (from the prototypes)

- 4 slides. The whole card is clickable → that court's page.
- **Place pill** (button): shows the current slide's place; clicking it advances to the next slide (wraps).
  - style: `rgba(255,255,255,0.2)` background, `backdrop-blur-[10px]`, `1px rgba(255,255,255,0.4)` border, `rounded-pill`, padding `10px 24px` (desktop `10px 26px`), serif 13px, `tracking-[0.16em]`, white, uppercase.
- **Dots** (6px circles):
  - desktop: pill, then all four dots to its right; active `rgba(255,255,255,0.95)`, others `0.45`; clicking a dot jumps to that slide;
  - mobile: the dots are split around the pill — dots for slides already passed (`i < current`) on the **left**, upcoming (`i > current`) on the **right**, all `rgba(255,255,255,0.85)`, each side `flex-1` so the pill stays centered; clicking jumps.
- Make dot hit areas ≥ 24px (a transparent padded `<button>` around the visible 6px dot) without changing how they look.
- Slide change: cross-fade (~400ms). Render all four images stacked (`absolute inset-0`), active one `opacity-100`, the rest `opacity-0`, first one `priority` — no re-mount, no flash on switch. Respect `prefers-reduced-motion` (no fade).
- No autoplay (the prototype has none).

### Interactivity without nesting

The card navigates, and it contains buttons. Use the same pattern as `CourtCard`: a `PendingCardLink` to `/courts/<slug>` covering the card (`absolute inset-0`, `aria-label` = court name or place), and the pill/dots as **siblings above it** (`z-10`), never inside the anchor. Clicking the pill/dots must not navigate. The pill and dots are purely local UI → no `Pending*` primitive and no spinner (CLAUDE.md §4 rule 10); the card link is navigation → `PendingCardLink`.

### Which courts

Pick on the **server**, pass only what the client needs: `slides: { slug, imageUrl, place, alt }[]` (don't ship the whole court list to the hero).

- Source: `courts.list()`; take `!isLocked` courts, featured first (`isFeatured`), then the rest, first **4**.
- `place` = `court.region` (fall back to `court.country`), uppercased in CSS (`uppercase`) not in data.
- Never use a locked court here: the hero shows the real photo and place name to guests, and locked courts are masked everywhere else.
- If fewer than 4 unlocked courts exist, show what there is; with exactly 1 slide hide the dots. If there are none, fall back to the first 4 courts regardless, and for any `isLocked` one use the masked display (`courtDisplay(court).masked` → pill text "PREMIUM"). Don't over-engineer this; it is a safety net for odd data.
- Image = `court.heroImageUrl` via `next/image` (`fill`, `sizes="(min-width: 1280px) 1240px, 100vw"`).

## 2. Membership section

### Geometry

**Desktop:** container `max-w-[1180px]`, centered, `px-14 py-[100px]`, two columns `gap-[72px]` vertically centered:

- left: image, `rounded-[20px]`, height 460, shadow `0 2px 16px rgba(15,15,15,0.06)`, `object-cover`. Use the same photo the old paywall band used: `/placeholders/jorge-salazar-pY_GFZNKrrc-unsplash.jpg`.
- right: 64px circle (`bg-bone`, `1px rgba(184,184,182,0.4)` border) with a lock (24px) or check (26px) → title serif 44px / `leading-[1.08]` weight 400 → subtitle 15px stone, `mt-2.5` → paragraph 15px graphite, `mt-[22px]`, `leading-[1.7]`, `max-w-[440px]` → feature list `mt-[34px]`, `gap-[18px]` → CTA `mt-[38px]`.

**Mobile:** `mx-4 mt-7`, one card: `bg-paper`, `rounded-[20px]`, `px-5 py-7`, shadow `0 2px 16px rgba(15,15,15,0.06)`. Inside, centered: 56px circle (lock 20 / check 22), title serif 24px, subtitle 13px stone `mt-1.5`; image `mt-5`, height 170, `rounded-[16px]`; paragraph 13px graphite `leading-[1.5]` centered `mt-4`; feature list `mt-[18px]`, `gap-3.5`. No button inside the card on mobile (the floating pill is the CTA).

**v3 repeats the title on mobile** (once in the header, again under the image, with "The European Collection"). That is a prototype redundancy and "European Collection" is not our product. **Render the title once** (header block) and drop the duplicate block and the "European Collection" line; keep the paragraph.

Feature row: icon circle 36px (`bg-bone`, `1px rgba(184,184,182,0.3)` border, graphite icon 16px) + label (mobile 14px, desktop 15px graphite), `gap-3.5`. Icons per row (copy from prototype): pin, calendar, heart, plus.

### Copy (our subscription model)

| | v3 | Use |
|---|---|---|
| Title (guest / free) | `100 Beautiful Tennis Courts` | `120+ Beautiful Tennis Courts` |
| Subtitle | `One-time payment. No subscription.` | `Monthly, quarterly or yearly. Cancel anytime.` |
| Paragraph | `One-time payment. Unlock to access every court, every detail, forever.` | `Unlock every court and every detail for as long as you are a member.` |
| Title (entitled) | `Your collection is unlocked` | `Everything is unlocked` |
| Subtitle (entitled) | `European Collection — Unlocked` | `Full Access — Active` |
| Paragraph (entitled) | `Full access to this collection and its new additions.` | `Every court and every detail, plus new additions as they are published.` |
| Row 1 | `Full map & court details` | same |
| Row 2 | `Locations & booking contacts` | `Exact locations for every court` |
| Row 3 | `Save your favourite courts` | same |
| Row 4 | `New additions to this collection` | `New courts as they are added` |

Notes:

- `120+` matches the number already used in the app's paywall copy and the old Home band (`PAYWALL_COPY`, `HomePaywallBand`). I did not verify it against the live data; **report if the real published count differs** so the owner can decide, but ship `120+`.
- Row 2 changed on purpose: nothing in our data model offers "booking contacts", and the app must not promise it.
- Lock icon for guest and free users, check icon for entitled.
- Keep these strings in one small copy constant at the top of the new component (like `PAYWALL_BAND_COPY` was), not scattered in JSX.

### CTA

- **Desktop (inside the card), non-entitled:** gold premium button `Unlock Full Access →` = `<PaywallTrigger source="home" className="btn btn-premium …">`, `mt-[38px]`. Entitled: no button.
- **Mobile floating pill** (`md:hidden`): `sticky bottom-[18px] mx-4 mt-7`, full width, `h-14`, `rounded-pill`, `bg-ink text-bone`, 12px, uppercase, `tracking-[0.16em]`, weight 500, shadow `0 16px 40px rgba(15,15,15,0.25), 0 2px 10px rgba(15,15,15,0.1)`.
  - non-entitled: label `Unlock the Map` → `PaywallTrigger source="home-floating"`. v3's prototype only scrolls to the membership block here; ours opens the real paywall, because that is the actual way to unlock;
  - entitled: label `Explore the Map` → `PendingLink` to `/map`.
- For `sticky bottom` to work the pill must be the last child of a wrapper that also contains the hero and the membership section (its containing block is its parent). Put hero + membership + pill in one wrapper inside `<main>`.
- Guests who open the paywall behave exactly as today (we are not changing what the paywall does for a signed-out visitor).

## 3. Page and data changes

`app/page.tsx` shrinks:

- fetch only `repositories.courts.list()` and `getViewerAuthState()` (gives `signedIn` + `viewerIsEntitled`; the Map page already does this). No collections, no articles, no saved courts, no saved collections, no `getRepositoriesForRequest()`.
- `<AppShell signedIn={signedIn}>` — **no `overHero`**.
- Compute the hero `slides` server-side (see §1) and render `<HomeHero slides={…} />` + the membership section + the mobile CTA.
- Rewrite the long header comment: it still describes search, shortcuts, saved hearts, the paywall band and `overHero`.

Components:

- `features/home/HomeHero.tsx` → rewritten as the v3 carousel (client component, state = current index).
- new `features/home/HomeMembership.tsx` → the section + the mobile floating CTA (client only where needed: `PaywallTrigger` is already a client island; the rest can stay server).
- `features/home/index.ts` → export only what remains.

## 4. Delete

All of these, once nothing outside `features/home` imports them (grep first):

`HomeExplorer.tsx`, `HomeSearchBar.tsx`, `HomeShortcutsRow.tsx`, `home-shortcuts.ts`, `HomeFeaturedCourts.tsx`, `HomeEditorsCut.tsx`, `HomeCollectionsTeaser.tsx`, `HomeJournalTeaser.tsx`, `HomePaywallBand.tsx`, `HomeMapPreviewBand.tsx`, `HomeCourtSaveHeart.tsx`.

Then clean up what only they used (grep each; delete only if truly unreferenced):

- `public/home/map-preview.png` (the band's background);
- `globals.css`: `.filter-pill-badge` (both rules — after TASK_57 only `HomeSearchBar` used it), `.home-banner`, `.paywall-banner`, `.map-preview-band` and any other Home-only class; keep `.filter-pill` (used by `FilterSheet`) and `.btn-over-image` if anything else uses it;
- `components/filters`: `filterStateToMapHref` was added in TASK_54 only for Home. **Leave it exported** (it is a sensible public helper and Collections may reuse it), but note in the report that it is now unused;
- the placeholder photos only the deleted components referenced — leave the files, just don't claim they are used.

`ConsultationTrigger` / the consultation feature loses its Home entry point; **do not delete the feature** (the Footer and others may use it — check, and report).

Scripts: grep `apps/web/scripts/*.ts` (esp. `verify-ux-pending-states.ts`, `verify-saved-court-toggle.ts`, anything reading `HomeCourtSaveHeart`/`HomeExplorer`/`HomePaywallBand`). Re-point checks whose subject still exists; remove only checks that exclusively covered a deleted component. Report the new pass counts, and update the stale count in `CLAUDE.md`.

## 5. Small cleanup carried over from TASK_57

1. `features/map/MapExpandedModal.tsx`: its focus/scroll-lock effect depends on `[onClose]`, and `MapExplorer` passes a new arrow function every render. If the parent re-renders while the modal is open, the effect re-runs and focus restoration on close breaks. Wrap `onClose` in `useCallback` in `MapExplorer` (and/or keep the latest `onClose` in a ref inside the modal so the effect runs once per mount).
2. `app/globals.css` line ~19: the comment still mentions `.map-layout`'s `--map-header`. Remove that mention.

## Do not touch

- The Footer, `AppShell`, `AppHeader`, `nav-items.ts`.
- `PaywallTrigger` / `PaywallModal` / billing / `PAYWALL_COPY` (prices stay out of this page entirely).
- `CourtCard` and the Courts screen.
- Journal, Collections, About pages.

## Testing

**Guest / free / entitled** (check all three):

- Guest and free: lock icon, title `120+ Beautiful Tennis Courts`, subtitle and paragraph from the table, four rows, desktop gold `Unlock Full Access →` opens the paywall.
- Entitled: check icon, `Everything is unlocked`, **no** desktop button, mobile pill says `Explore the Map` and goes to `/map`.
- No text anywhere on Home says "one-time", "lifetime", "forever" or "no subscription".

**Hero:**

- Four slides, all unlocked courts, real photos; the place pill advances and wraps; dots jump; clicking the card (not the pill/dots) opens that court.
- Pill/dots do not trigger navigation; no `<button>` inside an `<a>` (inspect the DOM).
- Cross-fade on change, no flash; with reduced motion, no fade.
- Desktop: "ATLAS" centered, all dots right of the pill. Mobile: "ATLAS" left-aligned from mid-height, dots split left/right of the pill.
- The nav pill floats above the page with the right gap to the hero; nothing hides under it.

**Mobile (~390px):** the floating pill stays pinned at the bottom while scrolling and comes to rest at the end of the membership section (above the Footer); hero is 480px tall with 16px side margins; membership card has the title only once.

**Cleanup:** Home no longer renders or fetches collections/articles/saved data (check the Network/server logs); no dead imports; `grep -r "HomeExplorer\|HomeSearchBar\|HomePaywallBand\|HomeMapPreviewBand"` returns nothing but comments you chose to keep.

**Build:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `verify:ux-pending-states`, `verify:map-autofocus` (4 known pre-existing failures stay as they were; no new ones).

## Report

List files created, changed, deleted. Confirm: no one-time/lifetime copy remains; hero uses only unlocked courts; no nested interactive elements in the hero; both TASK_57 cleanup items done. Say whether the published court count matches `120+`, whether `ConsultationTrigger` is still used elsewhere, and what you could only verify by reading code (especially the mobile layout). No git commit or push unless asked.
