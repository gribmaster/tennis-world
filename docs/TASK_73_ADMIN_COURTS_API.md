# TASK 73 — Minimal admin, part 1: admin API for courts (auth, CRUD, countries/regions, images)

**Model: Sonnet 5, reasoning effort: high.** This adds a privileged auth surface and a file-upload endpoint, so it is security-sensitive: read the code you are extending before you write anything, and do not improvise on auth or on upload validation.

## Goal

Nobody can add a court without SQL or the content importer. The owner wants a **minimal admin** to launch quickly: log in, create/edit/publish a court, manage its photos. This task is the API half; **TASK_74** is the UI (`apps/admin`).

This task **replaces and narrows TASK_64** (`docs/TASK_64_ADMIN_API_FOUNDATION.md`, deferred, never executed). From TASK_64 we keep only the auth foundation (below). Consultations, users, entitlement grant/revoke, review moderation, roles matrix, and content CRUD for collections/articles are **explicitly out of scope** — TASK_64 stays in `docs/` as the plan for them. Add one line at the very top of TASK_64: `> Narrowed by TASK_73 (admin auth + courts only). The sections below that TASK_73 does not implement are still the plan for later.`

**Out of scope:** any UI, `apps/admin`, collections/articles CRUD, a hard-delete of courts, bulk import UI, a Prisma migration (none is needed — if you think one is, stop and report), changes to public API response shapes, any change to `apps/web` other than the two `next.config` / `.env.example` lines named in §6.

## Decisions already made (do not re-litigate)

### Auth (condensed from TASK_64 decisions 1–4, 12; read `auth/auth.config.ts`, `auth/auth.guard.ts`, `auth/auth-request.util.ts` first)

1. **Separate admin identity**: rows of the existing `AdminUser` table. Admin tokens and user tokens are never interchangeable.
   - Admin JWT: HS256, its **own secret `ADMIN_JWT_SECRET`**, claim `aud: 'tennis-admin'`; the verifier requires both. A user token on an admin route and an admin token on `AuthGuard` routes (`/v1/me`, `/v1/reviews`, …) must both be **401**. Do not reuse `AuthGuard`, `AuthService.verifyAccessToken` or the user cookie name.
   - Config mirrors `auth.config.ts`: a dev sentinel secret with a loud warning; production **refuses to boot** with the sentinel *if admin routes are enabled*. Routes are enabled when `ADMIN_JWT_SECRET` is set or `NODE_ENV !== 'production'`; in production without the secret the admin module registers no routes and the API still boots.
   - TTL 8 h (`ADMIN_TOKEN_TTL_SECONDS`, default 28800). No refresh token.
2. **Transport: httpOnly cookie and Bearer** (cookie first, then `Authorization: Bearer`). Cookie `tennis_admin_session`, **`Path=/v1/admin`**, `HttpOnly`, `Secure`/`SameSite`/`Domain` from the existing `AuthConfig`. Login also returns the token in the body.
   - **CSRF:** every state-changing request authenticated *by cookie* must carry `X-Tennis-Admin: 1`, otherwise 403. Bearer-authenticated requests and GET are exempt.
   - CORS: append `ADMIN_APP_URL` (comma-separated allowed) to the existing allowlist. Do not loosen the existing logic, and the allowlist stays an exact match.
3. **Passwords: `crypto.scrypt`**, no new dependency. Format `scrypt$N$r$p$<saltB64>$<hashB64>` (N=16384, r=8, p=1, 16-byte salt, 64-byte key), `timingSafeEqual`. Unknown email still burns one scrypt (compare against a precomputed dummy hash). Policy: ≥ 12 characters.
4. **No self-signup, no endpoint that creates admins.** First admin via CLI (below).
5. **Roles:** `AdminUser.role` is a free string. For now the only role with access is **`admin`**. Any other stored value (`editor`, garbage) can log in and see `/me` but gets **403** on everything else. Default-deny: a route under `/v1/admin/*` that has the auth guard but no `@AdminRoles(...)` decorator is rejected by the roles guard, so a forgotten decorator can never leave a route open. Compose both guards in one decorator (e.g. `@AdminOnly('admin')`).
6. **Admin responses never contain** `passwordHash`. (Admin responses *may* contain exact `lat`/`lng`/`mapLinkUrl` of courts — that is the point of the tool — but only on `/v1/admin/*`, never on public routes.)

