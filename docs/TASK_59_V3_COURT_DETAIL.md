# TASK 59 — Redesign v3: Court Detail (`/courts/[slug]`)

**Model: Sonnet 5, reasoning effort: high.** The screen already has many shipped features (lightbox, review modal, save, add-to-collection, locked/unlocked branches). v3 changes its **layout**, not its behaviour. Preserve every feature; do not "simplify" any of them away.

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55–58 are done and assumed (floating pill nav, shared `SurfaceChip`/`PremiumBadge`, `.glass-surface`, `saved` colour token).

## Goal

- **Desktop (md+):** a two-column page — gallery + thumbnails + location + nearby on the left, an info panel (title, chips, description, actions, review / unlock card) on the right. No full-bleed hero, no docked bottom bar.
- **Mobile (< md):** keep the full-bleed hero + overlapping white card, but move save/share into a **floating glass action pill** at the bottom (v3), and tighten sizes to the prototype.
- Locked ("premium, not unlocked") reading: same layout, "locking as texture" — masked title, blurred description, locked map, and the dark "Unlock the full atlas" card **moved** to where v3 puts it.

Reference (read the `CourtDetailScreen` function in each; ignore the fake browser chrome and burger sheet on mobile):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`, `function CourtDetailScreen` (~line 546);
- mobile: `tennis_world_v17_standalone.html`, `function CourtDetailScreen` (~line 662).

## Decisions already made (do not re-litigate)

1. **No invented address.** v3 prints a street address. We have no `address` field and add none. Keep today's `locationLine` ("Country · Region") in that spot, exactly as `CourtDetailLocationPreview` does now.
2. **No fake distances.** v3 prints "3 km / 12 km…" on nearby cards. Keep today's country · region line (see `CourtDetailNearbyStrip`'s header for why).
3. **No price on the unlock card.** v3 says "Unlock access — $29" and promises "booking contacts". We keep today's copy (`PAYWALL_COPY.valueProp`, button `Unlock Full Access`). No billing / plan changes.
4. **Keep "Add to collection".** v3 has only share + heart; our `SaveToCollectionMenu` is a shipped feature the prototype doesn't know about. It stays, as one more circular button next to the heart.
5. **Heart stays a heart** on this screen (v3 uses a heart here and a bookmark on cards). Saved colour is the `saved` token (`#E85D4A`), not `clay`.
6. **Mobile keeps `overHero`.** The floating pill nav (TASK_55) sits over the photo on mobile. The v3 mobile prototype's back arrow / burger are fake browser chrome — ignore them; our existing `BackButton` overlay stays.
7. **Gallery thumbnails behave differently by breakpoint.** On desktop (thumbnails sit right under the image) clicking one **switches the main image** (v3). On mobile the Gallery strip is far below the hero, so it keeps opening the **lightbox** (Task 18's deliberate choice). Decide at click time with `window.matchMedia('(min-width: 768px)')`, the way `MapExplorer` did.

## Page structure: one grid, explicit placement

Gallery, map and images must exist **once** in the DOM (no hidden duplicate `priority` images, no second map). Small text/button blocks may be duplicated and toggled with `md:hidden` / `hidden md:flex`.

DOM order (this is also the mobile order):

1. `CourtDetailGalleryHero` (the hero image + overlays)
2. info block: title, location + surface chip, tag chips, description
3. location section
4. gallery strip
5. nearby courts
6. *(mobile only, `md:hidden`)* review card (unlocked) / dark unlock card (locked)

At md+ place these in a grid, explicitly (`md:col-start-*`, `md:row-start-*`), independent of DOM order:

- grid: `md:grid md:grid-cols-[1.1fr_1fr] md:gap-x-12 md:items-start`, container `max-w-[1240px] mx-auto md:px-14`, bottom padding ≈ 80px;
- left column: gallery (row 1), strip (row 2), location (row 3), nearby (row 4);
- right column: the info block, `md:col-start-2 md:row-start-1 md:row-span-4`, which at md+ **also contains** (in addition to what mobile shows) the action row and the review / unlock card.

Vertical rhythm on the left: thumbnails `mt-3` under the image; location and nearby each `mt-9` (36px).

Top of the page: `AppShell` keeps `overHero`, so add `md:pt-[var(--nav-offset)]` to the page wrapper (the nav pill is `fixed`). Between nav and content: a "‹ Back to Courts" link, then ≈26px, then the grid. Measure the gap under the pill in the browser; v3 is ≈36px below the nav row.

## Desktop spec

**Back link:** 13px, `text-stone`, `hover:text-ink`, chevron 13px, `gap-1.5`, `mb-[26px]`. Use the shared `BackButton` (CLAUDE.md §5: it must stay `<BackButton fallbackHref="/map" …>`), `label="Back to Courts"`, a plain-text `className`. The existing pill-style `Courts` BackButton overlaid on the hero becomes `md:hidden`; the desktop one is `hidden md:inline-flex`. Two instances are fine. Update the CLAUDE.md line (~238) that documents `label Courts`.

**Gallery (left, row 1):** `relative h-[440px] overflow-hidden rounded-[20px]`.

- Reuse `CourtDetailGalleryHero`'s state/keyboard/swipe; make its frame responsive (full-bleed 290px on mobile, framed 440px / `md:rounded-[20px]` at md+). **Do not build a second gallery component.**
- At md+: hide the overlaid back/save/share row, the dot pager and the "All photos" chip (thumbnails replace them). **Keep** the existing prev/next arrows (Task 37) and keyboard arrows.
- Counter chip: bottom-left `bottom-3.5 left-3.5`, `bg-[rgba(15,15,15,0.5)] backdrop-blur-[8px]`, `rounded-pill px-3 py-[5px]`, 11px / 500, white, image glyph 12px.
- Clicking the main image opens the lightbox at the active slide (`cursor-zoom-in`; a transparent button *under* the arrows). This keeps the lightbox reachable on desktop now that thumbnails switch the image. Don't change the lightbox itself.

**Thumbnails (left, row 2):** same slide list. `84 × 64`, `rounded-[8px]`, `gap-2`, active: `opacity-100` + `2px` ink border, inactive `opacity-60` + transparent border. Click → set active index (md+) / open lightbox (< md). No "Gallery" heading at md+ (v3 has none there); keep it below md.

**Location (left, row 3):** `<h2>` 17px / 600, `mb-3.5`. Two equal columns, `gap-4`: map box `h-[140px] rounded-[14px]`; right column `flex flex-col justify-between`: pin glyph 13px + `locationLine` (13px stone, `leading-[1.5]`) on top, button at the bottom (`btn btn-primary` small, full width, pin glyph 12px).
- Unlocked: label `Open in Maps` → real `exactLocation.directionsUrl` link when present, otherwise today's inert placeholder (leave that behaviour alone).
- Locked: `Address hidden` + a disabled `Unlock location` (keep today's `aria-disabled` + `title` + sr-only explanation pattern).
- Today's component hides these buttons at md+ and shows `CourtDetailUnlockCard` there. Remove both of those md-specific tricks: show the button at all sizes, and **remove `CourtDetailUnlockCard` from the location block** (it moves, see below).
- Locked map stays the blurred static placeholder + lock overlay (`Unlock to reveal`). Billing/coordinate rules in the file's header comment are unchanged: no live map and no coordinate in the DOM for a locked viewer. Both `<CourtDetailLocationPreview` call sites in `page.tsx` must keep passing `heroImageUrl` (a verify script asserts it).

**Nearby (left, row 4):** `<h2>` 17px / 600, `mb-3.5`; cards `w-[140px]`, image `h-[100px] rounded-[10px]`, name 13px / 500, sub-line 11px stone (country · region), `gap-3.5`, horizontal scroll. Locked nearby court: top-left premium badge only (no dimming overlay at md+). Reuse `PremiumBadge` (TASK_56) if its size fits the 9px badge; otherwise keep the existing inline badge. Masking is unchanged: `viewerIsEntitled` as passed today (Task 52).

**Info panel (right):**

| Element | Spec |
|---|---|
| `<h1>` | serif, 38px, weight 400, `leading-[1.1]` (locked: `Unlock to reveal court name`, unchanged) |
| Location row | `mt-3`, `gap-2.5`, flex-wrap: pin 13px + text 13px stone (`locationLine` / `Location hidden — Premium only`) + `<SurfaceChip surface size="md" />` (replace the `.meta-chip`) |
| Tag chips | `mt-[18px]`, **wrap** (`flex-wrap gap-2`) instead of scrolling; same labels as today (`CourtDetailTagStrip`, incl. indoor/outdoor); chip look = today's `bg-ink/[0.06]` 12px |
| Description | `mt-[22px]`, 14px, `leading-[1.7]`, graphite; **full text, no "Read more" at md+**; locked = today's blurred component |
| Action row | `mt-7`, flex `gap-2.5` (see below) |
| Review card (unlocked) / dark card (locked) | `mt-7` |

Mobile keeps today's clamp-110 + "Read more ↓" (clay). Implement "full on desktop, clamped on mobile" without a hydration mismatch (CSS, not a JS breakpoint read at render).

**Action row (`hidden md:flex`):** primary `btn btn-primary flex-1` (`h-[52px]`):

- unlocked: `Get directions` — keep today's three-way logic (real `directionsUrl` → external link; otherwise inert placeholder). **While there:** the inert fallback anchor in `CourtDetailShell` has a class typo `btn btn-primaryjustify-center gap-2` — fix it (`btn btn-primary justify-center gap-2`).
- locked: `Unlock to get directions` → the existing `PaywallTrigger`.

Then three `52px` circles: share (`CourtDetailShareButton`), heart (`CourtSaveButton`, saved = `text-saved`, otherwise ink), add-to-collection (`SaveToCollectionMenu`). Circle style: `bg-paper`, `1px rgba(184,184,182,0.4)` border, `rounded-pill`. Reuse the existing components via their `className` props; share the one `useCourtSaveState` already in `CourtDetailShell` so every instance stays in sync.

**Review card (unlocked, right column, md+):** `bg-paper`, `rounded-[14px]`, `p-[18px]`, `gap-3.5`, border `rgba(184,184,182,0.3)`, star circle 44px (ivory), title 14px / 600, sub 12px stone `leading-[1.4]`, `Review` small secondary button. Today's card is ivory / 12px radius / 16px padding (that's the mobile look, keep it below md). Same component, `md:` overrides; do not change its copy, `signedIn` routing or `ReviewModal`.

**Dark unlock card (locked, right column, md+):** `bg-ink`, `rounded-[14px]`, `p-[26px]`, centered. `Premium Content` 11px, `tracking-[0.08em]`, uppercase, bone/60 → `Unlock the full atlas` serif 24px weight 300, bone → `PAYWALL_COPY.valueProp` 13px `leading-[1.5]` bone/70 → `btn btn-premium` full width, `Unlock Full Access`. Mobile (end of the white card): `m-5`, `rounded-[12px]`, `p-5`, title 22px. Existing `CourtDetailUnlockCard` already has this content; add the `md:` size classes. Keep its `PaywallTrigger source`.

## Mobile spec

- **Hero:** height **290px** (was 320). The nav pill floats over it (`overHero` stays). Counter chip and "All photos" move to `bottom-3` (12px); dots stay at `bottom-[50px]`, active dot 20px wide. Remove the overlaid **save/share** buttons from the hero (they live in the floating bar now); keep the pill-style `Courts` BackButton overlay on the left.
- **White card:** unchanged (`-mt-4 rounded-t-[20px] bg-paper`), but `pb-[112px]` so the floating bar never covers the last block.
- **Title / chips / description / divider / location / gallery strip / nearby / review or unlock card:** as today, with these size changes to match v3:
  - location map `h-[100px] rounded-[10px]`, address text 11px (right column), button `text-[11px]`;
  - nearby cards `w-[120px]`, image `h-[90px] rounded-[8px]`, name 12px / 500 truncated, locked cards keep the dim `bg-ink/30` overlay + badge;
  - gallery strip thumbnails ≈ `90 × 68`, `rounded-[8px]`, active `2px` ink border, inactive `opacity-75` (today's 210×158 is far larger than v3);
  - do **not** port the "View all" link next to "Nearby courts" (it does nothing in the prototype).
- **Floating action bar** (replaces today's docked bar), `md:hidden`:
  - `sticky bottom-[18px] mx-4 z-30`, glass: `.glass-surface` (TASK_57) + `rounded-pill`, `p-[7px]`, `flex items-center gap-2`, shadow `0 16px 40px rgba(15,15,15,0.18), 0 2px 10px rgba(15,15,15,0.08)`, plus `pb` safe-area handling so it clears the iOS home indicator;
  - content: primary action `btn btn-primary flex-1 rounded-pill h-12` (same logic as the desktop row) + three `48px` circles (`bg-ink/5`, no border): share, heart (`text-saved` when saved), add-to-collection (`menuPlacement="above"` as today);
  - it is a bar over the content, never a blocking overlay (CLAUDE.md §4 rule 4), and sticky (not fixed) so it releases above the site Footer, as today.
  - **Width check at 360px:** the primary label must stay readable. `Unlock to get directions` may wrap to two lines (v3 does too). If `Get directions` is squeezed below ≈140px, tell me and propose a fix (e.g. moving add-to-collection out of the bar) instead of silently dropping something.
- Remove today's docked bar entirely at md+ (actions are inline there).

## Behaviour that must not change

Lightbox (open from mobile strip and desktop main image, own local index), review flow (signed-out → `/signin?redirectTo=…`), share (native sheet → clipboard "Link copied"), save toggle (optimistic, rollback, pending triad), add-to-collection menu, `directionsUrl` logic, locked ⇒ no coordinate / no live map, masking rules, `generateMetadata`, the `signedIn` / `viewerIsEntitled` / `exactLocation` server reads in `page.tsx`. `CourtDetailCtaPanel` and `CourtDetailFramedGallery` are already unused (Feature 79); leave them (or delete them only if you confirm nothing imports them and say so in the report).

## Do not touch

`CourtMap` / `CourtMapInner`, `FilterSheet`, the Courts screen, `CourtCard`, billing / paywall internals, `AppShell` / nav, Footer.

## Testing

Check on **desktop (1280+)** and **mobile (390 and 360)**, as: guest on a free court, signed-in free user on a premium court (locked), entitled user on a premium court, and any user on a free (unlocked-for-everyone) court.

- Desktop: back link works (history back, else `/map`); two columns, gallery 440px, thumbnails switch the image in place, main image click opens the lightbox, arrows still work; location row and nearby sized as above; action row has directions/unlock + share + heart + add-to-collection; review card (unlocked) or dark card (locked) under it; no docked bar; nothing hides under the pill nav.
- Locked: masked `<h1>`, `Location hidden — Premium only`, blurred description, locked map with `Address hidden` + disabled `Unlock location`, dark card in the **right column** (desktop) / **end of the card** (mobile), no coordinates in the DOM or network.
- Mobile: hero 290px under the pill; BackButton overlay present, no save/share on the hero; floating glass bar pinned while scrolling and resting above the Footer; last block never hidden behind it; strip thumbnails open the lightbox; description clamp + Read more still work.
- Heart is `saved` colour when saved on every instance and they stay in sync (toggle one, all update).
- No `<button>` inside `<a>`; no duplicate `priority` image preloads (check the page's `<link rel="preload">`s); `grep -n "btn-primaryjustify" apps/web/src` returns nothing.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `verify:ux-pending-states`, `verify:map-autofocus` (4 known pre-existing failures stay as they were; the check that both `CourtDetailLocationPreview` call sites pass `heroImageUrl` must still pass).

## Report

Files created / changed / deleted. Confirm: gallery and map exist once in the DOM; no md+ docked bar; save/share left the mobile hero; `CourtDetailUnlockCard` is out of the location block; the class-name typo is fixed; CLAUDE.md BackButton line updated. Say how the 360px action bar looks, and what you could only verify by reading code. No git commit or push unless asked.
