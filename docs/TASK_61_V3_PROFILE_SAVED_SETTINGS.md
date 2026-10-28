# TASK 61 — Redesign v3: Profile (`/profile`), Saved (`/saved`), Folder detail (`/saved/collections/[slug]`), Settings (`/profile/settings`)

**Model: Sonnet 5, reasoning effort: medium.** Four screens, all restyles of components that already exist. There is no new data, no new route and no behaviour change. The risk is breadth, not difficulty: keep every shipped feature (edit profile, folders, My Map, sort, sign-out).

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55–60 are done and assumed: floating pill nav, shared `CourtCard`, the `saved` colour token, `.glass-surface`, and `CollectionSaveHeart` with its `glyph` / `size` / `className` / `idleColorClassName` props (TASK_60).

## Goal

Bring the four "account" screens to the v3 layout:

- **Profile:** a single column on mobile; a two-column page on desktop (avatar, name and stats on the left, membership and "My collections" on the right), with the settings gear top-right.
- **Saved:** the v3 header (title on the left, tab chips on the right at md+), 3-column court grid with the "Dream List" card as the last grid cell, and the v3 collection tiles (150px mobile / 200px desktop) with a bookmark in the corner.
- **Folder detail:** the same page rhythm as the other v3 screens. Today it still has the old full-width back-bar and a 2/3/4-column grid.
- **Settings:** the v3 narrow centred column.

