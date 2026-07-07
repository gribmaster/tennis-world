# Phase 4 — Completion Summary & Handoff

**Status:** ✅ **Phase 4 complete (Features 50–59).** Real email magic-link authentication and
`/v1/me/*` user persistence are built on the existing Prisma schema; the web app's protected
`saved` / `user` domains now run against the live API in `api` mode (the Phase-2 hybrid seams are
retired) **with zero UI redesign**. Three verification harnesses prove it end-to-end — public
mock/API parity (35/35), the authed HTTP user/saved repositories (17/17), and a factory-flipped
persisted reload-survival flow (21/21) — and all three now run as a permanent CI gate.
**Date:** 2026-06-30.
**Audience:** whoever picks up Phase 5 (payments / entitlements) or hardens auth. Read this first; it
records the _as-built_ Phase-4 state, the deliberate deferrals, and the known caveats.
**Companions:** `PHASE_2_COMPLETION_SUMMARY.md` (as-built Phase-2 state + §10 hybrid seams),
`FEATURE_50_PHASE_4_AUTH_USER_PERSISTENCE_INTAKE.md` (the Phase-4 plan/intake),
`PHASE_1_COMPLETION_SUMMARY.md`, `IMPLEMENTATION_BACKLOG.md`, `../ARCHITECTURE_PLAN.md`
(Decisions #11/#12/#16).

**The Phase-4 contract, delivered:** introduce a real auth identity (email magic link → stateless
JWT session) and `/v1/me/*` persistence, then swap `MockSavedRepository` / `MockUserRepository` for
HTTP implementations **behind the same interfaces** — so the factory branch is the only product
change and **the UI does not move**. Payments, Stripe, entitlement unlock, and exact-coordinate
exposure remain **explicitly out of scope** (§7).

---

## 1. What was built (Features 50–59)

| Feature | Delivered |
| --- | --- |
| **50** | Phase-4 auth/user-persistence intake plan (planning only — no product code). |
| **51** | Schema + contracts groundwork: `MagicLinkToken` model, `User.name/authProvider/updatedAt`, `UserCollection.slug`, the `/v1/me/*` + auth contract DTOs. |
| **52** | API auth foundation: magic-link service (hash-only token, single-use), `JwtService`, `AuthGuard` (cookie + bearer), `AuthController` (`request-link` / `verify` / `logout`), CORS credentials allowlist, dev mailer. |
| **53** | `GET`/`PATCH /v1/me` profile endpoints (guarded; email never returned). |
| **54** | `GET`/`POST`/`DELETE /v1/me/saved-courts` (idempotent save/unsave; masked summaries). |
| **55** | `/v1/me/collections*` wishlist-folder endpoints (create/rename/add/remove + per-court membership read; server-derived slug). |
| **56** | Web `HttpUserRepository` + `HttpSavedRepository` (built + verified directly; not yet factory-wired). |
| **57** | Factory flip — `api` mode returns the HTTP saved/user repos; server cookie forwarding + browser `credentials:'include'`; `/verify` route, logout island, logged-out redirects, public court signed-out degradation. |
| **58** | Persisted saved/user UI verification (factory-flipped reload-survival harness, 21/21) + SQL cleanup approach. |
| **59** | **(this feature)** Promote the auth/saved verification scripts into CI + this completion summary. Infra + docs only. |

The swap was **additive**, not a rewrite. Outside the new auth/me modules and the `domain/http/*`
repositories, the only product-code changes were the Feature-57 wiring (factory branch + request-scoped
helpers + `/verify` route + logout island + logged-out boundary handling). No screens or layouts were
redesigned.

---

## 2. Auth architecture (as built)

- **Email magic link** is the ratified (and only) auth method (intake §3.3). `POST /v1/auth/request-link`
  mints a 256-bit random token, stores **only its SHA-256 hash** (`MagicLinkToken.tokenHash`, unique)
  plus a short `expiresAt`, and hands the raw link to the mailer. The raw token leaves the process
  exactly once (the emailed link); a DB leak can't be replayed.
- **No enumeration:** `request-link` always returns `202 { ok: true }` whether or not the email has a
  `User`. No user is created here — the user is upserted on verify.
- **Single-use, atomic consume:** `verify` hashes the presented token, looks it up, rejects
  missing/expired/already-consumed with a **uniform 400** (no oracle), and sets `consumedAt` inside an
  `updateMany` gated on `consumedAt: null` so two concurrent verifies can't both win.
- **JWT session (stateless):** on verify the service upserts the `User` (by the token row's bound
  email) and signs an HS256 access JWT (`{ sub, email }`, `AUTH_TOKEN_TTL_SECONDS`). `verify` returns
  the `AuthSessionDTO` (public profile + `accessToken` + `expiresAt`) **and** sets an httpOnly session
  cookie carrying the same token.
- **`AuthGuard` — two extractors, one guard:** cookie first (web, read by `cookie-parser`), then
  `Authorization: Bearer <jwt>` (mobile/API/scripts). On success it attaches `{ userId, email }` to
  `req.auth` for `@CurrentUser()`; any missing/invalid/expired token → uniform 401.
- **CORS credentials allowlist:** `API_CORS_ORIGINS` is a comma-separated allowlist (credentialed
  requests can't use a wildcard origin); empty/missing falls back to dev localhost origins. Production
  origins are never hardcoded.
- **Dev mailer / no real provider:** `MailerService` is the single send seam. With
  `MAGIC_LINK_DEV_LOG=true` (default) it logs the full magic-link URL at WARN (the only way to obtain
  the raw token for manual testing, since the DB stores only the hash); with it off, send is a safe
  no-op. **No real email provider is integrated** (a human/provider decision — intake §8).
- **Open-redirect guard:** an optional `redirectTo` is honored only if it's a relative path or
  same-origin as `WEB_APP_URL`; anything else is dropped (not 400'd).
- **Config:** `apps/api/src/auth/auth.config.ts` reads every auth env once (no `@nestjs/config`; env is
  loaded by `dotenv/config` in `main.ts`). The `change-me` JWT sentinel boots but is flagged at startup
  so it can't silently ship.

---

## 3. API endpoints (Phase 4 additions)

All under the `v1` global prefix. The three `/v1/auth/*` routes are **public** (they establish/end
identity); every `/v1/me/*` route is guarded by `AuthGuard` (class-level `@UseGuards`).

| Method | Path | Response | Notes |
| --- | --- | --- | --- |
| POST | `/v1/auth/request-link` | `202 { ok: true }` | Generic (no enumeration). Body `{ email, redirectTo? }`. |
| POST | `/v1/auth/verify` | `200 AuthSessionDTO` + Set-Cookie | Consumes token, upserts user, mints session. Bad/expired/used → 400. |
| POST | `/v1/auth/logout` | `200 { ok: true }` + cookie cleared | No guard; idempotent. |
| GET | `/v1/me` | `200 UserProfileDTO` | Email never returned; membership `free` (entitlement out of scope). |
| PATCH | `/v1/me` | `200 UserProfileDTO` | Edits `name` (trimmed, 1..80); empty patch → 400; missing user → 401. |
| GET | `/v1/me/saved-courts` | `200 CourtSummaryDTO[]` | `savedAt` desc, published-only; masked summaries. |
| POST | `/v1/me/saved-courts` | `201 CourtSummaryDTO` | Always 201 (new + idempotent re-save). Body `{ courtId }`. |
| DELETE | `/v1/me/saved-courts/:courtId` | `200 { ok: true }` | Idempotent; no 404 on non-saved. |
| GET | `/v1/me/collections` | `200 UserCollectionDTO[]` | Derived count + covers. |
| POST | `/v1/me/collections` | `201 UserCollectionDTO` | Server-derived slug. Body `{ name }`. |
| GET | `/v1/me/collections/:slug` | `200 UserCollectionWithCourtsDTO` | 404 if not the user's. |
| PATCH | `/v1/me/collections/:id` | `200 UserCollectionDTO` | Rename (re-derives slug). Mutations key off **id**. |
| POST | `/v1/me/collections/:id/courts` | `200 UserCollectionWithCourtsDTO` | Add court (idempotent). |
| DELETE | `/v1/me/collections/:id/courts/:courtId` | `200 UserCollectionWithCourtsDTO` | Remove court (idempotent). |
| GET | `/v1/me/courts/:courtId/collection-ids` | `200 string[]` | Folders holding this court (the Add-to-Collection checkmark seed). |

**Coordinate masking still holds:** every member-court read uses the public `courtSummarySelect`, so no
exact `lat`/`lng` is ever present in `/v1/me/*` court data. All three harnesses assert this recursively.

---

## 4. Web changes (as built)

- **`HttpUserRepository`** (`domain/http/http-user.repository.ts`) — `getCurrentUser()` → `GET /v1/me`;
  carries `HttpAuthOptions` (cookie / bearer / browser-include); 401 → `AuthRequiredError`.
- **`HttpSavedRepository`** (`domain/http/http-saved.repository.ts`) — the full `SavedRepository`
  contract over `/v1/me/saved-courts` + `/v1/me/collections*`. `toggleCourtInCollection` is a
  **read-before-write bridge** over the API's explicit add/remove (one extra membership read per
  toggle; documented trade-off so the interface/UI stay untouched).
- **Factory flip (Feature 57)** — `getRepositories('api', auth)` returns the HTTP saved/user repos. The
  factory stays framework-neutral (never reads cookies). Request-scoped callers supply the transport:
  - **Server components** → `lib/repositories.server.ts#getRepositoriesForRequest()` forwards the
    incoming `Cookie` header (the httpOnly session cookie the server can read).
  - **Browser islands** → `lib/repositories.client.ts#getClientRepositories()` uses
    `credentials:'include'` (JS can't read the httpOnly cookie, so `fetch` attaches it).
- **Auth UX** — `/signin` (magic-link request) and `/signup` (name + email) now call
  `POST /v1/auth/request-link`; a new **`/verify`** route lands the magic link and `POST`s the token to
  `/v1/auth/verify`; a **logout island** posts `/v1/auth/logout`. Logged-out visitors are redirected to
  `/signin` on private pages (Profile/Saved) and the public court page **degrades** to `signedIn:false`
  in the Add-to-Collection menu (the protected reads 401 → `AuthRequiredError`, never a silent
  empty/mock fallback).

---

## 5. Verification

| Harness | Command | Result |
| --- | --- | --- |
| Public mock/API parity | `pnpm verify:api-parity` | **35/35** |
| Authed HTTP user/saved repos | `pnpm --filter @tennis/web verify:user-saved-http` | **17/17** |
| Factory-flipped persisted reload-survival | `pnpm --filter @tennis/web verify:persisted-saved-flow` | **21/21** |

- The two authed harnesses need a real bearer `accessToken`. Locally that token is obtained via the
  magic-link flow (copy the raw token from the dev mailer log → `POST /v1/auth/verify`); see each
  script's header. The aggregate `pnpm verify:api-auth` runs both (token must already be in env).
- **CI gate added (Feature 59):** the `parity` job now also mints a token deterministically and runs
  both authed harnesses (§6).

---

## 6. CI gate (Feature 59)

`.github/workflows/ci.yml` keeps two jobs:

- **`verify`** — install → `prisma:generate` → `lint` → `typecheck` → `build` (unchanged).
- **`parity`** — extended (single Postgres/API setup, no duplication):
  1. Postgres 16 service → `prisma migrate deploy` (not reset) → `db:seed` (12/6/3/15) → build + start
     API → wait for `/v1/health`.
  2. `pnpm verify:api-parity` (35/35).
  3. **`Issue CI auth token`** — `pnpm --filter @tennis/api ci:issue-token` mints a bearer token
     **deterministically through the genuine `/v1/auth/verify` path** (it inserts a `MagicLinkToken`
     row whose hash matches a freshly-minted raw token, then exchanges it — **no dev-log scraping, no
     new endpoint**), masks it, and exports `AUTH_BEARER_TOKEN` to `$GITHUB_ENV`.
  4. `verify:user-saved-http` (17/17) + `verify:persisted-saved-flow` (21/21).
  5. **`Clean CI auth fixtures`** (`if: always()`) — `ci:clean-auth-fixtures` deletes the dedicated CI
     user + its folders/saves/tokens so a reused DB stays deterministic.
  6. **`Stop API`** (`if: always()`).

**CI env (test-only, no real secrets, none `NEXT_PUBLIC_*`):** `JWT_SECRET` (throwaway), `AUTH_COOKIE_NAME`,
`AUTH_TOKEN_TTL_SECONDS`, `MAGIC_LINK_TTL_MINUTES`, `WEB_APP_URL`, `API_CORS_ORIGINS`,
`AUTH_COOKIE_SECURE=false`, `MAGIC_LINK_DEV_LOG=true`, plus the existing `DATABASE_URL` /
`NEXT_PUBLIC_API_BASE_URL`. The API signs with `JWT_SECRET` and the token bootstrap mints against the
same running API, so they agree by construction.

**New scripts:** root `verify:api-auth`; `apps/api` `ci:issue-token` + `ci:clean-auth-fixtures` (backed
by `apps/api/scripts/ci-issue-token.ts` and `apps/api/scripts/ci-clean-auth-fixtures.ts`). Both API
scripts touch only the namespaced CI identity `ci-verify@tennis.test` (a `.test` address that can never
be a real or seeded user — the seed creates no users).

---

## 7. Still deferred (out of scope)

- **Real email provider** — the dev mailer logs the link; no provider is wired (production email
  sending does not work).
- **OAuth (Apple/Google)** — the buttons stay inert; magic link only.
- **Password auth** — `User` stores no `passwordHash` (deliberately); not adopted.
- **Refresh-token rotation** — single short-lived access token; no refresh, no server-side revocation
  list (acceptable given the short TTL — documented follow-on).
- **CSRF hardening beyond the current baseline** — credentialed cookie + CORS allowlist is the current
  posture; no separate CSRF token.
- **Payments / Stripe** — no checkout, webhooks, receipts, promo, or admin grant/revoke.
- **Entitlements / unlock** — `Entitlement` stays a stub; every request is non-entitled.
- **Exact `lat`/`lng` exposure** — stored, never on the wire (no entitlement to gate it).
- **Admin** — `apps/admin` empty; no `/v1/admin/*` (Phase 3).
- **Account deletion** — `DELETE /v1/me` documented but not implemented (App-Store requirement; own
  feature).
- **Global saved-court heart toggle** — the saved-courts list is read by Profile/Saved, but no UI heart
  wired to `POST`/`DELETE /v1/me/saved-courts` (the harness drives those endpoints directly).
- **Per-folder delete** — no `DELETE /v1/me/collections/:id` endpoint (empty folders are left behind;
  the CI cleanup script removes the CI user's residue).
- **Broad public header auth probe** — `AppHeader`/`AppShell` take a `signedIn` prop (default `false`);
  no app-wide `/v1/me` probe to light up the header for every page.

---

## 8. Known caveats

- **Sign-up name collected but not persisted** — `SignUpForm` requires a name for prototype parity but
  discards it; the contract `request-link` body has no `name` field. A user can set their name later via
  `PATCH /v1/me`; wiring that onboarding step is a follow-on.
- **Broad public header auth broadening deferred** — see §7 (the header relies on the page's `signedIn`
  prop, not a global probe).
- **`HttpSavedRepository.toggleCourtInCollection` read-before-write** — one extra membership read per
  toggle (the bridge over the API's explicit add/remove). Kept to leave the interface/UI untouched; a
  future island that passes the desired state can drop the read.
- **Magic-link dev mailer only** — the only way to get a raw token is the dev log (DB stores the hash).
  CI sidesteps this with the deterministic `ci-issue-token` bootstrap (genuine verify path).
- **No real production email sending** — `MAGIC_LINK_DEV_LOG=false` makes send a no-op until a provider
  is integrated.
- **Empty wishlist folders accumulate** — no delete-folder endpoint; locally this is harmless residue,
  and CI cleans its own fixture user each run.
- **`apps/api/package.json#prisma` deprecation** and **offline-authored migrations** — carried over
  from Phase 2 (see that summary §12); unchanged and out of scope.

---

## 9. Verification commands (this feature)

This feature changed **only** CI/scripts/docs — no product endpoint, no schema, no UI, no payments/
entitlements/admin.

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm typecheck` | ✅ 7/7 packages pass |
| `pnpm build` | ✅ 5/5; web route table unchanged (17 routes incl. `/verify`) |
| `pnpm verify:api-parity` | ✅ **35/35** (live API + Postgres) |
| `pnpm --filter @tennis/web verify:user-saved-http` | ✅ **17/17** (bearer token from `ci:issue-token`) |
| `pnpm --filter @tennis/web verify:persisted-saved-flow` | ✅ **21/21** (bearer token from `ci:issue-token`) |
| `apps/api ci:issue-token` | ✅ Mints a real JWT via the genuine `/v1/auth/verify` path |
| `apps/api ci:clean-auth-fixtures` | ✅ Removes the CI fixture user; idempotent; DB ends clean (seed intact) |

> **CI YAML:** validated structurally by inspection (no YAML parser is available in this toolchain).
> The new `env` block and steps mirror the existing, CI-proven `parity` job structure exactly; every
> command in those steps was run locally against the real Postgres + API and passed (the table above).

---

## 10. Recommended next phase

> **Update (2026-07-04): Phase 5 is now complete** (Features 60–69) — payments, entitlements, and
> per-user exact-coordinate unlock are built on this auth identity. See
> **`PHASE_5_COMPLETION_SUMMARY.md`** for the as-built handoff. The four items below were delivered
> (items 1–3); item 4 (admin grant/revoke) remains Phase 3, and the auth-hardening track below stays
> open.

**Phase 5 — payments + entitlements** (now unblocked by the auth identity). Intake/plan in
`FEATURE_60_PHASE_5_PAYMENTS_ENTITLEMENTS_INTAKE.md`; the schema + contracts groundwork (provider
columns, `User.stripeCustomerId`, `ProcessedWebhookEvent`, billing/exact-location DTOs, back-safe
migration) **has landed in Feature 61** — see that doc's §15:

1. **Entitlement service** — effective-entitlement read per user; the `Entitlement` stub is already
   expanded (Decision #12: `startsAt`/`revokedAt`/`revokedReason`/`grantedByAdminId` + provider
   correlation, Feature 61). Feature 62 adds the runtime service + refund flows.
2. **Per-user coordinate gating** — expose exact `Court.lat`/`lng` (already stored) only to entitled
   users; the masking seam is ready for the gated branch.
3. **Stripe web checkout + IAP** — checkout session, webhooks, receipt validation, promo codes.
4. **Admin grant/revoke** — depends on Phase 3 admin (`apps/admin` + `/v1/admin/*`).

**Auth hardening (parallel, non-blocking):** real email provider, refresh-token rotation, OAuth,
account deletion (`DELETE /v1/me`), and the global header auth probe.

**End of Phase 4 completion summary.**
