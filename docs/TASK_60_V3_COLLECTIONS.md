# TASK 60 — Redesign v3: Collections (`/collections`) + Collection Detail (`/collections/[slug]`)

**Model: Sonnet 5, reasoning effort: medium.** This is mostly a restyle of components that already exist. The one piece that needs care is the access-aware map CTA on the detail page.

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55–59 are done and assumed: floating pill nav, the shared `CourtCard` / `SurfaceChip` / `PremiumBadge`, `.glass-surface`, the `saved` colour token, and the Court Detail floating action bar pattern (`CourtDetailShell.tsx`).

## Goal

- **Collections list:** v3 header, then the Featured cards (a horizontal strip on mobile, a 3-column grid on desktop), "By Country" (a strip on mobile, a wrapping row on desktop), and "Curated for You" as **v3 rows** (thumbnail + text + bookmark) instead of today's photo tiles.
- **Collection Detail:** v3 layout. Mobile gets a full-bleed hero, an overlapping white card, a one-column list of `CourtCard`s and a floating glass action pill. Desktop gets a "Back to Collections" link, a framed hero with share and save, and a two-column body: description + a 2-up `CourtCard` grid on the left, a sticky "map" card on the right.

Reference (read the named functions; ignore the fake browser chrome, the `StatusBar` and the burger sheet):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`, `function CollectionsScreen` (~line 716) and `function CollectionDetailScreen` (~line 778);
- mobile: `tennis_world_v17_standalone.html`, `function CollectionsScreen` (~line 1041) and `function CollectionDetailScreen` (~line 1128).

**Out of scope:** the user's own folders (`/saved/collections/[slug]`, `features/user-collection-detail`). They move with Saved in TASK_61.

## Decisions already made (do not re-litigate)

1. **No invented subtitle.** v3 has two text fields per collection: `sub` (a short tagline) and `desc`. `CollectionDTO` has only an optional `description`, and we add no field. Wherever v3 prints `sub`, print `description` line-clamped. On the detail page print `description` **once**, as the v3 `desc` paragraph. Drop the v3 `sub` line there. No description ⇒ render nothing in that slot.
2. **The header search/filter glyphs stay out.** v3 draws them with no handler. `CollectionsHero`'s header comment explains why they are omitted. That reasoning still holds, so keep the comment.
3. **The Featured count follows the HTML.** Desktop shows up to 6 collections in a 3-column grid. Mobile shows the first 3 in the strip (v3 `COLLECTIONS.slice(0,3)`). One array goes down from the page (`collections.slice(0, 6)`), and the strip hides items 4–6 below md. "Curated for You" still lists every collection.
4. **The Featured cards lose their save heart.** v3 Featured cards have no save control, only the decorative arrow. Every collection also appears in "Curated for You", which keeps a real save button, so nothing becomes unreachable. Remove `CollectionSaveHeart` from `FeaturedCollectionsStrip` only.
5. **"Curated for You" becomes v3 rows.** This supersedes Task 40 ("look exactly like `SavedCollectionRow`"). Rewrite `CuratedCollectionCard`'s header comment accordingly. Its save control becomes a **bookmark** (v3 `Ico.save`) in a bone circle. It stays a real, database-backed `CollectionSaveHeart`, never the inert button the prototype has.
6. **Saved colour = the `saved` token** everywhere `CollectionSaveHeart` renders, including the Saved screen's `SavedEditorialCollectionsGrid`, which picks this up automatically. This replaces `text-clay`, as TASK_59 decision 5 did for courts.
7. **The map CTA describes what the viewer can actually do.** v3 has two states ("Unlock the map" / "Show the map"). We have three, because signed-in free users already see the map (plan decision 3) and guests never do. See "Map CTA" below. `/map` has no collection filter and this task adds none. "Show the map" links to plain `/map`, and the copy must not promise a filtered map.
8. **Real save on the detail page.** The hero heart (desktop) and the bar heart (mobile) save **the collection** through the existing `CollectionSaveHeart` / `POST|DELETE /v1/me/saved-collections`. No new endpoint, no contract change. Court cards keep their own bookmark (`CourtCard`'s `save` prop), as today.
9. **Share reuses `CourtDetailShareButton`** (it shares `window.location.href`). Pass `courtName={collection.name}`. The prop is used only for the share-sheet title and `aria-label="Share …"`, and both read correctly for a collection. Do not rename or move the component.

## 1. Collections list (`app/collections/page.tsx` + `features/collections`)

The page keeps its three reads exactly as today: `collections.list()`, `countries.list()`, and the protected `getSavedEditorialCollections()` with the `AuthRequiredError` degrade. The only change is `featured = collections.slice(0, 6)` (constant `FEATURED_MAX = 6`; update the comment that cites `slice(0,3)`).

Page wrapper: keep `bg-bone`. v3 desktop paints this screen `ivory` (`#FAF8F3`), but no other ported v3 screen (Courts, Atlas, Court Detail) switched its background, and one lighter page among them would read as a bug. Bottom padding is ≈40px on mobile and 80px at md+ (`pb-10 md:pb-20`).

