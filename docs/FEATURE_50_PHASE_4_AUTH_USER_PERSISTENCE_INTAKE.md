# Feature 50 — Phase 4: Auth + User Persistence (Intake / Planning)

**Status:** 📋 **Planning / intake only — no product code.** This document audits the current
auth/user/saved state, recommends an auth architecture, and breaks Phase 4 into small
implementable features. It changes **only** documentation — no `apps/api`, `apps/web`,
`packages/*`, Prisma schema, migration, dependency, CI, or UI change is made here.
**Date:** 2026-06-29.
**Audience:** whoever implements the Phase-4 feature group (Features 51+).

> **Update (2026-06-30): Phase 4 is now complete (Features 50–59).** This intake remains the original
> plan of record; the _as-built_ outcome — auth architecture, the delivered `/v1/me/*` endpoints, the
> factory flip, verification (35/35 · 17/17 · 21/21), the CI gate, and what stayed deferred — is in
> `PHASE_4_COMPLETION_SUMMARY.md`. Read that for the current state.
**Read alongside:** `PHASE_2_COMPLETION_SUMMARY.md` (the as-built Phase-2 state + §10 hybrid seams),
`PHASE_1_COMPLETION_SUMMARY.md` (§3.8 the mock mutation seam; §3.2 the saved/user split),
`PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the living inert-control inventory),
`FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md`, `FEATURE_47_DUAL_MODE_PARITY.md`,
`IMPLEMENTATION_BACKLOG.md` (Phase 4 line items), `../ARCHITECTURE_PLAN.md` (Decisions #11/#12/#16).

**The Phase-4 contract, restated:** retire the remaining `saved` / `user` mock seams in `api` mode
by introducing a real auth identity and `/v1/me/*` persistence, swapping
`MockSavedRepository` / `MockUserRepository` for HTTP implementations **behind the same
interfaces** — so the factory branch is the only change and **the UI does not move**. Payments,
Stripe, entitlement unlock, and exact-coordinate exposure are **explicitly out of scope** (§10).

---

## 1. Current state audit — auth / user / saved

### 1.1 Auth — none exists

There is **no** auth anywhere in the stack today (confirmed by grep + file reads):

- **No `/v1/auth/*` endpoints.** `apps/api/src/app.module.ts` wires only `Health`, `Courts`,
  `Collections`, `Articles`, `Consultations`, `Prisma` modules. No auth module, no guard, no
  strategy, no `@nestjs/passport` / `@nestjs/jwt` dependency (`apps/api/package.json` has only
  Nest core, Prisma, class-validator/-transformer, rxjs, reflect-metadata).
- **No session/JWT/cookie/OAuth.** `apps/api/src/main.ts` sets the `v1` prefix, a global
  `ValidationPipe`, **permissive `enableCors()`** (no `credentials`, no origin allowlist), and
  shutdown hooks. Nothing reads or sets a cookie or `Authorization` header.
- **`/signin` and `/signup` are UI-only shells.** `apps/web/src/features/auth/SignInForm.tsx`
  (magic-link) and `SignUpForm.tsx` (name + email) `preventDefault`, guard a non-empty field, run
  a **cosmetic `setTimeout`**, then flip to a local "Check your inbox" / "Confirm your email"
  success state. **No fetch, no API, no session, no cookies, no JWT, no OAuth, no localStorage**
  (Decision #11). The Apple/Google buttons are inert (`<button type="button">` with no handler).
- **`isLoggedIn` is a hardcoded `const false`** in two places — `components/layout/AppHeader.tsx:25`
  and `features/profile/ProfileMenuList.tsx:26` — not a session, context, or provider. It only
  chooses the nav user-icon target (`/profile` vs `/signin`) and Sign-In-vs-Sign-Out row. Real
  logout (Sign Out row) is still an inert `href="#"` placeholder.

### 1.2 Profile page expectations

`apps/web/src/app/profile/page.tsx` is a server component that reads three repository methods:
`user.getCurrentUser()`, `saved.getSavedCourts()`, `saved.getSavedCollections()`. It **derives**
all stats server-side (saved-courts count, collections count, distinct-countries count) and derives
`unlocked = user.membership === 'lifetime'`. `DEFAULT_MOCK_USER` is `'free'`, so `unlocked` is
`false` and the membership card + "Unlock Map" CTA render. **No email or private field is read or
displayed** — only `name`, `initials`, `membership`.

### 1.3 `UserRepository` — interface + mock

- **Interface** (`domain/user/user.repository.ts`): a single method
  `getCurrentUser(): Promise<UserProfileDTO>`. Read-only by design; **no** `getEntitlementStatus()`,
  no login/logout, no mutation (Decision #11/#12).
- **Mock** (`domain/user/mock-user.repository.ts`): returns a copy of `DEFAULT_MOCK_USER`
  (Eleanor Morgan / "EM" / `membership: 'free'`). No joining, no derivation.

### 1.4 `SavedRepository` — interface + mock (the mutation seam)

- **Interface** (`domain/saved/saved.repository.ts`) — **5 reads + 3 mutations**:
  - Reads: `getSavedCourts()` → `CourtSummaryDTO[]`; `getSavedCollections()` →
    `UserCollectionDTO[]`; `getUserCollectionBySlug(slug)` → `UserCollectionWithCourtsDTO | null`;
    `getCollectionIdsForCourt(courtId)` → `string[]` (the narrow membership read for the
    Add-to-Collection checkmarks — see the `court-collection-membership-read` memory).
  - Mutations (Feature 34, mock-only): `createUserCollection(name)` → `UserCollectionDTO`;
    `toggleCourtInCollection(collectionId, courtId)` → `void`; `renameUserCollection(collectionId,
    name)` → `UserCollectionDTO`.
- **Mock** (`domain/saved/mock-saved.repository.ts`): in-memory folders seeded by **cloning**
  `DEFAULT_USER_COLLECTIONS`; saved courts seeded from `DEFAULT_SAVED_COURT_SLUGS`. `count` and
  `coverImageUrls` are **derived** from live membership at projection time. Exposes two reusable
  pure helpers — `slugifyCollectionName(name)` and `ensureUniqueSlug(base, existing, current?)` —
  that the Phase-4 server will want to **reproduce** (slug derivation must match). `nextId` is a
  monotonic counter (`user-col-1`, …) kept deterministic (no `Date.now()`/random) for server
  safety.
- **Not in the interface:** `toggleSavedCourt(courtId)` (individual save/unsave global toggle) is
  **deliberately absent** — the `CourtCard` heart is visual-only. Phase 4 will likely add it (the
  saved-courts list has to become mutable for the heart to work), but it is **not required** to
  retire the existing seams. Flagged as an open question (§12, Q4).

### 1.5 Mutation use-sites (the three client islands)

All three are wired to the mock seam through `@/lib/repositories` and are the **only** feature/
component imports of `repositories` (grep-verified in Phase 1):

| Island | Reads / writes | Server seed | Persistence model today |
| --- | --- | --- | --- |
| `features/court-detail/SaveToCollectionMenu.tsx` | `toggleCourtInCollection`, `createUserCollection` | `page.tsx` passes `collections` (`getSavedCollections`) + `initialMemberCollectionIds` (`getCollectionIdsForCourt`) | Local `Set` of member ids is the source of truth after mount; **fire-and-forget** `void toggle(...)`, no await, no `router.refresh` |
| `features/user-collections/CreateCollectionModal.tsx` (+ `CreateCollectionTrigger`) | `createUserCollection` | — | Caller mirrors the returned DTO into local state (`SavedTabs.createdCollections`) |
| `features/user-collection-detail/UserCollectionRename.tsx` | `renameUserCollection` | `page.tsx` server-reads the folder by slug | Title updates from the returned DTO; `router.replace(newSlug)` (history swap only, no refresh) |

**Why the islands treat local state as truth (critical for Phase 4):** the mock repo is an
ES-module singleton, so the **server** process and the **browser** bundle each hold a *separate*
in-memory instance. A mutation fired from a client island reaches the browser instance only; the
server instance that rendered the page never sees it. The islands therefore mirror the returned DTO
into local state and never re-read the server — the divergence is invisible (the
`saved-repo-client-server-boundary` memory). **Phase 4 fixes this at the root:** once the seam is a
real HTTP call to `/v1/me/*` against Postgres, both server components and browser islands hit the
**same** persisted state, so the divergence disappears and a `router.refresh()` becomes *correct*
(though the optimistic-local pattern can stay for snappy UX).

### 1.6 Saved/collection detail pages (the read use-sites)

- `app/saved/page.tsx` → `getSavedCourts()` + `getSavedCollections()` (server).
- `app/profile/page.tsx` → `getCurrentUser()` + `getSavedCourts()` + `getSavedCollections()`.
- `app/courts/[slug]/page.tsx` → `getSavedCollections()` + `getCollectionIdsForCourt(court.id)`
  (server) to seed the Add-to-Collection menu.
- `app/saved/collections/[slug]/page.tsx` → `getUserCollectionBySlug(slug)` (server; also in
  `generateMetadata`).

### 1.7 Contracts for user/saved/auth today

`packages/contracts/src/user.ts` holds (all marked "INTENTIONALLY MINIMAL STUBS"):
`MembershipStatus` (`free | lifetime`), `UserProfileSchema` (`id, name, initials, membership`),
`UserCollectionSchema` (`id, name, count, coverImageUrls?, slug`),
`UserCollectionWithCourtsSchema` (= `UserCollection` + `courts: CourtSummary[]`), and a stub
`EntitlementSchema`. **There are no auth DTOs and no `SavedCourtDTO`** — saved courts are just
`CourtSummaryDTO[]`. `CourtSummarySchema` lives in `court.ts`.

### 1.8 Audit verdict — what is still mock

| Area | State in `api` mode | Phase-4 action |
| --- | --- | --- |
| `user` repository | **MOCK** | HTTP `GET/PATCH /v1/me` behind `UserRepository` |
| `saved` repository (5 reads + 3 mutations) | **MOCK** (in-memory) | HTTP `/v1/me/saved-courts` + `/v1/me/collections*` behind `SavedRepository` |
| Add-to-Collection / Rename / Create | **MOCK** seam (client-island local state) | persisted via `POST/PATCH/DELETE /v1/me/collections*` |
| Auth identity | **none** | real auth (§3) |
| `/signin` `/signup` | UI-only shells | wired to real auth (Feature 57) |
| Entitlement / unlock | page-level `const unlocked = false` | **OUT OF SCOPE** (later feature group) |
| Exact `lat`/`lng` | stored in DB, exposed by nothing | **OUT OF SCOPE** (entitlement-gated, later) |

---

## 2. Prisma schema readiness audit

`apps/api/prisma/schema.prisma` already carries every model Phase-4 saved/user persistence needs.
**No schema change is strictly required to ship the saved/user/collection persistence** — the
models exist as FK targets and are simply unread/unwritten today. Detailed review:

### 2.1 `User` — present, sufficient for magic-link/OAuth; **may need a password column**

```
model User {
  id           String   @id @default(cuid())
  email        String   @unique          // ✅ unique — login key
  name         String?
  authProvider String?                    // ✅ free-text provider tag ("magic" | "google" | …)
  createdAt    DateTime @default(now())
  entitlements / savedCourts / userCollections / consultationRequests  // relations present
}
```

- **Sufficient as-is for magic-link or OAuth** (no secret stored on `User`).
- **If email+password is chosen** (§3): add `passwordHash String?` (nullable so OAuth/magic-link
  users have none). Document-only here — **do not add it** until the auth strategy is ratified.
- **No `updatedAt`** on `User` (Profile `PATCH` would benefit; optional, low-stakes).
- Magic-link / refresh tokens, if persisted (vs. stateless JWT), need a **new** table (e.g.
  `AuthToken` / `MagicLinkToken` / `Session`) — see §3 and §8 Feature 51.

### 2.2 `SavedCourt` — present, sufficient

```
model SavedCourt {
  userId / user    // FK
  courtId / court  // FK
  savedAt DateTime @default(now())
  @@id([userId, courtId])               // ✅ composite PK = natural idempotency for save/unsave
}
```

The composite PK makes `POST` (save) idempotent and `DELETE` (unsave) a single-row delete. No
change needed.

### 2.3 `UserCollection` + `UserCollectionCourt` — present; **slug is the gap**

```
model UserCollection {
  id / userId / user / name / createdAt
  courts UserCollectionCourt[]
}
model UserCollectionCourt {
  userCollectionId / courtId / sortOrder
  @@id([userCollectionId, courtId])     // ✅ composite PK = add/remove idempotency
}
```

- **Missing `slug`.** The web routes a user folder by **slug** (`/saved/collections/[slug]`), and
  `UserCollectionDTO.slug` is **required** in the contract. The Prisma model has **no `slug`
  column**. Two viable resolutions (decision for Feature 51):
  - **(A, recommended) Persist `slug`** — add `slug String` to `UserCollection`, **unique per
    user** (`@@unique([userId, slug])`, not globally unique — two users may both have
    `summer-trip`). The server derives it on create/rename with the **same** `slugifyCollectionName`
    + `ensureUniqueSlug` logic the mock uses (scoped to that user's folders). This keeps the DTO
    stable and the URL stable across reloads.
  - **(B) Derive `slug` at read time** from `name` — simpler schema, but rename collisions and
    non-ASCII names get fragile, and a derived slug isn't a stable lookup key for
    `GET /v1/me/collections/:slug`. **Not recommended.**
- **No `updatedAt`** on `UserCollection` (optional).
- **`UserCollectionCourt.sortOrder`** exists (good — preserves the mock's insertion order).

### 2.4 `Entitlement` — present as a stub, **untouched in Phase 4 scope**

The stub stays. Per-user gating, effective-entitlement service, and exact-coordinate exposure are a
**later** feature group (blocked on auth, but not part of this intake — §10).

### 2.5 `AdminUser` — present (`passwordHash`, `role`); not Phase-4 (admin is Phase 3)

### 2.6 Schema verdict

| Model | Phase-4-ready? | Required change |
| --- | --- | --- |
| `User` | ✅ (magic-link/OAuth) | **+`passwordHash String?`** *only if* email+password chosen; optional `updatedAt` |
| `SavedCourt` | ✅ | none |
| `UserCollection` | ⚠️ | **+`slug String` + `@@unique([userId, slug])`** (option A) |
| `UserCollectionCourt` | ✅ | none |
| token/session table | ❌ (absent) | **new model** only if tokens are persisted (magic-link always; refresh optional) |
| `Entitlement` | ✅ (stub, untouched) | none in Phase 4 scope |

> **Schema is NOT changed in this feature.** The above is the documented change-set for Feature 51,
> to be ratified once the auth strategy (§3) is chosen.

---

## 3. Auth strategy — options + recommendation

### 3.1 Constraints that shape the choice

- **Web now (Next.js App Router) consuming a Nest API on a different origin** (web `:3000`, API
  `:3001` in dev). Server components *and* browser client islands both call repositories.
- **Future Flutter mobile** (Phase 6) must authenticate against the **same** API. Mobile cannot use
  browser cookies → it needs a **bearer-token** path.
- **Future payments/entitlements** ride on the same identity (Stripe customer ↔ `User`).
- **The prototypes already say "magic link"** — `/signin` is a magic-link form, `/signup` is
  name+email, both captioned "No password needed — we'll email you a secure sign-in link." Choosing
  email+password would contradict the shipped UI copy and the inert Apple/Google buttons frame
  social as *additional*, not primary.
- **Hard rule (Decision #16):** no business logic under `apps/web/app/api`. The only acceptable web
  route is framework-mandated plumbing (e.g. an OAuth callback) that immediately delegates to the
  API. Magic-link verify can land on the web origin as a thin redirect that forwards the token to
  the API, **or** land directly on the API — see §7.

### 3.2 Options matrix

| Option | Complexity | Web fit | Mobile fit | Security notes | API impact | FE impact | New deps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Email magic link** | Low–Med | ✅ matches shipped UI | ✅ (deep link → token) | No password to leak; token must be single-use, short-TTL, hashed at rest | `request` + `verify` endpoints; a `MagicLinkToken` table; email sender | minimal — forms already exist | mailer (e.g. `nodemailer` / provider SDK) + `@nestjs/jwt` |
| **Email + password** | Med | ⚠️ contradicts "no password needed" copy | ✅ | bcrypt/argon2 hashing; reset flow; enumeration risk | `register`/`login`; `passwordHash` column | rewrite both forms | `bcrypt`/`argon2` + `@nestjs/jwt` |
| **Google / Apple OAuth** | Med–High | ✅ (buttons already drawn) | ✅ (native SDKs) | redirect-URI allowlist, state/PKCE, provider config/secrets | callback handling, provider clients | wire the inert buttons | `@nestjs/passport` + provider strategies |
| **JWT access token** (transport, not a method) | Low | ✅ | ✅ | short-lived; pair with refresh; never in `NEXT_PUBLIC_` | issuance/verify guard | attach to requests | `@nestjs/jwt` |
| **httpOnly cookie session** (transport) | Low–Med | ✅ best for web XSS posture | ❌ not usable by mobile | `Secure`+`HttpOnly`+`SameSite`; CSRF if cookie-auth'd mutations | set/clear cookie; CORS `credentials` | cookies are automatic | none (or `cookie-parser`) |

### 3.3 Recommendation

**Primary auth method: email magic link. Token transport: a short-lived JWT access token issued on
verify, delivered to the web app as an `httpOnly` cookie *and* returned in the JSON body for
non-browser clients (mobile).** Defer social OAuth and refresh-token rotation to follow-on features.

Rationale:

1. **Magic link matches the shipped UI** (both forms, both captions) — zero UI redesign, the inert
   Apple/Google buttons stay inert for now (still tracked as placeholders).
2. **No passwords** → no hashing/reset/enumeration surface to get wrong in the MVP; the only secret
   is the one-time link token (hashed at rest, single-use, short TTL).
3. **JWT-in-cookie for web** gives the best XSS posture (the token is not readable by JS, so a
   script injection can't exfiltrate it) and lets **server components forward the incoming cookie**
   to the API with no token plumbing in the browser bundle.
4. **JWT-in-body for mobile** means the *same* `/v1/auth/verify` serves Flutter later — it stores
   the token in secure storage and sends `Authorization: Bearer` — so the API's guard accepts
   **either** a cookie or a bearer header (one guard, two extractors). This is the single most
   important forward-compatibility decision; it keeps the Phase-6 mobile contract honest.
5. **Stateless access JWT** (signed, ~15–60 min TTL) keeps the API horizontally scalable; the only
   persisted token table is the **magic-link** table (always needed). A persisted **refresh** token
   (for silent re-auth) is recommended but can be a follow-on feature (§8 Feature 52 vs. a later
   one) — for the MVP a longer-lived access cookie is acceptable if refresh is deferred, documented
   as a known trade-off.

> This is **design only.** No dependency is added, no auth is wired, in this feature. `@nestjs/jwt`,
> a mailer, and (if OAuth is later adopted) `@nestjs/passport` + provider strategies are the
> expected installs **at implementation time**, not now.

---

## 4. Endpoint plan (`/v1/*`)

All new endpoints sit under the existing `v1` global prefix. `/v1/me/*` requires auth (the guard
accepts cookie **or** bearer); `/v1/auth/*` is public (it *establishes* identity).

### 4.1 Auth

| Method | Path | Auth | Request DTO | Response | Prisma | Status codes |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/v1/auth/request-link` | public | `RequestMagicLinkDTO { email }` | `{ ok: true }` (always, no enumeration) | create `MagicLinkToken` (hashed), send email | 202 / 400 / 429 |
| POST | `/v1/auth/verify` | public | `VerifyMagicLinkDTO { token }` | `AuthSessionDTO { user, accessToken? }` + `Set-Cookie` | consume token, upsert `User`, issue JWT | 200 / 400 (bad/expired/used) |
| POST | `/v1/auth/logout` | auth (cookie/bearer) | — | `{ ok: true }` + cookie cleared | (revoke refresh if persisted) | 204 / 200 |
| POST | `/v1/auth/refresh` *(optional, follow-on)* | refresh cookie | — | `AuthSessionDTO` | rotate refresh token | 200 / 401 |

> **`/signup` vs `/signin`:** with magic link the two collapse server-side — `verify` **upserts**
> the `User` by email (creating on first link). The web keeps both screens for UX (signup also
> collects `name`, which the verify/create can persist). No separate `register` endpoint is required
> for magic-link; one is only needed if email+password is chosen. The prompt's
> `POST /v1/auth/register` + `POST /v1/auth/login` map onto `request-link` + `verify` for the
> magic-link design.

### 4.2 Profile (`/v1/me`)

| Method | Path | Auth | Request DTO | Response | Prisma | Backs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/v1/me` | ✅ | — | `UserProfileDTO` (+ optional `email`) | `User` by id | `UserRepository.getCurrentUser()` | 200 / 401 |
| PATCH | `/v1/me` | ✅ | `UpdateProfileDTO { name? }` | `UserProfileDTO` | update `User` | (new `updateProfile`?) | 200 / 400 / 401 |
| DELETE | `/v1/me` | ✅ | — | `204` | cascade-delete user data | (App-Store deletion req.) | 204 / 401 |

> `DELETE /v1/me/account` is an App-Store requirement on the backlog (Phase 4). It is **adjacent**;
> include it in the profile feature *if cheap*, else split it out. Not required to retire the seams.
> `PATCH /v1/me` has **no current UI call site** (Profile is read-only) — build the endpoint, but
> wiring an edit form is optional/out-of-scope for the seam retirement (§12, Q3).

### 4.3 Saved courts (`/v1/me/saved-courts`)

| Method | Path | Auth | Request | Response | Prisma | Backs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/v1/me/saved-courts` | ✅ | — | `CourtSummaryDTO[]` | `SavedCourt` join → `Court` (public select) | `getSavedCourts()` | 200 / 401 |
| POST | `/v1/me/saved-courts` | ✅ | `{ courtId }` | `204`/`CourtSummaryDTO` | upsert `SavedCourt` (idempotent on composite PK) | `toggleSavedCourt` add | 204/201 / 400 / 401 |
| DELETE | `/v1/me/saved-courts/:courtId` | ✅ | — | `204` | delete `SavedCourt` | `toggleSavedCourt` remove | 204 / 401 |

> **Coordinate masking carries over unchanged:** the `SavedCourt → Court` read MUST reuse the same
> public Prisma `select` as `courts.mapper.ts` (no `lat`/`lng` selected), so exact geo cannot leak
> through the saved list. This is the same structural guarantee Phase 2 asserts.

### 4.4 User collections (`/v1/me/collections`)

| Method | Path | Auth | Request | Response | Prisma | Backs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/v1/me/collections` | ✅ | — | `UserCollectionDTO[]` | `UserCollection` (+ `_count`/covers) | `getSavedCollections()` | 200 / 401 |
| POST | `/v1/me/collections` | ✅ | `CreateUserCollectionDTO { name }` | `UserCollectionDTO` | create (derive unique slug per user) | `createUserCollection(name)` | 201 / 400 / 401 |
| GET | `/v1/me/collections/:slug` | ✅ | — | `UserCollectionWithCourtsDTO` | folder + members (public court select) | `getUserCollectionBySlug(slug)` | 200 / 404 / 401 |
| PATCH | `/v1/me/collections/:id` | ✅ | `RenameUserCollectionDTO { name }` | `UserCollectionDTO` | rename + re-derive slug | `renameUserCollection(id, name)` | 200 / 400 / 404 / 401 |
| DELETE | `/v1/me/collections/:id` | ✅ | — | `204` | delete folder + members | *(new — see Q5)* | 204 / 404 / 401 |
| POST | `/v1/me/collections/:id/courts` | ✅ | `{ courtId }` | `204`/DTO | upsert `UserCollectionCourt` | `toggleCourtInCollection` add | 204/201 / 400 / 404 / 401 |
| DELETE | `/v1/me/collections/:id/courts/:courtId` | ✅ | — | `204` | delete `UserCollectionCourt` | `toggleCourtInCollection` remove | 204 / 404 / 401 |

**Key reconciliations with the existing interface (do not blindly accept the prompt list):**

1. **`toggleCourtInCollection` splits into POST-add / DELETE-remove.** The mock interface is a
   single *toggle* (`Promise<void>`). REST should be explicit add/remove (idempotent on the
   composite PK). The **HTTP repository** keeps the `toggleCourtInCollection(collectionId, courtId)`
   signature so **the UI does not change** — internally it decides add vs. remove. The cleanest way
   to keep the toggle honest without a read-modify-write race is: the island already tracks local
   membership, so it knows whether it is adding or removing and the HTTP repo can be told, *or* the
   repo issues POST and treats a 409/duplicate as "already there → remove." **Recommended:** widen
   the *internal* repo method (not the interface) — e.g. the island passes the desired next state —
   **or** keep `toggle` and have the repo `GET` membership first. Decide in Feature 56; the
   **interface signature stays** either way. (Flagged §12, Q1.)

2. **Collection lookups are split by key:** detail is by **slug** (`GET …/:slug`, matches the web
   route + `getUserCollectionBySlug`), mutations are by **id** (`PATCH/DELETE …/:id`, matches the
   interface's `collectionId`). This mirrors the Phase-2 courts pattern (route by slug, repo
   resolves id↔slug) and the existing interface exactly. The HTTP repo will already have the folder
   list (ids + slugs) from `getSavedCollections()`, so it can resolve as Phase-2's
   `HttpCourtRepository.getRelated` already does (id → slug via a `list()`).

3. **`createUserCollection` returns the created `UserCollectionDTO`** (count 0, no covers) — exactly
   the mock's contract; the menu/`SavedTabs` mirror it into local state unchanged.

4. **Slug derivation must match the mock.** The server derives slugs with the *same* algorithm as
   `slugifyCollectionName` + `ensureUniqueSlug` (kebab; dedupe `-2`, `-3`; uniqueness **scoped to
   the user**). Either lift those helpers into `@tennis/contracts` (or a shared util both sides
   import) or re-implement identically in the service. Keeping them shared avoids drift (a parity
   risk). (Flagged §12, Q2.)

5. **`DELETE` collection** has **no current UI** (no per-folder delete is rendered). Add the
   endpoint for completeness/admin, but it is **not required** to retire the seams; it can be
   deferred. (Flagged §12, Q5.)

---

## 5. DTO / contracts plan (`packages/contracts`)

Source of truth for both sides; keep stable for Flutter; never leak Prisma internals or private
user fields beyond what the screen needs.

### 5.1 Already exist — reuse unchanged

- `UserProfileDTO` (`id, name, initials, membership`) — the profile shape. **`GET /v1/me` returns
  exactly this** so `UserRepository.getCurrentUser()` is a drop-in HTTP swap. (Optionally extend
  with `email?` — see 5.3.)
- `UserCollectionDTO` (`id, name, count, coverImageUrls?, slug`) — list + create/rename result.
- `UserCollectionWithCourtsDTO` — folder detail.
- `CourtSummaryDTO` — saved-courts list + folder members.
- `MembershipStatus`, `EntitlementSchema` (untouched — entitlement is out of scope).

### 5.2 Must be added (auth)

- `RequestMagicLinkDTO` — `{ email: string }` (`z.string().email()`).
- `VerifyMagicLinkDTO` — `{ token: string }`.
- `AuthSessionDTO` — `{ user: UserProfileDTO; accessToken?: string }` (token present for mobile;
  omitted/ignored for the web cookie path). **No refresh token in the body** if it is cookie-only.
- *(optional)* `UpdateProfileDTO` — `{ name?: string }` for `PATCH /v1/me`.
- *(optional, follow-on)* `CreateUserCollectionDTO { name }`, `RenameUserCollectionDTO { name }` —
  thin request shapes; can also stay inline class-validator DTOs in the API (the consultation
  pattern) without a contract export, since the **request** bodies are trivial and the **response**
  is the already-shared `UserCollectionDTO`.

### 5.3 Decisions for the contracts feature (Feature 51)

- **Expose `email` on the profile?** The Profile UI does **not** render email today. Keeping
  `UserProfileDTO` email-free (per §9 "no private fields unnecessarily") is the conservative
  default; if a settings screen later needs it, add `email?` then, or return it on a separate
  `GET /v1/me` field. **Recommended: do not add `email` to the shared profile DTO now.**
- **`SavedCourtDTO`?** Not needed — saved courts are `CourtSummaryDTO[]` (matches the mock and the
  Saved/Profile UI). Don't introduce a wrapper.
- **Runtime-import caveat:** the API imports `@tennis/contracts` **type-only** (its TS-source `main`
  can't be `require`d by Node) and uses class-validator **classes** as the runtime validators, with
  a compile-time `satisfies`/`extends` guard keeping them in sync (the
  `api-contracts-type-only-import` memory). New auth request DTOs follow that exact pattern —
  class-validator class in the API + a structural assertion against the zod contract.

### 5.4 Contracts summary

| DTO | Status | Where |
| --- | --- | --- |
| `UserProfileDTO` | exists | `GET/PATCH /v1/me`, `AuthSessionDTO.user` |
| `UserCollectionDTO` / `…WithCourtsDTO` | exists | collections endpoints |
| `CourtSummaryDTO` | exists | saved-courts + folder members |
| `RequestMagicLinkDTO` / `VerifyMagicLinkDTO` / `AuthSessionDTO` | **add** | `packages/contracts/src/auth.ts` (+ `index.ts` re-export) |
| `UpdateProfileDTO` | add (optional) | `user.ts` or `auth.ts` |
| `CreateUserCollectionDTO` / `RenameUserCollectionDTO` | add (optional) or inline-in-API | — |

---

## 6. Web repository plan (`apps/web/src/domain`)

### 6.1 New HTTP implementations

- **`HttpUserRepository`** (`domain/http/http-user.repository.ts`) — `getCurrentUser()` →
  `GET /v1/me` (authenticated). Drop-in for `MockUserRepository` behind `UserRepository`.
- **`HttpSavedRepository`** (`domain/http/http-saved.repository.ts`) — implements all 8 methods:
  - `getSavedCourts()` → `GET /v1/me/saved-courts`
  - `getSavedCollections()` → `GET /v1/me/collections`
  - `getUserCollectionBySlug(slug)` → `GET /v1/me/collections/:slug` (404 → `null`)
  - `getCollectionIdsForCourt(courtId)` → derive from `getSavedCollections()` membership, **or** a
    narrow `GET /v1/me/courts/:courtId/collection-ids` (mirrors the mock's narrow read). Prefer the
    narrow endpoint if the folder list is large; otherwise derive. (Minor; Feature 55 decides.)
  - `createUserCollection(name)` → `POST /v1/me/collections`
  - `renameUserCollection(id, name)` → `PATCH /v1/me/collections/:id`
  - `toggleCourtInCollection(id, courtId)` → POST-add / DELETE-remove (§4.4 #1)

These reuse the existing `http-client.ts` (`getJson` / `getJsonOrNull` / `postJson`) — extended
with `patchJson` / `deleteJson` and an **auth-aware** request path (§7).

### 6.2 Factory behavior after Phase 4 (`domain/index.ts`)

The factory's `api` branch becomes fully HTTP:

```
case 'api':
  return {
    courts:       new HttpCourtRepository(),
    collections:  new HttpCollectionRepository(),
    journal:      new HttpArticleRepository(),
    consultation: new HttpConsultationRepository(),
    saved:        new HttpSavedRepository(),   // ← was MockSavedRepository
    user:         new HttpUserRepository(),    // ← was MockUserRepository
  };
```

`mock` mode is **untouched** (user/saved stay mock — the demo still works offline). This is the only
change to the factory; the swap is invisible to the UI by construction (Phase-1 §3.2 / Phase-2 §13).

### 6.3 Pages/components that need NO UI change

Every read use-site (§1.6) and every mutation island (§1.5) keeps its exact code — they call the
**interface**, and the interface is unchanged. Specifically `SaveToCollectionMenu`,
`CreateCollectionModal`/`CreateCollectionTrigger`, `UserCollectionRename`, `SavedTabs`, and all four
server pages render identically. The optimistic-local pattern stays valid; with real persistence a
post-mutation `router.refresh()` *also* becomes correct, but is not required.

### 6.4 What the islands DO gain (the real Phase-4 work in the web)

The non-trivial web work is **authentication transport**, not the repositories' read/write logic:

- **Server components** (the four pages) must forward the caller's identity to the API. With the
  cookie design they read the incoming request cookie (Next `cookies()` from `next/headers`) and
  attach it to the outbound `fetch`. The repository's `getJson` must accept/propagate that cookie
  when called server-side.
- **Browser client islands** (the three mutation islands) call the API directly; with the cookie
  design the cookie is sent automatically **iff** `fetch` uses `credentials: 'include'` **and** CORS
  allows credentials (§7). No token is ever read by JS.
- **Logged-out state** must be handled: today `unlocked`/`isLoggedIn` are hardcoded `false`. Once
  auth is real, `/v1/me/*` returns **401** when unauthenticated. The Saved/Profile pages and the
  Add-to-Collection menu need a logged-out story (redirect to `/signin`, or render an empty/CTA
  state). **This is new UX not present in the mock** and is the main place "zero UI change" stops
  being literally true — flagged as the biggest Phase-4 web risk (§12, Q6). The mock never 401s, so
  the parity harness never exercised this path.

---

## 7. Session / auth transport plan

This is the load-bearing decision; being explicit here prevents a mobile-incompatible web-only
shortcut.

### 7.1 Transport

- **Web uses an `httpOnly` cookie** carrying the access JWT (`Secure`, `SameSite=Lax`, `Path=/`,
  short TTL). The web bundle never sees the token (XSS-resistant).
- **Mobile uses `Authorization: Bearer <jwt>`** (the same token shape, stored in platform secure
  storage). The token is returned in the `AuthSessionDTO` body on `verify` for non-browser clients.
- **The API guard accepts both:** one `AuthGuard` with two extractors — cookie first, then the
  `Authorization` header. This is the single guard the whole `/v1/me/*` surface uses.

### 7.2 Server components → `/v1/me`

Next server components run on the server, so the user's cookie is **not** automatically on an
outbound `fetch`. The page reads the incoming cookie via `cookies()` (`next/headers`) and the
repository attaches it (`headers: { cookie }`) to the API call. → the repository's transport must
support an injected cookie/credential when invoked server-side. (Server components are the
**majority** of saved/user reads — all four pages are server components.)

### 7.3 Client islands → `/v1/me`

Browser islands `fetch` cross-origin to the API. With cookies that requires
`credentials: 'include'` on every request **and** the API responding with
`Access-Control-Allow-Credentials: true` + a **specific** allowed origin (cannot be `*` with
credentials). So the current permissive `enableCors()` must be **tightened** to an env-driven origin
allowlist with `credentials: true` (Feature 52).

### 7.4 Mobile (later)

Flutter sends `Authorization: Bearer`. No cookies, no CORS (native HTTP). The body-returned token on
`verify` is exactly what it needs — this is why the token is **also** in the JSON body, not
cookie-only.

### 7.5 CSRF

With cookie-borne auth on **state-changing** endpoints, CSRF must be addressed. `SameSite=Lax` blocks
cross-site POSTs from forms/navigations and is sufficient for most flows, but cross-site `fetch` with
credentials is the gap. Options: **(a)** `SameSite=Strict` for the auth cookie (mild UX cost on
first-click-from-email — relevant because magic-link arrives via email link), **(b)** a double-submit
CSRF token on mutations, or **(c)** require the bearer header (not the cookie) for mutations from the
SPA. **Recommended:** `SameSite=Lax` + a double-submit token on `/v1/me/*` mutations, OR scope the
cookie to GET-auth and require bearer for writes from the browser. Decide in Feature 52; document the
chosen control.

### 7.6 CORS / credentials

Replace `enableCors()` with `enableCors({ origin: <env allowlist>, credentials: true })`. The web
origin comes from an env var (no hardcoded production origin — same discipline as the API base URL).
Local dev: `http://localhost:3000`.

### 7.7 Logout

`POST /v1/auth/logout` clears the cookie (`Set-Cookie` with an expired/empty value) and, if a
persisted refresh token exists, revokes it. The web then flips its UI to logged-out (the
`isLoggedIn` constant becomes a real value from the session). Stateless access JWTs can't be
individually revoked before expiry — acceptable given the short TTL; a refresh-token revocation list
covers true logout if/when refresh is added.

### 7.8 Env / secrets discipline

- **`NEXT_PUBLIC_API_BASE_URL`** stays (already exists). **No secret** is ever placed behind a
  `NEXT_PUBLIC_` prefix — the JWT signing secret, mailer keys, and any provider secrets live in the
  **API** env only (`apps/api/.env`), never the web bundle.
- New API env: `JWT_SECRET`, `JWT_TTL`, mailer config, `WEB_ORIGIN` (CORS allowlist),
  `MAGIC_LINK_TTL`. Document in `apps/api/.env.example` at implementation time.

---

## 8. Migration plan — Phase 4 broken into small features

Refined from the prompt's suggested sequence against the actual repo state. Each feature is
independently shippable, lint/typecheck/build-green, and behind stable interfaces.

### Feature 51 — Schema + contracts groundwork *(schema + contracts only)*

> **✅ Implemented (2026-06-29).** Additive, backward-safe groundwork only — **no
> behavior, endpoint, web wiring, auth runtime, or UI** was added. Delivered:
> - **Schema** (`apps/api/prisma/schema.prisma`): `UserCollection.slug` +
>   `@@unique([userId, slug])` (per-user, not global); the `MagicLinkToken` model
>   (`id, email, tokenHash @unique, expiresAt, consumedAt?, createdAt, userAgent?,
>   ipHash?` + `@@index([email])`/`@@index([expiresAt])`); `User.updatedAt`.
>   **`passwordHash` was NOT added** — magic link is the ratified method (§3.3), so the
>   `User` row stores no secret.
> - **Migration** `…_add_user_collection_slug_magic_link_token` — one forward migration,
>   no history reset. Hand-authored back-safe (the dev shell is non-interactive, so
>   `migrate dev` can't prompt — same constraint Phase 2 hit): the two new `NOT NULL`
>   columns add a temporary `DEFAULT`, backfill, then `DROP DEFAULT`, so it applies
>   cleanly to a **populated** table (CI/prod), and the final column state matches the
>   datamodel exactly (`migrate diff` schema-vs-history is empty). Local
>   `UserCollection` was empty, so the backfill was a no-op there. Applied via
>   `migrate deploy`; the idempotent seed still runs **12/6/3/15** unchanged.
> - **Contracts:** new `packages/contracts/src/auth.ts`
>   (`RequestMagicLink`/`VerifyMagicLink`/`AuthSession` — `accessToken`/`expiresAt`
>   optional for the mobile bearer path; `AuthSession.user` reuses `UserProfileSchema`,
>   **no `email`** exposed) re-exported from the barrel; request shapes
>   `CreateUserCollection`/`RenameUserCollection`/`CourtIdRef`/`UpdateProfile` added to
>   `user.ts`. **All existing public/read DTOs are unchanged** (`UserProfileDTO`,
>   `UserCollectionDTO`, `UserCollectionWithCourtsDTO`, `CourtSummaryDTO`, … keep their
>   names). No API runtime validation was wired (the type-only import rule §5.3 holds).
> - **Verification:** `prisma generate`, contracts/api/web `lint`, root `typecheck`
>   (7/7), root `build` (5/5, route table unchanged), `db:seed` (12/6/3/15) — all green.
>   API parity not re-run (public reads untouched → no parity delta; it gates CI). Next:
>   **Feature 52 — API auth foundation**.

- **Scope:** add `UserCollection.slug` + `@@unique([userId, slug])`; add `User.passwordHash String?`
  *only if* password auth is chosen (with magic-link: skip); optional `updatedAt`s; add the
  `MagicLinkToken` (and optional `RefreshToken`) model; add auth DTOs to `packages/contracts`
  (`auth.ts` + index re-export). Generate one forward migration.
- **Files:** `apps/api/prisma/schema.prisma`, a new `prisma/migrations/*`, `packages/contracts/src/auth.ts`,
  `packages/contracts/src/index.ts`, maybe `user.ts`.
- **Acceptance:** `prisma migrate` applies clean on a fresh DB; existing seed still runs (12/6/3/15);
  `pnpm typecheck`/`build` green; **no endpoint or repo behavior changes yet**.
- **Out of scope:** any endpoint, any web wiring, any auth logic, entitlement fields.

### Feature 52 — API auth foundation
- **Scope:** install `@nestjs/jwt` + mailer; `AuthModule` with `POST /v1/auth/request-link` +
  `/verify` + `/logout`; the `AuthGuard` (cookie **or** bearer); JWT issuance; tighten CORS to an
  env allowlist with `credentials: true`; the CSRF control (§7.5); magic-link token create/consume.
- **Files:** `apps/api/src/auth/*`, `main.ts` (CORS), `app.module.ts`, `.env.example`,
  `apps/api/package.json` (deps).
- **Acceptance:** request-link issues a (logged-in-dev) link; verify mints a session cookie + body
  token; a protected probe route 401s without auth, 200s with cookie **and** with bearer; logout
  clears the cookie. No `/v1/me` resource yet beyond a probe.
- **Out of scope:** OAuth, refresh rotation (unless trivially included), any web change.

### Feature 53 — `/v1/me` profile endpoints
- **Scope:** `GET /v1/me` (→ `UserProfileDTO`), `PATCH /v1/me` (optional), optionally
  `DELETE /v1/me`. Maps `User` → `UserProfileDTO` (derive `initials` from `name`; `membership` from
  `Entitlement` *or* hardcode `'free'` since entitlement is out of scope — see Q3).
- **Acceptance:** `GET /v1/me` returns the authed user's profile; 401 unauth'd.
- **Out of scope:** entitlement-derived membership (stays `'free'` for now), web wiring.

> **✅ Implemented (2026-06-29).** The first PROTECTED resource — proves the Feature-52
> `AuthGuard` works on a real endpoint (cookie **or** bearer). Delivered:
> - **New `apps/api/src/me/` module** — `me.module.ts` (imports `AuthModule` for the
>   exported `AuthGuard`; Prisma is global), `me.controller.ts` (`@UseGuards(AuthGuard)`
>   at the class level guards both routes; `@CurrentUser()` supplies `{ userId, email }`),
>   `me.service.ts`, `me.dto.ts`. **No new mapper** — reuses the Feature-52
>   `auth/user-profile.mapper.ts` (`toUserProfileDTO`), so `GET /v1/me` returns the *same*
>   `UserProfileDTO` the verify response embeds (a future `HttpUserRepository` drop-in).
>   `app.module.ts` imports `MeModule`.
> - **`GET /v1/me`** — auth required; reads the user by `auth.userId`; returns
>   `UserProfileDTO` (`id, name, initials, membership`). **No `email`** (mapper strips it,
>   §5.3); **`membership` hardcoded `'free'`** (entitlement out of scope, Q3); no DB write.
>   Valid token but the user row no longer exists → **401** (stale auth context, not 404 —
>   prompt task 3 preferred choice).
> - **`PATCH /v1/me`** — auth required; `UpdateProfileRequestDTO { name? }` (class-validator,
>   derived `type`-only from the contract `UpdateProfileSchema`, compile-time `extends`
>   guard). `name` is **trimmed** (`@Transform`), must be **1..80** chars after trim
>   (max 80 chosen — the contract sets no bound; empty/whitespace-only → 400 via
>   `@MinLength(1)`). Updates **only** `name`; never email/membership/authProvider/
>   entitlements. An **empty patch** (no `name`) → **400** (`No updatable profile fields…` —
>   avoids a no-op write that would still bump `updatedAt`, prompt task 4 preferred). Unknown
>   fields (incl. an `email` attempt) → **400** via the global pipe's `forbidNonWhitelisted`.
>   Deleted-user write (P2025) → **401** (same staleness rule as GET). Returns the updated
>   `UserProfileDTO`.
> - **`DELETE /v1/me`** — documented for a later feature (App-Store account-deletion
>   requirement, §4.2); **NOT implemented** here (Feature-53 scope is GET + PATCH only).
> - **Verification (live, against Postgres):** `GET /v1/me` 200 with cookie **and** with
>   bearer; 401 no-auth; 401 tampered token. `PATCH` 200 with bearer (name trimmed) and with
>   cookie; 400 unknown field / empty name / `email` attempt / empty `{}` body. DB confirmed:
>   `User.name` changed, `User.updatedAt` advanced, `email` never returned. Smoke:
>   `/v1/health`, `/v1/courts?limit=1` (no lat/lng), `/v1/auth/logout` all green. API parity
>   **35/35** (public reads unaffected). lint/typecheck/build green across api + web + root.
> - **No web wiring** — `apps/web` `UserRepository`, profile page, signin/signup, factory all
>   UNCHANGED (web route table identical). No saved endpoints, no collection persistence, no
>   payments/entitlements/admin. Next: **Feature 54 — `/v1/me/saved-courts`**.

### Feature 54 — `/v1/me/saved-courts` endpoints
- **Scope:** GET/POST/DELETE saved courts; the **public court select** (no lat/lng) on the read.
- **Acceptance:** save → appears in GET; delete → gone; idempotent re-save; no lat/lng in payload
  (assert like the Phase-2 masking check).
- **Out of scope:** the `CourtCard` heart UI (web), entitlement.

> **✅ Implemented (2026-06-29).** The second protected `/v1/me/*` resource — three
> auth-gated saved-court endpoints, API-only (no web wiring). Delivered in the existing
> `apps/api/src/me/` module (preferred structure, alongside Feature 53):
> `saved-courts.controller.ts`, `saved-courts.service.ts`, `saved-courts.dto.ts`;
> `me.module.ts` registers the new controller + service.
> - **Routes** (`@UseGuards(AuthGuard)` at the class level → cookie **or** bearer; every
>   query scoped to `@CurrentUser().userId`, so a user only ever touches their OWN saves):
>   - `GET /v1/me/saved-courts` → **200** `CourtSummaryDTO[]`, ordered **`savedAt desc`**
>     (most-recent first — a deterministic order the static mock seed doesn't define; once
>     saves are real + timestamped, recency is the natural order). Only **published** member
>     courts are returned (a saved-then-unpublished court drops out, matching the public-read
>     invariant). Empty list → `[]`.
>   - `POST /v1/me/saved-courts` `{ courtId }` → **201** `CourtSummaryDTO`. Verifies the court
>     exists **and is published** (else **404**). **Idempotent** via `SavedCourt`'s composite
>     PK (`upsert`): re-saving is a no-op, no duplicate, no error — and returns **201** in
>     **both** the new-save and re-save cases (documented choice: distinguishing 200-vs-201
>     on re-save would leak whether the row already existed; the contract is simply "this
>     court is now saved → here's its summary").
>   - `DELETE /v1/me/saved-courts/:courtId` → **200** `{ ok: true }`. **Idempotent**
>     (`deleteMany` on the PK): deleting a never-saved or already-deleted court affects 0 rows
>     and still returns `{ ok: true }`. Documented choice: **no 404** on an unknown/non-saved
>     id — the operation is "ensure this court is not in my saved list", already satisfied; the
>     Court itself is never deleted and collections are never touched.
> - **Response shape:** GET + POST return the shared `CourtSummaryDTO` (not a new wrapper);
>   DELETE returns `{ ok: true }`.
> - **Coordinate masking (hard requirement):** the `SavedCourt → Court` read **reuses the
>   Courts module's public `courtSummarySelect` + `toCourtSummaryDTO`** (`courts.mapper.ts`) —
>   a pure-function import, no `CourtsModule` dependency. That select omits `Court.lat`/`lng`
>   and Prisma types the row to exactly the selected fields, so the saved payload is
>   **structurally incapable** of carrying exact geo. Verified by a recursive key scan over a
>   live GET response (only `approxLat`/`approxLng` present) — the same guarantee the public
>   `/v1/courts` reads have.
> - **DTO validation:** `SaveCourtRequestDTO { courtId }` — class-validator derived `type`-only
>   from the contract `CourtIdRefSchema` (compile-time `extends` guard, the
>   [[api-contracts-type-only-import]] idiom). `courtId` is **trimmed** then required non-empty
>   (`@MinLength(1)`); empty/whitespace-only → **400**; unknown fields → **400** via the global
>   pipe's `forbidNonWhitelisted`. The DELETE remove is a `:courtId` path param (no body DTO).
> - **Stale-identity handling:** a save whose `userId` FK fails (P2003 — the authed user row was
>   deleted since the token was minted) surfaces as **401**, matching `MeService`'s GET/PATCH
>   staleness rule (not a 500).
> - **Live verification (against Postgres, 23/23 PASS):** 401 no-auth; initial `[]`; POST 201 +
>   summary (bearer); GET includes it; re-POST idempotent (no dup, count=1); DELETE 200 + `{ok}`;
>   repeat DELETE 200 `{ok}`; GET `[]`; unknown courtId 404; empty/empty-courtId/unknown-field
>   bodies 400; **cookie path** GET 200 + POST persists; **user-isolation** (user B never sees
>   user A's saves, B starts `[]`); no lat/lng key in GET **or** POST. Smoke: `GET /v1/me`,
>   `GET /v1/courts?limit=1`, `POST /v1/auth/logout` all green. **API parity 35/35** (public
>   reads untouched). lint/typecheck/build green across api + web + root; web route table
>   unchanged.
> - **No web wiring** — `SavedRepository` interface, mock, factory, Saved/Profile pages, and
>   all islands are UNCHANGED. No collection endpoints, no Add-to-Collection persistence, no
>   payments/entitlements/admin, no schema change. Next: **Feature 55 — `/v1/me/collections`**.

### Feature 55 — `/v1/me/collections` endpoints
- **Scope:** GET list, POST create (server slug derivation matching the mock), GET `:slug` detail,
  PATCH `:id` rename, POST/DELETE `:id/courts/:courtId`, optional DELETE `:id`, optional narrow
  `collection-ids` read. Derived `count` + covers.
- **Acceptance:** create/rename derive unique per-user slugs identical to the mock helpers; toggle
  add/remove is idempotent; detail by slug 404s correctly; folder members carry no lat/lng.
- **Out of scope:** web wiring, per-folder delete UI.

> **✅ Implemented (2026-06-29).** The third protected `/v1/me/*` resource — the
> authed user's wishlist folders (the USER `UserCollection`/`UserCollectionCourt`
> domain, NOT the editorial `Collection`). API-only, no web wiring. Delivered in the
> existing `apps/api/src/me/` module (alongside Features 53/54): `collections.controller.ts`,
> `collections.service.ts`, `collections.dto.ts`, `collections.mapper.ts`; `me.module.ts`
> registers the new controller + service.
> - **Routes** (`@UseGuards(AuthGuard)` at the class level → cookie **or** bearer; every
>   query scoped to `@CurrentUser().userId`, so a user only ever touches their OWN
>   folders — another user's id/slug is **404, never 403**, no existence oracle):
>   - `GET /v1/me/collections` → **200** `UserCollectionDTO[]`, ordered **`createdAt asc`**
>     (oldest first — a newly created folder appends at the end, matching the mock's
>     `folders.push`). `count`/`coverImageUrls` derived. `[]` when none.
>   - `POST /v1/me/collections` `{ name }` → **201** `UserCollectionDTO` (count 0, no
>     covers). Server-derived unique-per-user slug.
>   - `GET /v1/me/collections/:slug` → **200** `UserCollectionWithCourtsDTO` (folder +
>     member `CourtSummaryDTO[]`). **404** if the slug isn't one of THIS user's folders
>     (the `@@unique([userId, slug])` point read is naturally user-scoped). **Read by
>     SLUG** (the web routes `/saved/collections/[slug]`).
>   - `PATCH /v1/me/collections/:id` `{ name }` → **200** updated `UserCollectionDTO`
>     with the re-derived slug. **Mutation by ID** (the stable key — a rename changes the
>     slug). **404** if not the user's folder.
>   - `POST /v1/me/collections/:id/courts` `{ courtId }` → **200**
>     `UserCollectionWithCourtsDTO`. Verifies the court exists **and is published** (else
>     **404**); **404** if the folder isn't the user's. **Idempotent** (composite PK
>     upsert); new members **appended** (`sortOrder = max+1`).
>   - `DELETE /v1/me/collections/:id/courts/:courtId` → **200**
>     `UserCollectionWithCourtsDTO`. **Idempotent** (`deleteMany` on the PK — removing a
>     non-member/unknown court is a no-op success, **no 404**, symmetric with the
>     saved-courts unsave). **404** only if the folder isn't the user's. The Court itself
>     is never deleted.
>   - `GET /v1/me/courts/:courtId/collection-ids` → **200** `string[]` — the ids of the
>     user's folders containing that court (backs `getCollectionIdsForCourt`). `[]` when
>     the court is in none, **including an unknown court id** (no 404 — the answer is
>     simply "none of my folders"). A distinct base (`me/courts/...`) from `me/collections`.
> - **Per-folder `DELETE /v1/me/collections/:id`** — NOT implemented (intake Q5: no UI
>   renders folder delete; deferred, not needed to retire the seams).
> - **Route-key choice (prompt task 2):** detail by **slug** (web route + mock's
>   `getUserCollectionBySlug`), all mutations by **id** (`UserCollectionDTO.id` is the
>   stable mutation key). `GET …/collections/:slug` and `PATCH …/collections/:id` are
>   different methods on the same path template — no collision.
> - **Slug behavior (prompt task 4):** the API re-implements the web mock's
>   `slugifyCollectionName` + `ensureUniqueSlug` **identically** in
>   `collections.mapper.ts` (copied, NOT imported — the API must not depend on web code;
>   a comment on both sides flags they must stay in sync). Uniqueness is **per user**
>   (the `@@unique([userId, slug])` schema constraint allows two users to share
>   `summer-italy`). On rename, the folder's own current slug is excluded from the
>   collision set, so a same-name rename keeps its slug (no accidental `-2`); a colliding
>   new name gets the next `-2`/`-3` suffix. Names with no slug-able chars fall back to
>   base `collection` (the mock falls back to its generated `user-col-N` id, unavailable
>   pre-insert server-side; the `-N` suffixing still guarantees uniqueness — documented
>   deviation).
> - **Mapper / derived count + covers (prompt task 5):** `count` = published-member row
>   count; `coverImageUrls` = first 3 member hero images (undefined when empty) — mirrors
>   the mock's `coversFor`/`toDTO`. Member courts are filtered to **published** and
>   ordered by **`sortOrder asc`** (insertion order, preserving the mock's `push`), so
>   covers are a prefix of the detail `courts` list.
> - **Add/remove return the updated `UserCollectionWithCourtsDTO`** (prompt tasks 10/11 —
>   preferred over `{ ok: true }`: the caller refreshes local state from the fresh
>   count/covers/members without a second round-trip).
> - **DTO validation (prompt task 3):** `CreateUserCollectionRequestDTO`/
>   `RenameUserCollectionRequestDTO` (`{ name }`, trimmed, 1..80) and
>   `AddCourtRequestDTO` (`{ courtId }`, trimmed, non-empty) — class-validator classes
>   derived `type`-only from the contracts (`CreateUserCollectionSchema`/
>   `RenameUserCollectionSchema`/`CourtIdRefSchema`) with compile-time `extends` guards
>   ([[api-contracts-type-only-import]]). Empty/whitespace name or courtId → **400**;
>   unknown fields → **400** via the global pipe's `forbidNonWhitelisted`.
> - **Coordinate masking (prompt task 13):** every member-court read reuses the Courts
>   module's public `courtSummarySelect` + `toCourtSummaryDTO` (no lat/lng). Verified by
>   a recursive key scan over live detail/add/remove responses — **no `lat`/`lng` key**.
> - **Stale-identity handling:** a create whose `userId` FK fails (P2003 — user row
>   deleted since the token was minted) → **401** (same rule as Me/SavedCourts services).
> - **Live verification (against Postgres, 55/55 PASS):** no-auth 401; A initial `[]`;
>   A create `summer-italy`; A re-create `summer-italy-2`; B create `summer-italy`
>   independently; per-user list isolation (A sees 2, B sees 1, no cross-leak, createdAt
>   order); A detail by slug (courts `[]`); B's `summer-italy` resolves to B's own folder;
>   rename → `tuscany-trip`; rename conflict → `tuscany-trip-2`; same-name rename keeps
>   slug; A can't PATCH B's id (404); add court (count/covers/members, no geo);
>   idempotent re-add; collection-ids includes the folder + B-isolation `[]`; remove
>   (idempotent, count→0); unknown slug/collection-id/courtId 404 (collection-ids of
>   unknown court `[]`); invalid bodies 400; **cookie path** GET+POST persist; `/v1/me`
>   + `/v1/me/saved-courts` regression green; logout ok. **API parity 35/35** (public
>   reads untouched). Test users/collections/tokens cleaned up after. lint/typecheck/
>   build green across api + web + root; web route table unchanged.
> - **No web wiring** — `SavedRepository` interface, mock, factory, Saved/Profile/
>   court-detail pages, and all islands UNCHANGED. No per-folder delete UI, no
>   payments/entitlements/admin, no schema change. Next: **Feature 56 — Web
>   `HttpUserRepository` + `HttpSavedRepository`**.

### Feature 56 — Web `HttpUserRepository` + `HttpSavedRepository`
- **Scope:** the two HTTP classes (§6.1); extend `http-client.ts` with `patchJson`/`deleteJson` +
  auth-aware transport (cookie forwarding server-side, `credentials:'include'` in the browser);
  resolve the toggle add/remove strategy (§4.4 #1) **inside** the repo, keeping the interface.
- **Files:** `domain/http/http-user.repository.ts`, `domain/http/http-saved.repository.ts`,
  `domain/http/http-client.ts`. **Factory unchanged in this feature** (wired in Feature 57) — or wire
  it here if auth is ready; sequence is flexible.
- **Acceptance:** classes compile against the interfaces; a manual run against the live API returns
  real persisted data for an authed user.
- **Out of scope:** the factory flip + logged-out UX (Feature 57).

### Feature 57 — Signin/signup wiring + factory flip + logged-out UX
- **Scope:** wire `SignInForm`/`SignUpForm` to `request-link`/`verify`; flip `domain/index.ts` `api`
  branch to the HTTP saved/user repos; replace the hardcoded `isLoggedIn` with the real session
  signal; handle 401 on `/v1/me/*` (redirect to `/signin` or empty-state) on Saved/Profile/
  court-detail menu; logout button real.
- **Acceptance:** end-to-end magic-link sign-in; a created/renamed/toggled folder **survives reload
  and server restart**; logged-out users get a coherent state, not a crash.
- **Out of scope:** OAuth buttons (stay inert/placeholder), entitlement, payments.

### Feature 58 — Persisted Add-to-Collection / Rename / Create verification
- **Scope:** confirm the three islands now persist (the literal "retire the seam" proof); document
  that the client/server mock-instance divergence is gone (both hit Postgres).
- **Acceptance:** manual + (if built) automated checks that mutations persist across reloads.

> **✅ Implemented (2026-06-30).** Verification + small cleanup pass — **no product
> scope, no API/schema/contracts/payments/entitlements/admin change.** Confirmed the
> Feature-57 factory flip persists across reloads, the logged-out paths stay safe, and
> mock mode is untouched. See §16 for the full note.

### Feature 59 — Auth/saved integration tests (parity-style harness)
- **Scope:** extend the verification approach to `/v1/me/*`. Unlike the Phase-2 read parity (mock vs
  API for *public* domains), the saved/user domains can't be "mock-vs-API equal" once persisted — so
  this is an **auth + CRUD integration** harness (seed a test user, exercise save/collection CRUD,
  assert persistence + no-lat/lng), runnable in CI behind the Postgres service the `parity` job
  already provisions. Optionally fold into the deferred Vitest runner.
- **Acceptance:** CI exercises an authed CRUD round-trip; coordinate-masking re-asserted.

> **Sequencing note:** 51 → 52 → (53/54/55 in any order, all depend on 52's guard) → 56 → 57 (the
> visible flip) → 58/59 (verification). 53/54/55 are parallelizable. The web stays on `mock` (and
> `api` with mock saved/user) until Feature 57 flips it, so nothing user-facing breaks mid-stream.

---

## 9. Security baseline (practical, Phase-4 minimum)

- **Magic-link tokens:** cryptographically random (≥128 bits), **single-use**, **short TTL**
  (~10–15 min), **hashed at rest** (store a hash, compare on verify), consumed atomically (mark used
  in the same transaction that mints the session). Rate-limit `request-link` per email/IP.
- **No user enumeration:** `request-link` returns the **same** `{ ok: true }` whether or not the
  email exists; timing kept roughly constant. (With magic-link there is no password-reset
  enumeration surface.)
- **Password hashing** — only if email+password is later chosen: argon2id or bcrypt (cost ≥ 12),
  never store plaintext; `passwordHash` nullable for non-password users.
- **JWT:** signed (HS256 with a strong `JWT_SECRET`, or RS256), short access TTL, `iss`/`aud`/`exp`
  set; secret in **API env only**, never `NEXT_PUBLIC_`. Refresh (if added) persisted + rotated +
  revocable.
- **Cookies:** `HttpOnly`, `Secure` (prod), `SameSite=Lax` (or `Strict` for the auth cookie),
  scoped `Path`, sensible `Max-Age` matching the JWT TTL.
- **CSRF:** the §7.5 control on all `/v1/me/*` mutations (double-submit token or bearer-for-writes).
- **CORS:** env-driven origin **allowlist** + `credentials: true` — replace the permissive
  `enableCors()`. Never `origin: '*'` with credentials.
- **Input validation:** the existing global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` +
  `transform`) covers new body DTOs; add `@IsEmail`, length bounds on names, etc.
- **Rate limiting:** at minimum on `/v1/auth/request-link` and `/verify` (e.g. `@nestjs/throttler`).
  Recommended on `/v1/me/*` writes too.
- **Authorization (not just authentication):** every `/v1/me/*` query MUST be scoped to the
  authenticated `userId` — a user can only read/mutate **their own** saved courts/collections.
  Folder/`:id` mutations must verify ownership (404, not 403, to avoid id enumeration). This is the
  most important data-isolation check.
- **Coordinate safety (carried over):** saved-court and folder-member reads reuse the **public**
  court select — **no exact `lat`/`lng`** until entitlement gating exists (out of scope here). The
  Phase-2 masking assertion should extend to the new `/v1/me/*` court-returning reads.
- **Secrets:** no secret in `NEXT_PUBLIC_*`; mailer/JWT/provider secrets in API env only.

---

## 10. Out of scope for Phase 4 intake (explicit)

Hard exclusions — do **not** build these in this feature group:

- **Stripe / payments** — no checkout, webhook, receipt validation, promo, admin grant/revoke.
- **Entitlement unlock** — `Entitlement` stays a stub; `membership` stays `'free'`; no per-user
  gating. (Blocked on auth, but a **separate later** feature group.)
- **Exact coordinate exposure** — `lat`/`lng` stay masked everywhere; no directions.
- **Admin panel** (`apps/admin`) — Phase 3, not touched.
- **CRM webhook / email marketing / auto-responder** — Phase 5.
- **Advanced roles/permissions** — only "is this my own data" authorization; no role model.
- **Social OAuth (Google/Apple)** — *not* in the MVP auth (buttons stay inert placeholders) unless
  explicitly re-scoped; magic-link is the chosen method.
- **Password reset** — N/A for magic-link (no password). Only relevant if password auth is chosen.
- **Mobile app implementation** — only the **token-compatibility** path is designed for, not built.
- **Refresh-token rotation** — recommended but may be deferred to a follow-on (documented trade-off).
- **`PATCH /v1/me` edit UI** and **per-folder delete UI** — endpoints optional; no UI required to
  retire the seams.
- **Individual `toggleSavedCourt` heart UI** — endpoint can land (Feature 54) but wiring the heart
  is optional/out-of-scope for seam retirement.

---

## 11. Verification commands (this docs-only feature)

This feature changed **only** `docs/FEATURE_50_PHASE_4_AUTH_USER_PERSISTENCE_INTAKE.md`. No
product/API/schema/web/contract code, no dependency, no CI change. Lint/typecheck/build were run to
confirm the working tree is still green (the doc change cannot affect them, but the prompt asked).

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/web lint` | _(recorded in the feature report)_ |
| `pnpm --filter @tennis/api lint` | _(recorded in the feature report)_ |
| `pnpm typecheck` | _(recorded in the feature report)_ |
| `pnpm build` | _(recorded in the feature report)_ |
| `pnpm verify:api-parity` | Not run — requires a live API + Postgres (not running for a docs task); it gates CI on every PR and last passed 35/35 in Feature 48. No parity is required for a docs-only change. |

---

## 12. Risks / open questions

- **Q1 — toggle vs. add/remove.** The interface exposes a single
  `toggleCourtInCollection(collectionId, courtId): Promise<void>`, but REST wants explicit POST-add /
  DELETE-remove. **Keep the interface** and resolve add-vs-remove inside `HttpSavedRepository`
  (island knows the desired next state, or repo reads membership first, or POST-then-409→DELETE).
  Decide in Feature 56.
- **Q2 — slug-derivation parity.** The mock derives slugs with `slugifyCollectionName` +
  `ensureUniqueSlug` (uniqueness currently *global* across the demo's folders). The server must
  derive **identical** slugs but scoped **per user**. Recommend lifting the two helpers into a shared
  util both sides import to prevent drift. (`UserCollection.slug` + `@@unique([userId, slug])` from
  §2.3 is the schema half.)
- **Q3 — `membership` source.** Entitlement is out of scope, but `UserProfileDTO.membership` is a
  required field. For Phase 4, return `'free'` for everyone (or derive from the stub `Entitlement` if
  any rows exist). The real lifetime/active derivation arrives with the (later) entitlement feature.
- **Q4 — `toggleSavedCourt`.** The global save/unsave heart is unimplemented and the saved-courts
  list is currently read-only. Phase 4 *can* add `POST/DELETE /v1/me/saved-courts` + the heart, but
  it is **not required** to retire the existing collection seams. Decide whether to include the heart
  UI now or defer.
- **Q5 — per-folder delete.** No UI renders folder deletion today; the `DELETE /v1/me/collections/:id`
  endpoint is optional. Build for completeness or defer.
- **Q6 — logged-out UX (biggest "zero-UI-change" caveat).** The mock never 401s; once `/v1/me/*` is
  auth-gated, Saved/Profile/the Add-to-Collection menu must handle unauthenticated users (redirect to
  `/signin` or empty/CTA state). This is **new UX** the parity harness never covered — the one place
  Phase 4 genuinely adds UI behavior beyond a transparent swap. Design it explicitly in Feature 57.
- **Q7 — refresh tokens.** Deferring refresh means a longer-lived access cookie or re-auth on expiry.
  Document the chosen TTL/trade-off; recommend adding refresh in a near follow-on for good UX.
- **Q8 — magic-link email delivery.** Needs a mailer/provider decision (like the Phase-2 CDN
  decision — a **human** choice, not the implementer's). In dev, log the link to console; pick a real
  provider before staging.
- **Q9 — server-component cookie forwarding.** The repository transport must accept an injected
  cookie when called from a server component (`cookies()` from `next/headers`) — a real change to
  `http-client.ts`'s shape. Verify it doesn't leak into the browser path.
- **Q10 — account claim / anonymous merge.** The backlog notes anonymous save/consultation flows
  should later be "claimable" by a new account. Today saved state is mock-only (nothing to claim) and
  consultations are anonymous (`userId` null). Not required for Phase 4 seam retirement; note it so a
  future feature can associate prior anonymous consultations on first sign-in.

---

## 13. Recommended next feature

**Feature 51 — Schema + contracts groundwork** (§8): add `UserCollection.slug` +
`@@unique([userId, slug])`, the `MagicLinkToken` model (and `RefreshToken` if refresh is in MVP),
optional `User.passwordHash`/`updatedAt`, and the auth DTOs in `packages/contracts` — one clean
forward migration, no endpoint/web/auth behavior. It is the smallest unblocking step: every
subsequent feature (the auth foundation, the `/v1/me` resources, the HTTP repos) depends on the
slug column and the auth contracts existing. Ratify the **auth strategy (§3 — magic link + JWT
cookie/bearer)** and the **slug-persistence option (§2.3 A)** before starting it.

---

## 14. Feature 56 implementation note — web HTTP user/saved repositories (no factory flip)

Feature 56 added the web-side HTTP implementations of the user and saved repositories against the
auth-gated `/v1/me/*` API (Features 53/54/55), plus auth-aware transport on the shared http-client.
**The factory was NOT flipped** — `saved`/`user` stay on the mock in `api` mode until Feature 57 —
and **no UI / API / schema / contracts changed.**

**Added**
- `apps/web/src/domain/http/http-user.repository.ts` — `HttpUserRepository` implementing
  `UserRepository.getCurrentUser()` → `GET /v1/me`. A 401 throws `AuthRequiredError` (no silent
  mock/empty fallback), so Feature 57 can branch on "logged out".
- `apps/web/src/domain/http/http-saved.repository.ts` — `HttpSavedRepository` implementing all seven
  `SavedRepository` methods against the `/v1/me/collections*` + `/v1/me/saved-courts` endpoints.
- `apps/web/scripts/verify-user-saved-http.ts` (+ `verify:user-saved-http` script) — direct live
  verification, bearer-token authenticated (`AUTH_BEARER_TOKEN` env).

**http-client auth support (env-neutral — never imports `next/headers`)**
- New `patchJson` / `deleteJson` wrappers alongside `getJson`/`getJsonOrNull`/`postJson`, all routed
  through one private `requestJson` that maps **401 → `AuthRequiredError`** and **404 → `null`**
  (when requested).
- New `HttpAuthOptions` accepted by every wrapper: `auth: 'include'` (browser cookie via
  `credentials:'include'`), `cookie: '<header>'` (server-component cookie forwarding — addresses
  §12 **Q9**; the literal string is injected by a SERVER-ONLY caller in Feature 57, so this module
  stays environment-neutral), and `bearerToken` (mobile-like / the verification script).
- Public repositories pass no auth options and keep working unchanged; the consultation browser POST
  is unaffected. Both repos take `HttpAuthOptions` via constructor and forward it on every request.

**Toggle bridge (resolves §12 Q1)** — the interface exposes one
`toggleCourtInCollection(collectionId, courtId): Promise<void>` but the API has explicit POST-add /
DELETE-remove and no desired-next-state flag. `HttpSavedRepository` does a **read-before-write**:
`getCollectionIdsForCourt(courtId)` → DELETE if already a member, else POST. One extra request per
toggle, no interface/UI change. Feature 57 may later pass the desired state from the island (it
already tracks the checkmark) and drop the read.

**Not done (kept for Feature 57)** — factory flip of `saved`/`user` to HTTP; the server-only
cookie-forwarding factory helper (`cookies()` from `next/headers`); browser-island instantiation
with `credentials:'include'`; sign-in/sign-up wiring; and the logged-out UX on Saved/Profile/the
Add-to-Collection menu (§12 **Q6**).

**Verification** — `verify:user-saved-http` passed **17/17** against the live API (create → list →
detail → toggle add → membership read → toggle remove → rename → old-slug 404 → new-slug detail;
no exact lat/lng on any read; bad bearer → `AuthRequiredError`). `verify:api-parity` still passed
**35/35** (public reads untouched). Web lint, API lint, monorepo typecheck, and both mock-mode and
`api`-mode builds passed; the `/saved` and `/profile` routes stayed statically prerendered in
`api` mode, confirming the factory still wires them to the mock.

## 15. Feature 57 implementation note — factory flip + auth UX + logged-out states

Feature 57 flips `saved`/`user` to HTTP in `api` mode, wires the real magic-link UX (sign-in/up,
verify, logout), derives logged-in state, and adds the logged-out UX. **No API/contracts/schema
change; no payments/entitlements/admin; no OAuth/password; no real email provider.**

**Factory / repository architecture**
- `getRepositories(dataSource, auth?)` (`domain/index.ts`) now takes an optional `HttpAuthOptions`.
  In `api` mode `saved` → `HttpSavedRepository(auth)` and `user` → `HttpUserRepository(auth)`; the
  public domains ignore `auth`. In `mock` mode `auth` is ignored entirely (the in-memory seam is
  unchanged), so a no-auth call still yields working mock wiring. The factory stays
  framework-neutral (never imports `next/headers`).
- The module-level `repositories` singleton (`lib/repositories.ts`) carries **no auth** — it's for
  the public discovery domains + mock mode. It re-exports `AuthRequiredError`/`HttpError` so UI can
  branch on logged-out without importing `@/domain`.
- **Server cookie-forwarding** (`lib/repositories.server.ts`): `getRepositoriesForRequest()` reads
  `cookies()` (Next 15 async), serializes them into a `Cookie:` header, and passes it to the
  factory (`{ cookie }`). This is the **only** file importing `next/headers` — which Next marks
  server-only, so a client import is a build error (self-enforcing boundary; no `server-only` dep).
- **Browser credentials** (`lib/repositories.client.ts`, `'use client'`): `getClientRepositories()`
  wires `{ auth: 'include' }` so island writes send the httpOnly cookie via `credentials:'include'`
  (JS can't read the cookie, so it lets fetch attach it). Both helpers no-op to the mock in mock mode.
- ESLint boundary extended to allow `repositories.server.ts` / `repositories.client.ts` to import
  `@/domain` (and its re-exported types), still forbidding concrete `http-*`/`mock-*`/mock-data.

**Server pages — logged-out UX** (`lib/auth-redirect.ts#loadOrSignIn` = "run protected read; on
`AuthRequiredError` `redirect('/signin?redirectTo=…')`; re-throw anything else"):
- `/profile`, `/saved` (PRIVATE) → `loadOrSignIn` redirects logged-out visitors to `/signin`.
- `/saved/collections/[slug]` (PRIVATE) → `loadOrSignIn` redirects on 401; an authenticated visitor
  with an unknown slug gets `null` → `notFound()`. `generateMetadata` swallows a 401 (generic title;
  the page owns the redirect).
- `/courts/[slug]` (PUBLIC) → court read stays on the public singleton; the protected saved reads
  are wrapped in try/catch — `AuthRequiredError` degrades to **empty collections + `signedIn:false`**
  (NEVER a redirect), so the public page still renders. A non-auth error still throws.
- Reading `cookies()` makes these four routes dynamic (`ƒ`) — expected for per-request auth.

**Client islands** — `SaveToCollectionMenu`, `CreateCollectionTrigger`, `UserCollectionRename` use
`getClientRepositories()` (cookie via `credentials:'include'` in api mode; in-memory seam in mock).
`SaveToCollectionMenu` gains a `signedIn` prop: when false, opening the menu shows a "Sign in to
save courts" prompt (link to /signin) and performs **no** mutation; a mid-session expiry surfaces as
`AuthRequiredError`, which rolls back the optimistic toggle and flips to the prompt. (The
create/rename islands mount only on the redirect-guarded Saved pages, so an authed session is in
hand — they don't add their own sign-in branch.) The public `SavedRepository` interface is unchanged
(the read-before-write toggle bridge from Feature 56 stays).

**Sign-in / sign-up wiring** (`features/auth/auth-client.ts` — a small purpose-built transport, NOT
a repository): in `api` mode both forms POST `/v1/auth/request-link` (email + `redirectTo` from the
query). Success is **generic on any 2xx** (the API answers 202 regardless of account existence — no
enumeration); a 400/network fault shows an inline error. **Name is deliberately NOT sent** — the
`request-link` contract is `{ email, redirectTo? }` only; the field is collected for parity and a
future `PATCH /v1/me` onboarding step (documented, no invented API field). Mock mode keeps the
cosmetic success UX. OAuth buttons stay inert (out of scope). `useSearchParams` ⇒ the form islands
sit under a `Suspense` boundary on their pages.

**Verify route** (`/verify`, `features/auth/VerifyMagicLink.tsx`) — REQUIRED: the API mailer points
the link at `${WEB_APP_URL}/verify?token=…`, but verify is `POST /v1/auth/verify` and the cookie
must land on the **web** origin. So the client island POSTs verify with `credentials:'include'`
(StrictMode-guarded single run), then `router.replace`s to the (relative, allowlisted) `redirectTo`
or `/profile`. Success/expired/no-token states render in the AuthLayout.

**Logout** (`features/auth/SignOutButton.tsx`) — a tiny client island replacing the inert Sign-Out
row; in api mode POSTs `/v1/auth/logout` (`credentials:'include'`) then `router.replace('/signin')`
+ `router.refresh()`. `ProfileMenuList` gains `signedIn` (Profile passes true) → renders Sign Out vs.
a Sign In link.

**Header logged-in state** — `AppHeader`/`AppShell` gain `signedIn` (user icon → `/profile` vs
`/signin`). The private Profile/Saved/collection-detail pages pass `signedIn` (they only render when
authed). Broad per-public-page derivation (a `GET /v1/me` on every render) is **deliberately scoped
out** — documented follow-on; public pages keep the logged-out header default.

**Env** — `apps/web/.env.example` updated: `api` mode now covers saved/user with auth; documents the
API's `API_CORS_ORIGINS` (must include the web origin, credentialed), `WEB_APP_URL` (must be the web
origin for the `/verify` link), and `AUTH_COOKIE_SECURE` (false on local http). API `.env.example`
already had these.

**Live verification (API + Postgres, full magic-link flow):**
- `request-link` → **202 `{ok:true}`**; dev mailer logged the `?token=` link.
- `verify` → **200**, set `tennis_session=…; HttpOnly; SameSite=Lax` cookie + `accessToken`;
  returned `UserProfileDTO` with **no email** (masking).
- `GET /v1/me` with the cookie jar → **200** (cookie-path auth, the server-component path); with no
  auth → **401**.
- `logout` → **200**, `Set-Cookie: tennis_session=; Expires=…` (cleared); subsequent `/v1/me` → 401.
- Web app in `api` mode: logged-out `/profile`,`/saved`,`/saved/collections/*` → **307 → /signin**;
  public `/courts/grand-hotel-tremezzo` → **200** (renders, Add-to-Collection present). With the
  session cookie forwarded: `/profile` → **200** (real name + Sign Out island), `/saved` → **200**.
- **Persistence/reload**: a collection created via the API appeared on a fresh web `/saved` request
  (server-read from live, persisted API state — survives reload).
- `verify:user-saved-http` **17/17**; `verify:api-parity` **35/35**.

**Commands** — `pnpm --filter @tennis/web lint` ✓, `pnpm --filter @tennis/api lint` ✓,
`pnpm typecheck` ✓, `pnpm build` ✓ (mock + `api`), `verify:api-parity` ✓ 35/35,
`verify:user-saved-http` ✓ 17/17.

**Deviations** — (1) Added a `/verify` web route + `VerifyMagicLink` island: the magic link can't be
satisfied by a GET and the cookie must land on the web origin, so a client-side verify is required
(the prompt anticipated this). (2) Header logged-in derivation scoped to the private flows (not every
public page) to avoid a `GET /v1/me` per render — documented above. (3) Sign-up `name` collected but
not sent (no contract field). No API/schema/payments/entitlements/admin/OAuth were added.

**Next recommended feature** — **Feature 58**: persisted Add-to-Collection / Rename / Create
verification (a UI-driven smoke or parity-style harness asserting the islands' writes survive reload
in `api` mode), plus optionally broadening header auth to public pages behind a cheap session probe.

## 16. Feature 58 implementation note — persisted UI/integration verification + cleanup

Feature 58 is a focused **verification + small cleanup** pass over the Feature-57 factory flip. It
proves the three mutation islands now persist (the "retire the seam" proof) and that logged-out and
mock paths stay safe. **No product scope was added: no new API endpoint, no schema/contracts change,
no payments/entitlements/admin, no OAuth/password, no real email provider, no UI redesign.**

**Files changed**
- `apps/web/scripts/verify-persisted-saved-flow.ts` (NEW) — a factory-flipped, reload-survival
  harness (see below). The ONLY product-adjacent file added; it's a dev script, not shipped UI/API.
- `apps/web/package.json` — added the `verify:persisted-saved-flow` script entry.
- `docs/FEATURE_50_PHASE_4_AUTH_USER_PERSISTENCE_INTAKE.md` — this note + the §8 Feature-58 ✅ stamp.

**Feature 57 audit — clean.** Read every Feature-57 file (factory, server/client repo helpers,
auth-redirect, http-client, http-saved/-user repos, the three islands, all four pages, the auth
islands, the API auth/me modules). Findings:
- Factory flips **only** in `api` mode (`domain/index.ts` `case 'api'`); `mock` keeps
  `MockSavedRepository`/`MockUserRepository` and **ignores** the auth context entirely. ✔
- Server-only cookie forwarding is isolated to `lib/repositories.server.ts` (the sole `next/headers`
  importer — a build-enforced boundary); the client helper is `'use client'` with
  `{ auth: 'include' }`; the http-client never imports `next/headers`, staying env-neutral. ✔
- Private routes (`/profile`, `/saved`, `/saved/collections/[slug]`) wrap protected reads in
  `loadOrSignIn` → **307 → /signin** on 401; non-auth errors re-throw. ✔
- Public court (`/courts/[slug]`) catches `AuthRequiredError` → degrades to empty collections +
  `signedIn:false` (never redirects); a non-auth error still throws. ✔
- Sign-in/up POST `request-link` (generic 2xx success, no enumeration; inline error on 400/network);
  `/verify` POSTs `verify` with `credentials:'include'` (StrictMode-guarded single run) and sets the
  cookie on the **web** origin; logout clears the cookie and redirects. ✔
- **No issues found.** One **documented behavior note** (not a defect): reading `cookies()` in the
  four pages makes them dynamic (`ƒ`) in **both** modes now, including mock — they were static (`○`)
  pre-Feature-57. Harmless (mock reads are per-request in-memory), expected for per-request auth.

**Verification strategy.** Browser automation (true hard-reload of a rendered UI) would need
Playwright, which isn't present and is out of scope. Instead, two complementary layers:
1. **A factory-flipped reload-survival script** (`verify-persisted-saved-flow.ts`) that goes through
   the real `getRepositories('api', auth)` **factory** (the exact entry point the server/client
   helpers call — proving the flip, unlike Feature 56's direct-class script) and **simulates a
   reload by discarding the repo set and building a fresh one** between every write and read. A value
   that only lived in one in-memory instance (the old mock failure mode) would vanish; persistence
   means the fresh repo re-reads it from Postgres. It also asserts the logged-out 401 path and
   coordinate masking. **21/21 PASS** (bearer auth — the AuthGuard path a script can drive).
2. **Live web-app route checks** (`next start` in `api` mode against the live API + Postgres) with
   `curl`, covering what the script can't: SSR redirects, cookie forwarding, and rendered content.

**Persisted Create / reload — PASS.** Script: `createUserCollection` → fresh repo set lists it →
fresh repo set resolves its detail by slug (empty courts). Live: a folder created via the API as the
authed user **appears in a fresh `/saved` SSR render**, and its detail page resolves at the slug
(**200**). Reload survives.

**Persisted Rename / reload — PASS.** Script: `renameUserCollection` returns a re-derived slug → a
fresh repo set resolves the **new** slug to the renamed folder and the **old** slug returns `null`.
Live: after rename, **new slug → 200**, **old slug → 404** (the authed `notFound()` path the page
takes). The URL/title change survives reload.

**Persisted Add / Remove-to-Collection / reload — PASS.** Script: the island-facing
`toggleCourtInCollection` **bridge** (add) → fresh repo set's `getCollectionIdsForCourt` includes the
folder (the Add-to-Collection **checkmark seed** survives) and the collection detail lists the court;
then toggle (remove) → fresh repo set no longer includes it. Masking re-asserted on the court-bearing
read (no `lat`/`lng`).

**Saved/Profile auth behavior — PASS.** Live: with the session cookie forwarded, `/profile` → **200**
rendering the **real** user (name, initials, Sign Out island) and `/saved` → **200**. Without a
cookie, both **307 → /signin?redirectTo=…**. The Sign Out island is present (api-mode logout wired).
`user.getCurrentUser()` returns a `UserProfileDTO` with **no email** (masking). Saved-courts save →
reload → present, then unsave → reload → gone (the `/profile` + `/saved` GET read path).

**Logged-out public court — PASS.** Live: with no cookie, `/courts/grand-hotel-tremezzo` → **200**
(renders; "Add to Collection" trigger present). The page's protected reads 401 → caught →
`signedIn:false` + empty collections (the menu's sign-in prompt renders client-side on open). No
crash, no redirect on the public page. Script: the bare (no-auth) `api`-mode factory's
`getSavedCollections()` / `getCollectionIdsForCourt()` / `user.getCurrentUser()` all throw
`AuthRequiredError` (the logged-out signal — not a silent empty), confirming the degrade is correct.

**Mock mode — UNCHANGED.** `next start` in `mock` mode: `/profile` + `/saved` → **200 with NO auth,
no redirect**, rendering the mock user (Eleanor Morgan / EM) and mock collections; public court →
**200**. Create/Rename/Add-to-Collection still run against the in-memory seam (lost on reload, as
designed — the mock has no backend). The auth/redirect logic is inert in mock because the mock reads
never throw `AuthRequiredError`. Both `pnpm build` modes green; the new script imports the factory
(which pulls in the mock repos) without issue.

**Toggle optimization — DEFERRED (documented).** The `HttpSavedRepository.toggleCourtInCollection`
read-before-write (one extra `getCollectionIdsForCourt` per toggle, intake §12 Q1 / Feature 56) is
**kept as-is.** The island (`SaveToCollectionMenu`) does track `wasMember` and could pass a desired
next-state, but consuming it would require **either** changing the public `SavedRepository` interface
(forbidden — the whole point is UI/interface parity with the mock) **or** a fragile
capability-probe/`instanceof` branch in the island to call a repo-private method only the HTTP repo
has. The cost is one request behind an **already-optimistic** UI (the checkmark flips instantly; the
write is fire-and-forget), so the latency is invisible. Not worth the interface churn for the seam-
retirement milestone; revisit only if toggle latency becomes a measured problem.

**Cleanup performed.** The dev test rows from Features 57/58 verification were removed via direct SQL
(no product code, no DELETE-collection endpoint added — that stays out of scope, intake Q5). Removed:
5 `@example.com` test users (`feature57b/c/persist/web`, `feature58`) + their 5 folders ("Lake Como",
"Persisted Trip", and the Feature-58 residue) + 9 magic-link tokens, then the Feature-58 final-run
rows. The **seed is intact and untouched** (12 courts / 6 collections / 3 articles / 15
collection-courts; 0 users remaining). Reusable manual snippet (run against the compose Postgres):

```sql
-- Dev-only cleanup of test users + their cascade (folders/saved/tokens). Adjust the LIKE.
DELETE FROM "UserCollectionCourt" ucc USING "UserCollection" uc, "User" u
  WHERE ucc."userCollectionId"=uc.id AND uc."userId"=u.id AND u.email LIKE '%@example.com';
DELETE FROM "SavedCourt" sc USING "User" u WHERE sc."userId"=u.id AND u.email LIKE '%@example.com';
DELETE FROM "UserCollection" uc USING "User" u WHERE uc."userId"=u.id AND u.email LIKE '%@example.com';
DELETE FROM "MagicLinkToken" WHERE email LIKE '%@example.com';
DELETE FROM "User" WHERE email LIKE '%@example.com';
```

**Commands run (all PASS).** `pnpm --filter @tennis/web lint` ✓ · `pnpm --filter @tennis/api lint`
✓ (exit 0) · `pnpm lint` ✓ 7/7 · `pnpm typecheck` ✓ 7/7 · `pnpm build` ✓ 5/5 (mock) · web `api`-mode
build ✓ · `verify:api-parity` ✓ **35/35** (re-run post-cleanup) · `verify:user-saved-http` ✓
**17/17** · `verify:persisted-saved-flow` (new) ✓ **21/21**.

**Remaining known gaps (carried, not introduced).** (1) Header logged-in derivation is still scoped
to the private flows — public pages keep the logged-out header default (no `GET /v1/me` per public
render); a cheap session-probe broadening is the documented follow-on. (2) No per-folder delete
endpoint/UI (intake Q5) — so script-created empty folders can only be cleaned via SQL. (3) The
create/rename islands have no inline sign-in branch (they mount only on redirect-guarded pages); a
mid-session expiry there propagates rather than prompting — a rare edge, documented in Feature 57.
(4) Refresh tokens still deferred (intake Q7) — a session expires at the access-TTL.

**Deviations from the prompt.** (a) Verification is bearer-script + live-curl rather than browser
automation — the prompt explicitly preferred avoiding Playwright; the factory-flipped script covers
the reload-survival assertion without it. (b) The toggle optimization was **deferred** (task 5
allowed this when it would cause interface churn — it would). No other deviations.

**Next recommended feature** — **Feature 59** (auth/saved integration tests, parity-style harness):
fold `verify-persisted-saved-flow.ts` + `verify-user-saved-http.ts` into the CI Postgres job so the
authed CRUD round-trip + coordinate-masking are gated on every PR (today only public `api-parity`
gates CI). Optionally pair with the deferred header-auth broadening for public pages.
