# Feature 21 — Profile Page Layout Note

**Status:** Planning only — **no implementation in this feature.** This note translates the
`profile.html` prototype, the established luxury design language in `apps/web`, the current repository
architecture, and the Phase-1 mock-first constraints into a concrete, reviewable layout for the
`/profile` screen before any code is written. It is the Profile-screen analogue of
`docs/FEATURE_11_COURT_DETAIL_LAYOUT.md`, `docs/FEATURE_13_MAP_PAGE_LAYOUT.md`, and
`docs/FEATURE_19_SAVED_PAGE_LAYOUT.md`.

**Reference sources:**

1. `files/profile.html` — the `ProfilePage` component (lines ~757–822) plus its `App` wiring
   (`unlocked`, `savedSet`, `onPaywall`, `onConsult`). This is the direct visual baseline — Profile,
   like Saved, *does* have a dedicated prototype.
2. The luxury design language already in `apps/web`: serif display type, `eyebrow` captions, the
   `AppShell` / `AppHeader` / `BottomNavigation` chrome, `Badge` (which already ships a `gold` tone
   explicitly described as "the gold 'LIFETIME MEMBER' membership badge (Profile)"), `Button`
   (including the `premium`/gold variant reserved for the paywall), `SectionHeader`, and the dark-on-
   ink membership card treatment shared with Court Detail / the Paywall.
3. Phase-1 mock-first discipline — `docs/PHASE_1_WEB_MOCK_FIRST.md` §3.10, §4; Architecture Plan §5,
   §9 Risk #7 (the mock user returns a User-*shaped* object, not a flat boolean) and Decision #11
   (auth/payments are Phase 4, not now).

**The screen this note plans:** `apps/web/src/app/profile/page.tsx` — the last missing Phase-1 screen
(Feature 20 / Saved is complete; the seven other routes — `/`, `/map`, `/courts/[slug]`,
`/collections`, `/collections/[slug]`, `/journal`, `/journal/[slug]`, `/saved` — all exist). Two live
nav targets already point at `/profile` and currently **404**: the desktop `AppHeader` user icon
(`<Link href="/profile">`) and the mobile `BottomNavigation` "Profile" tab (`TAB_NAV` → `/profile`).
This screen makes them land somewhere.

---

## 1. What already exists (the good news — Profile is mostly plumbed)

Unlike Saved (Feature 19), which had to introduce a brand-new repository boundary, **most of Profile's
data plumbing already exists** thanks to Saved:

- `@tennis/contracts` already ships `UserProfileDTO` (`{ id, name, initials, membership }`) and
  `MembershipStatus` (`'free' | 'lifetime'`) — the exact User-shaped stub Profile's header needs.
- `@tennis/mock-data` already ships `DEFAULT_MOCK_USER` (`Eleanor Morgan` / `EM` / `membership:'free'`,
  ported from `profile.html`), plus `DEFAULT_SAVED_COURT_SLUGS` and `DEFAULT_USER_COLLECTIONS` — the
  raw material the stats row needs.
- `apps/web/src/domain/saved/` already exposes a read-only `SavedRepository`
  (`getSavedCourts()` → `CourtSummaryDTO[]`, `getSavedCollections()` → `UserCollectionDTO[]`), wired on
  the factory, that the stats row can reuse directly.
- `@tennis/mock-data`'s `PAYWALL_COPY` already centralizes the `$29` price + membership benefit copy as
  data (used by the membership/unlock card).
- `Badge` (`gold` tone) and `Button` (`premium` gold variant) already exist and are documented as
  Profile-membership affordances.
- `apps/web/src/domain/profile/` exists as a `.gitkeep` placeholder.

**The one genuinely missing piece:** a sanctioned boundary to read the *current user profile*
(name/initials/membership) — i.e. `getCurrentUser(): Promise<UserProfileDTO>`. Today no repository on
the factory returns the user object; `SavedRepository` returns saved *items*, not the user. See §4 for
how to source it minimally.

---

## 2. Route, data fetching, and the server/client split

- **Route:** `apps/web/src/app/profile/page.tsx` — a static App Router segment (no dynamic param),
  exactly like `app/collections/page.tsx`, `app/journal/page.tsx`, and `app/saved/page.tsx`.