Reference (read the named functions; ignore the fake browser chrome, `StatusBar`, `TopTabs` and the avatar-picker / email fields in the Edit profile sheet):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`: `SavedScreen` (~649), `ProfileScreen` (~831), `SettingsScreen` (~924);
- mobile: `tennis_world_v17_standalone.html`: `SavedScreen` (~958), `ProfileScreen` (~1210), `SettingsScreen` (~1365).

## Decisions already made (do not re-litigate)

1. **Guests are out of scope.** `/profile`, `/saved`, `/saved/collections/*` and `/profile/settings` already redirect a signed-out visitor to `/signin` through `loadOrSignIn`. v3's `AuthGateScreen` is the sign-in screen itself and belongs to TASK_62. Do not add a guest branch to any of these pages.
2. **Stats stay real.** v3 shows "Courts saved" plus two greyed "Coming soon" cells. We keep our three real, linked stats (Saved Courts · Collections · Countries) and their destinations. No "Soon" placeholders (`docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md`).
3. **Membership copy stays on our model.** Keep `Membership` / `Choose your membership.` / `See Membership` and the active-state copy. v3's "One-time · Lifetime · $29" and "Since 2024" are not ported (plan decision 2). No billing change, and `ManageBillingButton` stays the only manage entry point.
4. **Edit profile is untouched.** `EditProfileModal`, `ProfileEditTrigger` and `SettingsAccountRow` keep their behaviour. v3's photo picker and editable email are demo scaffolding: there is no avatar upload and email is immutable (`verify:web-profile` asserts it). Only the trigger's position changes, and it already matches v3's small pill button.
5. **Saved keeps three tabs and two collection sections.** v3 knows only Courts and Collections. We keep "My Map" (shipped, `SavedWishlistMap`) and the Collections tab's two sections: "Saved Collections" (editorial) and "Your Folders". Folders are the backbone of Court Detail's "Add to collection" (TASK_59 decision 4), so they can't go. Only their look changes.
6. **Sort stays at every size.** v3 shows "Recently added ↓" on mobile only. Our `SavedSortControl` is a real control, so it shows at all sizes.
7. **Saved colour.** In every collection tile bookmark the saved state is the `saved` token, as in TASK_60. On the Saved screen every item is saved, so those bookmarks read coral.
8. **Background stays `bg-bone`** on all four screens (see TASK_60: no other ported v3 screen switched to ivory).
9. **Folder detail has no v3 screen.** The prototype only has the editorial `CollectionDetailScreen`. Apply the v3 page rhythm (plain back link, narrow header, `CourtCard` grid) and add nothing else. `UserCollectionRename` and its empty state keep their behaviour.

## Shared pieces (do these first)

### Glyphs

`SavedTabs.tsx` defines `CourtGlyph`, `CollectGlyph` and `MapGlyph` locally. Profile's stats need the same three. Move them to `features/saved/saved-glyphs.tsx` and export them with a `size?: number` prop (default 18). `SavedTabs` and `ProfileStats` import from there. Draw nothing new. Export from `features/saved/index.ts`.

### `CollectionCard`: `compact` prop

For the Saved tiles. `compact?: boolean`, default `false`, so `/collections` is untouched. When `true`:

- no `description` line and no arrow circle (v3 Saved tiles show only the count pill and the name);
- name: serif 17px, `leading-[1.2]`, `md:text-[20px]`;
- pill: `left-2 top-2`, `md:left-2.5 md:top-2.5`, 9px, `md:text-[10px]`, `tracking-[0.08em]`;
- bottom block: `px-3 pb-2.5 pt-2.5 md:px-4 md:pb-3.5`;
- radius `rounded-lg md:rounded-[14px]`; `sizes="(max-width: 768px) 50vw, 33vw"`.

### `SavedCollectionRow` (folders) and the editorial tile must match

Both tiles share the Saved grid, so they must be visually the same height and type scale. Give `SavedCollectionRow` the same values as `compact` above: `h-[150px] md:h-[200px]`, name 17px / `md:text-[20px]`, pill `md:` bumps, `rounded-lg md:rounded-[14px]`. Keep the empty-folder art, `PendingCardLink`, and the "1 court" singular handling.

Add `variant?: 'tile' | 'tall'` to `SavedCollectionRow` (default `'tile'`) for the Profile strip (see §1). `tall` fills its slot (`h-full`) instead of `h-[150px]`, and its name is serif 22px, `md:text-[19px]`. Everything else is shared.

## 1. Profile (`app/profile/page.tsx` + `features/profile`)

Keep the data reads exactly as they are, the `?checkout=` banner, and `loadOrSignIn`.

### Page structure

- Wrapper: `PageContainer` with `pt-8 pb-section-lg md:pt-11 md:pb-section-xl`. Inside, `mx-auto max-w-[1120px]`.
- **Gear row** first: `flex justify-end mb-3 md:mb-4`. The `PendingLink` to `/profile/settings` becomes a circle: `grid h-9 w-9 place-items-center rounded-pill border border-mist/40 bg-paper text-graphite md:h-[38px] md:w-[38px]`, glyph 16px (`md:` 17px). Keep `aria-label="Settings"`.
- **Checkout banner:** `CheckoutStatusBanner` moves to just under the gear row and spans the full width (`mb-6`), above both columns. Today it sits between the header and stats. After a Stripe return it should be the first thing the visitor sees, and in two columns that spot no longer exists.
- Then two sibling wrappers, giving the right mobile order (header, stats, membership, collections) with no explicit grid placement: `<div className="md:grid md:grid-cols-[320px_1fr] md:items-start md:gap-12">`, containing a **left** `<div>` (`ProfileHeader`, `ProfileStats`) and a **right** `<div className="mt-5 md:mt-0">` (`ProfileMembershipCard`, `ProfileCollectionsStrip`).

### `ProfileHeader`

- Mobile (as today): avatar left, name and Edit button right.
- md+: stack them. Container `md:flex-col md:items-start md:gap-3.5`. Avatar `md:h-24 md:w-24` via `className` (96px; do not add a size to `UserAvatar`), border `ring-[3px] ring-paper` as today. Name `md:text-[28px]`. Edit button `md:mt-2.5` (it already matches v3's small pill).
- Leave the hidden badge block, the demo-mode chip and the "Access until …" line as they are.

### `ProfileStats` / `ProfileStatLink`

Keep the same three cells, labels, hrefs and `aria-label`s. Restyle to the v3 cell:

- container: `mt-5 md:mt-7 grid grid-cols-3 divide-x divide-hairline rounded-lg bg-paper py-4 md:rounded-[14px] md:py-[18px]` (the divider colour matches v3's `rgba(184,184,182,0.3)` closely enough; keep `divide-hairline`);
- cell: centred column, an icon on top (Courts → `CourtGlyph`, Collections → `CollectGlyph`, Countries → `MapGlyph`, size 14, `md:` 15, ink), the number below (22px / 700, `md:text-[20px]`, `my-1.5`, plain sans, no `display-m`), then the label 10px (`md:text-[11px]`) stone, sentence case, no `eyebrow` uppercase;
- keep the `PendingCardLink`, hover, focus ring and `py` so the whole cell stays one tap target.

### `ProfileMembershipCard`

- **Free variant:** the v3 row. `rounded-lg bg-ink p-4 py-[18px] md:rounded-[14px] md:px-6 md:py-[22px]`, `flex items-center gap-3 md:gap-4`. Left (`flex-1`): the `Membership` eyebrow in gold (10px, `md:text-[11px]`, 600, `tracking-[0.08em]`, uppercase), the headline in serif 20px / 300 bone (`md:text-[24px]`). Right: the existing `PaywallTrigger source="profile"` with `btn btn-premium btn-sm gap-2 shrink-0` (small gold button, label and arrow unchanged). Remove the `my-8`; the right column owns spacing. **Do not add the v3 price line.**
- **Active variant:** `rounded-lg md:rounded-[14px]`, `px-4 py-3.5 md:px-6 md:py-[18px]`, same gradient. Add the gold uppercase eyebrow above the subhead: `Lifetime Member` / `Active Subscriber` (the same two labels `ProfileHeader` already maps; reuse them instead of a third copy: export the map from `ProfileHeader.tsx` or move it to a small shared const in `features/profile`). Subhead 13px (`md:text-[14px]`) bone. Keep `ManageBillingButton` on the right. **Fix a real defect while here:** its class is `text-stone … hover:text-ink`, and ink on this near-black gradient is invisible on hover. Use `text-bone/70 hover:text-bone`.

### `ProfileCollectionsStrip` ("My collections")

- Section `mt-9`. The heading row is as today (`flex items-baseline justify-between`), the heading 16px (`md:text-[17px]`) and `mb-3 md:mb-4`. "View all →" now links to **`/saved?tab=collections`** (it opens the Courts tab today, which is not where folders live). Still hidden when there are no folders; the empty state is unchanged.
- List: **one** `<ul>`, two layouts. Mobile: the horizontal scroll (`no-scrollbar -mr-[…] flex gap-3 overflow-x-auto pb-1`), each `<li>` `h-[240px] w-[200px] shrink-0`, rendering `<SavedCollectionRow variant="tall" />`. md+: `md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:mr-0`, each `<li>` `md:h-[180px] md:w-auto`. Show at most 4 folders at md+ (v3 `slice(0,4)`; mobile may scroll the full list as today).

## 2. Saved (`features/saved`, `app/saved/page.tsx`)

`page.tsx` is unchanged apart from comments. Everything below is in `SavedTabs.tsx` and its children.

### Header + tabs

- One flex container for header and tabs: `container-page pt-8 md:pt-11`, `flex flex-col md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-5`.
- Title block: `<h1 serif display-l>` with `md:text-[40px] md:font-normal md:leading-[1.1]`; subtitle 13px, `md:text-[14px] md:mt-1.5`.
- The tablist is the **same element**, not a second copy. Mobile: below the subtitle, `mt-4`, chips share the row. md+: it sits at the right of the header, `md:mt-0`, chips natural width (`md:flex-none`), `md:gap-2.5`. Chip sizing at md+: `md:px-5 md:py-2.5 md:text-[13px] md:gap-2`, icon 16. Mobile sizing stays exactly as today (the three-chip fit at 390px was worked out in `SavedTabs`'s comment, so don't disturb it). Update the stale header comment.
- Count row: `mt-4 mb-3 md:mt-7 md:mb-4`. The count is 13px / 500: ink on mobile, `md:text-stone`. `SavedSortControl` stays where it is.

### Courts tab

- Grid: `grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-5` (drop the standalone `mt-8` wrapper; the count row now owns the gap).
- **"Dream List" card moves into the grid** as the last `<li>`. On mobile (one column) it follows the cards just as in v3; at lg it occupies the next cell, like v3 desktop. Restyle `SavedDreamListCta` to match:
  - mobile: as today (ivory, border, `rounded-[12px]`, `p-4`, tilted tiles on the right);
  - md+: `md:rounded-[14px] md:bg-paper md:p-[22px] md:min-h-[230px] md:flex-col md:items-start md:justify-center`, the title `md:text-[24px]`, **tiles `md:hidden`** (v3 desktop has no pictures), the button `btn btn-primary btn-sm`;
  - remove its own `mt-8`; the grid gap spaces it. Show it only when there is at least one court, as today.
- Keep `SavedEmptyState` for zero courts.

### Collections tab

- Section headings "Saved Collections" and "Your Folders": 16px / 600 (`md:text-[17px]`), `mb-3 md:mb-4`, `mt-6 md:mt-8` between the two sections.
- Both grids: `grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5` (drop `lg:grid-cols-4`).
- **Editorial tiles** (`SavedEditorialCollectionsGrid`): `<li className="relative h-[150px] md:h-[200px]">`, `<CollectionCard compact … />`, and the `CollectionSaveHeart` as a **bookmark**:
  - `glyph="bookmark"`, `size={14}`;
  - `className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-pill bg-ink/45 backdrop-blur-[8px] md:right-2.5 md:top-2.5 md:h-8 md:w-8"`;
  - `idleColorClassName="text-bone"`; coral when saved (decision 7).
  - Keep `initialSaved`, `onSavedChange`, and the optimistic remove from the grid.
- **Folder tiles** (`SavedCollectionsGrid`): `<SavedCollectionRow />` with the sizes above. "New Collection" button and empty state unchanged.

### My Map tab

Unchanged apart from the shared header and count. `SavedWishlistMap` is not edited (`verify:map-autofocus` reads it).

## 3. Folder detail (`app/saved/collections/[slug]/page.tsx`, `features/user-collection-detail`)

Page data and logic unchanged. Edits:

- **`UserCollectionHero`:** delete the full-width `h-14 border-b` back-bar. In its place, inside `container-page pt-4 md:pt-6`, one `BackButton fallbackHref="/saved" label="Back to Saved"` with the plain-text class string used on Court Detail's desktop back link (visible at every size here, so no `hidden md:inline-flex`; use `inline-flex`), `mb-5`. It must stay in this file (`verify:ux-pending-states` reads `UserCollectionHero.tsx` and asserts `<BackButton` + `fallbackHref="/saved"`).
- Title row: the `h1` and the rename input use `display-l` today; add `md:text-[40px] md:leading-[1.1]` to both so rename doesn't jump in size. The "N courts in this collection" line becomes 13px stone sentence case (`md:text-[14px]`), no uppercase `eyebrow`. Copy unchanged.
- **`UserCollectionCourtsGrid`:** `grid-cols-1 gap-3 md:grid-cols-2 md:gap-5 lg:grid-cols-3` (replaces `grid-cols-2 … xl:grid-cols-4`; the shared `CourtCard` is sized for 1-up on mobile, TASK_56). Section padding `pt-6 md:pt-8`. Add `imageSizes="(max-width: 768px) 100vw, 33vw"`. Empty state unchanged.

## 4. Settings (`app/profile/settings/page.tsx`, `features/profile/SettingsMenuCard.tsx`)

- Column: `mx-auto max-w-[480px]` (was 680px). Padding `py-section-lg md:py-section-xl`, `min-h-[70vh]` stays.
- **Back control, two instances in the page file** (`verify:ux-pending-states` reads this file and wants `fallbackHref="/profile"`):
  - desktop: `BackButton fallbackHref="/profile" label="Back to Profile"` with the plain-text class string from Court Detail's desktop link, `hidden md:inline-flex`, `mb-5`;
  - mobile: today's `<BackButton fallbackHref="/profile" />` inside the header row, now `md:hidden`. `BackButton`'s `className` **replaces** its default (`className ??`), so copy the default class string from `BackButton.tsx` and append `md:hidden`.
- Heading: the `h1` appears **once**. Mobile `display-m` as today; md+ `md:text-[34px] md:font-normal md:leading-[1.1]`, row `mb-8 md:mb-6`.
- `SettingsMenuCard`: radius `rounded-lg md:rounded-[14px]`; rows `px-4 py-3.5 md:px-5 md:py-4` (`ROW_CLASS`). Dividers, the order (Subscription & access · Account settings · Contact us · Sign out) and every handler stay as they are. Sign-out is ours, not v3's, and stays.
- Footer links: `text-[11px] md:text-[12px]`, `gap-4 md:gap-[18px]`, `mt-4 md:mt-[18px]`, still `underline text-stone`, still `PendingLink`.

## Comments and docs

- Refresh the header comments of every file you restyle (several describe v1/v2 geometry, e.g. `SavedTabs`, `ProfileStats`, `ProfileMembershipCard`, `SavedCollectionRow`, `UserCollectionHero`). Don't leave comments that contradict the code.
- `CLAUDE.md` §5: the User collection detail line becomes `UserCollectionHero`, `fallbackHref="/saved"`, label `Back to Saved`. The Settings line notes the two instances (mobile icon back `md:hidden`, desktop `Back to Profile`), both `fallbackHref="/profile"`. Write both the way the Court detail line is written.

## Do not touch

`CourtCard` and `CourtCardSaveButton`, `SavedWishlistMap`, `EditProfileModal` / `ProfileEditTrigger` / `SettingsAccountRow` behaviour, `CreateCollectionModal`, `UserCollectionRename` behaviour, billing (`ManageBillingButton`, `CheckoutStatusBanner`, Stripe), `/signin` and the other auth screens (TASK_62), the Collections screens (TASK_60), `AppShell` / nav / Footer, the API, contracts, Prisma. `nav-items.ts` already lights Profile for `/saved`.

## Testing

Check on **desktop (1280+)**, **tablet (820)** and **mobile (390 and 360)**, signed in as a free user and as an entitled user, with and without saved courts/folders.

**Profile**
- Mobile: gear circle under the nav pill; avatar + name + Edit; three stats; membership card; "My collections" scrolls horizontally (200×240). Desktop: two columns (320px | rest), 96px avatar stacked above the name, stats under it, membership on the right, then a 2-column grid of up to 4 folder cards (180px).
- Free: the card reads `Choose your membership.` with the small gold `See Membership` that opens the paywall. Entitled: the eyebrow + subhead + `Manage`, which stays visible on hover. Neither shows a price.
- Stats: each cell navigates (`/saved`, `/saved?tab=collections`, `/saved?tab=wishlist`) with the pending state on that cell only. "View all →" opens the Collections tab.
- Stripe return: visit `/profile?checkout=success` (and `cancelled`): the banner is full-width above the columns.
- Edit profile still opens, saves a name, and email stays read-only.

**Saved**
- Mobile: the three chips fit at 390 and 360 exactly as before; sort works; the Dream List card follows the last court. Desktop: title left, chips right, 3-column grid, Dream List as the last cell with no pictures.
- Unbookmarking a court removes its card and updates "N saved"; failure rolls back.
- Collections tab: both sections use the same 150 / 200px tile height. Editorial tiles show a bone bookmark that turns coral when saved and removes the tile when toggled off. Folder tiles open `/saved/collections/{slug}`. New Collection still works.
- My Map tab still renders and focuses (no regression in `verify:map-autofocus`).

**Folder detail**
- The back link works (history back, else `/saved`); rename works and the title doesn't jump in size; courts in a 1 / 2 / 3-column grid; an empty folder shows the empty state; bookmarking a court here still works.

**Settings**
- 480px column on desktop with the plain "Back to Profile" link; mobile keeps the icon back in the header row. Each row works: subscription opens the billing portal (or its existing fallback), Account settings opens the modal, Contact us opens consultation, Sign out signs out. Privacy and Terms links work.

**Everywhere:** no horizontal scroll at the page level at 360px; no `<button>` inside `<a>`; no full-page overlay; Profile tab lit in the nav on all four routes.

**Checks:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `verify:ux-pending-states` (the Settings and folder-detail `BackButton` assertions and the `SavedCollectionRow` `PendingCardLink` assertion must pass), `verify:map-autofocus` (the 4 known pre-existing failures stay as they were). If an API is running, also `verify:web-profile` and `verify:persisted-saved-flow` (they cover the edit-profile and saved paths this screen sits on).

## Report

Files created / changed / deleted. Confirm: `/collections` looks as it did after TASK_60 (the new `CollectionCard` prop defaults off); the Saved tab's tiles match between editorial and folder; the stats are still the three real ones; no price appears in the membership card; the `Manage` hover fix is in; `UserAvatar` was not changed; the CLAUDE.md lines are updated. Say how the three Saved chips look at 360px and at 820px, what the Profile page looks like at 820 (two columns or one), and what you could only verify by reading code. No git commit or push unless asked.
