# TASK 55 — Redesign v3: floating pill navigation, remove the bottom tab bar

**Model: Sonnet 5, reasoning effort: medium.**

Read `docs/REDESIGN_V3_PLAN.md` first. This is the first v3 task.

## Goal

Replace the current site chrome navigation with v3's floating "pill" nav, on mobile and desktop:

- one translucent, blurred, fully-rounded pill, floating at the **top**, centered;
- exactly four text items: **Atlas · Courts · Collections · Profile**;
- no wordmark/logo, no Saved icon, no avatar, no "Unlock Map" CTA, no hamburger;
- the mobile bottom tab bar (`BottomNavigation`) is **removed**.

Reference:

- mobile: `TopTabs` in `new design/redesign v3/tennis_world_v17_standalone.html` (~line 327);
- desktop: `SiteNav` in `new design/redesign v3/tennis_world_desktop_standalone4.html` (~line 254).

## Spec (from the two files)

Pill container (both sizes):

- background `rgba(250,248,243,0.82)` (ivory @ 82%);
- `backdrop-filter: blur(24px) saturate(1.5)` (+ `-webkit-` prefix);
- `border: 1px solid rgba(255,255,255,0.6)`;
- `border-radius: 100px`;
- `padding: 6px`;
- shadow `0 16px 40px rgba(15,15,15,0.14), 0 2px 10px rgba(15,15,15,0.06)`.

Items:

- 13.5px Inter, `color: ink`;
- weight 400, **600 when active**;
- active background `rgba(184,184,182,0.42)` (mist @ 42%), fully rounded;
- `transition: background 150ms`.

| | Mobile (< md) | Desktop (≥ md) |
|---|---|---|
| Position | top 12px, side margin 16px | top 20px, centered (pill only as wide as its items) |
| Layout | items spread across the pill (`justify-between`) | items packed, pill centered |
| Item padding | `9px 14px` | `11px 22px` |

Put the new shadow (and the blurred-ivory background if it helps) into `tailwind.config.ts` /
`globals.css` as named tokens/classes once (e.g. `shadow-nav`, `.nav-pill`), instead of inline
style strings.

## Routing and active state

| Label | href | Active when pathname is |
|---|---|---|
| Atlas | `/` | exactly `/` |
| Courts | `/map` | `/map…` or `/courts/…` (Court Detail lights up Courts, as in v3) |
| Collections | `/collections` | `/collections…` |
| Profile | `/profile` if `signedIn`, else `/signin` | `/profile…`, `/saved…`, `/signin`, `/signup`, `/verify` |

- The route stays `/map`. Only the label is "Courts" (see the plan).
- Saved is no longer in the nav. It stays reachable from Profile: `ProfileStats` and
  `ProfileCollectionsStrip` already link to `/saved`. Confirm that, don't add anything.
- Journal leaves the nav. The Footer already links `/journal`. Leave the Footer as it is.

Rewrite `nav-items.ts` around this:

- one `PRIMARY_NAV` list of four items, plus an "is this item active" matcher that handles the
  extra prefixes above;
- delete `TAB_NAV` (it only existed for the bottom bar and the mobile dropdown);
- update `components/layout/index.ts` exports to match.

Each item navigates, so use `PendingLink` (CLAUDE.md §4 rule 1). A visible spinner must not
change the pill's width:

- either `spinnerPosition="none"` plus a dimmed busy state (e.g. Tailwind's `aria-busy:`
  variant, `aria-busy:opacity-60`),
- or an equivalent that keeps the box fixed.

`aria-current="page"` on the active item; `<nav aria-label="Primary">` on the pill.

## Positioning: keep `fixed` + one shared offset variable

Keep the header `fixed` (as today) rather than switching to `sticky`. That preserves the existing
`overHero` mechanics and the map screen's height math.

- Outer wrapper: `fixed inset-x-0 top-0 z-40`, transparent, `pointer-events-none`.
- The pill itself: `pointer-events-auto`. Clicks outside the pill reach the page underneath.
- Introduce one CSS variable for the space non-hero pages reserve under the nav:
  `--nav-offset: 72px` on mobile and `88px` at md+ (`:root` in `globals.css`).
  Use it for `<main>`'s top padding in `AppShell` (replacing the hard-coded `pt-[72px]`) and for
  `.map-layout`'s `--map-header` (replacing its hard-coded `72px`).
- `overHero` keeps its meaning: "no top padding, the page's first element sits under the
  floating pill". The **visual** over-hero variant goes away: v3's pill is always the same
  translucent ivory. Delete the transparent/light-text state, the scroll listener, `navOver`,
  and `btn-over-image` usage in the header.

## Remove the bottom tab bar, and everything that offsets for it