- **Recommendation: a thin `async` server component, with NO client component at all (or one tiny
  client island only if a modal is wired).** Profile is the *least* interactive Phase-1 screen:

  | Page | Why it needed a client boundary |
  |---|---|
  | Map | filter state, pin selection |
  | Saved | `activeTab` switch (`useState`) |
  | **Profile** | **nothing stateful in Phase 1** |

  The prototype's only interactivity is opening the paywall/consultation **modals** (`onPaywall`,
  `onConsult`). In Phase 1 **neither modal is built yet** (the paywall modal is Phase-1 §3.6 but is a
  separate cross-screen feature; the consultation modal is §3.7, also separate). So Profile's
  membership/consultation CTAs are **stub links/placeholders** (see §3, §4). With no real modal and no
  tab state, the page has **zero** client-only behavior → keep it a pure server component, the simplest
  split of any screen so far.

  > **Why not split anyway "to be safe"?** Over-clienting is an explicit Phase-1 risk (§9). There is no
  > state to own. If a later feature wires the real paywall/consultation modals, the menu rows that
  > trigger them become a small `'use client'` island *then* — not pre-emptively now.

### 2.1 Server page (`app/profile/page.tsx`) — the only repository boundary
- A normal `async` server component, like the other list pages.
- It is the **only** place that touches `repositories` (data-driven discipline, Phase 1 §4). It
  fetches everything the page needs **once**, up front, and passes plain DTOs/numbers down as props:
  - **Current user** (name, initials, membership) — via the user/profile repository (§4).
  - **Stats** (saved courts / collections / countries) — derived server-side from the existing
    `repositories.saved.getSavedCourts()` + `getSavedCollections()` (see §3.2 / §4). The page computes
    the three counts and passes plain numbers down; components never recompute or re-fetch.
- Wraps the presentational components in `AppShell unlocked={…}` (see §7) and passes props in.

```ts
// Shape only — NOT to be implemented in this feature.
export default async function ProfilePage() {
  const [user, savedCourts, savedCollections] = await Promise.all([
    repositories.user.getCurrentUser(),          // UserProfileDTO   (new — see §4)
    repositories.saved.getSavedCourts(),         // CourtSummaryDTO[]
    repositories.saved.getSavedCollections(),    // UserCollectionDTO[]
  ]);
  const stats = computeProfileStats(savedCourts, savedCollections); // server-side, in page
  const unlocked = user.membership === 'lifetime';
  return (
    <AppShell unlocked={unlocked}>
      {/* ProfileHeader, ProfileStats, ProfileMembershipCard, ProfileMenuList … (props only) */}
    </AppShell>
  );
}
```
*(Method/repository names are indicative — the implementation feature picks the exact surface per §4.
The point is: the page fetches and derives; components receive props.)*

---

## 3. Sections (ported from `profile.html`, top to bottom)

The prototype's `ProfilePage` is a single narrow column (`maxWidth: 680`) of stacked sections divided
by hairlines. Port that structure 1:1; it maps cleanly onto the existing design language.

### 3.1 User header / avatar / name / membership status
- **Avatar:** a circular `80px` ink chip with the user's **initials** in serif (`EM`), per the
  prototype — *not* a photo. (`UserProfileDTO.initials` already exists for exactly this; no image
  field, and none should be added in Phase 1.)