### Courts

7. **No hard delete.** There is no `DELETE /courts/:id`: saved courts and collection membership point at courts. "Remove" = set `status: 'draft'` (the public API already filters by `published`; `CourtsService` and `SavedCourtsService` do — re-verify, see Testing).
8. **The admin never types derived fields.** `approxLat`/`approxLng` (~10 km deterministic jitter), `mapX`/`mapY` (decorative) and `seedOrder` are computed by the server:
   - Extract `approxFromExact` and `mapCoordsFromSeed` out of `apps/api/scripts/import-courts-from-content.ts` into a shared module (suggested `apps/api/src/courts/court-derived-fields.ts`) and make **the importer import them from there**. The functions must stay **byte-for-byte identical** in behaviour (same hashing, same rounding, seed key = slug). A harness check compares the shared function against the existing rows in the DB (see Testing 3). Do not otherwise touch the importer.
   - `approx*` is recomputed **only when `lat`/`lng` change**; `mapX/mapY` are set once from the slug at creation and never recomputed.
   - `seedOrder` on create = `max(seedOrder) + 1` over all courts (inside the transaction that creates the row); never changed afterwards.
9. **Slug:** generated from `name` if omitted (reuse the importer's `slugify` semantic: lower-case, ASCII-fold diacritics, non-alphanumerics → `-`; export it from the same shared module if the importer's version is not already importable), validated `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 80 chars, unique (409 on clash). **Slug is immutable once the court has ever been published**: a PATCH that changes the slug of a `published` court → 409 (URLs and saved links depend on it). Changing it on a draft is allowed.
10. **Publishing gate:** `status` may become `published` only if the court has ≥ 1 image **and exactly one hero**, a non-empty `blurb`, a country, a region, and valid `lat`/`lng`. Otherwise **422** with `{ message, missing: string[] }` (the list is what the UI shows). Validated on create-as-published, on PATCH, and re-checked when images are deleted (see 15).
11. **Validation:** `name` 2–120 chars; `setting` 1–120; `blurb` ≤ 4000; `lat` −90..90, `lng` −180..180 (finite numbers, **not** 0/0); `surface`/`access`/`indoorOutdoor` from the existing contract enums; `tags` ⊆ `CourtTag` — normalise with `orderCourtTags` (canonical order, de-duplicated, unknown tag → 400). `countryId`/`regionId` must exist **and the region must belong to the country** (400 otherwise).
12. **`mapLinkUrl` is user-visible** (entitled viewers get a "Directions" link built from it), so validate strictly: `https:` only, hostname exactly one of `www.google.com` (path starts with `/maps`), `google.com`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl` (path starts with `/maps`); ≤ 2000 chars; no credentials in the URL. Anything else → 400. Empty string / `null` clears it.
13. **Request DTOs** are local class-validator classes (imported as values so the global `ValidationPipe` works; `whitelist` + `forbidNonWhitelisted` are on). **Response shapes** go in `packages/contracts/src/admin.ts` as zod schemas + inferred types, exported from `index.ts`, imported **type-only** in the API (see the note in `consultations.controller.ts`; follow the layout of `billing.ts`).

### Images (Supabase Storage)

