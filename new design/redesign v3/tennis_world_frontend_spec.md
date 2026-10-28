# Tennis World — Frontend Handoff Spec

Source files: `tennis_world_v2.html` (mobile) and `tennis_world_desktop.html` (desktop) — both self-contained React 18 + Babel-in-browser single-file prototypes, no build step. Live previews:

- Mobile: https://claude.ai/artifact/9tipx4EXNTzfk997JmKNsG
- Desktop: https://claude.ai/artifact/Cre9yaVXTLEfxAYQumMFAr
- Design system (tokens + component reference, for a designer): https://claude.ai/artifact/N3m3p9T6PYEfSnTkjT5rgT

These HTML files are build-ready reference, not production code — every value in them (colors, sizes, copy, logic) is final; the JSX/inline-style authoring style is not meant to be shipped as-is. Treat them as the single source of truth for what to build; this document is the index into them.

## 1. Design tokens

### Color

| Token | Value | Usage |
|---|---|---|
| ink | `#0F0F0F` | Primary text, headings, active nav/chip fills |
| graphite | `#2A2A2A` | Secondary text, experience-chip text |
| stone | `#6B6B6B` | Tertiary text, captions, subdued CTAs |
| mist | `#B8B8B6` | Dividers, sheet handle, inactive pagination dot |
| bone | `#F5F2EC` | App background tint, text-on-dark |
| ivory | `#FAF8F3` | Nav-pill fill base (used translucent) |
| paper | `#FFFFFF` | Card surfaces, search bar, filter-chip resting fill |
| clay | `#B95C3A` | Reserved accent — not yet used in shipped UI |
| moss | `#4A5D3F` | Reserved accent — not yet used in shipped UI |
| gold | `#B89968` | Premium badge, star rating |
| page-bg | `#E8E4DC` | Background behind the device frame (mobile/desktop demo chrome only — not part of the app surface itself) |
| star-filled | `#C9963C` | Filled star icon |

Surface/access/experience chip colors (background / text / border triplets): Clay `#F0E6E0`/`#8B3A1F`/`#D4A090`, Hard `#E0E8F0`/`#1A4A70`/`#90B0C8`, Grass `#E4EDE0`/`#2A5020`/`#90B878`, Carpet `#EDE8E0`/`#504030`/`#B0A888`, Private `#F5F0E8`/`#6B4A20`/`#C8A878`, Open `#E8F5E8`/`#2A5020`/`#78B878`, Experience `rgba(15,15,15,0.06)` bg / graphite text (no border).

### Typography

Two Google Fonts: **Cormorant Garamond** (serif/display) and **Inter** (sans/body). Full `@import`/`<link>` is in both files' `<head>`.

| Style | Family | Size / Line-height | Weight | Letter-spacing |
|---|---|---|---|---|
| display-xl | serif | 44 / 48 | 300 | -0.02em |
| display-l | serif | 32 / 38 | 300 | -0.02em |
| display-m | serif | 24 / 30 | 400 | -0.01em |
| headline | sans | 20 / 26 | 500 | — |
| body-l | sans | 17 / 26 | 400 | — |
| body-m | sans | 15 / 22 | 400 | — |
| body-s | sans | 13 / 20 | 400 | — |
| caption | sans | 11 / 16 | 500 | 0.08em, uppercase |
| nav-label (mobile) | sans | 9.5 / 12 | 500 | 0.02em |

### Spacing

4px-rooted scale: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Mobile screens default to 16–20px side padding; desktop screens use 40px side padding with a 1240px max content width.

### Radius

Buttons/inputs 4px · thumbnails/icon buttons 8px · court card (mobile) 12px · court card (desktop) 14px · bottom sheet top corners 20px · filters modal 24px · desktop hero card 32px · pills (nav, search, chips, pill buttons) fully round (999px).

### Shadow

