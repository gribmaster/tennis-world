# Feature 28 — New Designs Intake & Implementation Plan

**Status:** Planning / intake only — **no code, no routes, no repository changes, no contract
changes in this feature.** This document compares the second wave of HTML prototypes in `/files`
against the as-built Phase-1 `apps/web`, recommends routes and architecture, and breaks the work
into small, individually-shippable features (29–37).
**Audience:** whoever implements Features 29+.
**Companions:** `PHASE_1_COMPLETION_SUMMARY.md` (as-built state), `PHASE_1_PLACEHOLDER_CTA_AUDIT.md`
(the living inert-control inventory), `IMPLEMENTATION_BACKLOG.md` (Phases 2–7),
`../ARCHITECTURE_PLAN.md` (Decisions #1–#19 referenced throughout).

---

## 0. What the new prototypes are (and how they're structured)

13 new HTML files were added to `/files`. Each is a standalone React-over-CDN prototype that
**re-declares the entire shared component library** (the same `Nav`, `CourtCard`, `CourtDetail`,
`Paywall`, `Consult`, `Footer`, the `COURTS`/`COLLECTIONS`/`ARTICLES`/`USER_COLLECTIONS` datasets,
and the same design-token `<style>` block) and then adds **one new page component** at the bottom.

So the prototypes overlap ~85% with each other and with the existing prototypes. The genuinely
**new** material is small and concentrated:

| File | New page component | New vs. existing |
|---|---|---|
| `article.html` | `ArticlePage` | **New richer single-article layout** (author avatar+byline, date, drop-cap first paragraph, share button, "More from the Journal" related grid). Reads `?id=` query. |
| `collection.html` (singular) | `CollectionDetailPage` | **New USER-collection detail** (wishlist folder): back-to-`saved`, inline Rename, per-card Remove, empty state. Reads `?id=` from `USER_COLLECTIONS`. |
| `collections.html` (plural) | `Collections` | Editorial collections grid + filter — **matches existing `/collections`** (minor copy/interaction deltas). |
| `home.html` | `App`/home sections | **Matches existing `/`** (deltas: footer links real, nav user-icon → signin). |
| `journal.html` | journal grid | **Matches existing `/journal`** (article cards now link to `article.html?id=`). |
| `map.html` | map explorer | **Matches existing `/map`**. |
| `saved.html` | saved tabs | **Matches existing `/saved`** (deltas: "New Collection" now opens a real modal; collection rows now link to `collection.html?id=`). |
| `profile.html` | profile | **Matches existing `/profile`** (delta: Sign In / Sign Out tied to `isLoggedIn`). |
| `about.html` | `StaticPage` | **New** static About page. |
| `privacy.html` | `StaticPage` | **New** static Privacy Policy (sectioned, placeholder legal copy). |
| `terms.html` | `StaticPage` | **New** static Terms of Service (sectioned, placeholder legal copy). |
| `signin.html` | `SignIn` | **New** auth screen — magic-link + Apple/Google, UI-only `setTimeout` "sent" state. |
| `signup.html` | `SignUp` | **New** auth screen — name+email, UI-only "confirm email" state. |

New shared building blocks introduced across these files (already authored in the prototypes,
not yet ported): **`CreateCollectionModal`**, **`SaveToCollectionMenu`** (a dropdown added into
`CourtDetail`'s action bar), an **`isLoggedIn`** prototype flag, and an **`AuthIcons`** set
(mail/apple/google).

> **Coordinate-safety note (Risk #2/#17):** every new prototype still carries the decorative
> `coords:[x%,y%]` screen positions and the locked-location blur. Nothing in this wave introduces
> exact `lat/lng` to the UI. The plan preserves that — no new surface plots real geo.

---

## 1. Existing-screen comparison (refresh audit)

For each already-implemented screen: visual diffs, missing sections, copy/component/CTA changes,
and whether the change is **safe & small** or **needs its own feature**.

### `/` — Home
- **Visual / sections:** No structural change. Hero, destinations/featured, Editor's Cut,
  collections teaser, journal teaser, paywall band, footer — all already built and matching.
- **Changed copy:** none material.
- **Changed CTA behavior:**
  - Footer **Company** column links (About/Privacy/Terms/Contact) are `href="#"` placeholders
    today; the new designs point them at real pages (`about.html`, `privacy.html`, `terms.html`,
    `mailto:`). → wire in **Feature 29** once those routes exist.
  - Nav user-icon: prototypes now route to `signin.html` when logged-out, `profile.html` when
    logged-in. Today `AppHeader` always links `/profile`. → **Feature 30** (auth screens), behind
    a mock `isLoggedIn=false`.
- **Verdict:** **No Home refresh feature needed.** Home only changes as a *consumer* of new routes
  (footer + nav-icon link targets), folded into Features 29/30.

### `/map` — Map
- **No change.** The map prototype is unchanged from the existing build. Nav-icon/footer link
  deltas only (same as Home). **No feature needed.**

### `/collections` — Editorial collections (plural)
- **Visual / sections:** Matches existing `/collections` (dark hero band + grid; the prototype's
  in-page filter that swaps the lower court list is an SPA nicety not required by the routed app —
  the routed app drills into `/collections/[slug]`).
- **Changed CTA behavior:** footer/nav deltas only.
- **Verdict:** **Safe & small / none.** No dedicated refresh; the only change is link targets
  (Features 29/30). Do **not** confuse this with `collection.html` (singular = user collection).

### `/collections/[slug]` — Editorial collection detail
- The new wave's `collection.html` is **NOT** this screen — it is the *user* collection detail
  (see §3). The editorial `/collections/[slug]` (Feature 17, dark hero + courts grid) has **no new
  prototype in this wave** and is unchanged.
- **Verdict:** **No change.** Keep `/collections/[slug]` exactly as-is. (Optional tiny polish:
  Feature 32 may align hero spacing with `collection.html`'s back-bar pattern — low value,
  documented but not required.)

### `/journal` — Journal index
- **Visual / sections:** Matches existing `/journal`.
- **Changed CTA behavior:** article cards link `article.html?id={id}` → in the routed app this is
  already `/journal/[slug]`. The destination layout is what's richer (see `/journal/[slug]`).
- **Verdict:** **No journal-index feature.** No card/grid change beyond what already exists.

### `/journal/[slug]` — Single article ⚠️ **needs its own feature (Feature 31)**
- **Missing sections vs. new `article.html`:** the new design adds, relative to the current
  `ArticleHero` + `ArticleBody`:
  1. **Author byline block** — circular avatar with initials, author name, published date, and a
     **Share** button, on a hairline-bordered row between subtitle and body.
  2. **Drop-cap** on the first body paragraph (large serif initial, floated).
  3. **"More from the Journal" related-articles grid** (3 cards) in an ivory band before the footer.
  4. A **back-bar** ("← Journal") as a separate slim bar (current build puts the back-link inside
     the hero — acceptable, but note the difference).
- **Data impact:** `ArticleDTO` currently has **no `author` field**. The prototype's `author`
  ("Janet See") is authored data. Two options — see §1.1 below.
- **Verdict:** **Own feature (Feature 31)** — new presentational components + a documented contract
  addition (`author`, optionally an explicit `authorInitials`).

### `/saved` — Saved
- **Visual / sections:** Tabs (Courts / Collections / Wishlist Map) unchanged.
- **Changed CTA behavior — two real changes:**
  1. **"New Collection"** button: today a **disabled stub** (`SavedCollectionsGrid`). New design
     opens **`CreateCollectionModal`**. → **Feature 35** (requires the mutation seam, Feature 34).
  2. **Collection rows** (`SavedCollectionRow`): today a static, non-link row ("no per-folder
     detail route yet"). New design makes each row a link to `collection.html?id=` → our
     `/saved/collections/[slug]`. → **Feature 33** (route) + row becomes a `<Link>`.
- **Verdict:** Saved changes are **driven by Features 33–35**, not a standalone "saved refresh."

### `/profile` — Profile
- **Visual / sections:** Unchanged.
- **Changed CTA behavior:** prototype ties **Sign In / Sign Out** menu rows to `isLoggedIn`
  (Sign-Out shown when logged-in; otherwise a Sign-In affordance). Today both Sign Out and the
  account rows are inert `href="#"` (correct for Phase 1).
- **Verdict:** **Safe & small**, folded into **Feature 30**: point the Sign-In affordance at
  `/signin` and Sign-Out stays inert (no session to end). No profile-specific feature.

### `/courts/[slug]` — Court Detail ⚠️ **gains a control (Feature 36)**
- **New component:** the prototypes add **`SaveToCollectionMenu`** ("Add to Collection" dropdown)
  into the Court Detail action bar (next to Save / Share), with an inline "New collection" item
  that opens `CreateCollectionModal`.
- **Changed CTA behavior:** the **Save** heart on Court Detail is interactive in the prototype
  (`toggleSave`). In the current build, save state is read-only/visual (Phase 4). The new "Add to
  Collection" menu is the bigger addition.
- **Verdict:** **Own feature (Feature 36)** — depends on the user-collection mutation seam
  (Feature 34) and the modal (Feature 35).

### Summary table

| Screen | Change | Classification |
|---|---|---|
| `/` | footer + nav-icon link targets only | small, folded into F29/F30 |
| `/map` | link targets only | none |
| `/collections` | link targets only | none |
| `/collections/[slug]` | none (not the new `collection.html`) | none |
| `/journal` | none (cards already route) | none |
| `/journal/[slug]` | byline + drop-cap + related grid; `author` data | **own feature — F31** |
| `/saved` | "New Collection" modal; rows link to user-collection detail | driven by **F33–F35** |
| `/profile` | Sign-In/Out affordance wired to `/signin` | small, folded into **F30** |
| `/courts/[slug]` | "Add to Collection" menu | **own feature — F36** |

---

### 1.1 Documented future contract changes (not made in Feature 28)

These are **recorded here only** — Feature 28 changes no contracts. They are made in the feature
that needs them.

1. **`ArticleSchema.author`** (Feature 31). Add an optional `author: z.string().optional()` to
   `packages/contracts/src/article.ts`, and seed `author` on each article in
   `packages/mock-data/src/articles.ts`. The avatar initials can be **derived** in the component
   (`author.split(' ').map(w => w[0]).join('')`, exactly as the prototype does) — no separate
   `authorInitials` field needed. Keep it optional so the byline block degrades gracefully when
   absent (matching how `subtitle`/`heroImageUrl` are already optional).
2. **`UserCollectionSchema` already has `slug?`** (`packages/contracts/src/user.ts`, line 43:
   *"Routing key for a future per-folder detail view (not routed in Phase 1)"*). Feature 33
   **promotes `slug` from optional to required** for the routed detail view, and Feature 34 has the
   repository populate it. This is the intended seam — no new field invented.
3. **No `CollectionCourt`-style table for user collections** is required for Phase-1 demo. The
   mutation seam (Feature 34) holds folder→courtIds in the mock repository instance (see §4).

---

## 2. New routes required

Recommended routes, with the alternatives considered and why they were rejected. **No routes are
created in Feature 28** — this is the recommendation only.

| Recommended route | Source prototype | Rendering | Notes |
|---|---|---|---|
| `/about` | `about.html` | Static | Static marketing page. |
| `/privacy` | `privacy.html` | Static | Sectioned legal page (placeholder copy). |
| `/terms` | `terms.html` | Static | Sectioned legal page (placeholder copy). |
| `/signin` | `signin.html` | Static (client island for the form) | UI-only. |
| `/signup` | `signup.html` | Static (client island for the form) | UI-only. |
| `/saved/collections/[slug]` | `collection.html` | Dynamic | **User** (wishlist) collection detail. See §3. |

### Route-name decisions

- **`/signin` and `/signup`** (one word, no hyphen) — matches the prototype filenames
  (`signin.html`, `signup.html`) and the cross-links inside them (`href="signin.html"` /
  `href="signup.html"`). *Alternatives:* `/sign-in` / `/sign-up` (more conventional kebab-case) or
  an `/(auth)` route group. **Rejected** because the prototype already commits to the one-word
  spelling in its own links; matching it keeps the port mechanical. If the team prefers kebab-case
  as a house style, that is a trivial rename — flag at Feature 30 kickoff, don't block on it.
- **`/about`, `/privacy`, `/terms`** — flat top-level, matching filenames and the footer's hrefs
  (`about.html`, `privacy.html`, `terms.html`). *Alternative:* a `/legal/*` group for privacy/terms.
  **Rejected** — only two legal pages, and the footer/auth links point at the flat names; a group
  adds nesting for no benefit. They can share one feature folder without sharing a route segment.
- **`/saved/collections/[slug]`** — the user-collection detail. **Strongly recommended over
  `/collections/[slug]`** — see §3 for the full rationale. The prototype's own back-link goes to
  `saved.html`, which confirms the user-collection detail lives *under* Saved conceptually.

### Routes deliberately NOT added

- The new `article.html` maps to the **existing** `/journal/[slug]` — **no new route**, just a
  layout refresh (Feature 31). The prototype's `?id=` query is a single-file SPA artifact; the
  routed app keeps slug routing.
- The new `collections.html` maps to the **existing** `/collections` — **no new route**.

---

## 3. Editorial vs. user collections — architecture recommendation

This is the most important structural decision in this intake. **The two "collection" concepts are
distinct domain objects and must not share a route or a repository.**

| | Editorial collection | User (wishlist) collection |
|---|---|---|
| What | Curated, published themes (Coastal, Desert, Hidden…) | A person's own folders ("Summer in Italy", "Hidden Honeymoon") |
| Owner | The editorial team / CMS | The signed-in user |
| Contract | `CollectionDTO` (`packages/contracts/src/collection.ts`) | `UserCollectionDTO` (`packages/contracts/src/user.ts`) |
| Repository | `collections` (`CollectionRepository`) | `saved` (`SavedRepository`) |
| List route | `/collections` (Feature 16) | Saved → Collections tab (`/saved`) |
| Detail route | `/collections/[slug]` (Feature 17) | **`/saved/collections/[slug]` (new, Feature 33)** |
| Prototype | `collections.html` (plural) | `collection.html` (singular) |
| Mutable? | No (editorial, read-only) | Yes in the new designs (create / add / remove / rename) |

### Recommendation

1. **User-collection detail route = `/saved/collections/[slug]`.** It is owned by the user, reached
   from the Saved page, and its prototype back-link returns to `saved.html`. Nesting it under
   `/saved` makes ownership and breadcrumb obvious and keeps it cleanly separate from the editorial
   `/collections/[slug]`.
   - *Alternative considered:* `/saved/[slug]` — **rejected**, too ambiguous (could collide with a
     future saved-court detail) and loses the "collections" segment that signals what it is.
   - *Alternative considered:* reuse `/collections/[slug]` with a type flag — **rejected outright**;
     it conflates two domains, two repositories, and two DTOs behind one route and would force the
     editorial detail page to branch on ownership. Explicitly disallowed by the task brief.
2. **Slug key:** use `UserCollectionDTO.slug` (already present as optional; promoted in Feature 33).
   Phase-1 mock slugs can be derived from the folder id (`wishlist-summer-italy` → `summer-italy`)
   or authored. The prototype derives an id from the name on create
   (`name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`) — reuse that derivation in the repository
   (Feature 34) so created folders get a stable slug.
3. **Detail page reuses the shared `CourtCard`** for member courts (the prototype does), so no new
   card component — only a feature-local "user-collection detail" shell (hero/title + rename
   affordance + grid + empty state + per-card remove).

---

## 4. User-collection flows & the minimal mock mutation seam

The new designs require, for the first time, **mock-only mutations**: create a folder, toggle a
court in/out of a folder, rename, remove. Phase 1 deliberately kept `SavedRepository` **read-only**
(`saved.repository.ts` header: *"READ-ONLY by design for Phase 1: no toggleSavedCourt, no
createUserCollection, no mutation of any kind"*). Feature 28 does **not** change that file — but it
recommends the smallest safe extension for Features 34+.

### Where the mutations live

Keep them on the **`SavedRepository`** (it already owns `getSavedCollections()`), not a new
repository. The smallest interface extension:

```ts
// Recommended additions to SavedRepository (made in Feature 34, NOT Feature 28):
getUserCollections(): Promise<UserCollectionDTO[]>;              // alias/clarify of getSavedCollections()
getUserCollectionBySlug(slug): Promise<UserCollectionWithCourtsDTO | null>; // detail page (folder + member courts)
createUserCollection(name: string): Promise<UserCollectionDTO>; // returns the created folder (with derived slug)
toggleCourtInCollection(collectionId: string, courtId: string): Promise<void>;
renameUserCollection(collectionId: string, name: string): Promise<void>;   // optional — only if Feature 33 ships rename
```

- `getSavedCollections()` already exists; either keep it and add `getUserCollectionBySlug`, or
  rename to `getUserCollections()` and update the one caller (`saved/page.tsx`). **Recommend
  keeping `getSavedCollections()`** to avoid churn and just **adding** the new methods.
- A `UserCollectionWithCourtsDTO` (= `UserCollectionDTO` + `courts: CourtSummaryDTO[]`) mirrors the
  existing `CollectionWithCourtsDTO` pattern (Feature 33/34 contract addition, documented in §1.1).

### Persistence: in-memory, with a narrowly-scoped localStorage option

- **Default recommendation: in-memory mutation inside the mock repository instance.** The repo is a
  singleton (ES-module singleton via `lib/repositories.ts`), so a folder created during a session
  survives client-side navigation within that session. This needs **no localStorage** and keeps the
  hard-rule surface clean. It matches exactly how the prototype behaves (`useState`, lost on reload).
- **If demo persistence across reloads is explicitly wanted**, localStorage is acceptable **only if**:
  1. it lives **entirely inside the mock repository** (`mock-saved.repository.ts`) — never in UI,
     never in a feature component, never in a page;
  2. it is **guarded for SSR** (`typeof window !== 'undefined'`) since pages are server components
     and the repo can be constructed server-side;
  3. it is **seeded from `@tennis/mock-data`** on first run (so the demo isn't empty) and is a pure
     implementation detail behind the unchanged interface;
  4. it is clearly labelled as a Phase-1 demo shim to be deleted when the Phase-4 HTTP repository
     lands.
  - **Why localStorage is a real tension here:** the mutating methods will be called from **client**
    components (the modal, the menu) but the *reads* happen in **server** components (pages). A
    server-rendered page cannot see a browser's localStorage. So a localStorage-backed mock only
    "works" if the mutating pages re-read on the client, which pushes the user-collection reads to
    client components too. **Recommendation:** start **in-memory** (Feature 34) and treat
    localStorage as an optional, separately-justified follow-up only if a stakeholder asks for
    reload-survival in the demo. Do not add it speculatively.

### No backend, no API, no auth

All of the above is mock-only. No `apps/web/app/api`, no fetch, no session. The mutation methods are
the Phase-4 swap point: the same interface gets an HTTP implementation against
`POST /v1/me/collections`, `POST/DELETE /v1/me/collections/:id/courts/:courtId` (already in
ARCHITECTURE_PLAN §4) — the UI won't change.

---

## 5. Auth screens (Sign In / Sign Up) — recommendation

UI-only. **No real auth, no API, no cookies, no session, no JWT** (Decision #11; auth is Phase 4).

- **Routes:** `/signin`, `/signup` (see §2).
- **Form UI:** port the prototype faithfully —
  - Minimal top bar (wordmark + "Continue exploring" → `/`), **not** the full `AppHeader` (the
    auth screens intentionally use a stripped bar and no footer).
  - **Apple / Google** buttons (`AuthIcons`) — **inert** in Phase 1 (no OAuth). Render them as the
    prototype does; clicking does nothing (or, acceptably, routes to the same mock-success state).
    Document them as placeholders in `PHASE_1_PLACEHOLDER_CTA_AUDIT.md`.
  - **Email magic-link** (Sign In) / **name + email** (Sign Up).
- **Validation:** **only what the prototype already has** — HTML `required` on the inputs and the
  JS guard `if (!email.trim()) return;` / `if (!email.trim() || !name.trim()) return;`. No extra
  email-regex/zod validation beyond required-field. (Mirror the local-state validation pattern the
  Consultation modal already uses.)
- **Submit:** **mock/local success state only.** The prototype flips to a "Check your inbox" /
  "Confirm your email" panel after a `setTimeout`. Reproduce that as local React state — **no
  fetch, no network, no persistence.** "Use a different email" resets the local state.
- **Links between them:** Sign In → "Create an account" → `/signup`; Sign Up → "Sign in" →
  `/signin`. Both footers link to `/terms` and `/privacy` ("By continuing, you agree…").
- **Entry points:** nav user-icon and profile Sign-In affordance link to `/signin` while the mock
  `isLoggedIn` is `false` (Feature 30 keeps `isLoggedIn=false`; there's no real session to flip).
- **Client boundary:** the form is a `'use client'` island (local state + the success toggle); the
  page shell around it can stay a server component.

---

## 6. Privacy / Terms / About — recommendation

Keep it **simple: static page components with feature-local copy.** **No CMS, no backend, no
markdown library** (none is installed; don't add one — hard rule).

- **Recommendation: feature-local static components**, one small feature folder
  (e.g. `features/static-pages/` or `features/legal/` + an `features/about/`), each page a server
  component rendering hardcoded JSX/structured copy.
  - **About** is short, free-form prose + a small stats row + a contact CTA → plain JSX.
  - **Privacy / Terms** are an **array of `{ h, p[] }` sections** in the prototype, `.map`-rendered.
    Port that array as a **local `const` in the feature** (or a colocated `*.content.ts` module).
    This keeps the copy editable in one place without standing up data infrastructure.
- **Data-driven nuance:** the §5 Phase-1 hard rule ("no literal court names/prices/copy in JSX")
  targets **domain content** (courts, collections, prices) that must flow through a repository so the
  Phase-2 seed stays the source of truth. **Static legal/marketing copy is page chrome**, not domain
  data — it has the same latitude `Footer`, `HomePaywallBand`, and the paywall/consultation copy
  already take (feature-local copy constants). So **do not** route legal copy through a repository or
  `@tennis/mock-data`, and **do not** create a contract for it. A colocated content module is the
  right altitude.
- **Important:** these are placeholder legal texts (the prototype says so:
  *"placeholder copy … replace with counsel-reviewed language before launch"*). Carry that disclaimer
  through; do not represent them as final legal text.
- **Chrome:** unlike the auth screens, About/Privacy/Terms **do** use the full `AppShell`
  (`AppHeader` + `Footer`), matching the prototypes (they render `Nav` + `Footer`).

---

## 7. Architecture-constraint check

The plan is verified against every standing constraint. All preserved:

- ✅ **No `apps/web/app/api`** (Decision #16). No new route handlers; auth/mutations are client/mock
  only. Still absent.
- ✅ **No backend / API integration.** No fetch, no endpoints. The `api` data-source branch still
  throws.
- ✅ **No real auth.** Sign In/Up are UI-only local-state; no session/JWT/cookies (Decision #11).
- ✅ **No payments / Stripe.** Untouched; paywall checkout stays disabled.
- ✅ **No exact-coordinate exposure** (Risk #2/#17). No new surface plots `lat/lng`; user-collection
  detail and article detail use summaries / approximate geo only.
- ✅ **No UI imports from `@tennis/mock-data`.** New pages import only `@/lib/repositories`; new
  feature components stay presentational and receive props. ESLint boundary
  (`apps/web/.eslintrc.json`) unchanged and still enforced.
- ✅ **Only `page.tsx` touches repositories.** New pages (`/signin`, `/about`, etc.) follow the
  server-page-fetches / feature-presents pattern. Auth/modal client islands hold local state only.
- ✅ **mock-data imports only from domain mock repositories.** New mutation seam reads/writes through
  `mock-saved.repository.ts`; `@tennis/mock-data` stays imported only inside `src/domain/**`.
- ⚠️ **One intentional, documented evolution:** `SavedRepository` gains **mutating** methods
  (Feature 34). This is a *deliberate* relaxation of the Phase-1 "read-only" stance for mock-only
  demo behaviour — recorded in §4 and to be reflected in the repository's header comment and in
  `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` when implemented. It does **not** add a backend or auth.

---

## 8. Recommended implementation order (Features 29–37)

Sequenced so each feature is small, independently shippable, and unblocks the next. **Features 29–33
are independent of the mutation seam; 34 is the seam; 35–36 depend on it.**

Each feature lists: **goal · files likely changed · data/repository impact · risks · commands.**
Standard commands for every feature:
`pnpm --filter @tennis/web lint` · `pnpm typecheck` · `pnpm build`.

---

### Feature 29 — Static pages: About / Privacy / Terms
- **Goal:** add `/about`, `/privacy`, `/terms` with feature-local copy; wire the footer Company
  column to them.
- **Files likely changed:**
  - `apps/web/src/app/about/page.tsx`, `apps/web/src/app/privacy/page.tsx`,
    `apps/web/src/app/terms/page.tsx` (new server pages, in `AppShell`).
  - `apps/web/src/features/static-pages/*` (new) — `AboutPage`/`LegalPage` presentational
    components + a `legal-content.ts` (the Privacy/Terms section arrays).
  - `apps/web/src/components/layout/Footer.tsx` — Company links `#` → real routes (About →
    `/about`, Privacy → `/privacy`, Terms → `/terms`; Contact → `mailto:`).
  - `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` — move About/Privacy/Terms out of the placeholder list.
- **Data/repository impact:** **none.** No repository, no contract, no mock-data. (Copy is chrome.)
- **Risks:** low. Only watch: don't import a markdown lib; keep placeholder-legal disclaimer.
- **Commands:** standard trio; spot-check the three routes render and footer links resolve.

### Feature 30 — Auth screens: Sign In / Sign Up (UI-only)
- **Goal:** add `/signin`, `/signup` (magic-link + inert Apple/Google), local success state, mutual
  links; point nav user-icon + profile Sign-In affordance at `/signin` (mock `isLoggedIn=false`).
- **Files likely changed:**
  - `apps/web/src/app/signin/page.tsx`, `apps/web/src/app/signup/page.tsx` (new; minimal top bar,
    **not** full `AppShell`).
  - `apps/web/src/features/auth/*` (new) — `SignInForm`, `SignUpForm` (`'use client'`),
    `AuthIcons`, shared auth layout/top-bar.
  - `apps/web/src/components/layout/AppHeader.tsx` — user-icon → `/signin` when `!isLoggedIn`
    (introduce a mock `isLoggedIn` constant, default `false`).
  - `apps/web/src/features/profile/ProfileMenuList.tsx` — Sign-In affordance → `/signin`; Sign-Out
    stays inert.
  - `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` — record Apple/Google/magic-link submit as inert.
- **Data/repository impact:** **none.** No auth backend, no session, no contract change.
- **Risks:** scope creep into real auth — **resist.** Keep validation to prototype's required-field
  only. Don't add cookies/JWT. Apple/Google must be visibly inert.
- **Commands:** standard trio; verify success-state toggle and cross-links by inspection.

### Feature 31 — Article detail design refresh
- **Goal:** bring `/journal/[slug]` up to `article.html`: author byline (avatar+name+date+share),
  drop-cap first paragraph, "More from the Journal" related grid.
- **Files likely changed:**
  - `packages/contracts/src/article.ts` — add optional `author`.
  - `packages/mock-data/src/articles.ts` — seed `author` per article.
  - `apps/web/src/domain/journal/*` — pass `author` through; add a `getRelated(slug, n)` (or page
    fetches `list()` and filters out the current slug — preferred, no interface change).
  - `apps/web/src/features/journal-detail/*` — new `ArticleByline`, `ArticleRelated`; drop-cap in
    `ArticleBody` (or a wrapper); compose in the page.
  - `apps/web/src/app/journal/[slug]/page.tsx` — fetch related (sibling articles), pass down.
- **Data/repository impact:** **contract addition** (`author` optional) + mock seed; optional
  read-only related-articles query (prefer page-level `list()` filter to avoid an interface change).
- **Risks:** keep `author` optional so the byline degrades; **Share** button stays inert (document
  it); related grid must exclude the current article and handle <3 siblings.
- **Commands:** standard trio; verify byline/drop-cap/related render and `getBySlug` still 404s.

### Feature 32 — Editorial collection detail design note (low priority / optional)
- **Goal:** confirm `/collections/[slug]` needs **no** refresh from this wave (the new singular
  `collection.html` is the *user* collection, not this). Optionally align back-bar/hero spacing.
- **Files likely changed:** likely **none**; at most minor spacing tweaks in
  `features/collection-detail/CollectionDetailHero.tsx`.
- **Data/repository impact:** none.
- **Risks:** the only real risk is **mistaking `collection.html` for this screen** — it isn't.
  Treat this feature as a documented no-op/guardrail unless a spacing polish is requested.
- **Commands:** standard trio (no behavioural change expected).

### Feature 33 — User-collection detail layout + route (read path)
- **Goal:** add `/saved/collections/[slug]` rendering a wishlist folder (title + member-court grid +
  empty state), reachable from the Saved → Collections rows. **Read-only first** (uses Feature 34's
  reads; can ship a static read against existing `getSavedCollections` + a derived membership if 34
  isn't ready, but **prefer ordering 34 before 33's data wiring**).
- **Files likely changed:**
  - `packages/contracts/src/user.ts` — promote `UserCollectionDTO.slug` to required; add
    `UserCollectionWithCourtsDTO`.
  - `apps/web/src/app/saved/collections/[slug]/page.tsx` (new server page; 404 on miss).
  - `apps/web/src/features/user-collection-detail/*` (new) — hero/title, grid (reuse `CourtCard`),
    empty state, (rename + per-card remove arrive with 34/35).
  - `apps/web/src/features/saved/SavedCollectionRow.tsx` — static row → `<Link>` to
    `/saved/collections/{slug}`.
  - `packages/mock-data/src/users.ts` — give `DEFAULT_USER_COLLECTIONS` stable `slug`s + real
    member `courtIds` (so the detail page has data).
- **Data/repository impact:** contract: `slug` required + `…WithCourtsDTO`. Mock-data: add slugs +
  membership (`courtIds`) to user collections (today they only carry `count`).
- **Risks:** ordering vs. Feature 34 (the read method `getUserCollectionBySlug` is cleanest there).
  Recommend implementing 34's read method first, then 33 consumes it. Keep editorial
  `/collections/[slug]` untouched.
- **Commands:** standard trio; verify a row → detail navigation and an empty-folder state.

### Feature 34 — User-collection mock repository mutations (the seam)
- **Goal:** add the minimal mutation/read methods to `SavedRepository` + mock impl, in-memory.
- **Files likely changed:**
  - `apps/web/src/domain/saved/saved.repository.ts` — add `createUserCollection`,
    `toggleCourtInCollection`, `getUserCollectionBySlug`, (`renameUserCollection` if F33 ships
    rename); update the "read-only" header note.
  - `apps/web/src/domain/saved/mock-saved.repository.ts` — in-memory state seeded from
    `@tennis/mock-data`; slug derivation on create (reuse prototype's kebab logic).
  - `apps/web/src/domain/saved/saved.types.ts` — any option types if needed.
  - `packages/contracts/src/user.ts` — `UserCollectionWithCourtsDTO` (if not already in F33).
  - `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` / repo header — record the deliberate read-only→mutable
    relaxation (mock-only).
- **Data/repository impact:** **this is the only repository-shape change of the wave.** Still
  mock-only, no backend. Default **in-memory**; localStorage only if separately justified (§4).
- **Risks:** server-vs-client read/write boundary (§4) — mutations fire from client components;
  server pages read. Keep mutations callable from client islands and keep reads idempotent. Don't
  leak `@tennis/mock-data` outside `src/domain`. Don't add localStorage speculatively.
- **Commands:** standard trio; add/keep plain-TS unit tests for the repo (create → toggle → read).

### Feature 35 — Create Collection modal
- **Goal:** port `CreateCollectionModal`; wire Saved "New Collection" (replace disabled stub) and
  the menu's "New collection" item to it; on submit call `createUserCollection`.
- **Files likely changed:**
  - `apps/web/src/features/user-collections/CreateCollectionModal.tsx` +
    `CreateCollectionTrigger.tsx` (new `'use client'`, mirroring the Paywall/Consultation
    trigger+modal pattern: portal, Escape/backdrop close, focus management, scroll-lock).
  - `apps/web/src/features/saved/SavedCollectionsGrid.tsx` — disabled button → trigger.
  - `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` — remove "New Collection" from the disabled-stub list.
- **Data/repository impact:** consumes Feature 34's `createUserCollection` (client-side call).
- **Risks:** reuse the existing modal a11y conventions (the codebase already has two modals); note
  the known no-focus-trap gap is consistent with existing modals. Keep required-name validation
  only (prototype: `disabled={!name.trim()}`).
- **Commands:** standard trio; verify create → new folder appears (in-memory) and modal a11y.

### Feature 36 — "Add to Collection" menu on Court Detail
- **Goal:** port `SaveToCollectionMenu` into the Court Detail action bar (toggle court in folders +
  "New collection" → Feature 35's modal).
- **Files likely changed:**
  - `apps/web/src/features/court-detail/SaveToCollectionMenu.tsx` (new `'use client'` dropdown:
    outside-click close, checkbox state per folder).
  - `apps/web/src/features/court-detail/CourtDetailCtaPanel.tsx` or the detail action bar — mount
    the menu next to Save/Share.
  - `apps/web/src/app/courts/[slug]/page.tsx` — pass the user's folders (read) to the action bar.
- **Data/repository impact:** consumes Feature 34's `toggleCourtInCollection` + folder reads.
- **Risks:** the action bar is partly server-rendered; the menu is a client island that needs the
  folder list — pass folders as props from the page (read) and call the toggle from the client.
  Keep the Save heart's Phase-1 status consistent (don't silently turn read-only save into a real
  mutation unless explicitly scoped).
- **Commands:** standard trio; verify toggle reflects in the menu and survives intra-session nav.

### Feature 37 — Final QA pass
- **Goal:** end-to-end visual/link QA of the new routes + refreshed screens; refresh the audit doc.
- **Files likely changed:** `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (final true-state refresh);
  `docs/PHASE_1_COMPLETION_SUMMARY.md` (route table + new features); small fixes surfaced by QA.
- **Data/repository impact:** none (fixes only).
- **Risks:** ensure every new link resolves; confirm coordinate-safety untouched; confirm ESLint
  boundary still green and `apps/web/app/api` still absent.
- **Commands:** standard trio + manual click-through of `/about`, `/privacy`, `/terms`, `/signin`,
  `/signup`, `/saved/collections/[slug]`, refreshed `/journal/[slug]`, and Court Detail menu.

---

## 9. Next exact implementation prompt

Use this verbatim to start the first build feature:

> **Feature 29: Static pages — About / Privacy / Terms.**
> Implement three new static routes in `apps/web` and wire the footer to them. Do not add auth,
> payments, backend, `apps/web/app/api`, dependencies, or a markdown/CMS library.
>
> 1. Create `apps/web/src/app/about/page.tsx`, `.../privacy/page.tsx`, `.../terms/page.tsx` as
>    server components wrapped in `AppShell` (full `AppHeader` + `Footer`), each with `metadata`.
> 2. Create `apps/web/src/features/static-pages/` with presentational `AboutPage` and `LegalPage`
>    components, plus a colocated `legal-content.ts` holding the Privacy and Terms section arrays
>    (`{ h, p: string[] }[]`) and a `lastUpdated` string — ported from `files/privacy.html` and
>    `files/terms.html`. Port `files/about.html`'s prose, stats row, and "Get in Touch" `mailto:`
>    CTA into `AboutPage`. Keep the prototype's "placeholder copy — replace with counsel-reviewed
>    language before launch" disclaimer.
> 3. This copy is page chrome, NOT domain data: do not route it through a repository, a contract, or
>    `@tennis/mock-data`. No repository/contract/mock-data changes in this feature.
> 4. Update `apps/web/src/components/layout/Footer.tsx`: Company links `#` → `/about`, `/privacy`,
>    `/terms` (Contact → `mailto:hello@tennisworld.app`).
> 5. Update `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md`: move About/Privacy/Terms out of the
>    placeholder/static-pages rows (now real routes).
> 6. Verify: `pnpm --filter @tennis/web lint`, `pnpm typecheck`, `pnpm build` all green; confirm
>    `apps/web/app/api` still does not exist and the ESLint import boundary still passes.

---

## Report (deliverables checklist)

1. **File created:** `docs/FEATURE_28_NEW_DESIGNS_INTAKE.md` (this document). No code, routes,
   repositories, or contracts changed.
2. **New routes recommended:** `/about`, `/privacy`, `/terms`, `/signin`, `/signup`,
   `/saved/collections/[slug]` (user-collection detail). `article.html`→ existing `/journal/[slug]`;
   `collections.html`→ existing `/collections` (no new routes).
3. **Existing screens needing refresh:** `/journal/[slug]` (byline + drop-cap + related — Feature
   31) and `/courts/[slug]` (Add-to-Collection menu — Feature 36). `/saved` changes are driven by
   Features 33–35. `/`, `/map`, `/collections`, `/collections/[slug]`, `/journal`, `/profile` only
   change link targets (folded into Features 29/30).
4. **User-collection architecture:** distinct from editorial collections — own DTO
   (`UserCollectionDTO`), own repository (`SavedRepository`), own route
   **`/saved/collections/[slug]`**. Never reuse `/collections/[slug]`.
5. **Auth screens:** `/signin` + `/signup`, UI-only, local success state, required-field validation
   only, inert Apple/Google, mutual links, no API/session/JWT/cookies.
6. **Static pages:** feature-local static components with colocated copy (legal sections as a
   `{h,p[]}[]` array). No CMS, no backend, no markdown library, no repository/contract.
7. **Risks:** (a) server-vs-client boundary for user-collection reads/writes (§4) — start
   in-memory, treat localStorage as separately-justified; (b) confusing `collection.html` (user)
   with editorial `/collections/[slug]`; (c) auth-screen scope creep into real auth — keep UI-only;
   (d) the deliberate, documented relaxation of `SavedRepository` from read-only to mutable
   (mock-only); (e) keeping `@tennis/mock-data` out of UI and `apps/web/app/api` non-existent
   throughout.
8. **Recommended feature order:** 29 (static) → 30 (auth) → 31 (article) → 32 (editorial-detail
   no-op note) → 33 (user-collection detail route, read) → 34 (mutation seam) → 35 (create modal)
   → 36 (add-to-collection menu) → 37 (QA). 29–33 are independent of the seam; 34 unblocks 35–36.
9. **Next exact implementation prompt:** see §9 (Feature 29).