- Delete `components/layout/BottomNavigation.tsx`, its export, and its render in `AppShell`.
- `AppShell` `<main>`: drop `pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0`.
- `globals.css` `.map-layout`: remove the `--map-bottom-nav` term from the height `calc` and the
  `--map-bottom-nav: 0px` md override. Update the comment above it.
- `features/court-detail/CourtDetailShell.tsx` (~line 199): the sticky action bar uses
  `bottom-[calc(56px+env(safe-area-inset-bottom))] … md:bottom-0`. Make it `bottom-0` at all
  sizes, with `pb-[env(safe-area-inset-bottom)]` (or equivalent) so it still clears the iOS home
  indicator. Fix the comment there that mentions the tab bar.
- `features/map/MapCourtPreview.tsx` (~line 213): same change. The preview sheet docks at
  `bottom-0` plus safe-area padding.
- Grep for any other `56px` / `safe-area-inset-bottom` / "tab bar" / "BottomNavigation" leftovers
  in `apps/web/src` and fix them. The comment in `app/saved/page.tsx` line ~17 mentions the
  bottom-nav "Saved" tab; update it.

## Props cleanup (`AppShell` / `AppHeader`)

v3's nav has no Unlock CTA and no avatar, so:

- **Remove `unlocked`** from `AppShellProps` / `AppHeaderProps`, and drop it from every
  `<AppShell …>` call site. There are 15 under `apps/web/src/app`; TypeScript will list them.
  Where a page computed `viewerIsEntitled` **only** to feed that prop (e.g. `about`, `privacy`,
  `terms`, `journal`, `journal/[slug]`), remove the now-unused value. Where `signedIn` is still
  needed, keep `getViewerAuthState()` or switch back to `isSignedIn()` (same cost). Pages that use
  `viewerIsEntitled` for real content (map, collections, saved, Home, Court Detail, etc.) keep it.
- **Remove `headerUser`** from both prop interfaces and from `profile/page.tsx` and
  `profile/settings/page.tsx`. If removing it leaves an unused import/value on those pages, clean
  it up. If `UserAvatar` is still used elsewhere, leave the component alone.
- **Keep `signedIn`.** It decides the Profile item's href (`/profile` vs `/signin`).

Rename `AppHeader` only if it makes things clearer (e.g. `SiteNav`). Either name is fine; update
imports consistently.

Rewrite the header comments in `AppShell.tsx` / `AppHeader.tsx` / `nav-items.ts`. They currently
describe the wordmark, the transparent-over-hero header, the hamburger, the Unlock CTA and the
bottom tab bar. All of that is gone. Say briefly what v3 does and why (float, don't dock; see the
design-decisions doc).

## Do not touch

- The Footer (contents and styling). It is the remaining route to Journal / About / Privacy /
  Terms.
- Page content and layouts. Home, Courts/Map, Court Detail etc. get their own v3 tasks. They may
  look slightly off under the new nav until then. Only fix what this task breaks:
  - content hidden under the pill;
  - a sticky bar floating 56px above the bottom.
- Auth pages (`/signin`, `/signup`, `/verify`). They don't render `AppShell` today; leave them.
- Any billing/paywall component. The header CTA is removed, but `PaywallTrigger` and the
  paywall modal stay as they are everywhere else.

## Testing

**Mobile (~390px):**

- The pill sits 12px from the top, 16px from each side, with four evenly spread items.
- No bottom tab bar anywhere.
- No content hidden under the pill on any non-hero page: `/map`, `/collections`, a collection,
  `/saved`, `/profile`, `/journal`, `/about`.

**Desktop (≥768px):** the pill is centered, 20px from the top, sized to its items.

**Active state:**

| Page | Active item |
|---|---|
| `/` | Atlas |
| `/map`, `/courts/<slug>` | Courts |
| `/collections`, `/collections/<slug>` | Collections |
| `/profile`, `/profile/settings`, `/saved`, `/saved/collections/<slug>` | Profile |

**Profile link:** signed-out it goes to `/signin`; signed-in it goes to `/profile`.

**Other checks:**

- Court Detail's sticky action bar and the Map's mobile pin preview sit at the very bottom
  (above the safe area), not floating 56px up.
- The map screen's canvas/list fill the viewport exactly: no gap and no double scrollbar under
  the new nav.
- The page scrolls under the pill and the blur is visible over images.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

List every file changed or deleted. Confirm:

- `TAB_NAV`, `BottomNavigation`, `unlocked` and `headerUser` are gone;
- every 56px tab-bar offset was removed.

Note any page that looks visibly wrong under the new nav and is waiting for its own v3 task.
No git commit or push unless asked.