- **Name:** `display-m` serif (`Eleanor Morgan`), from `UserProfileDTO.name`.
- **Membership status line:** branches on `membership`:
  - `lifetime` → the gold **`Badge` tone="gold"`** "Lifetime Member" (the badge component literally
    documents this as its Profile use case).
  - `free` → an `eyebrow` "Explorer · Free" in `stone`.
- Bottom hairline divider (`border-hairline`), matching the prototype.

### 3.2 Stats row
- Three centered stat cells in a `grid-cols-3`: **Saved Courts · Collections · Countries** (prototype
  shows `12 / 3 / 8`), each a `display-m` number over an `eyebrow` label, with a hairline below.
- **Data-driven, NOT hardcoded** (Phase 1 §3.10 is explicit: stats are "computed from the same mock
  user-state repositories, not separately hardcoded numbers"). Derive server-side in the page:
  - **Saved Courts** = `savedCourts.length`.
  - **Collections** = `savedCollections.length` (the user's wishlist folders).
  - **Countries** = distinct `country` count across `savedCourts` (`new Set(savedCourts.map(c => c.country)).size`).
  - The prototype's literal `12 / 3 / 8` are display-only mock figures to discard — derive from the
    real (mock) saved data so the numbers stay internally consistent and the Phase-2 swap is a data
    change, not a JSX edit.

### 3.3 Membership / unlock card
- **Only shown when `!unlocked`** (prototype gates it on `!unlocked`). A dark `bg-ink` card with a gold
  `eyebrow` "Membership", a `display-m` headline, and a gold CTA ("See Membership"). Same dark-on-ink
  treatment as Court Detail's locked membership panel and the Paywall hero.
- **Copy + price come from `PAYWALL_COPY`** in `@tennis/mock-data` (the `$29` lives there as data —
  never inline a price string in JSX). Use the `premium`/`gold` `Button` variant (reserved for paywall
  affordances).
- **CTA behavior in Phase 1:** a **stub** — `href="#"` placeholder or disabled, with a code comment
  noting the real paywall modal is a separate feature (Phase 1 §3.6). It must **not** trigger a fake
  unlock, a checkout, or any payment flow. (See §9 — payment scope creep.)

### 3.4 Menu / settings rows
- A vertical list of hairline-divided rows (prototype: `height 56`, label on the left, optional value
  + chevron on the right). Ported rows, in order:
  - **Subscription & Purchases** → would open the paywall (stub in Phase 1).
  - **Contact Concierge** → would open the consultation modal (stub in Phase 1).
  - **Notifications** → inert row (no settings backend).
  - **Language** — `English` (a row with a right-aligned *value*, not just a chevron).
  - **Help & Support** → inert / `href="#"`.
  - **Privacy** → inert / `href="#"` (or link to a future static page).
  - **Terms** → inert / `href="#"` (or link to a future static page).
- Rows are **presentational, prop-fed** — the row label/value list is local page chrome (same latitude
  `MapFilterBar`/`HomePaywallBand` take for local copy), but must **not** import `@tennis/mock-data`.
- Every row's action is a **no-op / placeholder** in Phase 1 (no settings persistence, no real
  navigation targets that don't exist). Render for parity; wire to nothing or to a clearly-commented
  `href="#"`.

### 3.5 Consultation / help CTA
- The prototype routes **"Contact Concierge"** to `onConsult` (the consultation modal). The consultation
  modal is **not built in Phase 1** (Phase 1 §3.7 is a separate cross-screen feature). Render the row
  for parity as a **stub** (inert / `href="#"` with a comment), exactly as Saved's "Plan a Trip" CTA was
  stubbed. Do **not** build the consultation form here.

### 3.6 Logout placeholder
- The prototype renders a final **"Sign Out"** row in clay (`#B95C3A`), no chevron.
- **There is no auth in Phase 1, so there is no real logout.** Render the row for visual parity as a
  **labeled stub** — a `button` that does nothing (or is disabled), with a code comment:
  `// Phase 1: no auth, no session — Sign Out is a visual placeholder (Phase 4).`
- It must **not** clear any state, hit any endpoint, or pretend to log anyone out (there is no one
  logged in). See §9 — logout/account-deletion scope creep.

### 3.7 Footer
- The prototype includes the shared `Footer` at the bottom of the Profile screen. In `apps/web` the
  footer is part of the page composition where used — render the existing footer pattern consistent
  with the other screens (or omit if Profile is treated as a chrome-only utility screen; decide in
  implementation to match the other list pages). Not a new component.

---

## 4. Sourcing mock profile data in Phase 1 — recommended approach

Profile needs two things: (a) the **current user** object, and (b) **saved counts** for the stats row.
(b) is already solved — reuse the existing `SavedRepository`. Only (a) needs a new method.

**Recommendation: add a minimal, read-only `getCurrentUser()` to a `user` (profile) repository on the
factory, backed by `@tennis/mock-data`'s `DEFAULT_MOCK_USER`.**

Two viable placements — **decide in the implementation feature**, but the recommendation is the first:

1. **(Recommended) A new `user` domain slice** at `apps/web/src/domain/user/` (the `domain/profile/`
   `.gitkeep` could also host it; `user/` is the better long-term name since Phase 4's real
   `UserRepository` — saved courts, entitlements, account — is a *user* concern, and Phase 1 §1.1
   already names a `user.repository.ts`):
   - `user.repository.ts` — the **interface**: `getCurrentUser(): Promise<UserProfileDTO>` (read-only).
   - `mock-user.repository.ts` — returns a copy of `DEFAULT_MOCK_USER`. Plain TS, no React/Next,
     independently testable — same pattern as the other `mock-*.repository.ts` files.
   - `index.ts` — barrel re-exporting interface + mock (mirrors `domain/saved/index.ts`).
   - Wire into `apps/web/src/domain/index.ts`: add `user: UserRepository` to `Repositories` and
     `user: new MockUserRepository()` to the `'mock'` branch.

2. **(Alternative) Add `getCurrentUser()` to the existing `SavedRepository`** — fewer files, but
   muddies a repository whose name says "saved items," and is the wrong home for the Phase-4 user/auth
   surface. Prefer option 1 unless the team wants to minimize new files for one method.

**Minimal interface surface (read-only for Phase 1):**

| Method | Returns | Notes |
|---|---|---|
| `getCurrentUser()` | `Promise<UserProfileDTO>` | Returns `DEFAULT_MOCK_USER` (copy). Feeds the header + the `unlocked` derivation (`membership === 'lifetime'`). |

Stats reuse the **existing** `repositories.saved.getSavedCourts()` / `getSavedCollections()` — **no new
method needed** for counts. The page derives the three numbers; the repository surface stays tiny.

