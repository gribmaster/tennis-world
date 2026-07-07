# Feature 39 — Phase 2 API + Prisma Intake & Plan

**Status:** Planning / intake only — **no code, no schema edits, no migrations, no DB resets, no
new dependencies.** This document is the source-of-truth plan for Phase 2 (NestJS public discovery
API + real Postgres data behind `NEXT_PUBLIC_DATA_SOURCE=api`).
> **Phase 2 is now COMPLETE (Features 40–48).** This remains the plan-of-record; for the _as-built_
> state (endpoints, schema/migrations, seed counts, the hybrid seams, and what stays deferred) see
> **`docs/PHASE_2_COMPLETION_SUMMARY.md`**. Note the live `collectionMemberships` count is **15**,
> not the "14" stated below (corrected in §13).
**Audience:** whoever implements Phase 2. Read `docs/PHASE_1_COMPLETION_SUMMARY.md` first (the
as-built Phase 1 state), then this.
**Companions:** `../ARCHITECTURE_PLAN.md` (§3 schema, §4 endpoints, §9 risks),
`IMPLEMENTATION_BACKLOG.md` (Phase 2 task list), `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (what stays
inert), `PHASE_1_WEB_MOCK_FIRST.md` (Phase 1 plan).

**The Phase-2 contract in one line:** `packages/mock-data` → Postgres seed → NestJS `/v1/*`
endpoints → `apps/web/src/domain/http/*` repositories, such that flipping
`NEXT_PUBLIC_DATA_SOURCE=api` requires **zero UI changes** and every court-returning endpoint
**omits exact `lat`/`lng`**.

---

## 1. Current state (audited)

### 1.1 API app (`apps/api`) — what exists

NestJS 10 scaffold, Phase-0 minimal:

```
apps/api/
  src/
    main.ts                       NestFactory; app.setGlobalPrefix('v1'); PORT ?? 3001
    app.module.ts                 @Module({ controllers: [HealthController] }) — nothing else
    health/health.controller.ts   @Controller('health') → GET /v1/health → {status,service,timestamp}
  prisma/                          (schema + draft migration — see §1.2)
  nest-cli.json                    sourceRoot src, deleteOutDir
  tsconfig.json                    extends @tennis/config; CommonJS, ES2022, decorators on
  package.json                     scripts: build/dev/start/lint/typecheck + prisma:generate/migrate
  .env.example                     DATABASE_URL (matches docker-compose), PORT=3001
```

- **Build/lint/typecheck:** wired via Turbo (`build`/`lint`/`typecheck` scripts present; `.turbo`
  logs show they run). `nest build` → `dist/`.
- **Dependencies present:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `@prisma/client`, `reflect-metadata`, `rxjs`; dev: `@nestjs/cli`, `prisma`, eslint, ts.
- **Config/env pattern:** none beyond raw `process.env` in `main.ts` (`PORT`). No `@nestjs/config`,
  no `ConfigModule`, no `ValidationPipe`, no global exception filter, no CORS config.

**What is MISSING (Phase 2 must add — all behind the hard rules, i.e. nothing in this doc):**

- `PrismaService` (a Nest provider wrapping `PrismaClient` with lifecycle hooks) — none exists.
- Any feature module/controller/service beyond health (no courts/collections/articles/consultations).
- Global `ValidationPipe` (needed once we accept the consultation POST body) and a consistent
  error/404 shape.
- CORS enablement (the web app on a different origin will call this in staging).
- `@nestjs/swagger` / OpenAPI setup (backlog item for Phase 2).
- Seed script + a `prisma:seed` wiring.
- A DTO/serialization boundary (Nest has no mapper layer yet).

### 1.2 Prisma state — what exists

- **One schema:** `apps/api/prisma/schema.prisma`, explicitly headed **`DRAFT / DISPOSABLE`**
  (Decision #13). Postgres datasource via `env("DATABASE_URL")`; `prisma-client-js` generator.
- **One migration:** `apps/api/prisma/migrations/000_draft_do_not_build_on/migration.sql` — the
  named-as-disposable draft, plus `migration_lock.toml` (`provider = postgresql`).
- The draft schema is already quite complete and **closely matches the finalized shapes Phase 1
  validated** (see §3). Models present: `Country`, `Region`, `Court`, `CourtImage`, `Collection`,
  `CollectionCourt`, `Article`, `User`, `Entitlement` (stub), `SavedCourt`, `UserCollection`,
  `UserCollectionCourt`, `ConsultationRequest`, `AdminUser`. All enums from `@tennis/contracts`
  are mirrored.
- **Field-name note:** the draft uses `Court.access` (the contract/DTO also uses `access`), and
  `Court.indoorOutdoor`. These already align with `CourtSummaryDTO`. Good.

**Recommendation on the draft (see §2):** treat it as the **near-final baseline**, but per
Decision #13 do **not** preserve the `000_draft_do_not_build_on` migration history — reset the dev DB
and regenerate a single clean initial migration in Phase 2. The schema *content* barely needs to
change; the *migration history* must be reset.

### 1.3 Contracts (`packages/contracts`) — the wire shapes (source of truth)

Workspace-linked TS source (`main`/`types` → `./src/index.ts`), so **both** the API seed/mappers
**and** the web HTTP repositories can import `@tennis/contracts` directly. Zod schemas double as
runtime validators. Relevant DTOs:

| DTO | Key fields | Notes for Phase 2 |
|---|---|---|
| `CourtSummaryDTO` | id, slug, name, country, region, surface, setting, access, indoorOutdoor, isScenic, isFeatured, **isLocked**, heroImageUrl, mapCoords, **approxLat, approxLng** | List/card/map shape. **No exact lat/lng.** `country`/`region` are denormalized **names** (strings), not ids. |
| `CourtDTO` | `CourtSummaryDTO` + blurb, images[], status, **lat?, lng? (optional)** | Detail shape. Exact `lat`/`lng` are **optional on the wire** — omitted for non-entitled requests. In Phase 2 they are **always omitted** (no entitlement system yet). |
| `CourtImageDTO` | url, alt?, isHero, sortOrder | |
| `MapPinDTO` | courtId, slug, mapCoords, state(`open`/`locked`/`featured`) | Decorative screen coords only. |
| `CollectionDTO` | id, slug, name, description?, coverImageUrl, type, **count** | `count` is DERIVED from membership. **`getBySlug` returns this (NOT `WithCourts`)** — see §1.4. |
| `CollectionWithCourtsDTO` | `CollectionDTO` + courts[] | Defined in contracts but **the web does NOT currently use it** for collection detail (it fetches courts separately). |
| `ArticleSummaryDTO` / `ArticleDTO` | summary + bodyRichText, publishedAt(ISO string), author? | `publishedAt` is an **ISO-8601 string** on the wire. |
| `ConsultationSubmitDTO` / `ConsultationRequestDTO` | email(required), name?, destinationInterest, travelStart/End?, isFlexible, skillLevel?, groupSize?, additionalRequest?, source?(`court`/`paywall`/`profile`) | POST body + stored shape. |
| `UserProfileDTO`, `UserCollectionDTO`, `UserCollectionWithCourtsDTO`, `EntitlementDTO` | — | **Out of scope for Phase 2** (auth/Phase 4). |

### 1.4 Web domain layer — the interfaces the HTTP repos must satisfy

By-domain folders (`apps/web/src/domain/{courts,collections,journal,saved,user}/`), each with an
interface + mock + types. Factory `domain/index.ts` resolves `NEXT_PUBLIC_DATA_SOURCE` (default
`mock`); the **`api` branch throws `'API repositories are not implemented yet'`** — the Phase 2
entry point. `lib/repositories.ts` is the single sanctioned import boundary, enforced by ESLint
`no-restricted-imports` (config in `apps/web/.eslintrc.json`).

**Exact interface signatures Phase 2 must implement (do not change them):**

- `CourtRepository`: `list(filter?: CourtFilter): CourtSummaryDTO[]`,
  `getBySlug(slug): CourtDTO | null`, `search(query): CourtSummaryDTO[]`,
  `getMapPins(bbox?, zoom?): MapPinDTO[]`, `getRelated(courtId, limit?): CourtSummaryDTO[]`.
  - `CourtFilter` = `{ country?, region?, collection?(slug), surface?, access?, indoorOutdoor?,
    scenic?, featured?, q?, limit? }` — already aligned to `GET /v1/courts` query params.
- `CollectionRepository`: `list(options?): CollectionDTO[]`, `getBySlug(slug): CollectionDTO | null`.
  - **Important:** `getBySlug` returns `CollectionDTO` (no courts). The collection-detail page
    (`app/collections/[slug]/page.tsx`) fetches the court list **separately** via
    `courts.list({ collection: slug })`. The HTTP repos must preserve this — `/v1/collections/:slug`
    needs to return only `CollectionDTO`, and `/v1/courts?collection=` must support the filter.
- `ArticleRepository`: `list(options?): ArticleDTO[]`, `getBySlug(slug): ArticleDTO | null`.
  - Note: `list()` returns **full `ArticleDTO[]`** (not summaries) in the current mock; the journal
    list page and "More from the Journal" both consume `ArticleDTO`. Match this.
- `SavedRepository` / `UserRepository`: **NOT part of Phase 2** (auth/Phase 4). Keep the mock wired
  for these even when `DATA_SOURCE=api` — see §7.
- `ConsultationRepository`: **does not exist yet** — Phase 2 introduces it (§8).

**How pages consume repositories today** (the equivalence target for the dual-mode test):
- Home (`/`): `courts.list({featured,limit:6})`, `collections.list({featured,limit:4})`,
  `journal.list({featured,limit:3})`.
- Map (`/map`): `courts.list()`, `courts.getMapPins()`.
- Court detail (`/courts/[slug]`): `courts.getBySlug`, `courts.getRelated(id,4)`,
  `saved.getSavedCollections()`, `saved.getCollectionIdsForCourt(id)`.
- Collections (`/collections`): `collections.list()`. Detail: `collections.getBySlug` +
  `courts.list({collection:slug})`.
- Journal (`/journal`, `/journal/[slug]`): `journal.list()`, `journal.getBySlug`.
- Saved (`/saved`): `saved.getSavedCourts()`, `saved.getSavedCollections()` (mock stays).

### 1.5 Mock-data — the seed source (12 courts, 6 collections, 14 memberships, 3 articles)

- `COURTS` (12): each is structurally a full `CourtDTO` with `id`, `slug`, denormalized
  `country`/`region` **names**, `mapCoords` (screen %), placeholder real-geo `lat`/`lng`/
  `approxLat`/`approxLng`, `images[]` (with `isHero`/`sortOrder`), `blurb`, `status:'published'`,
  `isLocked`/`isScenic`/`isFeatured`.
- `COLLECTIONS` (6): `count` derived from `COLLECTION_COURTS`.
- `COLLECTION_COURTS` (14 links): `{ collectionSlug, courtSlug, sortOrder }` — the membership ground
  truth.
- `ARTICLES` (3): `publishedAt` as `'YYYY-MM-DD'` strings, `author: 'Janet See'`.
- `IMG`/`U`: image ids → Unsplash URLs; `CourtImage.url` is an **opaque URL string** (CDN provider
  is an unresolved human decision — see §10/Risk).
- `DEFAULT_*` user/saved/collection seeds, `SITE_STATS`, `PAYWALL_COPY`: **not** seeded into
  Postgres in Phase 2 (user-state + static copy stay client/mock — auth is Phase 4; copy is
  feature-local).

**Key data shape facts that drive seeding (§6):**
- `country`/`region` in mock-data are **strings (names)**, but Prisma models them as `Country`/
  `Region` tables with FKs. The seed must **create Country/Region rows and link courts** to them,
  while the API mapper must **flatten them back to names** so `CourtSummaryDTO.country/region`
  match the mock exactly.
- Mock-data has **no `Continent` per country** and **no region lat/lng**; Prisma requires
  `Country.continent` (non-null), `Region.lat/lng` (non-null). The seed must supply these (derive
  continent from country; region lat/lng can reuse a representative court's approx geo or a
  placeholder). This is **new seed-only data**, not a contract change.
- Court `id`s in mock-data are short stable strings (`tremezzo`, `tragara`, …). Prisma `Court.id`
  is `@default(cuid())`. **The seed should set `id` explicitly to the mock-data id** so
  `CourtSummaryDTO.id` and `MapPinDTO.courtId` stay byte-identical to the mock (see §6 ID stability).

---

## 2. Prisma / schema recommendation

**Direction: keep the draft schema as the baseline (it already matches validated Phase-1 shapes),
finalize with small edits, and reset the migration history — do NOT migrate forward from the
draft.** This is exactly Decision #13.

Concretely (for the *implementation* phase, not this doc):

1. **Reset dev DB + regenerate one clean initial migration.** Delete the
   `000_draft_do_not_build_on` migration directory, `prisma migrate reset` the dev database, then
   `prisma migrate dev --name init` (or `--name initial_schema`) to produce a single authoritative
   migration. Do **not** layer a "fix" migration on top of the draft.
2. **Schema content is ~final already.** The Court/Collection/Article/Region/Country models map
   1:1 onto what the DTOs need. Likely *no* structural changes are required for Phase-2 discovery.
3. **Entitlement stays a minimal stub** (Decision #12 expansion is Phase 4). Leave it as-is;
   Phase 2 never reads/writes it.
4. **Confirm `Court.status` default vs. seed.** Schema default is `draft`; all mock courts are
   `published`. The seed sets `status:'published'` explicitly and every read filters
   `status = published` (mirrors `MockCourtRepository`). No schema change needed.
5. **`coverImageId` on Collection is a nullable string FK-by-id, but the DTO needs
   `coverImageUrl` (a URL).** Mock-data carries `coverImageUrl` directly (not an image id). Decide
   one of: (a) add a nullable `Collection.coverImageUrl String?` for Phase 2 simplicity, or (b)
   seed a `CourtImage`-like row and resolve the URL in the mapper. **Recommended: add
   `coverImageUrl String?`** to the Collection model during finalization — it matches the DTO and
   the mock with no join. *(Flag for the implementer; this is the one likely schema edit.)*
6. **Article hero image:** same pattern — schema has `heroImageId String?` but the DTO needs
   `heroImageUrl`. **Recommended: add `Article.heroImageUrl String?`** during finalization (mirrors
   the mock). Court hero is already covered (`CourtImage.isHero` → mapper picks the hero URL).

> These two `*ImageUrl` additions are the only schema edits anticipated, and they exist precisely
> because Phase 1 validated that the UI consumes a **URL string**, not an image id. Everything else
> in the draft holds. **No schema edits happen in this intake** — they are the first task of the
> implementation phase.

**Hard rule for this doc:** schema is **not** edited, no migration is created, the DB is **not**
reset here.

---

## 3. Contracts → required database models (Phase 2 scope)

Source of truth = `packages/contracts` + `packages/mock-data`.

### Models REQUIRED for Phase-2 public discovery + consultation

| Model | Backs | Status in draft |
|---|---|---|
| `Country` | court denormalized `country` name; `/v1/countries` (future) | present; needs seeded `continent` |
| `Region` | court denormalized `region` name | present; needs seeded `lat/lng` |
| `Court` | `CourtSummaryDTO` / `CourtDTO` | present, aligned |
| `CourtImage` | `CourtDTO.images[]`, hero URL | present, aligned |
| `Collection` | `CollectionDTO` | present; recommend add `coverImageUrl` (§2.5) |
| `CollectionCourt` | membership; `count`, `?collection=` filter | present, aligned |
| `Article` | `ArticleDTO` | present; recommend add `heroImageUrl` (§2.6) |
| `ConsultationRequest` | `POST /v1/consultations` | present, aligned (anonymous `userId?`) |

**Enums/value objects reused (already in both contracts & schema):** `Surface`, `AccessType`,
`IndoorOutdoor`, `CourtStatus`, `CollectionType`, `SkillLevel`, `GroupSize`, `Continent`.
`MapCoords` is a `[number, number]` tuple stored on `Court` (the draft does **not** have a
`mapCoords` column — see ⚠ below).

> ⚠ **`mapCoords` is in the DTO but NOT in the Prisma draft.** `CourtSummaryDTO`/`MapPinDTO` both
> carry `mapCoords: [x%, y%]`, and the Map screen positions pins from it. The draft `Court` model
> has `lat/lng/approxLat/approxLng` but **no `mapCoords`**. Phase-2 finalization must add a way to
> store it — e.g. `Court.mapX Int` + `Court.mapY Int` (or `Float`), mapped back to the tuple in the
> serializer. **This is a required finalization edit** (flagged here, performed in implementation).
> Without it, `/v1/courts` and `/v1/courts/map` cannot reproduce the mock and the Map screen breaks.

### Models that must NOT be implemented yet (Phase 4 / later)

- **Auth users** — `User` table exists (FK target) but **no** auth endpoints, sessions, JWT, OAuth,
  magic-link.
- **Entitlements** — `Entitlement` stays a stub; **no** effective-entitlement logic, no gating.
- **Payments** — no Stripe, no checkout, no webhooks, no receipt validation, no promo, no
  admin grant/revoke.
- **User saved collections (HTTP mutations)** — `SavedCourt`, `UserCollection`,
  `UserCollectionCourt` tables may exist in the schema, but **no** `/v1/me/*` endpoints; the mock
  seam stays in the web app (§7, §9).
- **Add-to-Collection / Rename / Create persistence** — stays mock-only in `apps/web`.
- **Exact-coordinate entitlement gating** — beyond the blanket public masking, no per-user
  gating. (Phase 2 = *everyone* is non-entitled.)
- **`AdminUser` / admin endpoints** — Phase 3.
- **`/v1/countries`, `/v1/regions`** — listed in the architecture plan but **not consumed by any
  Phase-1 web repository** (filters use country/region *names* via `courts.list`). Treat as
  **optional / defer** unless a consumer appears; not required for the mock→api equivalence.
- **AnalyticsEvent / `/v1/events`** — removed from MVP (Decision #10).

---

## 4. Coordinate masking plan

**Requirement:** Phase-2 public endpoints must never expose exact `lat`/`lng`. (Risk #2, #17;
backlog "Coordinate masking logic".) No entitlement system exists yet, so **all** requests are
treated as non-entitled → exact coords are exposed by **no** endpoint until Phase 4.

**Where exact coords may live vs. where they must be stripped:**

| Layer | Exact `lat`/`lng` allowed? | Notes |
|---|---|---|
| **Database (`Court.lat/lng`)** | ✅ stored | The schema keeps exact coords for Phase-4 gating + admin map picker. |
| **Prisma query / service** | ✅ may read | The service may `select` them, but must hand the mapper a court that the mapper will not expose. **Safer: do not `select` lat/lng at all** for public reads (see below). |
| **Mapper / serializer (DTO boundary)** | ❌ stripped | The mapper builds `CourtSummaryDTO` / `CourtDTO` and **never sets `lat`/`lng`**. `approxLat`/`approxLng` and `mapCoords` are always included. |
| **Wire / HTTP response** | ❌ absent | `CourtDTO.lat?`/`lng?` are optional and **omitted** in Phase 2. |

**Recommended belt-and-suspenders approach (document the decision, implement in Phase 2):**

1. **Primary masking at the service/query layer:** public court reads use a Prisma `select` that
   **excludes** `lat`/`lng` entirely, so the exact values never enter the Node process for a public
   request. This is the strongest guarantee (you can't leak what you didn't fetch).
2. **Reinforced at the mapper/DTO boundary:** the `toCourtSummaryDTO` / `toCourtDTO` mappers are
   typed to the contract and structurally cannot attach `lat`/`lng` (the summary type has no such
   field; the detail mapper simply never sets them in Phase 2).
3. **Map endpoints (`/v1/courts/map`)** return only `MapPinDTO` (courtId, slug, `mapCoords`,
   state) — decorative screen coords, never geo.
4. **Court detail (`/v1/courts/:slug`)** returns `CourtDTO` with `lat`/`lng` omitted; the location
   preview on the web stays a styled box that receives no coordinates (unchanged from Phase 1).
5. **Directions** remain a placeholder (Phase 4) — no directions URL is built from coordinates.

**Masking happens primarily in the service `select` and is enforced again at the mapper/DTO
boundary.** Treat any code path that puts `Court.lat`/`lng` on a public response as a
security-review failure (Risk #2 is a code-review gate). A serializer-level test should assert no
`/v1/courts*` response body contains `lat`/`lng` keys (§6).

---

## 5. Public API endpoint plan

All under the existing `v1` global prefix. Each replaces a web repository method; each needs a
service + Prisma read + a mapper to the contract DTO. **Every court-returning endpoint applies §4
masking.**

### Courts

| Endpoint | Response contract | Replaces (web repo method) | Service / mapper | Masking | Error / 404 |
|---|---|---|---|---|---|
| `GET /v1/courts` | `CourtSummaryDTO[]` | `CourtRepository.list(filter)` | `CourtsService.list(filter)` → Prisma `where` from query params (`country`,`region`,`collection`(slug→join),`surface`,`access`,`indoor`,`scenic`,`featured`,`q`,`limit`); `toCourtSummaryDTO` | yes (no lat/lng) | empty array if no matches (200). Invalid enum → 400 via ValidationPipe. |
| `GET /v1/courts/:slug` | `CourtDTO` | `CourtRepository.getBySlug(slug)` | `CourtsService.getBySlug` → include `images`; `toCourtDTO` | yes (lat/lng omitted) | **404** when slug not found (web page calls `notFound()` on null → must surface as 404). |
| `GET /v1/courts/map` | `MapPinDTO[]` | `CourtRepository.getMapPins(bbox?,zoom?)` | `CourtsService.getMapPins` → select id/slug/mapCoords/locked/featured; `toMapPinDTO` | n/a (screen coords only) | empty array (200). `bbox` accepted, ignored (no PostGIS, Risk #1). |
| *(related)* | `CourtSummaryDTO[]` | `CourtRepository.getRelated(courtId,limit)` | see ⚠ below | yes | empty array if none. |

> ⚠ **`getRelated` has no dedicated endpoint in the architecture plan.** Two options for the HTTP
> repo: **(a)** add `GET /v1/courts/:slug/related?limit=` (clean, server owns the heuristic — same
> "same-country then same-surface" ranking the mock uses, so the dual-mode test passes), or
> **(b)** have the HTTP repo call `GET /v1/courts` and rank client-side (avoids a new endpoint but
> duplicates ranking logic and risks drift). **Recommended: (a)** — keep ranking server-side, mirror
> the mock's heuristic exactly, document it. Note `getRelated` keys off court **id**, not slug, but
> the public route key is slug; the endpoint resolves slug→court then ranks. *(Open decision for the
> implementer — call it out in the implementation PR.)*

### Collections

| Endpoint | Response contract | Replaces | Service / mapper | 404 |
|---|---|---|---|---|
| `GET /v1/collections` | `CollectionDTO[]` | `CollectionRepository.list(options)` | `CollectionsService.list` → derive `count` from `_count` of `CollectionCourt`; `toCollectionDTO`. `featured` accepted, no-op (mock parity). `limit` trims. | empty array. |
| `GET /v1/collections/:slug` | **`CollectionDTO`** (NOT with courts) | `CollectionRepository.getBySlug(slug)` | `toCollectionDTO` | **404** on miss. |

> **Critical parity point:** the web collection-detail page reads `collections.getBySlug` (returns
> `CollectionDTO`) **and separately** `courts.list({collection: slug})`. So `/v1/collections/:slug`
> must return `CollectionDTO` only, and the `?collection=` filter on `/v1/courts` carries the court
> list. Do **not** "helpfully" embed courts in the collection detail response — it would diverge from
> the mock and the UI would change.

### Journal

| Endpoint | Response contract | Replaces | Service / mapper | 404 |
|---|---|---|---|---|
| `GET /v1/articles` | `ArticleDTO[]` (full, newest-first) | `ArticleRepository.list(options)` | sort by `publishedAt` desc; `toArticleDTO` (publishedAt → ISO string). `limit` trims. | empty array. |
| `GET /v1/articles/:slug` | `ArticleDTO` | `ArticleRepository.getBySlug(slug)` | `toArticleDTO` | **404** on miss. |

> Note: the mock `list()` returns **full `ArticleDTO`** (the journal list + "More from the Journal"
> consume the full shape, incl. `bodyRichText`). Mirror that — `/v1/articles` returns full articles,
> not summaries — so the web HTTP repo's `list()` return type is unchanged.

### Consultations

| Endpoint | Request / response | Replaces | Service | Errors |
|---|---|---|---|---|
| `POST /v1/consultations` | body `ConsultationSubmitDTO` → response `{ id: string }` (or `ConsultationRequestDTO`) | **new** `ConsultationRepository.submit()` (§8) | `ConsultationsService.create` → Prisma insert (anonymous: `userId` null) | 400 on invalid body (ValidationPipe + zod-aligned DTO); 201 on success. **No CRM webhook** (Phase 5). |

### Health

| Endpoint | Response | Status |
|---|---|---|
| `GET /v1/health` | `{status:'ok',service:'api',timestamp}` | **keep as-is** (already exists). |

**Cross-cutting endpoint concerns to set up in Phase 2 (not this doc):**
- Global `ValidationPipe` (whitelist + transform) for the consultation body.
- A consistent 404 shape (Nest's default `NotFoundException` is fine; the web maps null→`notFound()`).
- CORS for the web origin (staging).
- `@nestjs/swagger` to publish the spec early (backlog).

---

## 6. Seed plan & diff/verification strategy

### Seed process (reads `packages/mock-data`, writes Postgres)

Order (respect FKs):

1. **Countries** — derive the distinct `country` names from `COURTS`; assign a `continent` each
   (seed-only mapping, e.g. Italy/Spain/France/Monaco/Portugal/UK→Europe, Morocco→Africa,
   Indonesia/Japan/Maldives→Asia, USA→Americas). `isoCode` seeded (or a stable placeholder per
   country). **Set `Country.id` deterministically** (e.g. slugified name) for stable re-seeds.
2. **Regions** — distinct `(country, region)` pairs from `COURTS`; `lat/lng` from a representative
   member court's `approxLat/approxLng` (or a placeholder) — these are not surfaced by any Phase-2
   DTO, so values only need to be valid. Deterministic `id`.
3. **Courts** — insert each `COURTS[i]` with **`id` set to the mock-data id** (`tremezzo`, …),
   `slug`, names→`countryId`/`regionId` FKs, `mapCoords`→`mapX/mapY`, `lat/lng/approxLat/approxLng`,
   `surface/setting/access/indoorOutdoor/isScenic/isFeatured/status`, `blurb`. Also the
   `isLocked`→? mapping ⚠ (see below).
4. **CourtImages** — from each court's `images[]` (`url/alt?/isHero/sortOrder`), FK to court.
5. **Collections** — from `COLLECTIONS` (id, slug, name, type, `coverImageUrl`); `count` is NOT
   stored (derived at read time from membership).
6. **CollectionCourt** — from `COLLECTION_COURTS` (collectionSlug→id, courtSlug→id, sortOrder).
7. **Articles** — from `ARTICLES` (id, slug, title, subtitle, category, bodyRichText,
   `heroImageUrl`, readTimeMinutes, `publishedAt` (date→DateTime), `author`).

> ⚠ **`isLocked` has no column in the draft schema.** `CourtSummaryDTO.isLocked` and `MapPinDTO.state`
> depend on it, and the mock reads `court.isLocked` directly. The draft `Court` model has **no
> `isLocked` field.** Phase-2 finalization must add `Court.isLocked Boolean @default(false)` (or
> derive lock state from another rule — but the mock treats it as authored data, so a column is the
> faithful choice). **Flag this as a required finalization edit** alongside `mapCoords`,
> `coverImageUrl`, `heroImageUrl`. *(Author field: `isFeatured`/`isScenic` exist; `isLocked` is the
> missing one.)*

**Seed wiring:** a `prisma/seed.ts` run via `prisma db seed` (configure `prisma.seed` in
`apps/api/package.json`). The seed imports `@tennis/mock-data` directly (it is the explicit shared
source — Decision #5). **Idempotent**: use `upsert` keyed on stable ids/slugs so re-running the seed
is safe and does not duplicate rows.

### ID stability (handle carefully)

- **Courts:** set `id` = mock-data `id` explicitly → `CourtSummaryDTO.id` and `MapPinDTO.courtId`
  match the mock byte-for-byte. This is the simplest path to a clean diff and is **strongly
  recommended.**
- **Collections / Articles:** same — set `id` = mock-data `id`.
- **Countries / Regions:** deterministic ids (slugified) so re-seeds are stable; these ids are not
  exposed on the wire anyway (DTOs carry names).
- If for any reason DB-generated cuids are used instead, the diff test must **normalize/ignore `id`**
  and compare on `slug` + the rest — but prefer explicit ids to avoid this.

### Diff / verification strategy (the mock-first proof point)

The backlog requires the seeded API output to be **provably identical** to the mock repositories'
output. Recommended:

1. **Stand up a diff test** that, for each repository method, compares:
   `MockXRepository.method(args)` **vs.** `HttpXRepository.method(args)` (against a seeded test DB /
   running API), asserting **deep equality** after a canonical sort.
2. **Cover these method/argument pairs** (the ones pages actually call):
   - `courts.list()`, `courts.list({featured:true,limit:6})`, `courts.list({collection:'coastal-courts'})`,
     and one of each filter dimension; `courts.getBySlug('grand-hotel-tremezzo')` (and a 404 slug →
     both return null); `courts.getMapPins()`; `courts.getRelated('tremezzo',4)`.
   - `collections.list()`, `collections.list({limit:4})`, `collections.getBySlug('coastal-courts')` +
     a 404 slug.
   - `journal.list()`, `journal.list({limit:3})`, `journal.getBySlug('the-world-as-a-tennis-map')` +
     a 404 slug.
3. **Order/sort expectations** (must match the mock exactly, or the deep-equal fails):
   - Courts `list`: mock iterates `COURTS` in array order, filtered, then `slice(limit)`. The API
     must return the **same order** — add a stable `ORDER BY` that reproduces mock-data array order
     (e.g. seed a `sortOrder`/sequence column, or `ORDER BY` an explicit ordinal). **Do not rely on
     DB insertion order.**
   - Articles `list`: **newest-first** by `publishedAt` desc (mock sorts descending). Match it.
   - Collections `list`: mock returns `COLLECTION_SEEDS` order. Reproduce (seed ordinal / `sortOrder`).
   - `getMapPins`: mock order = `COURTS` (published) order. Match.
   - `getRelated`: mock heuristic = same-country (+2), same-surface (+1), exclude self, stable sort,
     `slice(limit)`. The API must reproduce the **same ranking and tie-breaking** or the diff fails
     — this is the trickiest one; document the exact comparator and replicate it in the service
     (server-side `getRelated` endpoint, §5 option (a)).
4. **Masking assertion** (security): assert no `/v1/courts*` response (list, detail, map) contains
   `lat` or `lng` keys, and that `approxLat/approxLng`/`mapCoords` are present.
5. **No test runner exists today** — Phase 2 must add one (e.g. **Vitest**) at the workspace or
   `apps/api`/`apps/web` level. Wire it into Turbo (`test` task) and **CI** as the permanent dual-mode
   check (backlog item). *(Choosing/adding the runner is a Phase-2 dependency decision — see §10
   risks; not added in this intake.)*

---

## 7. Web HTTP repository plan (`apps/web/src/domain/http/*`)

**Goal:** implement the `api` branch of the factory behind `NEXT_PUBLIC_DATA_SOURCE=api` with **zero
UI changes** and **stable interfaces**.

- **Create `apps/web/src/domain/http/`** (does not exist — correct per Phase 1; Phase 2 work):
  - `http-court.repository.ts` → `HttpCourtRepository implements CourtRepository`
  - `http-collection.repository.ts` → `HttpCollectionRepository implements CollectionRepository`
  - `http-article.repository.ts` → `HttpArticleRepository implements ArticleRepository`
  - a small shared `http-client.ts` (base URL from an env var, e.g. `NEXT_PUBLIC_API_BASE_URL`,
    `fetch` wrapper, JSON parse, error→throw, 404→`null` for `getBySlug`-style reads).
- **Wire them into the factory** (`domain/index.ts`): the `case 'api'` branch returns
  `{ courts: new HttpCourtRepository(), collections: …, journal: …, saved: <mock>, user: <mock> }`.
  - **`saved` and `user` stay MOCK even in `api` mode** in Phase 2 — they are auth/Phase-4 and have
    no Phase-2 endpoints. This is a documented, deliberate hybrid (the court-detail page still calls
    `saved.getSavedCollections()` etc.). The factory must not throw for these.
  - `consultation` is added to the `Repositories` set (§8), with a mock impl and an http impl.
- **Validation at the boundary:** the HTTP repos may parse responses with the `@tennis/contracts`
  zod schemas (e.g. `CourtSummarySchema.array().parse(json)`) so wire drift fails loudly. Recommended
  but optional; at minimum type-assert.
- **DTO shapes are reused verbatim** from `@tennis/contracts` — no new types. Return-type parity:
  `list` → `CourtSummaryDTO[]`; `getBySlug` → `CourtDTO | null` (map 404→null); `getMapPins` →
  `MapPinDTO[]`; `getRelated` → `CourtSummaryDTO[]`; collections/articles likewise.
- **Server vs. client fetch:** pages are server components and call repos on the server, so the HTTP
  base URL must be reachable server-side (and from the browser for the few client islands — but
  those use `saved`, which stays mock). Use a server-side base URL env; the `NEXT_PUBLIC_` prefix
  keeps it readable in both bundles if any client path ever needs it.
- **ESLint boundary unchanged:** UI still imports only from `@/lib/repositories`. The http repos live
  under `src/domain/**` (exempt from the no-restricted-imports rule), same as the mocks. The
  `**/domain/*/*.repository` pattern already covers `http-*.repository` files — no rule change needed.
- **Keep the mock repositories** — they remain the default and the dual-mode test baseline forever.

---

## 8. Consultation plan

Current state: the consultation modal (`features/consultation/ConsultationModal.tsx`) is **fully
in-component** — `handleSubmit` validates in local React state and flips `setSubmitted(true)`; the
form data is **discarded** (no repository, no network). The planned `ConsultationRepository` was
never created in Phase 1 (Completion Summary §3.5). Phase 2 introduces it.

Plan:

1. **Add `ConsultationRepository` interface** (`apps/web/src/domain/consultation/`):
   `submit(payload: ConsultationSubmitDTO): Promise<{ id: string }>` — typed to the contract.
2. **Mock impl** (`mock-consultation.repository.ts`): resolves with a fake id (e.g. logs + returns
   `{ id: 'mock-…' }`) — **no network**, preserving the current demo behavior.
3. **HTTP impl** (`http-consultation.repository.ts`): `POST /v1/consultations` with the payload,
   returns `{ id }` from the response.
4. **Register in the factory** (`Repositories.consultation`), both `mock` and `api` branches.
5. **Wire `ConsultationModal.handleSubmit`** to `repositories.consultation.submit(...)`:
   - Map the local `FormState` → `ConsultationSubmitDTO` (email/name/destinationInterest/…/`source`
     from the trigger's `source` prop).
   - On resolve → flip to the existing in-modal success state (**UX unchanged**). On reject → surface
     a non-blocking error (keep the modal open). Keep the existing local validation.
   - The modal becomes a (still client) island that now performs a real submit in `api` mode and a
     fake submit in `mock` mode — **no visual change**, no new screens.
6. **Out of scope:** **no CRM webhook** (HubSpot/Pipedrive is Phase 5; backlog confirms the webhook
   is Phase 5, not Phase 2). Phase 2 only persists the `ConsultationRequest` row via the endpoint.

---

## 9. Out of scope for Phase 2 (must remain deferred)

- **Real auth** — no magic-link, Apple/Google OAuth; `/signin`/`/signup` stay UI-only shells.
- **Sessions / JWT / cookies / OAuth** — none.
- **Stripe / payments** — no checkout, no webhooks, no receipt validation, no promo, no admin
  grant/revoke.
- **Entitlement / unlock** — `Entitlement` stays a stub; no effective-entitlement service; no
  per-user gating; **all requests non-entitled** (exact coords exposed by nothing).
- **Restore purchase** — footer "Restore" stays `href="#"`.
- **Individual saved-court global toggle** (`toggleSavedCourt`) — still not implemented anywhere.
- **User-collection HTTP mutations** behind `/v1/me/collections*` — create/toggle/rename stay the
  **mock seam** in `apps/web`; `saved`/`user` repos stay mock even in `api` mode.
- **Add-to-Collection persistence** beyond the mock UI.
- **Directions / exact coordinates** — stay placeholder; no coords on the wire.
- **Article Share** — stays `disabled`.
- **Profile / settings backend** — none.
- **`/v1/countries`, `/v1/regions`** — defer unless a consumer materializes (no Phase-1 repo uses
  them).
- **Admin (`apps/admin`, Refine, `/v1/admin/*`)** — Phase 3; `apps/admin` stays empty.
- **Image CDN provider decision** — must be made by a human before seed finalization (see §10); the
  implementer must NOT pick one. `CourtImage.url` stays an opaque string.
- **OpenAPI publish as a versioned artifact** — Swagger *setup* is in-scope (start publishing), the
  *frozen mobile contract* is Phase 6.

---

## 10. Risk list

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Prisma draft migration misuse** — building Phase 2 forward from `000_draft_do_not_build_on` instead of resetting (violates Decision #13). | Delete the draft migration, `migrate reset`, regenerate one clean `init` migration. Call it out in the PR. Do not "preserve history." |
| R2 | **Exact-coordinate leakage** — `Court.lat/lng` reaching a public response. | Don't `select` lat/lng for public reads; mapper structurally can't attach them; serializer-level test asserts no `lat`/`lng` in `/v1/courts*` bodies. Security-review gate (Risk #2). |
| R3 | **Mock/API DTO drift** — seeded API output differs from mock (order, fields, derived counts, related ranking). | The §6 diff test compares mock vs. http repo deep-equal with explicit sort/order rules; zod-parse responses at the http boundary; run in CI (dual-mode). |
| R4 | **Missing columns in the draft** — `mapCoords`, `isLocked`, `Collection.coverImageUrl`, `Article.heroImageUrl` are in the DTOs but not the schema. | Finalization adds them (§2, §3, §6). Without them the Map screen and lock states can't be reproduced. **Highest-priority schema work.** |
| R5 | **Route rendering changes** — flipping to `api` accidentally changes which routes are SSR/static or changes markup. | Keep server-component pages and repo call sites unchanged; only the factory branch differs. Re-run the build and compare the route table (14 entries + `_not-found`) in both modes. |
| R6 | **Seed ID instability** — DB cuids breaking `id`/`courtId` equality with the mock. | Set explicit ids = mock-data ids on Court/Collection/Article; deterministic ids on Country/Region; idempotent upserts. |
| R7 | **Image CDN provider unresolved** (Risk #9) — `CourtImage.url` shape (raw key vs. resolved URL) affects seed + later upload. | Human decision before seed finalization; until then keep `url` an opaque absolute string exactly as mock-data emits. Implementer must not choose. |
| R8 | **Making UI changes during the API swap** — the cardinal sin of the mock-first contract. | Zero `.tsx`/feature changes except wiring `ConsultationModal.handleSubmit` to the new repo (which is itself behind the interface and UX-identical). Dual-mode test + visual parity check. |
| R9 | **Accidentally implementing auth/payment/entitlement scope** — scope creep into Phase 4. | §9 out-of-scope list is the gate; `saved`/`user` stay mock; `Entitlement` untouched; no `/v1/me/*`, no `/v1/auth/*`, no `/v1/payments/*`. |
| R10 | **Collection-detail shape regression** — embedding courts in `/v1/collections/:slug`. | Endpoint returns `CollectionDTO` only; courts come from `/v1/courts?collection=` (mirrors mock exactly). |
| R11 | **`getRelated` endpoint/ranking ambiguity** — no planned route; heuristic must match the mock. | Add `GET /v1/courts/:slug/related` (§5 option a) replicating the mock comparator exactly; cover in the diff test. |
| R12 | **No test runner exists** — the dual-mode "proof" has nowhere to run. | Add Vitest (workspace) + Turbo `test` task + CI step as part of Phase 2 (dependency decision). |
| R13 | **`country`/`region` denormalization mismatch** — names vs. FK ids producing different strings. | Seed creates Country/Region rows; mapper flattens FK→name; diff test asserts `country`/`region` strings equal the mock. |
| R14 | **API config gaps** — no ValidationPipe/CORS/error shape, so the consultation POST or cross-origin web call fails. | Add global `ValidationPipe`, CORS for the web origin, consistent 404; set up in the API bootstrap during Phase 2. |

---

## 11. Recommended implementation order

1. **Finalize Prisma schema** (small edits only): add `Court.mapX/mapY` (or `mapCoords`),
   `Court.isLocked`, `Collection.coverImageUrl`, `Article.heroImageUrl`; confirm everything else.
   **Reset dev DB + regenerate one clean `init` migration** (drop the draft). *(Decision #13.)*
2. **PrismaService + module wiring** in `apps/api` (lifecycle-managed `PrismaClient`); global
   `ValidationPipe`, CORS, 404 shape.
3. **Seed script** (`prisma/seed.ts`) from `@tennis/mock-data`, idempotent upserts, explicit ids,
   ordinal/sort columns to reproduce mock order. Verify row counts (12/6/14/3 + countries/regions).
4. **Courts module** — `GET /v1/courts`, `/v1/courts/:slug`, `/v1/courts/map`,
   `/v1/courts/:slug/related`; service + mappers + **masking**. This is the biggest surface.
5. **Collections module** — `GET /v1/collections`, `/v1/collections/:slug` (derived `count`).
6. **Journal module** — `GET /v1/articles`, `/v1/articles/:slug` (newest-first, full DTO).
7. **Consultations module** — `POST /v1/consultations` (anonymous, persist row, no CRM).
8. **Web HTTP repositories** — `domain/http/*` + `http-client`; wire the factory `api` branch
   (courts/collections/journal http; saved/user **stay mock**; consultation mock+http).
9. **ConsultationRepository** (interface + mock + http) and wire `ConsultationModal.handleSubmit`
   (UX unchanged).
10. **Diff/verification harness** — add Vitest; mock-vs-http deep-equal tests with sort rules +
    masking assertions; Turbo `test` task.
11. **Dual-mode run + CI** — run the page suite/build in both `mock` and `api`; confirm zero UI
    changes and an identical route table; make dual-mode a permanent CI step.
12. **OpenAPI/Swagger** — stand up `@nestjs/swagger`, start publishing the spec (early, cheap).

> Steps 1–7 are the API/data spine; 8–9 are the web swap; 10–11 are the proof. Steps 4–7 can be
> parallelized by module once the seed (3) lands.

---

## 12. Next exact implementation prompt

> **Feature 40: Phase 2 — Finalize Prisma schema, reset DB, and seed Postgres from
> `packages/mock-data`.**
>
> Context: Phase 2 is approved per `docs/FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md`. This is the first
> implementation step (intake §11 steps 1–3). Do **only** schema finalization + a clean migration +
> the seed; **no endpoints, no web changes** in this feature.
>
> Read first: `docs/FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md` (§2, §3, §6), the draft
> `apps/api/prisma/schema.prisma`, and `packages/mock-data/src/*`.
>
> Tasks:
> 1. **Finalize `apps/api/prisma/schema.prisma`** with the minimal edits identified in the intake,
>    and nothing more:
>    - Add `Court.isLocked Boolean @default(false)`.
>    - Add a way to store `mapCoords` — `Court.mapX Int` + `Court.mapY Int` (mapped to the
>      `[x%, y%]` tuple by the future serializer).
>    - Add `Collection.coverImageUrl String?` and `Article.heroImageUrl String?`.
>    - Add a stable ordinal for deterministic list ordering where needed (e.g. `Court.seedOrder Int`,
>      `Collection.sortOrder` already exists, `Article` order via `publishedAt`).
>    - Keep `Entitlement` a stub; do not touch auth/payment/admin models.
> 2. **Reset the migration history per Decision #13:** delete
>    `prisma/migrations/000_draft_do_not_build_on`, reset the dev database, and generate a single
>    clean initial migration (`--name init`). Do not preserve the draft history.
> 3. **Add an idempotent seed** (`apps/api/prisma/seed.ts`, wired via `prisma db seed` in
>    `apps/api/package.json`) that imports `@tennis/mock-data` and writes, in FK order:
>    countries (with seeded `continent`/`isoCode`), regions (with placeholder `lat/lng`), courts
>    (explicit `id` = mock id, `mapX/mapY`, `isLocked`, all geo + content fields), court images,
>    collections (with `coverImageUrl`; `count` NOT stored), collection-court memberships, and
>    articles (`heroImageUrl`, `publishedAt`, `author`). Use `upsert` keyed on stable ids/slugs.
> 4. **Verify** (no destructive prod commands): `db:up`, run the migration, run the seed twice
>    (idempotency), and confirm row counts (12 courts, 6 collections, 14 memberships, 3 articles,
>    plus the derived countries/regions). Report counts and a sample court row.
>
> Hard rules: no API endpoints, no web/`domain/http` changes, no auth/payments/entitlement/admin
> work, no exact-coordinate exposure logic yet (that's the endpoint feature), no new runtime deps
> beyond what seeding strictly needs, do not edit `apps/web`. Coordinate-masking and endpoints are
> the **next** feature (Feature 41: Courts module + masking).
>
> Report: schema edits made, the new migration name, the seed file, idempotency proof, row counts,
> and any deviation from intake §2/§3/§6.

---

## 13. Feature 40 — implementation note (schema finalized + seed landed)

Implemented intake §11 steps 1–3 (schema finalize, migration reset, seed). No
endpoints, no `apps/web`, no `domain/http`, no auth/payments/entitlement/admin.

**Schema edits made** (`apps/api/prisma/schema.prisma`, minimal):
- `Court.isLocked Boolean @default(false)`, `Court.mapX Int` + `Court.mapY Int`
  (serializer recombines into the `mapCoords` tuple), `Court.seedOrder Int
  @default(0)` (reproduces mock array order for deterministic list/map reads).
- `Collection.coverImageUrl String?` replaces the unused `coverImageId String?`.
- `Article.heroImageUrl String?` replaces the unused `heroImageId String?`.
- `Collection.sortOrder` already existed and is reused (set to list index by seed).
- Exact `Court.lat`/`lng` kept in the DB, `approxLat`/`approxLng` kept; Entitlement
  left a stub; auth/payment/admin/user-collection models untouched.

**Migration reset (Decision #13):** `000_draft_do_not_build_on` deleted; a single
clean `20260626224118_init` migration generated. **Generated offline** via
`prisma migrate diff --from-empty --to-schema-datamodel` (no Docker/Postgres was
reachable in the dev environment — same authoring method as the original draft).
Verified byte-identical to a fresh schema diff (zero drift). `prisma migrate dev`
/ `reset` could **not** be applied to a live DB here — see "manual steps" below.

**Seed** (`apps/api/prisma/seed.ts`, wired via `package.json#prisma.seed` →
`tsx prisma/seed.ts`, also `pnpm --filter @tennis/api db:seed`): imports
`@tennis/mock-data` and writes Country → Region → Court → CourtImage → Collection
→ CollectionCourt → Article with idempotent `upsert`s (stable ids = mock ids for
Court/Collection/Article; slugified ids for Country/Region; `${courtId}-img-N` for
CourtImage). `count` is NOT stored (derived from membership). New dev deps: `tsx`
(seed runner) + `@tennis/mock-data` (workspace dep); `esbuild` added to
`pnpm-workspace.yaml` `onlyBuiltDependencies` so tsx's native binary builds.

**Derived row counts** (offline dry-run; DB-applied counts will match):
courts 12, collections 6, articles 3, countries 11, regions 12, court images 30,
**collection memberships 15**.

> ⚠ **Correction to §1.5/§6:** the intake says "14 memberships", but the
> ground-truth `COLLECTION_COURTS` array in `packages/mock-data` actually has
> **15** links (coastal 5 + desert 1 + hidden 4 + historic 2 + mountain 2 +
> rooftop 1). The seed follows the data source (Decision #5) and seeds 15.

**Manual steps the user must run once Postgres is up** (Docker Desktop installed
but daemon was not running):
```
pnpm db:up                                   # start Postgres (docker compose)
cp apps/api/.env.example apps/api/.env        # if not already present
pnpm --filter @tennis/api prisma:migrate:reset   # apply the clean init migration
pnpm --filter @tennis/api db:seed             # seed; run again to prove idempotency
```
`prisma migrate reset` runs the seed automatically; the explicit `db:seed` second
run proves no duplicates (every write is an upsert).

---

**End of intake.**
