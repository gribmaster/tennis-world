# Phase 2 — Completion Summary & Handoff

**Status:** ✅ **Phase 2 complete (Features 39–48).** The NestJS public discovery API
(`/v1/*`) is built on a finalized Prisma schema seeded from `packages/mock-data`, and `apps/web`
swaps cleanly to it via `NEXT_PUBLIC_DATA_SOURCE=api` with **zero UI changes**. A dual-mode
mock/API parity harness (35/35) proves the seeded API returns DTOs equivalent to the Phase-1 mock
repositories, and it runs as a permanent CI gate.
**Date:** 2026-06-29.
**Audience:** whoever picks up the next phase (auth + user persistence — see §13). Read this first;
it records the _as-built_ Phase-2 state, the deliberate hybrid seams, and what stays deferred.
**Companions:** `PHASE_1_COMPLETION_SUMMARY.md` (the as-built Phase-1 state),
`FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md` (the Phase-2 plan/intake — §13 there records the schema
finalization), `FEATURE_47_DUAL_MODE_PARITY.md` (the parity harness + CI gate),
`PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the living inventory of intentionally-inert controls),
`IMPLEMENTATION_BACKLOG.md` (Phases 2–7), `../ARCHITECTURE_PLAN.md`.

**The Phase-2 contract, delivered:** `packages/mock-data` → Postgres seed → NestJS `/v1/*`
endpoints → `apps/web/src/domain/http/*` repositories, such that flipping
`NEXT_PUBLIC_DATA_SOURCE=api` requires **zero UI changes** and **no court-returning endpoint exposes
exact `lat`/`lng`**.

---

## 1. What was built (Features 39–48)

| Feature | Delivered |
| --- | --- |
| **39** | Phase-2 API/Prisma intake plan (planning only). |
| **40** | Finalized Prisma schema, clean `init` migration (draft history reset, Decision #13), idempotent seed from `packages/mock-data`. |
| **41** | API foundation (PrismaService/module) + Courts module with coordinate masking. |
| **42** | Collections module (derived `count`; detail returns `CollectionDTO` only). |
| **43** | Articles module (full `ArticleDTO[]`, newest-first). |
| **44** | `Article.author` parity fix — `add_article_author` migration + seed + mapper, so the API reproduces the `'Janet See'` byline. |
| **45** | `POST /v1/consultations` + global `ValidationPipe` (first request-body DTO). |
| **46** | Web HTTP repositories (`domain/http/*`) + the new `ConsultationRepository` (interface + mock + http) wired through the modal. |
| **47** | Dual-mode mock/API parity harness (`verify-api-parity.ts`, 35/35) + one source-side byte-parity fix (`Article.publishedAt` → date-only). |
| **48** | Root `pnpm verify:api-parity` pass-through + the `parity` CI job (Postgres service → migrate deploy → seed → start API → health wait → parity). |

The swap was **additive**, not a rewrite: the only product-code change outside `domain/http/*` and
the new consultation domain was wiring `ConsultationModal.handleSubmit` to the repository (Feature
46) and the `Article.publishedAt` serialization fix for byte parity (Feature 47). No screens, no
layouts, no routes changed.

---

## 2. Public API endpoints

All under the `v1` global prefix (`apps/api/src/main.ts` → `app.setGlobalPrefix('v1')`).

| Method | Path | Response | Notes |
| --- | --- | --- | --- |
| GET | `/v1/health` | `{ status:'ok', service:'api', timestamp }` | Unchanged since Phase 0. |
| GET | `/v1/courts` | `CourtSummaryDTO[]` | Filters: `country,region,collection,surface,access,indoorOutdoor,scenic,featured,q,limit`. No lat/lng. |
| GET | `/v1/courts/map` | `MapPinDTO[]` | Decorative screen coords only. Declared **before** `:slug`. |
| GET | `/v1/courts/:slug` | `CourtDTO` | 404 on miss. lat/lng omitted. |
| GET | `/v1/courts/:slug/related` | `CourtSummaryDTO[]` | `?limit=` (default 4). 404 if anchor slug unknown. |
| GET | `/v1/collections` | `CollectionDTO[]` | `featured` (no-op), `limit`. Derived `count`. |
| GET | `/v1/collections/:slug` | `CollectionDTO` (no courts) | 404 on miss. |
| GET | `/v1/articles` | `ArticleDTO[]` (full, newest-first) | `featured` (no-op), `limit`. |
| GET | `/v1/articles/:slug` | `ArticleDTO` | 404 on miss. |
| POST | `/v1/consultations` | `ConsultationRequestDTO` (201) | Global `ValidationPipe`; anonymous (`userId` null). |

Cross-cutting bootstrap (`main.ts`): global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` +
`transform`), permissive `enableCors()` (production origins deliberately not hardcoded yet),
`enableShutdownHooks()` for clean Prisma teardown, `PORT ?? 3001`.

---

## 3. Prisma / schema / migrations

Schema: `apps/api/prisma/schema.prisma` — **finalized for Phase 2** (header updated; the
`DRAFT / DISPOSABLE` banner is gone). Owned exclusively by `apps/api` (Decision #3).

### Migration paths

- **`apps/api/prisma/migrations/20260626224118_init/`** — the single clean initial migration. The
  Phase-0 `000_draft_do_not_build_on` draft was **deleted** and history reset per Decision #13 (no
  forward-migration off the draft). Authored offline via `prisma migrate diff` (no live Postgres was
  reachable in the dev environment).
- **`apps/api/prisma/migrations/20260629132232_add_article_author/`** — Feature 44 forward
  migration adding the nullable `Article.author` column (the Feature-40 schema omitted it, which was
  the Feature-43 byline parity gap).
- `migration_lock.toml` → `provider = postgresql`.

### Finalization edits made in Feature 40 (vs. the Phase-0 draft)

- `Court.isLocked Boolean @default(false)`, `Court.mapX Int` + `Court.mapY Int` (serializer
  recombines into the `mapCoords` tuple), `Court.seedOrder Int @default(0)` (reproduces mock array
  order for deterministic list/map reads).
- `Collection.coverImageUrl String?` replaced the unused `coverImageId`.
- `Article.heroImageUrl String?` replaced the unused `heroImageId`; `Collection.sortOrder` reused.
- Exact `Court.lat`/`lng` **kept in the DB** (Phase-4 gating + admin map picker); `approxLat`/
  `approxLng` kept. `Entitlement` left a stub; auth/payment/admin/user-collection models present as
  FK targets only, never read/written by a Phase-2 endpoint.

### Seed strategy

`apps/api/prisma/seed.ts`, wired via `apps/api/package.json#prisma.seed` → `tsx prisma/seed.ts`
(also `pnpm --filter @tennis/api db:seed`). DATA flows one way: `@tennis/mock-data` → Postgres.

- **FK write order:** Country → Region → Court → CourtImage → Collection → CollectionCourt → Article.
- **Idempotent:** every write is an `upsert` keyed on a stable id/slug — re-running the seed produces
  no duplicates and no drift.
- **ID stability:** Court/Collection/Article ids are set **explicitly to the mock-data ids**
  (`tremezzo`, …) so `CourtSummaryDTO.id` / `MapPinDTO.courtId` stay byte-identical to the mock;
  Country/Region use slugified deterministic ids; CourtImage uses `${courtId}-img-${sortOrder}`.
- **Seed-only data** (not in mock-data, not exposed by any DTO): `Country.continent`/`isoCode`
  (lookup tables in the seed), `Region.lat/lng` (reuse a representative member court's approx geo).
- `count` is **not stored** — derived from `CollectionCourt` at read time.
- **Not seeded** (auth/Phase-4 or runtime-only): `User`, `Entitlement`, `SavedCourt`,
  `UserCollection*`, `AdminUser`, `ConsultationRequest`. Consultation rows are **runtime data**
  created by `POST /v1/consultations`, never seeded.

### Live seed counts

| Entity | Count |
| --- | --- |
| countries | 11 |
| regions | 12 |
| courts | 12 |
| courtImages | 30 |
| collections | 6 |
| collectionMemberships | **15** |
| articles | 3 |

> **`collectionMemberships` is 15, not 14.** The Feature-39 intake said "14 memberships", but the
> ground-truth `COLLECTION_COURTS` array in `packages/mock-data` has **15** links (coastal 5 +
> desert 1 + hidden 4 + historic 2 + mountain 2 + rooftop 1). The seed follows the data source
> (Decision #5) and seeds 15; any seed/diff test must expect 15.

### Coordinate safety

Exact `lat`/`lng` are **stored** in the DB but exposed by **no** public court endpoint. The masking
is structural: the public Prisma `select`s in `courts.mapper.ts` never read `Court.lat`/`lng`, so the
row payload types literally have no such fields and the mappers are incapable of attaching them. The
detail mapper additionally leaves `CourtDTO.lat`/`lng` undefined (no entitlement system yet → every
request is non-entitled). See §6.

---

## 4. API modules (as built)

### Health — `apps/api/src/health/`

- `GET /v1/health` → `{ status:'ok', service:'api', timestamp: ISO }`. No DB read, no business logic;
  used by the CI parity job's health-wait loop.

### Courts — `apps/api/src/courts/`

- **Endpoints:** `GET /v1/courts`, `/v1/courts/map`, `/v1/courts/:slug`, `/v1/courts/:slug/related`.
- **DTOs:** `CourtSummaryDTO[]` (list/related), `MapPinDTO[]` (map), `CourtDTO` (detail).
- **Behavior (faithful port of `MockCourtRepository`):** only `status = published`; list/map ordered
  by `seedOrder asc` (reproduces mock COURTS array order); `limit` applied as `take` post-WHERE
  (matches mock `slice`). `collection` filters by **slug** through the `CollectionCourt` join. `q`
  is case-insensitive `contains` over name/country/region/setting (the exact mock fields — not blurb).
- **Coordinate masking:** public selects exclude `lat`/`lng` (the "can't leak what you didn't fetch"
  guarantee); mappers structurally cannot attach them; `CourtDTO.lat`/`lng` omitted in Phase 2.
- **Map pin DTO:** only `courtId`, `slug`, `mapCoords` (`[mapX, mapY]`), `state`
  (`locked > featured > open`, matching the mock `pinState`).
- **Related ranking:** reproduces the mock heuristic **exactly** — score
  `(sameCountry ? 2 : 0) + (sameSurface ? 1 : 0)`, sort score DESC then `seedOrder` ASC (stable
  tie-break), `slice(limit)`, self excluded. The endpoint keys off **slug** (route key); the HTTP
  repo resolves the interface's **id** → slug before calling (see §5).
- **404/400:** `:slug` and `:slug/related` throw `NotFoundException` (→ 404) on an unknown/unpublished
  slug; `list`/`map` return `[]` (200) when empty; a malformed `limit` is rejected by `ParseIntPipe`.

### Collections — `apps/api/src/collections/`

- **Endpoints:** `GET /v1/collections`, `/v1/collections/:slug`.
- **DTO:** `CollectionDTO` / `CollectionDTO[]`.
- **Derived count:** `count` comes from `_count` of `CollectionCourt` (never stored).
- **Detail is `CollectionDTO` ONLY** — no embedded `courts` array, no `/with-courts` route. The web
  detail page fetches member courts **separately** via `GET /v1/courts?collection=slug` (Risk #10
  regression guard; asserted by the parity harness).
- **Behavior:** list ordered by `sortOrder asc` (seed assigns `sortOrder = i` over the mock array);
  `featured` accepted but does **not** narrow the set (parity with the mock); `limit` trims after
  ordering. No `isPublished` WHERE — the mock returns every collection, so adding one would break
  byte parity (all seeded collections are published anyway).
- **404:** `getBySlug` throws `NotFoundException` on a miss.

### Articles — `apps/api/src/articles/`

- **Endpoints:** `GET /v1/articles`, `/v1/articles/:slug`.
- **DTO:** `list()` returns **full `ArticleDTO[]`** (incl. `bodyRichText`), **not** summaries — the
  journal list page and "More from the Journal" both consume the full shape.
- **`author` included** (Feature 44; omitted when null).
- **`publishedAt` is date-only `YYYY-MM-DD`** on the wire — the mapper does
  `value.toISOString().slice(0, 10)` for **byte parity** with the mock (Feature 47). Timezone-safe
  (`toISOString` is always UTC); the UI parses it identically, so no rendering change.
- **Behavior:** ordered `publishedAt desc` (`nulls: 'last'`, defensive); `featured` no-op; `limit`
  trims after ordering. No related-articles endpoint by design (derived page-side).
- **404:** `getBySlug` throws `NotFoundException` on a miss.

### Consultations — `apps/api/src/consultations/`

- **Endpoint:** `POST /v1/consultations` → `ConsultationRequestDTO` (201; Nest's default `@Post`
  status, no override).
- **Validation:** the global `ValidationPipe` runs the class-validator decorators on
  `ConsultationSubmitRequestDTO` — `whitelist` strips undecorated props, `forbidNonWhitelisted`
  400s on an unknown field, and any failed rule 400s.
- **`destinationInterest` is REQUIRED** — `email` (valid email) and `destinationInterest`
  (`@IsString`) are required; everything else optional. *(The prompt lists `destinationInterest` as
  optional, but the contract zod schema — the source of truth — and the non-nullable Prisma column
  make it required; the DTO follows the contract.)*
- **Capitalized enum values** (the Prisma/contract enums, **not** the lowercase web pill labels):
  - `skillLevel`: `Beginner` / `Intermediate` / `Advanced` / `Pro`
  - `groupSize`: `Solo` / `Couple` / `Family` / `Group`
  - `source`: `court` / `paywall` / `profile`
- **Persistence only:** inserts one `ConsultationRequest` row (`userId` null, `status` default
  `"new"`, `createdAt` default `now()`), then reads it back. **No CRM webhook, no email, no auth, no
  rate limiting** (intake §8).

> **`@tennis/contracts` is imported type-only** in the API (its TS-source `main` can't be
> `require`d by Node at runtime); the consultation DTO **class** is the runtime validator, with a
> compile-time `satisfies`-style guard keeping it structurally in sync with the zod contract. See
> the `api-contracts-type-only-import` memory.

---

## 5. Web domain state (as built)

`apps/web/src/domain/` — the by-domain repository layer. UI imports only from
`@/lib/repositories` (ESLint `no-restricted-imports` boundary, unchanged); the http repos live under
`src/domain/**` and are exempt, same as the mocks.

### HTTP client — `domain/http/http-client.ts`

The single transport module: `getJson` / `getJsonOrNull` (404 → `null`) / `postJson` + a
`buildQuery` helper. Base URL from `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001/v1`,
incl. the `/v1` segment), trailing slash trimmed. `cache: 'no-store'`. Deliberately tiny — no client
class, no interceptors, no retry, no zod re-validation. `HttpError` carries status + path + body.

### HTTP repositories

- **`HttpCourtRepository`** — `list` → `GET /v1/courts{query}`; `getBySlug` → `/courts/:slug`
  (404→null); `search(q)` → `list({ q })`; `getMapPins` → `/courts/map` (`bbox`/`zoom` accepted for
  interface stability, unused/unsent); `getRelated(courtId, limit)` resolves **id → slug** via a
  single `list()` call (seeded `id !== slug`), then `GET /courts/:slug/related?limit=` (unknown id →
  `[]`).
- **`HttpCollectionRepository`** — `list` → `/collections{query}`; `getBySlug` → `/collections/:slug`
  (404→null). `CollectionDTO` only — never embeds courts.
- **`HttpArticleRepository`** — `list` → `/articles{query}` (full `ArticleDTO[]`); `getBySlug` →
  `/articles/:slug` (404→null). `publishedAt` arrives date-only; UI parses it the same way.
- Response typing is **type assertion, not zod** — the first-party API is the source of truth and
  validates server-side; DTO **types** still come from `@tennis/contracts` (so `tsc` catches drift).

### ConsultationRepository — `domain/consultation/`

- **Interface** (`consultation.repository.ts`): `submit(payload: ConsultationSubmitDTO):
  Promise<ConsultationRequestDTO>`. New in Phase 2 (Feature 46) — it did not exist in Phase 1, where
  the modal discarded the form data.
- **Mock impl** (`mock-consultation.repository.ts`): echoes the payload back as a fully-shaped
  `ConsultationRequestDTO` (fabricated `mock-consultation-<ts>` id, `status:'new'`, real `createdAt`)
  — **no network, no persistence**, preserving the Phase-1 demo UX.
- **HTTP impl** (`http-consultation.repository.ts`): `POST /v1/consultations` (runs from the browser —
  the modal is a client island, hence the `NEXT_PUBLIC_` base URL), returns the created DTO.
- `ConsultationModal.handleSubmit` calls `repositories.consultation.submit(...)` and flips to the
  existing in-modal success state on resolve / non-blocking error on reject — **UX unchanged** in
  both modes.

### Factory behavior — `domain/index.ts`

- **`mock` mode** (default): every domain mock — courts, collections, journal, saved, user,
  consultation.
- **`api` mode:** courts, collections, journal, consultation → HTTP; **saved + user stay MOCK**
  (deliberate hybrid — no `/v1/me` persistence yet; the factory must **not** throw for them).
- Unknown `NEXT_PUBLIC_DATA_SOURCE` fails fast; exhaustiveness guard on the switch.

### What stays mock in `api` mode

- **`saved` / `user`** — the Saved and Profile screens, and the **Add-to-Collection / Rename / Create
  Collection** interactions, run against in-memory mock state (the Phase-1 mutation seam). These are
  **Phase-4** swaps behind the same interfaces (`/v1/me/collections*`). The court-detail page still
  calls `saved.getSavedCollections()` / `saved.getCollectionIdsForCourt()` server-side.
- **No UI redesign happened during the API swap** — the only product-code edits were the consultation
  wiring and the `publishedAt` serialization fix; no screens/routes/layouts changed.

---

## 6. Coordinate masking (recap)

| Layer | Exact `lat`/`lng`? |
| --- | --- |
| Database (`Court.lat/lng`) | ✅ stored (Phase-4 gating + admin) |
| Public Prisma `select` | ❌ never selected for public reads |
| Mapper / DTO boundary | ❌ structurally cannot attach (row type has no field) |
| Wire / HTTP response | ❌ absent (`CourtDTO.lat?`/`lng?` omitted in Phase 2) |

`approxLat`/`approxLng` + `mapCoords` are always present. The parity harness asserts **no
`lat`/`lng` key at any nesting depth** in `/v1/courts*` responses, independently of the deep-equal
checks — a real leak fails that assertion regardless of any harness normalization.

---

## 7. Verification — parity harness

- **Root command:** `pnpm verify:api-parity` (root pass-through, Feature 48).
- **Web script:** `pnpm --filter @tennis/web verify:api-parity` → `tsx scripts/verify-api-parity.ts`.
- **Result: 35/35 pass** — "PARITY VERIFIED — mock and API return equivalent DTOs" (last run:
  Feature 48 in CI; see §9 on running locally).

The harness (`apps/web/scripts/verify-api-parity.ts`) instantiates the concrete mock and HTTP
repository classes directly (bypassing the env factory) so one process drives both sources, and for
each method the pages actually call:

- **Courts:** `list()` + `list` filter variants (`featured/limit`, `collection`, `surface`,
  `access`, `q`), `search`, `getBySlug` hit + miss(→null), `getMapPins`, `getRelated` (real id,
  non-existent id → `[]`, smaller limit).
- **Collections:** `list()` + `limit`/`featured`, `getBySlug` hit + miss(→null); asserts detail is
  `CollectionDTO` only (**no `courts` key**).
- **Articles:** `list()` + `limit`/`featured`, `getBySlug` hit + miss(→null); asserts full
  `ArticleDTO` (bodyRichText + author + publishedAt).
- **No lat/lng leakage:** recursive key scan on every `/v1/courts*` HTTP response; `approxLat`/
  `approxLng` + `mapCoords` present.
- **DTO shapes:** exact `CourtDTO` key set (no Prisma internals, no lat/lng), images ordered by
  `sortOrder`; map pins carry only the four `MapPinDTO` fields.

The **one** intentional normalization: strip `lat`/`lng` from the **mock** side of the court-detail
deep-equal (the mock carries them, the API masks them) — masking is asserted separately so this
cannot hide a leak. `saved`/`user` are intentionally **not** compared (they stay mock).

---

## 8. CI parity job

`.github/workflows/ci.yml` has two jobs:

- **`verify`** — install → `prisma:generate` → `lint` → `typecheck` → `build`.
- **`parity`** (Feature 48) — self-contained Linux job:
  1. checkout + pnpm/Node setup + `pnpm install --frozen-lockfile` + `prisma:generate`.
  2. **Postgres 16** service container (`tennis`/`tennis`/`tennis_world`, port 5432, `pg_isready`
     health-gated).
  3. **`prisma migrate deploy`** — applies the committed migrations to the fresh CI DB
     (non-destructive; deliberately not `reset`, which the Prisma AI-agent guardrail blocks without a
     human and which an empty CI DB doesn't need).
  4. **`db:seed`** — the idempotent upsert seed (12/6/3/15).
  5. **Build + start the API** (`node apps/api/dist/main.js` in background).
  6. **Wait for `/v1/health`** — plain `curl` retry loop (30 × 1 s; no `wait-on` dependency).
  7. **`pnpm verify:api-parity`** — exits non-zero on any drift, failing the job.
  8. **Stop API** (`if: always()`).

---

## 9. Running it locally

```bash
pnpm db:up                                       # Postgres (docker compose)
cp apps/api/.env.example apps/api/.env            # if not present
pnpm --filter @tennis/api prisma:migrate:reset    # apply init migration + seed (HUMAN-run; destructive)
#   (or, if already migrated, just re-seed — non-destructive upserts:)
pnpm --filter @tennis/api db:seed
pnpm --filter @tennis/api dev                     # or: pnpm --filter @tennis/api build && node apps/api/dist/main.js
pnpm verify:api-parity                            # 35/35
```

`NEXT_PUBLIC_API_BASE_URL` overrides the base (default `http://localhost:3001/v1`). For the web app
in API mode, set `NEXT_PUBLIC_DATA_SOURCE=api` in `apps/web/.env.local` (see `apps/web/.env.example`).

---

## 10. Remaining hybrid seams (deliberate, behind stable interfaces)

| Seam | State in `api` mode | Phase-4 target |
| --- | --- | --- |
| `saved` repository | **mock** (in-memory) | auth-backed HTTP behind `SavedRepository` |
| `user` repository | **mock** (in-memory) | auth-backed HTTP behind `UserRepository` |
| Create / Rename / Add-to-Collection | **mock** mutation seam (client-island local state) | `POST/PATCH /v1/me/collections*` |
| Entitlement / unlock | page-level `unlocked = false` constant | entitlement service after auth |
| Consultation submit | **real** in `api` mode (`POST /v1/consultations`) | CRM webhook (Phase 5) |

The UI does not change when these swap — the interfaces are stable.

---

## 11. Out of scope — still deferred

- **Auth** — magic-link, Apple/Google OAuth; `/signin`/`/signup` stay UI-only shells. No sessions,
  JWT, cookies, OAuth.
- **Payments** — no Stripe, checkout, webhooks, receipt validation, promo, admin grant/revoke.
- **Entitlement / unlock** — `Entitlement` stays a stub; no per-user gating; all requests
  non-entitled (exact coords exposed by nothing).
- **`/v1/me/*`** — no user/saved endpoints; saved/user stay mock.
- **Admin** — `apps/admin` empty; no `/v1/admin/*` (Phase 3).
- **Exact directions** — stay placeholder; no coords on the wire.
- **Article Share** — still `disabled` placeholder.
- **Profile / settings backend** — none (placeholder).
- **Restore purchase** — footer "Restore" stays `href="#"`.
- **Individual saved-court global toggle** (`toggleSavedCourt`) — still unimplemented.
- **`/v1/countries`, `/v1/regions`** — deferred (no Phase-1/2 consumer; filters use names).
- **AnalyticsEvent / `/v1/events`** — removed from MVP (Decision #10).
- **Test runner (Vitest) + Turbo `test` task** — not added; the parity harness is a plain `tsx`
  script (see §13).
- **OpenAPI/Swagger publish** — not stood up yet (optional, §13).

---

## 12. Known caveats

- **`saved`/`user` still mock in `api` mode** — the Saved/Profile screens and the
  create/rename/add-to-collection interactions are in-memory; a created/renamed/toggled folder is
  demo-only and may reset on reload / server restart. Phase-4 swap.
- **No auth / session / JWT / OAuth**, **no Stripe / payments / entitlements**, **no `/v1/me`
  endpoints**, **no admin**, **no exact directions**.
- **Article Share** and **profile settings** remain placeholders.
- **Consultation** persists a row only — no CRM, email, or rate limiting.
- **`apps/api/package.json#prisma` deprecation:** configuring the seed under the `package.json#prisma`
  key emits a Prisma deprecation warning (Prisma 7 will move this to `prisma.config.ts`). Left as-is;
  a Prisma-7 migration is out of scope.
- **`pnpm format:check` pre-existing failure:** `prettier.config.js` can't resolve `@tennis/config`.
  It is **not** wired into either CI job and does not gate anything. Pre-existing and unrelated to
  Phase 2; left as-is. *(Confirmed still present — see §14 command results.)*
- **Migrations were authored offline** (`prisma migrate diff`) because no live Postgres was reachable
  in the dev environment; CI (`migrate deploy`) and a human's local `migrate reset` apply them.

---

## 13. Recommended next phase

> **Update (2026-06-30): Phase 4 is now complete** (Features 50–59) — the auth + user-persistence work
> recommended below was delivered, retiring the §10 saved/user hybrid seams in `api` mode. See
> `PHASE_4_COMPLETION_SUMMARY.md` for the as-built state.

**Phase 4 groundwork — auth + user persistence (blocking the remaining hybrid seams):**

1. **Auth + users** — real authentication (the `/signin`/`/signup` shells exist); sessions/JWT.
2. **`/v1/me` saved/user persistence** — endpoints backing `SavedRepository` / `UserRepository`.
3. **Replace the saved/user mock repositories in `api` mode** behind the **same interfaces** (the
   factory branch is the only change; UI unchanged).
4. **Persist Add-to-Collection / Rename / Create Collection** via `POST/PATCH /v1/me/collections*`.
5. **Entitlement / unlock** — only **after** the auth foundation: effective-entitlement service,
   per-user coordinate gating (exact `lat`/`lng` already stored, ready to expose to entitled users).

These are **blocking** for finishing the hybrid seams in §10 — nothing else can replace the
saved/user mocks without an auth identity.

**Optional infra (non-blocking, can run in parallel or be deferred):**

- **Vitest runner for the parity harness** (intake R12 / Feature 47 §11) — wrap the existing
  deep-equal/masking/shape helpers in Vitest, add a Turbo `test` task, have the `parity` CI job call
  `pnpm test`. Gives per-check reporting + a home for future unit tests, reusing the comparison
  helpers verbatim. The current `tsx` script already gates CI, so this is polish, not a requirement.
- **Swagger / OpenAPI docs** — stand up `@nestjs/swagger` to publish the `/v1` spec early (the
  frozen mobile contract remains Phase 6).

> **Blocking vs. optional:** auth + `/v1/me` persistence (items 1–4) are **blocking** — they are the
> only way to retire the saved/user/collection mock seams. Entitlement (item 5) is blocked on auth.
> Vitest and Swagger are **optional** infra that improve DX/docs but unblock nothing.

---

## 14. Verification commands (this doc-only feature)

This feature changed **only** documentation — no product/API/schema/web code.

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm typecheck` | ✅ 7/7 packages pass |
| `pnpm build` | ✅ 5/5; web emits 14 route entries + `_not-found` (unchanged route table) |
| `pnpm verify:api-parity` | ⏸ Not re-run — the API/Postgres were not running locally for this doc task. **Feature 48 last ran it: 35/35 pass** (and it gates CI on every PR). Not faked here. |
| `pnpm format:check` | ❌ Pre-existing, unrelated `@tennis/config` resolution failure (confirmed still present); not wired into CI; does not gate anything. |

**End of Phase 2 completion summary.**
