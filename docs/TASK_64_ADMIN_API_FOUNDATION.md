# TASK 64 — Phase 3, part 1: admin API foundation (auth, roles, ops endpoints)

**Model: Sonnet 5, reasoning effort: high.** This task adds a second, privileged auth surface and endpoints that grant paid access, so it is security-sensitive: read the code you are extending before you write anything, and do not improvise on auth.

## Goal

The v3 redesign is finished. The biggest missing piece of the product is Phase 3 (`docs/ARCHITECTURE_PLAN.md` §6, §8; `docs/PHASE_5_COMPLETION_SUMMARY.md` §16 item 3): nobody can operate the product without SQL. `apps/admin` is an empty placeholder and `AdminUser` has never been used. Phase 3 is split into three tasks:

- **TASK_64 (this one): the admin API foundation.** Admin login, role guard, and the operational endpoints that need no new schema: consultations, users, entitlement grant/revoke, review moderation status.
- TASK_65: content CRUD in the API (courts + images, collections, articles) with draft/publish.
- TASK_66: the Refine app in `apps/admin` on top of TASK_64–65.

**Out of scope here:** any UI, `apps/admin`, Refine, content CRUD, a Prisma migration, any change to `apps/web`. If you think one is needed, stop and report it.

## Decisions already made (do not re-litigate)

1. **A separate admin identity, not a flag on `User`.** Admins are rows of the existing `AdminUser` table (`email`, `passwordHash`, `role`). Admin tokens and user tokens must never be interchangeable.
   - Admin JWT: signed with its **own secret `ADMIN_JWT_SECRET`** (HS256) and carrying `aud: 'tennis-admin'`; the verifier must require both. A user token presented to an admin route, and an admin token presented to `AuthGuard` (`/v1/me`, `/v1/reviews`, …), must both fail with 401. Do not reuse `AuthGuard`, `AuthService.verifyAccessToken`, or the user cookie name.
   - Config mirrors `auth/auth.config.ts` (read it): a dev sentinel secret that logs a loud warning, and a production refusal to boot when the sentinel is still in use **if admin routes are enabled**. Admin routes are enabled when `ADMIN_JWT_SECRET` is set or `NODE_ENV !== 'production'`; in production without the secret the admin module must not register routes at all (and the API still boots). Document the env vars in the API's `.env.example` and in the CLAUDE.md section below.
   - TTL: 8 hours (`ADMIN_TOKEN_TTL_SECONDS`, default 28800). No refresh token in this task.
2. **Transport: httpOnly cookie *and* Bearer**, same shape as the user guard (cookie first, then `Authorization: Bearer`). Cookie name `tennis_admin_session`, **`Path=/v1/admin`** (so it is never sent to public or user routes), `HttpOnly`, `Secure`/`SameSite` from the existing `AuthConfig` values. The login body also returns the token so a non-cookie client (Refine on another origin) can use Bearer.
   - **CSRF:** every state-changing admin request authenticated *by cookie* must carry the header `X-Tennis-Admin: 1`, otherwise 403. Bearer-authenticated requests are exempt (not ambient credentials). GET is exempt. Add the admin app origin to CORS through `ADMIN_APP_URL` (comma-separated allowed), appended to the existing allowlist; do not loosen the existing logic.
3. **Password hashing: Node's built-in `crypto.scrypt`** — no new native dependency. Stored format `scrypt$N$r$p$<saltB64>$<hashB64>` (N=16384, r=8, p=1, 16-byte random salt, 64-byte key), compared with `timingSafeEqual`. Unknown email must still burn one scrypt (compare against a precomputed dummy hash) so response time doesn't reveal which emails exist. Password policy: ≥ 12 characters, no other rules.
4. **No self-signup.** The first admin is created by a CLI script (below). There is no endpoint that creates or edits admin users in this task.
5. **Roles** (existing column `AdminUser.role`, string, default `editor`; allowed values `editor` | `admin` | `ops`). Role matrix for this task (a role not listed gets **403**, an unauthenticated request gets **401**):

   | Endpoint group | editor | ops | admin |
   |---|---|---|---|
   | `GET /v1/admin/me`, `POST …/auth/logout` | ✔ | ✔ | ✔ |
   | consultations (list/get/patch) | ✘ | ✔ | ✔ |
   | users (list/get) | ✘ | ✔ | ✔ |
   | reviews (list/patch status) | ✘ | ✔ | ✔ |
   | entitlement **grant** / **revoke** | ✘ | ✘ | ✔ |

   `editor` is reserved for TASK_65 content endpoints; it can only log in and see `/me` for now. A stored role that isn't one of the three values is treated as no access (403), never as admin.
