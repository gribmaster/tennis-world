# Phase 1 — Completion Summary & Handoff

**Status:** ✅ **Phase 1 complete — including the second design wave (Features 28–37).** `apps/web`
is built, data-driven from in-app mock repositories, and presentational-only (one documented
exception: a mock-only user-collection mutation seam — see §1 and §3.8). Lint, typecheck, and a
clean production build all pass.
**Audience:** whoever picks up **Phase 2** (NestJS API + real data). Read this first; it records
the _as-built_ state, where it deviates from the plan, and the exact seams Phase 2 plugs into.
**Companions:** `PHASE_1_WEB_MOCK_FIRST.md` (the plan), `FEATURE_28_NEW_DESIGNS_INTAKE.md` (the
second-wave intake/plan, Features 29–37), `FEATURE_32_EDITORIAL_COLLECTION_GUARDRAIL.md`
(editorial-vs-user collection guardrail), `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the living inventory
of every intentionally-inert control), `IMPLEMENTATION_BACKLOG.md` (Phases 2–7),
`../ARCHITECTURE_PLAN.md` (decisions/risks referenced below).

---

## 1. What was built

The full `apps/web` UI — every screen from **both** waves of HTML prototypes **plus Court Detail**
(Decision #15, no prototype) — wired to local mock repositories. Zero hardcoded domain content in
JSX; all court/collection/article data flows from `@tennis/mock-data` through a repository boundary.
Static legal/marketing/auth copy is page chrome (feature-local), not domain data, by design
(FEATURE_28 §6).

### Routes (all build & prerender — 16 app routes, build emits 14 entries + `_not-found`)

| Route                          | Rendering     | Source feature                  | Wave  |
| ------------------------------ | ------------- | ------------------------------- | ----- |
| `/`                            | Static        | `features/home`                 | 1     |
| `/map`                         | Static        | `features/map`                  | 1     |
| `/courts/[slug]`               | Dynamic (SSR) | `features/court-detail`         | 1 (+36) |
| `/collections`                 | Static        | `features/collections`          | 1     |
| `/collections/[slug]`          | Dynamic (SSR) | `features/collection-detail`    | 1 (editorial) |
| `/journal`                     | Static        | `features/journal`              | 1     |
| `/journal/[slug]`              | Dynamic (SSR) | `features/journal-detail`       | 1 (+31) |
| `/saved`                       | Static        | `features/saved`                | 1 (+35) |
| `/profile`                     | Static        | `features/profile`              | 1 (+30) |
| `/about`                       | Static        | `features/static-pages`         | **29** |
| `/privacy`                     | Static        | `features/static-pages`         | **29** |
| `/terms`                       | Static        | `features/static-pages`         | **29** |
| `/signin`                      | Static        | `features/auth`                 | **30** |
| `/signup`                      | Static        | `features/auth`                 | **30** |
| `/saved/collections/[slug]`    | Dynamic (SSR) | `features/user-collection-detail` | **33 (+37)** |

Plus the cross-screen `features/paywall`, `features/consultation`, and `features/user-collections`
(Create-Collection modal) islands.

> **Editorial vs. user collections (FEATURE_32 guardrail):** `/collections/[slug]` is the
> **editorial** collection detail (`CollectionDTO` / `CollectionRepository`, read-only, back-link to
> `/collections`). `/saved/collections/[slug]` is the **user wishlist** folder detail
> (`UserCollectionDTO` / `SavedRepository`, mutable via the mock seam, back-link to `/saved`). They
> are distinct domains, DTOs, repositories, and routes — never conflated.

### The cross-screen interactive islands

**Wave 1 (Features 24–27):**

- **Paywall modal** (`features/paywall`) — opened by `<PaywallTrigger>` on 6 surfaces (Home band,
  Court Detail CTA panel, Court Detail location preview, Profile membership card, Footer ×2).
  Presentational only: the checkout CTA is a `disabled` placeholder. No Stripe, no entitlement
  mutation.
- **Consultation modal** (`features/consultation`) — opened by `<ConsultationTrigger>` on 4
  surfaces (Home secondary CTA, Court Detail CTA, Saved "Plan a Trip", Profile "Contact
  Concierge"). Presentational only: validates required fields in local React state and shows an
  in-modal confirmation. No backend, no API, no CRM, no email, no persistence.

**Wave 2 (Features 29–37):**

- **Static pages** (`features/static-pages`, Feature 29) — `/about`, `/privacy`, `/terms` as server
  components in the full `AppShell`. Copy is feature-local (`legal-content.ts` section arrays + the
  About prose); the Privacy/Terms text is **explicitly placeholder legal copy** ("replace with
  counsel-reviewed language before launch"). The footer Company column + profile-menu Privacy/Terms
  now point at these real routes; Contact is a `mailto:`.
- **Auth UI-only screens** (`features/auth`, Feature 30) — `/signin` (magic-link), `/signup`
  (name + email). A stripped top bar (not the full `AppShell`), inert Apple/Google buttons, and a
  `<form onSubmit>` that `preventDefault`s, guards required fields, and flips to a **local** success
  state. **No fetch, no API, no session, no cookies, no JWT, no OAuth, no localStorage** (Decision
  #11; real auth is Phase 4). Nav user-icon and profile "Sign In" point at `/signin` while a
  hardcoded mock `isLoggedIn = false`.
- **Article detail refresh** (`features/journal-detail`, Feature 31) — `/journal/[slug]` gains an
  author byline (initials avatar derived from `author`, published date, inert **Share** placeholder),
  a drop-cap on the **first plain-text paragraph only**, and a "More from the Journal" related grid
  (page filters `list()` to exclude the current slug, takes 3; degrades for <3 siblings).
- **User collection detail** (`features/user-collection-detail`, Feature 33 + 37) —
  `/saved/collections/[slug]` renders a wishlist folder (hero + member-court `CourtCard` grid +
  empty state), reached from the Saved → Collections rows. Read-only except the inline **Rename**
  island (Feature 37). Per-card **Remove** is deliberately **not rendered**.
- **Create-Collection modal** (`features/user-collections`, Feature 35) — `<CreateCollectionTrigger>`
  + `CreateCollectionModal` (portal, Escape/backdrop close, focus management, scroll-lock — the
  Paywall/Consultation convention). Used by Saved "New Collection" and reused inside the
  Add-to-Collection menu. On submit calls the mock seam `createUserCollection`.
- **Add-to-Collection menu** (`features/court-detail/SaveToCollectionMenu`, Feature 36) — a dropdown
  on the Court Detail CTA panel listing the user's folders with per-court checkmarks; toggling calls
  the mock seam `toggleCourtInCollection` with optimistic local state (no fetch, no `router.refresh`).
  "New collection" reuses the Create-Collection modal and adds the current court to the new folder.
- **Rename collection** (`features/user-collection-detail/UserCollectionRename`, Feature 37) — the
  inline rename on the user-collection hero. **Save** (disabled while empty/unchanged) calls the mock
  seam `renameUserCollection`, updates the title from the returned DTO, and `router.replace`s to the
  (possibly new) slug. No fetch, no `router.refresh`, no server re-read.

Each modal/trigger owns its open/close state in a single `useState` — no global state library, no
`localStorage` for any modal/form/membership state.

---

## 2. Architecture, as built

### Data layer — `apps/web/src/domain/*`

The local repository layer (Decision #7: lives in `apps/web`, not a shared package). UI is typed
against interfaces; concrete mock classes read `@tennis/mock-data`.

```
src/domain/
  index.ts                    factory: getRepositories() reads NEXT_PUBLIC_DATA_SOURCE
  courts/      court.repository.ts (iface) · mock-court.repository.ts · court.types.ts
  collections/ collection.repository.ts    · mock-collection.repository.ts
  journal/     article.repository.ts        · mock-article.repository.ts
  saved/       saved.repository.ts          · mock-saved.repository.ts
  user/        user.repository.ts           · mock-user.repository.ts
src/lib/repositories.ts        THE sanctioned access point — UI imports `repositories` from here
```

The single import boundary is enforced by ESLint (`apps/web/.eslintrc.json`,
`no-restricted-imports`): UI may not import `@tennis/mock-data`, a `mock-*.repository`, or the
`@/domain` factory directly — only `@/lib/repositories`. **This rule is active and passing.**

### Page → feature composition

Pages (`src/app/**/page.tsx`) are **server components** and the only repository boundary on each
screen: they fetch via `repositories.*` and pass plain data down as props. Feature components
(`src/features/*`) are presentational and never fetch. The only `'use client'` boundaries are the
interactive islands: `SavedTabs`, `MapFilterBar`/map interactions, and the paywall/consultation
triggers+modals.

### Shared primitives — `src/components/*`

`components/ui` (Button, SectionHeader, Badge), `components/layout` (AppShell, AppHeader,
BottomNavigation, Footer, PageContainer), `components/court` (CourtCard, CourtMeta, CourtImage).
No `packages/ui` (Decision #6) — promote only per the trigger in `IMPLEMENTATION_BACKLOG.md`.

---

## 3. Deviations from the Phase 1 plan (read before Phase 2)

The build is faithful to the plan's _intent_ but differs in a few concrete details. Recording
these so Phase 2 doesn't code against stale assumptions in `PHASE_1_WEB_MOCK_FIRST.md`:

1. **Domain folder layout** is **by-domain folders** (`domain/courts/*`, `domain/user/*`, each
   holding its interface + mock + types), **not** the planned `domain/interfaces/` + `domain/mock/`
   split. Functionally equivalent; the import boundary and factory work identically.
2. **A separate `saved` repository exists**, split out from `user`. The plan folded saved-court
   state into `UserRepository`; the build has `SavedRepository` alongside `UserRepository`. Phase 2
   should preserve this split (or consciously re-merge) when building the HTTP repositories.
3. **Env var is `NEXT_PUBLIC_DATA_SOURCE`** (not `DATA_SOURCE`) so the value is readable in both
   server and browser bundles. Default `"mock"`; `"api"` branch **throws `'API repositories are
not implemented yet'`** — this is the Phase 2 entry point. Unknown values fail fast.
4. **No `domain/http/` directory exists** — correct per the plan (Phase 2 work; not stubbed early).
5. **Consultation submit is fully in-component**, not routed through a
   `consultationRepository.submit()`. The mock consultation repository described in the plan was
   **not** created; the modal's `handleSubmit` just flips to a success state and discards the data.
   **Phase 2 action:** introduce `ConsultationRepository` (interface + mock + http) and wire
   `handleSubmit` to it — this is the cleanest place to add the `POST /v1/consultations` call.
6. **Paywall/consultation copy is feature-local**, not sourced from `@tennis/mock-data`'s
   `paywall-copy` export. This is deliberate: the ESLint boundary forbids UI importing
   `@tennis/mock-data`, and the hard rules said not to stand up a repository just for static modal
   copy. Phase 4 routes this through a sanctioned boundary (see `paywall-copy.ts` header note).
7. **Entitlement is a page-level constant**, not a repository call. Court Detail sets
   `const unlocked = false` and derives `locked = court.isLocked && !unlocked` once at the page
   (`app/courts/[slug]/page.tsx`). The planned `userRepository.getEntitlementStatus()` call is a
   **Phase 4** swap. No component invents its own lock logic — they all receive `locked` as a prop.
8. **`SavedRepository` is no longer read-only — a mock-only user-collection mutation seam exists**
   (Feature 34, the one deliberate relaxation of the early-Phase-1 read-only stance). The interface
   (`domain/saved/saved.repository.ts`) + mock (`mock-saved.repository.ts`) gained three mutating
   methods, plus two reads the detail/menu need:
   - `createUserCollection(name)` → `UserCollectionDTO` (derives a stable, unique kebab slug);
   - `toggleCourtInCollection(collectionId, courtId)` → `void` (add/remove, no-op on unknown folder);
   - `renameUserCollection(collectionId, name)` → `UserCollectionDTO` (re-derives a unique slug);
   - `getUserCollectionBySlug(slug)` → `UserCollectionWithCourtsDTO | null` (the detail-page read);
   - `getCollectionIdsForCourt(courtId)` → `string[]` (the narrow membership read that seeds the
     Add-to-Collection menu's checkmarks — keeps `UserCollectionDTO` minimal; `courtIds` stays an
     internal join, never a wire field).

   The folder state is **in-memory only**, seeded by cloning `DEFAULT_USER_COLLECTIONS`; `count` and
   `coverImageUrls` are derived from live membership on every projection. **No backend, no API, no
   auth/session, no localStorage, no persistence** — a created/renamed/toggled folder is demo-only
   and **may reset on reload / server restart**. Because pages are server components but the
   create/toggle/rename calls fire from **client islands** (the modal, the menu, the rename), the
   server and browser mock instances diverge after a mutation; the islands therefore treat their
   **local state as the source of truth** (mirror the returned DTO, `router.replace` for the new
   slug) and never re-read the server — so the divergence is invisible to the user. **Phase 4** swaps
   this mock for an auth-backed HTTP implementation behind the **same interface**
   (`POST /v1/me/collections`, `POST/DELETE /v1/me/collections/:id/courts/:courtId`,
   `PATCH /v1/me/collections/:id`); the UI does not change.
9. **Two routes are dynamic *because* of mutable/server-derived state, not just slug routing:**
   - `/courts/[slug]` reads the (mutable) user-collection folder list + per-court membership on the
     server (`getSavedCollections` + `getCollectionIdsForCourt`) to seed the Add-to-Collection menu,
     so it stays SSR (Feature 36).
   - `/saved/collections/[slug]` is SSR and additionally mounts the `<UserCollectionRename>` **client
     island** in its hero (Feature 37) — the page itself stays a pure server read; the island owns
     the mutation + the client-side `router.replace`.
   - `/journal/[slug]` and `/collections/[slug]` remain dynamic for ordinary slug-based SSR reads.
10. **`ArticleSchema.author` added (optional)** (Feature 31, `packages/contracts/src/article.ts`)
    and seeded per article in `packages/mock-data/src/articles.ts` ("Janet See"). The byline avatar
    initials are **derived in the component** (`author.split(' ').map(w => w[0]).join('')`) — no
    `authorInitials` field. `UserCollectionSchema.slug` was **promoted from optional to required**
    and `UserCollectionWithCourtsSchema` added (Features 33/34) for the user-collection detail read.

---

## 4. Hard-rule compliance (verified)

Phase 1's non-negotiables, confirmed still true at completion:

- ❌ **No auth, no payments, no Stripe.** Paywall checkout CTA is `<button disabled>`.
- ❌ **No live API calls.** Only the mock data source is wired; `api` branch throws.
- ❌ **No `apps/web/app/api` directory** (Decision #16) — confirmed absent.
- ❌ **No real submit / persistence.** Consultation + auth submits are local state only; no fetch,
  no `localStorage` for form data, no CRM, no email, no session/cookies/JWT/OAuth.
- ❌ **No global state library, no new dependencies.**
- ⚠️ **One documented exception to "presentational only":** the **mock-only user-collection mutation
  seam** (§3.8 — `createUserCollection` / `toggleCourtInCollection` / `renameUserCollection`,
  in-memory). It adds **no** backend, API, auth, localStorage, or persistence; it is the Phase-4
  swap point. The three approved client islands that call it through `@/lib/repositories` are
  `CreateCollectionTrigger`, `SaveToCollectionMenu`, and `UserCollectionRename` — verified by grep
  to be the **only** feature/component imports of `repositories`.
- ✅ **Data-driven:** every court/collection/article string flows from `@tennis/mock-data` through
  a repository. Demo content is editable in `packages/mock-data` with zero `.tsx` changes. (Static
  legal/marketing/auth copy is feature-local page chrome by design — FEATURE_28 §6 — not routed
  through a repository.)
- ✅ **Import boundary** active and passing in lint: no UI imports `@tennis/mock-data`, a
  `mock-*.repository`, or the `@/domain` factory; `@tennis/mock-data` is imported only inside
  `src/domain/**`.
- ✅ **Coordinate safety** (Risk #17): no `lat`/`lng` reaches the UI. Map pins (Map screen, Saved
  wishlist map) are positioned **only** from each court's decorative `mapCoords` (`[x%, y%]`). The
  Court Detail location preview is a styled box that never receives coordinates. The user-collection
  detail + article detail use court summaries / approximate geo only.

The full inventory of intentionally-inert controls (what stays a placeholder and why, with the
exact future-phase target for each) lives in **`PHASE_1_PLACEHOLDER_CTA_AUDIT.md`** — that doc is
the authoritative leftover list; this summary does not duplicate it.

---

## 5. Verification (last full pass — Feature 38 final QA)

| Command                          | Result                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors                                                     |
| `pnpm typecheck`                 | ✅ 7/7 packages pass                                                                |
| `pnpm build`                     | ✅ 5/5 build; web generates all 14 route entries + `_not-found` (clean, non-cached) |

Build route split (Feature 38): **Dynamic (SSR, ƒ):** `/courts/[slug]`, `/collections/[slug]`,
`/journal/[slug]`, `/saved/collections/[slug]`. **Static (○):** everything else, including
`/about`, `/privacy`, `/terms`, `/signin`, `/signup`.

Architecture QA (Feature 38, grep-verified): no `apps/web/app/api` or `apps/web/src/app/api`; no
`localStorage` in `apps/web/src` outside doc/comment strings; no `@tennis/mock-data` import outside
`src/domain/**`; the only feature/component imports of `@/lib/repositories` are the three approved
mutation islands (`CreateCollectionTrigger`, `SaveToCollectionMenu`, `UserCollectionRename`). The
only rendered `href="#"` placeholders are the documented ones (Court Detail "Get Directions" ×2,
profile menu fallback rows, footer "Restore").

Modal a11y/behavior QA confirmed from code for all three modals (Paywall, Consultation,
Create-Collection): `role="dialog"` + `aria-modal`, Escape close, backdrop close, focus moves into
the dialog and returns to the trigger on close, body scroll-lock with proper cleanup (restores prior
`overflow`), portal SSR guard, required-field validation, success state, and reset-on-reopen. The
Add-to-Collection dropdown (`SaveToCollectionMenu`) and the inline Rename use lighter
outside-click/Escape handling appropriate to a menu/inline-edit (not full dialogs).

**Known non-blocking gap (unchanged):** the dialog modals do not implement a **Tab focus trap**
(focus can Tab out of an open dialog). Escape/backdrop/restore all work. A reasonable polish item,
out of scope for Phase 1; flagged so it isn't mistaken for a regression.

---

## 6. Exit criteria — checklist

From `PHASE_1_WEB_MOCK_FIRST.md` §"Exit criteria for Phase 1":

- [x] All prototype screens (**both waves**) **plus Court Detail** implemented in `apps/web`,
      data-driven from mock repositories.
- [x] Lint rule preventing direct `domain/mock`/`domain/http` imports is active and passing.
- [x] All **domain** content changeable by editing only `packages/mock-data` (no `.tsx` changes).
      (Static legal/marketing/auth copy is feature-local page chrome, by design — FEATURE_28 §6.)
- [x] No real auth, no payments, no live API calls anywhere in `apps/web`. The one mutation seam is
      mock-only/in-memory (§3.8): no backend, no localStorage, no persistence.
- [x] No `apps/web/app/api` (or `apps/web/src/app/api`) directory exists (Decision #16).

**Phase 1 is complete — including the second design wave (Features 29–37) and the Feature 38 final
QA pass.**

---

## 7. Handoff to Phase 2 — where to start

> **Phase 2 is now COMPLETE (Features 39–48).** The plan below was followed; for the _as-built_
> Phase-2 state and the handoff to the next phase (auth + user persistence) see
> **`docs/PHASE_2_COMPLETION_SUMMARY.md`**.

Phase 2 is **NestJS API + real data** (`IMPLEMENTATION_BACKLOG.md` §"Phase 2"). The mock-first
design means the swap should be _additive_, not a rewrite. Recommended order:

1. **Finalize the Prisma schema** (Decision #13) — the Phase 0 draft + its
   `000_draft_do_not_build_on` migration are disposable. Reset the dev DB and regenerate a clean
   initial migration now that Phase 1 has validated the real data shapes.
2. **Seed from `packages/mock-data` into Postgres** — write a diff test proving the seeded data is
   identical to what the Phase 1 mock repositories return. `packages/mock-data` is the contract.
3. **Build public discovery endpoints** (`/v1/courts`, `/v1/courts/:slug`, `/v1/courts/map`,
   `/v1/collections`, `/v1/articles`, …) + **coordinate masking**: in Phase 2 every court-returning
   endpoint omits exact `lat/lng` (no entitlement system yet — all requests treated as non-entitled
   until Phase 4).
4. **Add `POST /v1/consultations`** (anonymous allowed) — and on the web side, introduce the
   missing `ConsultationRepository` and wire the modal's `handleSubmit` to it (see §3.5 above).
5. **Build `apps/web/src/domain/http/*`** against the live endpoints, typed via `@tennis/contracts`
   — mirroring each existing mock repository (including the `saved`/`user` split, §3.2).
6. **Flip `NEXT_PUBLIC_DATA_SOURCE=api`** in a staging deploy; run the page suite in both `mock` and
   `api` modes and verify **zero UI changes** were needed. That equivalence is the mock-first proof
   point — make the dual-mode run a permanent CI step.

**Stays deferred past Phase 2:** auth (the `/signin` + `/signup` screens are UI-only shells),
payments/Stripe, real unlock/entitlement gating, the individual saved/unlock court toggle, the
**HTTP swap of the mock user-collection mutation seam** (§3.8 — create/toggle/rename behind
`/v1/me/collections*`), and the remaining placeholder CTAs (directions, account/settings, restore,
article Share) — all Phase 4 / later, tracked in `PHASE_1_PLACEHOLDER_CTA_AUDIT.md`. (The static
About/Privacy/Terms pages are **built routes**, not deferred; their Privacy/Terms bodies still carry
placeholder *legal copy* to be replaced by counsel before launch.)

### Phase-2 pre-req that needs a human, not the implementer

Per `IMPLEMENTATION_BACKLOG.md` / Risk #9: the **image CDN provider must be chosen before Phase 2
seed finalization**. `CourtImage.url` is an opaque string today; don't let the implementer pick a
provider — surface this as a decision.