### Header (`CollectionsHero`)

- Container: `.container-page` (the same gutter the Courts screen uses, so left edges line up across the nav destinations), `pt-8 md:pt-11`.
- `<h1>`: mobile `serif display-l` as today. md+: `md:text-[40px] md:font-normal md:leading-[1.1]`.
- Subtitle: 13px stone, `mt-1` on mobile; md+ `md:text-[14px] md:mt-1.5`. Gap to the first section: 24px on mobile, 36px on desktop (put this on the section's top padding, see below).

### Featured (`FeaturedCollectionsStrip` + `CollectionCard`)

Section: `pt-6 md:pt-9`. Heading: 16px / 600 on mobile, `md:text-[17px]`, `mb-3`.

One `<ul>`, responsive:

- mobile: today's horizontal scroll row (`flex gap-3 overflow-x-auto no-scrollbar`, right-gutter bleed, trailing spacer `<li>`). Items are `h-[240px] w-[200px] shrink-0`. Items with index ≥ 3 get `hidden md:block`.
- md+: `md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:mr-0`. Items are `md:h-[260px] md:w-auto`. The spacer `<li>` gets `md:hidden`.

`CollectionCard` (also used by `SavedEditorialCollectionsGrid`, so the defaults must keep that screen looking as it does now):

| | mobile (today's values, keep) | md+ (v3 desktop) |
|---|---|---|
| radius | `rounded-lg` (12px) | `md:rounded-[14px]` |
| count pill | `left-2.5 top-2.5`, 9px, `tracking-[0.1em]`, `px-2.5 py-[3px]` | `md:left-3 md:top-3`, `md:text-[10px]`, `md:tracking-[0.08em]`, `md:px-[11px] md:py-1` |
| bottom block | `px-3.5 pb-4 pt-4` | `md:px-4 md:py-[18px]` |
| name | serif 22px, `leading-[1.15]` | `md:text-[24px]` |
| subline (`description`) | 11px, paper/70, `mt-1`, `line-clamp-2` | `md:text-[12px] md:mt-[5px]` |
| arrow circle | 32px, glyph 14 | `md:h-9 md:w-9`, glyph 15 |

- Count pill: handle the singular (`1 court`), the way `CuratedCollectionCard` already does. Today this card prints "1 courts".
- The arrow is `hidden md:flex` today, and v3 mobile shows it. Add one prop, `arrowOnMobile?: boolean` (default `false`, so the Saved grid's 150px tiles stay unchanged). `FeaturedCollectionsStrip` passes `true`. The arrow stays a decorative `aria-hidden` span inside the link.
- `sizes`: `"(max-width: 768px) 200px, 33vw"`.
- Remove the `CollectionSaveHeart` sibling from the Featured `<li>` (decision 4) and the props that only fed it (`savedCollectionIds`, `signedIn`) from `FeaturedCollectionsStripProps`. Keep `priority` on the first card.

### By Country (`CountriesStrip`)

Keep the data, the `/map?q=<name>` destination and `PendingCardLink`. Section `pt-7 md:pt-12`, heading as above.

- mobile: unchanged (h-scroll, `gap-2.5`, items `w-[90px]`, circle 72px, name 12px, count 10px).
- md+: no scroll. `md:flex-wrap md:gap-7 md:overflow-visible md:mr-0`, items `md:w-24`, circle `md:h-20 md:w-20`, name `md:text-[13px] md:mt-2`, count `md:text-[11px]`, spacer `<li>` `md:hidden`. `sizes="80px"`.

### Curated for You (`CuratedCollectionsList` + `CuratedCollectionCard`)

Section `pt-7 md:pt-12`, heading `mb-3 md:mb-4`.

List: mobile `flex flex-col gap-2.5`; md+ `md:grid md:grid-cols-2 md:gap-3.5`.

Row (each `<li className="relative">` holds the card link plus the bookmark as a **sibling**, as today; never a button inside the link):

- `CuratedCollectionCard` is a `PendingCardLink` to `/collections/{slug}`, `flex items-center gap-3.5 rounded-[12px] bg-paper p-3 pr-[56px]` (the right padding reserves the bookmark's slot). md+: `md:gap-4 md:rounded-[14px] md:p-3.5 md:pr-[64px]`.
- Thumbnail: `relative h-20 w-24 shrink-0 overflow-hidden rounded-[10px]` (96×80); md+ `md:h-[88px] md:w-[108px]`. `next/image fill`, `sizes="108px"`, `object-cover`.
- Text column `min-w-0 flex-1`:
  - name: 15px / 500, `leading-[1.2]`, ink; md+ 16px;
  - `description`: 12px stone, `mt-[3px] leading-[1.35] line-clamp-2`; md+ `md:mt-1 md:leading-[1.4]`;
  - count: 11px stone, `mt-1.5` (md+ `md:mt-[7px]`), singular-aware ("1 court").
- Bookmark: `CollectionSaveHeart` with `glyph="bookmark"`. Box: `absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-pill bg-bone` (md+ `md:right-3.5 md:h-9 md:w-9`). Glyph 14 (md+ 15). Idle colour ink; saved colour `text-saved`.

### `CollectionSaveHeart` changes (keep the behaviour byte-for-byte)

The optimistic flip, rollback, `.finally()` reset, the guest → `/signin?redirectTo=/collections/{slug}` route and the pending triad all stay as they are. Add:

- `glyph?: 'heart' | 'bookmark'` (default `'heart'`). For the bookmark, export the existing `BookmarkGlyph` from `components/court/CourtCardSaveButton.tsx` (a named export only, no change to that component) instead of drawing a third copy. Give it the size the call site needs.
- `className?: string`: when given, it **replaces** the default box classes (`absolute right-3 top-3 … bg-ink/35 backdrop-blur-sm`). Colour stays computed inside the component.
- `idleColorClassName?: string` (default `'text-paper hover:text-saved'`). Saved is always `text-saved` (decision 6, replacing `text-clay`).
- The spinner inherits `currentColor`. Drop the hard-coded `text-paper` on the `InlineSpinner` so it is visible on the bone and glass circles.
- `state?`: see the shared state in §2. Without it, the component owns its state exactly as today.

## 2. Collection Detail (`app/collections/[slug]/page.tsx` + `features/collection-detail`)

### Data (page.tsx)

Keep `getBySlug` → `notFound()`, `courts.list({ collection: slug })`, `generateMetadata`, and the protected block with its `AuthRequiredError` degrade. Add `protectedRepos.saved.getSavedEditorialCollections()` to the **same** `Promise.all` as `getSavedCourts()` / `getCurrentUser()`, giving `initialCollectionSaved = saved.some(c => c.id === collection.id)`. On the degrade path it is `false`.

Switch the page to `<AppShell signedIn={signedIn} overHero>` (mobile hero sits under the pill nav, as on Court Detail). Give the page wrapper `md:pt-[var(--nav-offset)]`. Update the header comment that says "NOT `overHero`".

### Page structure

Hero image and court list exist **once** in the DOM. Small text and button blocks may be duplicated with `md:hidden` / `hidden md:flex`.

DOM order (also the mobile order):

1. `CollectionDetailHero`: desktop back link (hidden on mobile), then the hero frame with the mobile back pill, count pill, name, and (md+) share + save circles.
2. Body: description, divider (mobile only), "Courts in this collection" + grid.
3. Map card (md+ only, right column).
4. Floating action bar (mobile only).

At md+: container `mx-auto max-w-[1240px] md:px-14 md:pb-20`. The body is `md:grid md:grid-cols-[1fr_320px] md:gap-12 md:items-start`, with the map card in column 2.

### Hero (`CollectionDetailHero`, restyled, not replaced)

Both `BackButton` instances stay **in this file**. `verify:ux-pending-states` reads `features/collection-detail/CollectionDetailHero.tsx` and asserts `<BackButton` + `fallbackHref="/collections"`.

- **Desktop back link:** `<BackButton fallbackHref="/collections" label="Back to Collections" className=…>`, using the exact plain-text class string of Court Detail's desktop back link (`app/courts/[slug]/page.tsx`, `label="Back to Courts"`), `mb-[26px]`, `hidden md:inline-flex`. Measure the gap under the nav pill in the browser. v3 puts it ≈36px below the nav row, the same as Court Detail.
- **Frame:** mobile `relative h-[260px]` full-bleed. v3 is 230px, but v3 sits under fake browser chrome and ours sits under the nav pill + back pill, so the extra 30px keeps the title clear of them. **At 360px, check that a two-line name doesn't hit the back pill**, and say what you saw. md+: `md:h-[320px] md:rounded-[24px] md:overflow-hidden md:mb-9`.
- **Image:** `next/image fill priority sizes="(max-width: 768px) 100vw, 1240px"`, `object-cover`. Drop today's `opacity-35` on an ink band.
- **Overlay** (inline `style` gradients, as `CollectionCard` already does; these CSS classes don't exist in our `globals.css`): mobile = v3 `.img-overlay-top`, which is `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.78) 100%)` (keeps the nav and back pill legible). md+ = v3 `.img-overlay`, which is `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)`. Two absolutely positioned spans with `md:hidden` / `hidden md:block` are fine (no image duplication).
- **Mobile back pill:** `<BackButton fallbackHref="/collections" label="Collections" …>`, with Court Detail's mobile pill class string (`… rounded-pill bg-ink/40 … md:hidden`), placed `absolute left-4 top-[72px]` (Court Detail's offset).
- **Bottom block:** mobile `absolute bottom-4 inset-x-5`; md+ `md:bottom-7 md:inset-x-8 md:flex md:items-end md:justify-between`.
  - Count pill: 9px / 600, `tracking-[0.1em]`, uppercase, `px-2.5 py-[3px]`, `bg-ink/50 backdrop-blur-[8px]`, paper. md+: 10px, `md:px-3 md:py-1`. Singular-aware.
  - `<h1>`: serif, weight 400, paper, 30px `leading-[1.1]` `mt-2`; md+ `md:text-[42px] md:mt-2.5`.
  - md+ only (`hidden md:flex gap-2.5`): share + save, both 48px circles `bg-paper/20 backdrop-blur-[8px] border border-paper/40 text-paper`, glyph 18. Share is `CourtDetailShareButton` (decision 9). Save is `CollectionSaveHeart glyph="heart"` with `className` for the circle and `idleColorClassName="text-paper"`. Saved shows `text-saved`.
- Description moves **out** of the hero into the body.

### Body

- **White card on mobile:** `relative -mt-4 rounded-t-[20px] bg-paper pb-[112px]` (room for the floating bar), so the same pattern as Court Detail. md+: `md:mt-0 md:rounded-none md:bg-transparent md:pb-0`.
- **Description** (only when present): mobile `px-5 pt-5`, `body-m text-graphite leading-[1.6]`. md+: `md:px-0 md:pt-0 md:text-[15px] md:leading-[1.7] md:max-w-[600px]`.
- **Divider:** mobile only, `mx-5 my-5 h-px bg-hairline md:hidden` (Court Detail's divider). If there is no description, render no divider either.
- **Courts section** (`CollectionCourtsGrid`, restyled): mobile `px-5`; md+ `md:px-0 md:mt-9`. Drop `SectionHeader` and the `eyebrow` / `title` props (only this page uses them). Use a plain `<h2>` "Courts in this collection", 16px / 600 `mb-3`, md+ `md:text-[17px] md:mb-4`.
  - List: `grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-[18px]`. These are the same columns as the Courts screen's `MapCourtGrid` (1-up mobile, 2-up desktop). `CourtCard` props are unchanged (`viewerIsEntitled`, `save`, `priority` on the first). Add `imageSizes="(max-width: 768px) 100vw, 430px"`.
  - Empty state: today's copy, unchanged.

### Map CTA (one decision, rendered twice)

Compute once in a small client wrapper (or in page.tsx and pass down):

```ts
const anyMasked = courts.some((c) => courtDisplay(c, viewerIsEntitled).masked);
const mapCta = !signedIn ? 'guest' : anyMasked ? 'unlock' : 'map';
```

| `mapCta` | Card title (serif 20px / 400) | Card text (13px stone, `leading-[1.5]`) | Button |
|---|---|---|---|
| `guest` | See it on the map | Sign in to explore these courts on the map. | `Sign in to view the map`: `PendingLink` to `/signin?redirectTo=/map` (same target as the Courts screen's guest link) |
| `unlock` | Unlock the full atlas | Premium courts in this collection stay hidden — names, locations and map pins — until you unlock full access. | `Unlock Full Access`: `PaywallTrigger source="collection-detail"` |
| `map` | See it on the map | Explore these courts, and every other court in the atlas, on the map. | `Show the map`: `PendingLink` to `/map` |

The `guest` row is checked first. `courtDisplay(...).masked` is already false for the free-for-everyone courts (Task 41) and for entitled viewers, so a free user on an all-free collection gets `map`, not a paywall. No price, no plan sentence (plan decision 2).

- **Desktop card** (column 2, `hidden md:block`): `md:sticky md:top-[calc(var(--nav-offset)+20px)]`, `bg-paper rounded-[16px] p-6 shadow-[0_2px_16px_rgba(15,15,15,0.06)]`, title `mb-2`, text `mb-[18px]`, button `btn btn-primary w-full`.
- **Mobile floating bar** (`md:hidden`): copy the Court Detail bar's container classes exactly (`glass-surface sticky bottom-[18px] z-30 mx-4 flex items-center gap-2 rounded-pill p-[7px] pb-[calc(7px+env(safe-area-inset-bottom))] shadow-[…]`). It must be the last child of the page wrapper, so it pins while scrolling and releases above the Footer. Content:
  - the primary button with the same label/target as the table, `btn btn-primary flex-1 rounded-pill !h-12`;
  - share (`CourtDetailShareButton`) and save (`CollectionSaveHeart glyph="heart"`, `idleColorClassName="text-ink"`) as 48px circles `bg-ink/5`, no border, the same as Court Detail's `MOBILE_CIRCLE`;
  - no add-to-collection (v3 has none here, and it is a court feature).
  - **Width at 360px:** `Sign in to view the map` will likely wrap to two lines. That's acceptable (TASK_59 accepted it for `Unlock to get directions`). If the button gets narrower than ≈140px, tell me instead of shortening the copy.

### Shared save state (hero heart ↔ bar heart)

Both instances are in the DOM, one per breakpoint, so a toggle on one must show on the other after a resize. Do what TASK_59 did for courts: extract the state + click handler of `CollectionSaveHeart` into `useCollectionSaveState({ collectionId, collectionSlug, initialSaved, signedIn })` in the same file. `CollectionSaveHeart` accepts an optional `state` from that hook and creates its own when none is given, so the list pages are untouched. The detail page's client wrapper creates one state and passes it to both instances.

## Do not touch

`CourtCard` / `CourtCardSaveButton` (apart from exporting `BookmarkGlyph`), `SavedEditorialCollectionsGrid` and the rest of `features/saved`, `features/user-collection-detail`, the Courts screen / `FilterSheet` / map, `CourtDetailShareButton`'s behaviour, `AppShell` / nav, Footer, paywall internals, the API, contracts, Prisma. `/map` gets no new search param.

## CLAUDE.md

Update the §5 fallback line for Collection detail. It becomes two `BackButton` instances in `CollectionDetailHero`: the mobile pill `Collections` (`md:hidden`) and the desktop plain-text `Back to Collections` (`hidden md:inline-flex`), both `fallbackHref="/collections"`. Write it the same way the Court detail line is written.

## Testing

Check on **desktop (1280+)** and **mobile (390 and 360)**, as a guest, a signed-in free user and an entitled user.

**Collections list**
- Desktop: 40px title; Featured in a 3-column grid (all 6, 260px tall); countries wrap with 80px circles; Curated in two columns of rows; no horizontal scroll anywhere.
- Mobile: Featured strip shows 3 cards (200×240) **with** arrows; country strip scrolls; Curated is a single column of rows.
- Featured cards have no save control. Curated bookmark: guest → `/signin?redirectTo=/collections/{slug}`; signed in → toggles, the spinner shows only on that bookmark, and the state survives a reload. Saved colour is `#E85D4A`.
- The Saved screen's editorial-collections tab looks as before (150px tiles, heart top-right, no arrow on mobile). Only the saved colour changed.

**Collection Detail**
- Mobile: 260px hero under the pill nav, back pill present and working (history back, else `/collections`); title readable; white card overlaps; one court card per row; floating glass bar pinned while scrolling and resting above the Footer; the last card is never hidden behind it.
- Desktop: "Back to Collections" link, framed 320px hero with rounded 24px corners, share + heart on the hero; description at max 600px; 2-up `CourtCard` grid; map card sticky under the nav pill while the left column scrolls.
- Map CTA: guest → `Sign in to view the map`; free user on a collection with a premium court → `Unlock Full Access` opens the paywall; free user on a collection whose courts are all free → `Show the map`; entitled → `Show the map`. Check that the bar and the card agree in every case.
- Collection heart: the desktop hero heart and the mobile bar heart stay in sync (toggle on desktop, narrow the window, check the bar). Guest → `/signin?redirectTo=…`. The state persists after a reload. Court bookmarks still work independently.
- Share: native sheet where available, otherwise "Link copied". It shares the collection URL.
- Masking on court cards is unchanged (premium court for a free user → "Premium Court" + badge).
- No `<button>` inside `<a>`; one `priority` preload for the hero (check the `<link rel="preload">` entries); `notFound()` still 404s an unknown slug.

**Checks:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `verify:ux-pending-states` (the Collection detail `BackButton` assertion must pass), `verify:map-autofocus` (the 4 known pre-existing failures stay as they were). If an API is running, run `verify:api-parity` too, since the collections reads are on that path.

## Report

Files created / changed / deleted. Confirm: the hero image and court list exist once in the DOM; the Featured save heart is gone and Curated keeps a working bookmark; the Saved tab is unchanged apart from the colour; `CollectionSaveHeart` behaviour is unchanged (only presentation props + the extracted hook); the CLAUDE.md line is updated. Say how the 360px bar looks with each of the three CTA labels, how a long name sits in the 260px mobile hero, and what you could verify only by reading code. No git commit or push unless asked.