Card resting `0 1px 4px rgba(15,15,15,0.08)` · search `0 2px 12px rgba(15,15,15,0.1)` · floating nav `0 16px 40px rgba(15,15,15,0.18), 0 2px 10px rgba(15,15,15,0.08)` · bottom sheet `0 -4px 40px rgba(15,15,15,0.15)` · modal `0 40px 100px rgba(0,0,0,0.3)` · desktop hero `0 24px 64px rgba(15,15,15,0.18)`.

## 2. Component inventory

Full visual reference with live previews is in the design-system artifact linked above. Summary:

- **CourtCard** — the one reusable card used on every court-listing surface (Courts/Map list, Saved, inside a Collection) on both platforms. Props: `court`, `onClick`, `locked`, `saved`, `onToggleSave`, `saveDisabled`. Mobile height ≈230px / desktop ≈340px, otherwise identical markup. Locked state swaps the name/chip block for a frosted `LockOverlay`.
- **PillNav** — floating translucent pill, `blur(24px) saturate(1.5)`, `ivory` @82%, 1px white-ish border, pill radius, nav shadow. Mobile: bottom-sticky, 4 icon+label items (Home/Map/Saved/Profile). Desktop: top-sticky, centered, 4 text-only items (Atlas/Courts/Collections/Profile), **no logo, no sign-in button**.
- **Buttons** — primary (ink/bone), secondary (outline), gold (premium CTA), `btn-pill` modifier, `btn-sm` modifier. 52px default height, 4px radius, uppercase 13px/0.1em label.
- **Chips** — surface (Clay/Hard/Grass/Carpet), access (Private/Open), experience (neutral catch-all), and interactive filter chip (resting/active) used inside the Filters modal.
- **SearchBar** — 48px pill, `paper` background, inline filter-toggle button on the trailing edge (the filter control lives inside the bar, not beside it).
- **LockOverlay** — frosted gate (`blur(16px)` over bone@70%) shown over any locked card/section instead of hiding it; paired with the gold-gradient **premium badge**.
- **Filters modal** — centered overlay, categorized into Experience / Surface / Access / Setting sections (see `FILTER_GROUPS` in the desktop source for the exact option lists), "Clear all" + close in the header, full-width "Show Results" primary button at the bottom.

## 3. Screen map

Both platforms share the same screen set and the same underlying logic; only layout changes (single column vs. multi-column/grid, bottom nav vs. top nav).

| Screen | Mobile component | Desktop component | Notes |
|---|---|---|---|
| Home | `HomeScreen` | `HomeScreen` | Hero court carousel + membership upsell section. Desktop hero is a large floating, rounded, **inset** card over the page background (not edge-to-edge) — centered title + place-pill/dots pagination, no CTA button or arrows on the hero itself. |
| Courts / Map | `MapScreen` | `CourtsScreen` | Heading shows court count (or "Sign in to view the map" for guests). Subtitle CTA varies by access state. Search bar + inline filter toggle → Filters modal. Desktop adds a sticky map panel alongside the list; mobile is map-first with a bottom sheet list. |
| Court Detail | `CourtDetailScreen` | `CourtDetailScreen` | Gallery, description, feature list, address. Locked state shows teaser + "Unlock access — $29" → routes through the paywall-fail flow. |
| Collections | `CollectionsScreen` | `CollectionsScreen` | Grid/list of curated collections. |
| Collection Detail | `CollectionDetailScreen` | `CollectionDetailScreen` | Uses `CourtCard` for its member courts. |
| Saved | `SavedScreen` | `SavedScreen` | Guests see a sign-in prompt instead of a list. |
| Profile | `ProfileScreen` | `ProfileScreen` | Access-state-aware: guest (sign-in prompt), free (account info + "Unlock Full Access"), full (account + settings). |
| Settings | `SettingsScreen` | `SettingsScreen` | Simple rows; unlock-gated items shown per `unlocked`. |
| Auth gate | — | `AuthGateScreen` | Desktop-only standalone sign-in screen (Apple/Google buttons); mobile handles sign-in inline on Profile. |
| Purchase success | `PurchaseSuccessScreen` | `PurchaseSuccessScreen` | Only reachable via `PurchaseFailedScreen`'s "Try again". |
| Purchase failed | `PurchaseFailedScreen` | `PurchaseFailedScreen` | The real destination of every "unlock" CTA in the product (see §4). |