14. **Storage abstraction with two drivers**, selected by `COURT_IMAGE_STORAGE` = `supabase` | `local` (default `local` when `NODE_ENV !== 'production'`; in production the value must be set explicitly and `local` is **refused at boot**):
    - `supabase`: **plain `fetch`** against the Storage REST API — **do not add `@supabase/supabase-js`** or any dependency. Env (server-only, never `NEXT_PUBLIC_*`, never logged): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` (default `court-images`). Upload `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}` with `Authorization: Bearer <service key>` and `apikey` header, `Content-Type` = the sniffed type, `x-upsert: false`. Public URL stored in `CourtImage.url` = `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}` (the bucket is created **public** by the owner; creating it is not this task). Delete = `DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{path}`. If the env is incomplete the upload endpoint returns **503** with a clear message (everything else keeps working); the key must never appear in any response or log line.
    - `local` (dev/CI only): writes to `apps/web/public/uploads/courts/<courtId>/<file>` and stores the root-relative URL `/uploads/courts/<courtId>/<file>`. Add `apps/web/public/uploads/` to `.gitignore`. This lets the owner and the harness work with no Supabase account.
    - The legacy images (`/courts/<slug>/…`, `/placeholders/…`) are **never** touched by delete: only URLs that start with this storage's own prefix are removed from storage; for anything else the DB row is deleted and the file is left alone.
15. **Upload endpoint:** multipart, field `file`, exactly one file per request, `memory` storage, **max 8 MB**. Use Nest's `FileInterceptor` (`multer` already ships inside `@nestjs/platform-express`; adding **`@types/multer` as a devDependency is allowed**, nothing else).
    - **Never trust the client:** sniff the magic bytes — accept only JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF….WEBP`). Everything else (including SVG, GIF, HTML renamed to `.jpg`) → **415**. Ignore the client `mimetype` and `originalname` entirely: the object name is `<random uuid>.<ext from the sniffed type>`. Over the size limit → **413**.
    - First image of a court becomes the hero automatically; later ones are appended (`sortOrder = max + 1`). Optional `alt` (≤ 200 chars) as a form field.
    - Returns the created `CourtImage` in the admin image shape.
    - Rate-limit uploads per admin (in-memory, copy the structure of `reviews/reviews-rate-limit.service.ts`; 30 uploads / 10 minutes) → 429.
16. **Hero invariant:** a court with ≥ 1 image has **exactly one** `isHero` image at all times. Every image mutation runs in one transaction that restores it: setting a hero clears the others; deleting the hero promotes the lowest-`sortOrder` remaining image; deleting the last image of a **published** court → **409** (unpublish first).
17. Image reorder: `PUT /v1/admin/courts/:id/images/order` with `{ imageIds: string[] }` must be **exactly** the court's current image id set (no missing, no extra, no duplicates) → 400 otherwise; writes `sortOrder = index`.

## What to build

All under `apps/api/src/admin/` (module `AdminModule` registered in `app.module.ts`; sub-folders `auth/`, `courts/`, `geo/` (countries+regions), `images/`, in the style of `billing/` and `me/`).

### 1. Admin auth
- `POST /v1/admin/auth/login` `{ email, password }` → 200 `{ accessToken, expiresAt, admin: { id, email, role } }` + cookie. Wrong email *or* password → the same **401** `Invalid email or password.` Email trimmed + lower-cased.
- `POST /v1/admin/auth/logout` → clears the cookie (same Path/flags) → 204. `GET /v1/admin/auth/me` → `{ id, email, role }`.
- Login rate limit: in-memory, keyed by IP **and** separately by email, 5 failures / 15 min per key → **429** + `Retry-After`; success resets that email's counter. Copy the structure of `billing-rate-limit.service.ts`; don't invent a third style.
- `AdminAuthGuard` loads the `AdminUser` row **on every request** (deleted admin or changed role takes effect immediately) and attaches `req.admin`.
- Login is the only unauthenticated admin route.

### 2. Bootstrap CLI
`apps/api/scripts/admin-user.ts` + scripts `admin:create` and `admin:set-password` in `apps/api/package.json` (style of `ci-issue-token.ts`):
- `pnpm --filter @tennis/api admin:create -- --email you@example.com --role admin`. **Password from `ADMIN_PASSWORD` env, or prompted without echo on a TTY — never a CLI argument.** Enforce the policy; fail if the email exists; `--role` default `admin`.
- `admin:set-password -- --email …`, same input rules.
- Refuse under `NODE_ENV=production` unless `--yes-i-am-sure`; always print the target DB host/name before acting.