**`getEntitlementStatus` is NOT needed.** Profile derives `unlocked` from
`UserProfileDTO.membership === 'lifetime'` (the User-shaped stub, Risk #7). Phase 1 §1.1 sketches a
richer `getEntitlementStatus()` but that is Phase-4-shaped; Profile doesn't gate any content on it, so
do not add it here. (`DEFAULT_MOCK_USER.membership` is `'free'`, so the page renders the free/unlock
variant by default — exactly the prototype's default state.)

**Why a repository and not just import mock-data in the page?** The ESLint import-boundary rule
(`apps/web/.eslintrc.json`) blocks `@tennis/mock-data` and `mock-*.repository` imports outside the
domain folder + `lib/repositories.ts`. Routing the current user through a repository is what makes the
Phase-4 swap to a real auth-backed `UserRepository` a wiring change, not a page rewrite (Risk #7).

**Explicitly rejected alternatives:**
- ❌ **Importing `@tennis/mock-data` directly in the page/components** — violates the boundary rule and
  data-driven discipline; defeats the Phase-4 swap.
- ❌ **Hardcoding name/initials/stats in JSX** — Phase 1 §3.10 + §4 forbid it; the prototype's literal
  `12 / 3 / 8` and `EM` must come from data.
- ❌ **`localStorage` / a client user store** — not needed for a read-only view; forbidden by the hard
  rules. There is no mutation on this screen.
- ❌ **An `EntitlementService` / real entitlement lookup** — Phase 4 (Decision #12). `membership` on the
  stub DTO is sufficient.

---

## 5. Mobile behavior

- **Single narrow centered column** at all breakpoints (prototype `maxWidth: 680`). Profile is a
  reading/utility screen, not a grid — the same column on phone and desktop, just more side gutter on
  larger screens. No layout reflow between breakpoints (unlike Map/Saved).
- **Header row** (avatar + name/badge) stays a horizontal `flex` with the `80px` avatar; comfortable on
  the narrowest screens.
- **Stats** stay `grid-cols-3` even on mobile (three short numbers fit; the prototype keeps three
  across on phones).
- **Menu rows** are full-width tap targets (≥56px tall, satisfying touch-target sizing).
- **Tab-bar clearance:** `AppShell` already adds bottom padding for `BottomNavigation` (~56px + safe
  area) — no extra handling. The mobile "Profile" tab lights up via `isActiveRoute('/profile', …)` with
  no nav-config change.

## 6. Desktop behavior

- The same single centered column (`max-w-[680px] mx-auto`) inside `PageContainer` / `AppShell` — it
  does **not** widen into a multi-column dashboard. The luxury language favors a calm, narrow reading
  measure here; don't invent a sidebar/grid the prototype doesn't have.
- The desktop `AppHeader` user icon already targets `/profile`; this page makes it resolve. The "Unlock
  Map" CTA in the header is driven by the same `unlocked` value the page derives (consistent with the
  membership card showing/hiding).
- Standard solid header + `pt-[72px]` offset — **not** `overHero` (Profile has no full-bleed hero).

---

## 7. App-shell integration

- Render inside **`AppShell`** like every other screen. **Not `overHero`** — Profile has no hero; it
  uses the standard solid header + `pt-[72px]` content offset (same as Collections / Journal / Saved /
  Court Detail).
- **`unlocked` is derived from the mock user** (`user.membership === 'lifetime'`), not a hardcoded
  `false`. This is a small but meaningful improvement over the other pages (which pass a hardcoded
  stand-in): Profile actually *has* the user object, so it can pass a real (mock-derived) value. With
  `DEFAULT_MOCK_USER.membership === 'free'`, this resolves to `false` today — the header shows "Unlock
  Map" and the membership card shows — matching the prototype default. (If a reviewer flips the mock
  user to `lifetime`, both the header CTA and the membership card react consistently — a good
  data-driven sanity check.)
- The desktop user icon and mobile "Profile" tab already target `/profile` (`AppHeader` /
  `TAB_NAV`) — no nav-config change needed; this page just makes them resolve.

---

## 8. Presentational components vs. page-level data fetching

**Page-level (server, `app/profile/page.tsx`):** the **only** repository boundary — reads the current
user (§4) + saved courts/collections (existing `SavedRepository`), derives the three stat counts and
`unlocked`, wraps in `AppShell`, and hands plain props (a `UserProfileDTO`, three numbers, the derived
`unlocked`) to presentational components. No data logic lives in components.

**Presentational components (no state, props only):** `ProfileHeader`, `ProfileStats`,
`ProfileMembershipCard`, `ProfileMenuList` / `ProfileMenuRow`, optional `ProfileCtaCard` — each receives
its props and renders. None fetch; none import `@tennis/mock-data`; none own state. (No client boundary
needed at all in Phase 1 — see §2.)

**Boundary rules carry over unchanged:** only the page imports `repositories`; no UI/feature component
imports `@tennis/mock-data`; new components take data via props. Keep new pieces **feature-local** under
`apps/web/src/features/profile/` (mirroring `features/saved`, `features/map`, etc.).

---

## 9. Minimal component breakdown (identify only — DO NOT create now)

Likely feature-local components (`apps/web/src/features/profile/`), built in the *implementation*
feature, not here:

| Component | Kind | Responsibility |
|---|---|---|
| `ProfileHeader` | presentational | Avatar (initials chip) + serif name + membership status (`Badge tone="gold"` for lifetime, `eyebrow` "Explorer · Free" for free). Props: `UserProfileDTO`. |
| `ProfileStats` | presentational | The `grid-cols-3` stat row (Saved Courts / Collections / Countries). Props: three numbers (derived in the page). |
| `ProfileMembershipCard` | presentational | Dark `bg-ink` unlock card, gold eyebrow + headline + gold CTA; rendered only when `!unlocked`. Copy/price from `PAYWALL_COPY`. CTA is a **stub**. |
| `ProfileMenuList` | presentational | Renders the ordered list of `ProfileMenuRow`s + the clay "Sign Out" stub row. Holds the local row config (label/value/inert action). |
| `ProfileMenuRow` | presentational | One settings row: label (+ optional right-aligned value) + chevron; a tap target wired to a no-op / `href="#"` in Phase 1. |
| `ProfileCtaCard` | presentational *(optional)* | Only if the consultation/"Contact Concierge" affordance is broken out of the menu into its own card. May be **omitted** — the prototype keeps "Contact Concierge" as a menu row, so this is likely unnecessary. Listed per the prompt; recommend folding into `ProfileMenuList` unless the design calls for a distinct card. |

`ProfileMenuRow` may be inlined into `ProfileMenuList` if trivial — avoid premature splitting (same
latitude the Saved note gave `SavedCollectionRow`).

**Also required (not a component):** the read-only `user`/profile repository + factory wiring (§4) — a
domain change, sequenced before/with the page, not a UI component. **No contracts change is needed**
(`UserProfileDTO` already exists), which is a notable difference from the Saved note (which had to add
`UserCollectionDTO`).

---

## 10. Data availability vs. missing fields

### Available now (sufficient to build the whole page)
- `UserProfileDTO` (`id, name, initials, membership`) + `DEFAULT_MOCK_USER` — header + `unlocked`.
- `SavedRepository.getSavedCourts()` / `getSavedCollections()` (already on the factory) — stats.
- `CourtSummaryDTO.country` on each saved court — the distinct-country count for the stats row.
- `PAYWALL_COPY` (`@tennis/mock-data`) — membership card copy + `$29` price as data.
- `Badge` (`gold`), `Button` (`premium`/gold + `primary`/`secondary`), `SectionHeader` — chrome.

### Missing-but-addressable (do **not** resolve in this layout note)
| Gap | Where it bites | Resolution (in the *implementation* feature, sequenced separately) |
|---|---|---|
| No `getCurrentUser()` on the factory | Profile header + `unlocked` | Add a minimal read-only `user` repository + factory wiring (§4). This is the one prerequisite step. **No contracts change** — `UserProfileDTO` already exists. |
| No paywall modal yet | Membership card / "Subscription" CTA | Render an inert/stub CTA for parity; the modal is a separate Phase-1 cross-screen feature (§3.6). |
| No consultation modal yet | "Contact Concierge" row | Render an inert/stub row for parity; the modal is a separate feature (Phase 1 §3.7). |
| No auth / session | "Sign Out" row, real subscription mgmt | Out of scope by design (Phase 4). Render a visual-only / disabled stub (§3.6). |
| No settings backend | Notifications / Language / Privacy / Terms | Inert rows / `href="#"` placeholders. No settings persistence in Phase 1. |

Recorded only so the implementation feature doesn't rediscover them as surprises.

---

## 11. Implementation risks (call out before building)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Auth scope creep** — Profile reads as a "logged-in account" page, tempting real auth / session / login wiring. | **No auth in Phase 1** (Decision #11). The "user" is a fixed mock profile from `DEFAULT_MOCK_USER`. The mock repo returns a User-*shaped* object so Phase 4 swaps the adapter, not the page (Risk #7). No session, no login, no `/me`. |
| 2 | **Payment / subscription scope creep** — the membership card + "Subscription & Purchases" row invite Stripe, checkout, plans, or a fake "unlock" toggle. | **No Stripe, no checkout, no subscription management, no fake unlock.** The membership CTA is a labeled stub (`href="#"`/disabled). Price/copy come from `PAYWALL_COPY` as data. Real payments are Phase 4 (Decision #12). |
| 3 | **Logout / account-deletion scope creep** — "Sign Out" tempts a real logout; an account-deletion control tempts a delete flow. | **No real logout, no account deletion.** "Sign Out" is a visual-only stub with a comment (there is no session to end). Do **not** add an account-deletion control (the App Store deletion requirement is Phase 4/7, Architecture Plan §8). |
| 4 | **Over-clienting the page** — adding `'use client'` / state where none is needed. | Profile has **no** Phase-1 state (no tabs, no modals built). Keep it a **pure server component** (§2). A client island appears only when the real paywall/consultation modals are wired (a later feature), and only around the triggering rows. |
| 5 | **Direct mock-data imports in UI** — reaching into `@tennis/mock-data` for the name/initials/stats. | All profile data enters via `repositories` → the server page → props. The ESLint import-boundary rule already blocks `@tennis/mock-data` / `mock-*.repository` imports outside the domain. Components receive DTOs/numbers only. |
| 6 | **Hardcoding stats / identity in JSX** — pasting the prototype's `12 / 3 / 8` / `EM` / `Eleanor Morgan`. | **Data-driven discipline** (Phase 1 §3.10, §4): name/initials/membership from `UserProfileDTO`; the three counts **derived** server-side from the saved repository. Discard the prototype's decorative literals. |
| 7 | **Expanding `UserProfileDTO` too much** — adding avatar URLs, email, settings prefs, entitlement arrays, notification flags to "support" the menu rows. | **Do not modify contracts in this feature.** `UserProfileDTO` is an intentionally minimal Phase-1 stub (its own comment says "do NOT elaborate these here" — the full Entitlement/account model is Phase 4, Decision #12). The menu rows are inert local chrome; they need **no** new DTO fields. Profile ships with **zero** contracts changes. |
| 8 | **Keeping the repository boundary** — adding `getCurrentUser()` in a way that leaks or over-builds. | The new method is **read-only**, returns the existing `UserProfileDTO`, and lives behind the factory like every other repository. No write methods, no entitlement service, no `getEntitlementStatus()` (Profile derives `unlocked` from `membership`). |
| 9 | **Inventing a desktop dashboard** — widening Profile into a multi-column settings dashboard the prototype doesn't have. | Keep the single centered `~680px` column on all breakpoints (§5, §6). Match the prototype's calm reading measure; no sidebar/grid. |

---

## 12. Phase-1 scope guardrails (for the implementation feature)

- **Read-only Profile view** — no auth, no login, no logout, no account deletion, no settings
  persistence, no `localStorage`.
- **Pure server page = the only repository boundary**; no client component in Phase 1 (no tab/modal
  state to own); components are presentational and prop-fed.
- **New `user` repository is read-only** (`getCurrentUser()` → `UserProfileDTO`), mock-backed
  (`DEFAULT_MOCK_USER`), wired on the factory; stats **reuse** the existing `SavedRepository`. The page
  reads through `repositories`, never `@tennis/mock-data`.
- **No contracts change** — `UserProfileDTO` already exists and must **not** be expanded.
- **Membership card price/copy from `PAYWALL_COPY`**; reuse `Badge` (gold), `Button` (premium/gold),
  `SectionHeader`. New pieces feature-local under `features/profile/`.
- **Stub CTAs** ("Subscription & Purchases", "Contact Concierge", "Sign Out", Notifications/Language/
  Help/Privacy/Terms) render for parity but do nothing (`href="#"` / disabled / no-op), each with a
  code comment naming the later feature that owns the real behavior.
- **Stats are derived** from saved data (counts), never hardcoded.
- **No Stripe, no checkout, no subscription management, no account deletion, no backend/API, no
  `app/api`, no auth/payments** in this screen.

---

## Next implementation prompt

> **Feature 22: Implement the Profile page (`/profile`).**
> Build `apps/web/src/app/profile/page.tsx` per `docs/FEATURE_21_PROFILE_PAGE_LAYOUT.md`.
> - **First**, add a minimal **read-only** `user` repository: `apps/web/src/domain/user/`
>   (`user.repository.ts` interface with `getCurrentUser(): Promise<UserProfileDTO>` +
>   `mock-user.repository.ts` returning `DEFAULT_MOCK_USER` from `@tennis/mock-data`, plain TS, no
>   React) and wire it into `apps/web/src/domain/index.ts` (`user` on `Repositories` + the `'mock'`
>   branch). **Do NOT modify `@tennis/contracts`** — `UserProfileDTO` already exists.
> - **Server page (no client component):** fetch the current user + saved courts + saved collections
>   once; derive the three stat counts (saved courts = length; collections = folder length; countries =
>   distinct `country` across saved courts) and `unlocked = user.membership === 'lifetime'`; wrap in
>   `AppShell unlocked={unlocked}` (not `overHero`).
> - **Create feature-local components** under `apps/web/src/features/profile/`: `ProfileHeader`
>   (initials avatar + name + gold "Lifetime Member" / "Explorer · Free" status), `ProfileStats`
>   (`grid-cols-3` derived counts), `ProfileMembershipCard` (dark unlock card from `PAYWALL_COPY`,
>   shown only when `!unlocked`, **stub** CTA), `ProfileMenuList` + `ProfileMenuRow` (Subscription &
>   Purchases · Contact Concierge · Notifications · Language=English · Help & Support · Privacy · Terms,
>   all inert/`href="#"`, plus the clay **stub** "Sign Out" row). `ProfileCtaCard` is optional — fold
>   "Contact Concierge" into the menu unless the design calls for a separate card.
> - **HARD RULES:** read-only (no auth, no login, **no real logout**, no account deletion, no settings
>   persistence, no `localStorage`); **no Stripe/checkout/subscription management/fake unlock** — the
>   membership + "Subscription" CTAs are labeled stubs; **no contracts change** (do not expand
>   `UserProfileDTO`); pure server component (no `'use client'` in Phase 1); only the page imports
>   `repositories`; no `@tennis/mock-data` in any UI/feature component; no `app/api`, no backend,
>   no auth/payments; stats derived from saved data, never hardcoded; single centered ~680px column on
>   all breakpoints (no desktop dashboard). Reuse `Badge` (gold), `Button` (premium/gold).
> - Verify against `files/profile.html` for visual parity and confirm the desktop user icon and the
>   mobile "Profile" tab now resolve to `/profile`. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.