## 4. Access-state / gating rules

A single `accessState` value drives the whole product: `'guest' | 'free' | 'full'`.

```
unlocked = accessState === 'full'
isGuest  = accessState === 'guest'
```

- **Guest:** can browse court/collection cards, cannot see the map, saved list, or full court detail (shown locked/teased). Any gated CTA routes to the sign-in surface (`onNav('profile')` on mobile's Map subtitle / desktop's Courts subtitle — not straight to the paywall).
- **Free:** signed in, still not unlocked. Locked courts/map/features stay gated behind `LockOverlay`. Gated CTAs now route to the paywall flow, not sign-in.
- **Full:** `unlocked = true` everywhere; no lock overlays, no gating CTAs render.

**Every unlock action routes through a "failed" demo step first**, by design (not a bug — see the design-decisions doc): any `onPaywall` / `onUnlock` call sets screen to `paywall-fail` (`PurchaseFailedScreen`). Only that screen's "Try again" button actually calls `handleUnlock`, which sets `accessState = 'full'` and shows `PurchaseSuccessScreen`. In a real build this is where the actual payment attempt and its real failure/success branches would plug in.

`isLocked = court.locked && !unlocked` is the pattern used everywhere a court/collection needs its individual lock state (a court can be `locked:false` in data and still render unlocked content even for a free user, if it's one of the free-sample courts).

## 5. Navigation map

Two kinds of navigation coexist in the source files — don't port the first kind:

- **Demo screen-tabs** (top of `App()`, outside the device frame) — a flat list of buttons to jump straight to any screen for design review. This is scaffolding for this prototyping process only; it has no equivalent in the real product.
- **Real in-app navigation** — `onNav(screen)` for tab-level moves, `onCourtOpen(court)` / `onCollectionOpen(collection)` to drill into detail (these also record `prevScreen`), and `onBack()` which returns to `prevScreen` (falling back to `home`). The nav/tab's active state is derived, not stored separately — e.g. being on Court Detail highlights "Courts", being on Saved/Profile/Settings highlights "Profile".

## 6. Data model

```ts
type Court = {
  id: string; name: string; location: string;
  surface: 'Clay' | 'Hard' | 'Grass' | 'Carpet';
  labels: string[];           // e.g. 'Sea View','Beach Club','Resort','Scenic','Private','Historic','Mountains'
  rating: number; reviews: number;
  img: string; imgs: string[]; // hero image + gallery
  locked: boolean;
  desc: string; features: string[]; address: string;
}

type Collection = {
  id: string; name: string; sub: string; courts: number; img: string;
  desc: string; courtIds: string[];
}

type Country = {
  name: string; courts: number; img: string;
}
```

Seven sample courts, six collections, six countries are hardcoded in both files (`COURTS`, `COLLECTIONS`, `COUNTRIES`) — identical data in both prototypes.

## 7. What's real vs. mocked (do not port as-is)

- **All imagery is Unsplash placeholder** — `U(id)` helper builds a `images.unsplash.com` URL. Needs real licensed photography per court/collection/country before ship.
- **The 3-button access-state switcher** in the demo chrome is prototype-only scaffolding; it stands in for real auth + payment state and should not exist in production.
- **Saved/favorite state is in-memory** (`useState<Set>`) — resets on reload, no persistence.
- **The purchase-failed→success flow is a scripted demo**, not a real payment integration — see §4.
- **Profile's "Edit profile" button exists but isn't wired** on either platform currently — flagged, not yet decided whether it should be a modal (mobile had draft markup for photo/name/email at one point) or a separate screen.
- **Some newer filter options** added for the Filters-modal redesign (Lakeside, Garden, Jungle, Island, Rooftop, Countryside, Club, Academy, Indoor, Outdoor) **aren't yet present in any court's `labels`** — they're selectable but currently return zero results. Needs either data backfill or trimming the option list.