### 3. Courts
- `GET /v1/admin/courts?q=&status=&page=&pageSize=` — includes drafts; `q` = case-insensitive substring on name or slug; `status` ∈ draft|published; newest `updatedAt` first; default `pageSize` 25, max 100; `{ items, page, pageSize, total }`. Item: id, slug, name, status, isLocked, isFeatured, country `{id,name}`, region `{id,name}`, heroImageUrl (or null), imageCount, updatedAt.
- `GET /v1/admin/courts/:id` — everything editable plus `lat`, `lng`, `mapLinkUrl`, derived `approxLat/approxLng`, and the ordered `images` (id, url, alt, sortOrder, isHero). Unknown id → 404.
- `POST /v1/admin/courts` — body per decisions 8–12 (everything except derived fields; `status` default `draft`). Returns the full detail shape, **201**.
- `PATCH /v1/admin/courts/:id` — any subset of the editable fields; same validation; returns the detail shape. `PATCH` with `lat`/`lng` recomputes approx.
- Nothing else is patchable (`id`, derived fields, `seedOrder`, `createdAt`, images are not).

### 4. Countries and regions
- `GET /v1/admin/countries` — **all** countries (not only those with published courts) with their regions: `[{ id, name, isoCode, continent, regions: [{id, name}] }]`, name-ascending (JS `localeCompare('en')`, as `CountriesService` does).
- `POST /v1/admin/countries` `{ name, isoCode, continent }`: `isoCode` = 2 letters, upper-cased by the server, unique (409); `continent` from the contract enum; `name` 2–80, unique case-insensitively (409).
- `POST /v1/admin/regions` `{ countryId, name, lat, lng }`: region `lat/lng` valid ranges; `name` unique within the country, case-insensitive (409 — there is no DB constraint, so check in a transaction); unknown country → 404.
- No edit, no delete for either. (Public `GET /v1/countries` only lists countries with a published court, so a freshly added empty country is invisible publicly — assert it.)

### 5. Images
`POST /v1/admin/courts/:id/images` (upload), `PATCH …/images/:imageId` `{ alt?, isHero? }` (`isHero: false` is rejected with 400 — you set a hero by promoting another; `alt` may be `null`), `PUT …/images/order`, `DELETE …/images/:imageId` (204), per decisions 14–17. All 404 on a court/image mismatch (an image id belonging to another court must not be reachable).

### 6. Small non-API edits
- `apps/web/next.config.mjs`: add one `remotePatterns` entry for the Supabase host, **built from env** at build time (`SUPABASE_IMAGE_HOSTNAME`, protocol `https`, `pathname: '/storage/v1/object/public/**'`); when the env is unset, no entry is added. Keep the existing `lh3.googleusercontent.com` entry. Grep `apps/web` for a `Content-Security-Policy` / `images-src` setting: if one exists, report it instead of changing it.
- `apps/web/.env.example` and `apps/api/.env.example`: the new env vars with comments.

### 7. Logging
One `Logger` line per successful admin mutation (`adminId`, `action`, `targetType`, `targetId`, the names of the changed fields, not their values) and per login success/failure (failures carry the lower-cased email and IP, never the password). Never log tokens, passwords, or the Supabase key.

### 8. Docs
- **CLAUDE.md**: a short "Admin API" section next to billing/auth, rule-list voice: separate identity, own secret + `aud` + cookie `Path`, CSRF header, only role `admin`, default-deny roles guard, no `passwordHash` in responses, `admin:create` usage, upload rules (sniffing, 8 MB, never trust filename), storage drivers and the "`local` is refused in production" rule, hero invariant, slug immutability once published, publish gate, derived fields computed server-side from the shared module. Add `verify:admin-courts` to the harness inventory in §2 with its check count. Also add a rule that **`SUPABASE_SERVICE_ROLE_KEY` is server-only** (CLAUDE.md §3 already forbids Supabase Auth; this is Storage only — say so).
- `docs/PHASE_5_COMPLETION_SUMMARY.md` §16 item 3: note "admin API for courts done in TASK_73; UI in TASK_74".