6. **No schema migration.** Everything needed already exists (`AdminUser`, `Entitlement.grantedByAdminId/revokedAt/revokedReason`, `ConsultationRequest.status`, `Review.status`). Audit trail comes from those columns plus one structured log line per admin mutation (`adminId`, `action`, `targetType`, `targetId`, from/to values) written with Nest's `Logger`. No new table.
7. **Entitlement revoke is `POST /v1/admin/entitlements/:id/revoke`, not `DELETE`** with a body (the architecture doc says DELETE; a body on DELETE is unreliable through proxies and Refine's REST provider). Update the two lines in `docs/ARCHITECTURE_PLAN.md` that name the DELETE route in the same change.
8. **Admin may only revoke what admin may grant.** Revoking a row whose `source` is `stripe_web` (or any `iap_*`) returns **409** with a message saying to cancel/refund in the payment provider (the webhook owns those rows; revoking them here would be undone by the next event). Allowed: `source` = `admin` or `promo_code`. A row that is already not `active` → 409.
9. **Review moderation vocabulary** (the column is a free string, default `"new"`): `new` | `approved` | `rejected`. This task only lets an admin set it. **Nothing in the public API or web may read it** — reviews stay write-only/non-displayed (see `reviews/reviews.controller.ts` header). Whether and how approved reviews are shown is a separate product decision.
10. **Consultation statuses**: read the `ConsultationRequest.status` convention in the schema/`consultations.service.ts` and reuse it. If no vocabulary is defined anywhere yet, use `new` | `contacted` | `closed`, and say so in the report.
11. **DTO style**: request bodies are local class-validator classes in `apps/api` (imported as values so the global `ValidationPipe` works; `whitelist` + `forbidNonWhitelisted` are already on). Response shapes go in **`packages/contracts/src/admin.ts`** as zod schemas + inferred types, exported from `index.ts`, and are imported **type-only** in the API (zod objects can't be `require`d at runtime there — see the note in `consultations.controller.ts`). Follow the file layout of `packages/contracts/src/billing.ts`.
12. **Responses never contain** `passwordHash`, provider ids (`providerCustomerId`, `providerSubscriptionId`, `providerPurchaseId`), or `metadata`. A harness check asserts this by scanning every admin response body for those key names.

## What to build

All under `apps/api/src/admin/` (module `AdminModule`, registered in `app.module.ts`; sub-folders by area, same style as `billing/` and `me/`).

### 1. Admin auth

- `POST /v1/admin/auth/login` `{ email, password }` → 200 `{ accessToken, expiresAt, admin: { id, email, role } }` + sets the cookie. Wrong email *or* wrong password → the same **401** `Invalid email or password.` Email is trimmed and lower-cased.
- `POST /v1/admin/auth/logout` → clears the cookie (same Path/flags), 204.
- `GET /v1/admin/me` → `{ id, email, role }`.
- **Login rate limit**: in-memory, per instance, keyed by client IP **and** separately by email, 5 failed attempts per 15 minutes per key → **429** with `Retry-After`. Copy the structure of `reviews/reviews-rate-limit.service.ts` / `billing-rate-limit.service.ts` (read them; don't invent a third style). A successful login resets that email's counter. Record failures only (not successes).
- `AdminAuthGuard` (verifies token, loads the `AdminUser` row **on every request** so a deleted admin or changed role takes effect immediately, attaches `req.admin = { id, email, role }`) and `@AdminRoles('ops', 'admin')` + `AdminRolesGuard`. Default-deny: a route under `/v1/admin/*` with the auth guard but no `@AdminRoles` decorator must be rejected by the roles guard, so a forgotten decorator can't leave a route open to every role. Apply both guards at the controller level via one composed decorator (e.g. `@AdminOnly('ops','admin')`).
- `/v1/admin/auth/login` is the only unauthenticated admin route.

### 2. Bootstrap CLI

`apps/api/scripts/admin-user.ts`, scripts `admin:create` and `admin:set-password` in `apps/api/package.json` (style of `ci-issue-token.ts`):

- `pnpm --filter @tennis/api admin:create -- --email you@example.com --role admin` creates the row. **The password is read from the `ADMIN_PASSWORD` env var or, if unset and stdin is a TTY, prompted without echo.** Never accept the password as a CLI argument (shell history). Enforce the policy; fail if the email exists or the role isn't one of the three.
- `admin:set-password -- --email …` (same password input) for resets.
- Refuse to run when `NODE_ENV=production` unless `--yes-i-am-sure` is passed (it writes to whichever DB `DATABASE_URL` points at; print that DB's host/name before acting).

### 3. Consultations (`ops`, `admin`)

- `GET /v1/admin/consultations?status=&page=&pageSize=` — newest first, default `pageSize` 25, max 100; response `{ items, page, pageSize, total }`. Each item has everything a person on the ops queue needs: id, createdAt, status, name, email, destinationInterest, travel dates, isFlexible, skillLevel, groupSize, additionalRequest, source, and `userId` (nullable).
- `GET /v1/admin/consultations/:id`, `PATCH /v1/admin/consultations/:id` `{ status }` (validated against the vocabulary; nothing else is patchable). Unknown id → 404.
- The patch body is its own DTO; the public `POST /v1/consultations` and its DTO are untouched.

### 4. Users (`ops`, `admin`)

- `GET /v1/admin/users?q=&page=&pageSize=` — `q` is a case-insensitive substring match on email (and name if the model has one). Items: id, email, name, createdAt, and **effective entitlement** (`isEntitled`, `membership`, `reason`, `source`, `activeUntil`) computed through `EntitlementsService.getEffectiveEntitlement`. Compute it for the page's users in one query, not N queries (batch the entitlement rows for the page and compute the same way — or add a batch method to `EntitlementsService` that reuses its existing selection logic; do **not** duplicate the "effective" rule inline, that is the single-source rule in `entitlements.service.ts`).
- `GET /v1/admin/users/:id` — the same plus the user's full entitlement history (every row, newest first): id, kind, status, source, startsAt, expiresAt, revokedAt, revokedReason, grantedByAdminId (+ the granting admin's email resolved for display), createdAt. No provider ids, no metadata.
- Read-only. There is no endpoint that edits or deletes a user.

### 5. Entitlement grant / revoke (`admin` only)

- `POST /v1/admin/entitlements/grant` `{ userId, kind, expiresAt?, note }`:
  - `kind` ∈ `manual_grant` | `promo_unlock` (never `lifetime_unlock` or `subscription` — those are paid kinds owned by the webhook).
  - `expiresAt` optional ISO date, must be in the future; omitted = non-expiring.
  - `note` required, 3–500 chars, stored in `metadata.note` (and `grantedByAdminId` set; `source = 'admin'` for `manual_grant`, `'promo_code'` for `promo_unlock`; `status = 'active'`, `startsAt = now`). Unknown `userId` → 404.
  - Returns the created row in the history shape above.
  - Idempotency: if the same admin already created an identical active grant (same user, kind, expiresAt) in the last 60 seconds, return **409** instead of a duplicate (double-click guard).
- `POST /v1/admin/entitlements/:id/revoke` `{ reason }` — `reason` required, 3–500 chars; per decision 8. Sets `status = 'revoked'`, `revokedAt = now`, `revokedReason = reason`; the row is never deleted. Returns the updated row.
- After either call, the affected user's `GET /v1/me` (via their own user token) must reflect the new entitlement immediately. Do not cache entitlement anywhere.

### 6. Review moderation (`ops`, `admin`)

- `GET /v1/admin/reviews?status=&page=&pageSize=` — newest first; items: id, createdAt, rating, body, status, court `{ slug, name }`, user `{ id, email }` (nullable user).
- `PATCH /v1/admin/reviews/:id` `{ status }` per decision 9. Nothing else patchable.

### 7. Logging

One `Logger` line per successful admin mutation and per login success/failure (failure lines carry the lower-cased email attempted and the IP, never the password). Never log tokens or passwords.

### 8. Docs

- **CLAUDE.md**: add a short "Admin API (Phase 3)" section next to the billing/auth sections: admin identity is separate from `User`; token/cookie/secret rules; the role matrix; the default-deny roles guard; CSRF header; "no provider ids / passwordHash in admin responses"; `admin:create` usage; the revoke-is-POST decision. Add `verify:admin-api` to the harness inventory in §2 with its check count. Keep it a rule list in the file's existing voice.
- **docs/PHASE_5_COMPLETION_SUMMARY.md** §16 item 3: mark the API half done in TASK_64.
- **docs/ARCHITECTURE_PLAN.md**: the two revoke-route lines (decision 7).
- **apps/api/.env.example**: `ADMIN_JWT_SECRET`, `ADMIN_TOKEN_TTL_SECONDS`, `ADMIN_APP_URL`.

## Testing

Add `apps/api/scripts/verify-admin-api.ts` and the script `verify:admin-api`, in the exact style of `verify-exact-location.ts` (same `record()` harness, namespaced fixtures with the prefix `f64-` / `@tennis.test`, cleanup in a `finally`, **fail loudly** if the API is unreachable, and never let a skip count as a pass). It creates its own `AdminUser` rows (one per role) and its own users/consultations/reviews; it must not depend on `grand-hotel-tremezzo` being locked or unlocked. To log in as a *user* it must use the real `POST /v1/auth/verify` path the other harnesses use.

Required checks (at least):

1. Login: ok → token + cookie (`HttpOnly`, `Path=/v1/admin`); wrong password and unknown email → identical 401 body; 6th failed attempt → 429 with `Retry-After`; email case-insensitive.
2. Token separation: a **user** access token on `GET /v1/admin/me` → 401; an **admin** token on `GET /v1/me` and `POST /v1/reviews` → 401; a token signed with the user secret but `aud` admin → 401; an expired admin token → 401; a deleted `AdminUser` with a still-valid token → 401; a role changed from `admin` to `editor` takes effect on the next request.
3. Role matrix: for every endpoint group, each role gets exactly the status in the table (loop over the matrix and assert; don't hand-write 40 checks). Unauthenticated → 401 on every admin route except login. A route with the auth guard but no `@AdminRoles` is rejected (unit-level check of the roles guard, or a test-only route).
4. CSRF: cookie-authenticated `PATCH`/`POST` without `X-Tennis-Admin` → 403; with it → ok; Bearer without it → ok.
5. Consultations: create two through the **public** endpoint, list (pagination bounds `pageSize=101` → 400, `status` filter, ordering), get, patch ok / invalid status 400 / unknown id 404 / extra field 400.
6. Users: search by email substring, effective entitlement shape, detail with history, `pageSize` bounds; N+1 guard — count Prisma queries for a page of 25 (or assert the batched path is used) so it can't silently regress.
7. Grant: manual_grant with expiry → that user's own `GET /v1/me` shows entitled; `lifetime_unlock`/`subscription` kinds → 400; past `expiresAt` → 400; missing note → 400; unknown user → 404; double-submit within 60 s → 409; `grantedByAdminId` equals the acting admin.
8. Revoke: admin-source row → revoked, user is no longer entitled (via their own `/me`); revoke twice → 409; revoke a `stripe_web` row (insert one directly through Prisma in the harness) → 409 and the row is unchanged; missing/short reason → 400.
9. Reviews: list shows court/user info, patch status ok / invalid 400; and `GET /v1/courts/:slug` + every public endpoint **do not** contain any review status or body (grep the JSON).
10. No-leak scan: across every admin response collected during the run, none contains the keys `passwordHash`, `providerCustomerId`, `providerSubscriptionId`, `providerPurchaseId`, or `metadata`.
11. CLI: `admin:create` with a short password fails; with `ADMIN_PASSWORD` set creates the row with a `scrypt$…` hash; a duplicate email fails; the stored hash verifies and a wrong password doesn't.
12. Regression guard (run the existing suites, don't re-implement): `verify:effective-entitlement`, `verify:billing-checkout`, `verify:billing-rate-limit` must be unchanged (136/136, 21/21, 11/11); `verify:api-parity` 42/42; `verify:staging-demo-auth` 11/11; `verify:google-oauth` 19/19. The three harnesses that fail on the `grand-hotel-tremezzo` fixture (`verify:exact-location`, `verify:web-exact-location`, `verify:stripe-webhook`) keep failing the same checks — that is a known pre-existing issue, don't touch it and don't count it against this task.

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first — `.next` gets corrupted otherwise). Use the local Postgres only (CLAUDE.md §8: never `db push` / `migrate reset` against staging/production). If `.github/workflows/ci.yml` already runs the other API-backed `verify:*` scripts in a job that has a database and a running API, add `verify:admin-api` next to them following the same pattern; if the wiring isn't obviously the same, **don't edit CI** and say so in the report.

## Do not touch

`apps/web`, `apps/admin`, the existing auth/billing/webhook/reviews/me code (except registering the new module in `app.module.ts`, adding the CORS origin env, and — only if you really need it — a batch method on `EntitlementsService` that reuses the existing selection logic), the Prisma schema and migrations, `packages/mock-data`, and the public API's response shapes. No new runtime dependencies (if you believe one is unavoidable, stop and report why). No git commit or push unless asked.

## Report

1. Files created / changed (grouped), and the exact env vars added.
2. The role matrix as implemented (confirm it matches decision 5).
3. How token separation works in practice (secret + audience + cookie path) and the result of the cross-token checks.
4. Every place you deviated from or interpreted this brief (especially the consultation status vocabulary, the batch entitlement approach, and CI wiring) and why.
5. `verify:admin-api` check count and the full results table for the suites in Testing §12, with skips named.
6. Anything security-relevant you noticed in the existing auth code while reading it (report only; don't change it).
7. The exact commands run.