## Testing

Add `apps/api/scripts/verify-admin-courts.ts` and script `verify:admin-courts`, in the exact style of `verify-court-geo-redaction.ts` / `verify-exact-location.ts` (same `record()` harness, namespaced fixtures with prefix `f73-`, cleanup in a `finally` including uploaded files and fixture countries/regions/courts, **fail loudly** if the API is unreachable, a skip never counts as a pass). It creates its own `AdminUser` rows. Run it with `COURT_IMAGE_STORAGE=local`. It must not depend on `grand-hotel-tremezzo`.

Required checks (at least):

1. **Login:** ok → token + cookie (`HttpOnly`, `Path=/v1/admin`); wrong password and unknown email → identical 401 body; 6th failure → 429 + `Retry-After`; email case-insensitive; success resets the email counter.
2. **Token separation:** user token on `/v1/admin/auth/me` → 401; admin token on `/v1/me` and `POST /v1/reviews` → 401; token signed with the user secret but `aud` admin → 401; token with the admin secret but wrong/missing `aud` → 401; expired → 401; deleted `AdminUser` with a valid token → 401; role changed `admin` → `editor` takes effect on the next request (403 on courts, 200 on `/me`); every `/v1/admin/*` route except login → 401 unauthenticated; roles guard rejects a route with the auth guard but no `@AdminRoles` (unit-level or a test-only route).
3. **Derived fields parity:** for **every existing court row** in the DB, `approxFromExact(lat, lng, slug)` and `mapCoordsFromSeed(slug)` from the shared module equal the stored `approxLat/approxLng/mapX/mapY` (the importer produced them with the same functions). Report how many matched; if rows that predate the importer (seeded mock courts) legitimately differ, restrict the check to importer-created rows and **say so with the counts** rather than weakening the function.
4. **CSRF:** cookie-authenticated POST/PATCH/PUT/DELETE without `X-Tennis-Admin` → 403; with it → ok; Bearer without it → ok; GET never needs it.
5. **Courts CRUD:** create a draft (derived fields present, `seedOrder` = previous max + 1, slug auto-generated and de-diacritised); duplicate slug → 409; bad lat/lng (91, 0/0, NaN-ish strings) → 400; unknown tag → 400, tags stored in canonical order; region from another country → 400; extra field (`approxLat`, `seedOrder`, `id`) → 400; PATCH name only does **not** change approx; PATCH lat/lng **does**; `pageSize=101` → 400; `q` and `status` filters; drafts appear in the admin list.
6. **`mapLinkUrl`:** accepted hosts pass; `http://`, `javascript:`, `https://evil.example/maps`, `https://www.google.com.evil.example/maps`, `https://user:pw@www.google.com/maps`, and a >2000-char URL → 400; `null` clears.
7. **Publish gate:** publish with no image → 422 and `missing` lists it; with image but empty blurb → 422; after fixing → 200 and the court **appears in `GET /v1/courts`, `GET /v1/courts/:slug`, `GET /v1/courts/map` and `GET /v1/countries`**; set back to draft → it disappears from every public read **and** from `GET /v1/me/saved-courts` of a user who saved it; slug change on a published court → 409.
8. **Countries/regions:** create country (iso upper-cased), duplicate iso/name (case-insensitive) → 409, bad continent → 400; region duplicate within country → 409 but same name in another country OK; a new empty country is **absent** from public `GET /v1/countries` until a court in it is published, then present.
9. **Images:** upload jpg/png/webp (tiny real fixtures generated in the harness) → 201, first one is hero; upload a `.jpg`-named HTML file, an SVG, a GIF, a 0-byte file → 415; 8 MB + 1 byte → 413; client-supplied filename like `../../x.png` never influences the stored path (assert the stored name is a uuid + sniffed ext and the file landed under the court's folder); second image not hero; `PATCH isHero` flips exactly one; `isHero:false` → 400; reorder with a missing/extra/duplicate id → 400, correct set → persisted order visible in the public detail read; delete hero → another promoted; delete last image of a published court → 409; image id of another court → 404; the file is removed from disk on delete, and a legacy `/courts/...` url row is deleted without touching any file; 31st upload within the window → 429.
10. **Supabase driver (stubbed):** run the driver against a local stub HTTP server (or an injected `fetch`) and assert: request path, `Authorization` + `apikey` headers, `Content-Type` = sniffed type, `x-upsert: false`, returned public URL shape, delete path; a stub 500 → the endpoint returns 502 and **no DB row is created**; env incomplete → 503; the service-role key string appears in no response body and no captured log line.
11. **Boot guards:** `COURT_IMAGE_STORAGE=local` with `NODE_ENV=production` refuses to boot; production without `ADMIN_JWT_SECRET` boots with no `/v1/admin` routes (404) — these may be checked with a short child-process spawn of the compiled app or by unit-testing the config loaders; say which.
12. **No-leak scan:** across all admin responses collected in the run, none contains `passwordHash`; and across all **public** responses fetched in the run for the fixture courts as a guest and a non-entitled user, none contains the fixture's exact `lat`/`lng` or `mapLinkUrl` (guards the redaction from TASK_72).
13. **CLI:** `admin:create` with a short password fails; with `ADMIN_PASSWORD` set creates a `scrypt$…` row; duplicate email fails; stored hash verifies and a wrong password doesn't; refuses under `NODE_ENV=production` without the flag.
14. **Importer unchanged:** run the importer in its existing dry/plan mode against `content/` before and after the refactor and diff the planned output — must be identical (paste the diff result in the report).
15. **Regression guard (run the existing suites, don't re-implement):** `verify:court-geo-redaction` 66/66, `verify:effective-entitlement` 155/155, `verify:billing-checkout`, `verify:billing-rate-limit`, `verify:api-parity` 42/42, `verify:staging-demo-auth` 11/11, `verify:google-oauth` 19/19, `verify:api-auth` — all unchanged. The three harnesses that fail on the `grand-hotel-tremezzo` fixture (`verify:exact-location`, `verify:web-exact-location`, `verify:stripe-webhook`) keep failing the same checks; a known pre-existing issue, don't touch it.

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; delete `apps/web/.next` before starting dev again). Local Postgres only (CLAUDE.md: never `db push` / `migrate reset` against staging/production). If `.github/workflows/ci.yml` already runs the other API-backed `verify:*` scripts in a job that has a DB and a running API, add `verify:admin-courts` next to them in the same pattern (with `COURT_IMAGE_STORAGE=local`); if the wiring isn't obviously the same, **don't edit CI** and say so.

## Do not touch

`apps/web` (except §6), `apps/admin` (TASK_74), existing auth/billing/webhook/reviews/me code (except registering the module in `app.module.ts`, the `ADMIN_APP_URL` CORS append, and extracting the two helper functions as described), the importer's behaviour, the Prisma schema and migrations, `packages/mock-data`, and public API response shapes. No new runtime dependency (`@types/multer` as a devDependency is the only addition allowed; if you believe another is unavoidable, stop and report why). No git commit or push unless asked.

## Report

1. Files created / changed (grouped), and the exact env vars added (with which are server-only secrets).
2. How token separation works in practice (secret + audience + cookie path) and the results of the cross-token checks.
3. The final endpoint list with method, path, success status, and who can call it.
4. Every deviation from or interpretation of this brief (especially: the slugify reuse, the derived-fields parity result and counts, the boot-guard test method, CI wiring) and why.
5. `verify:admin-courts` check count and the results table for the Testing §15 suites, with skips named.
6. What was **not** tested against real Supabase (expected: the live driver) and the exact manual steps the owner needs: create the public bucket `court-images`, set the four env vars on the API host, set `SUPABASE_IMAGE_HOSTNAME` on the web build, create the first admin.
7. Anything security-relevant you noticed in the existing auth code while reading it (report only).
8. The exact commands run.
