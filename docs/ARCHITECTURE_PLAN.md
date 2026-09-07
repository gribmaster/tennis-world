# Technical Architecture Plan — Tennis World

**Scope:** Web (Next.js), Backend API (NestJS + PostgreSQL/Prisma), Admin Panel (Refine), Mobile (Flutter, external consumer, separate repo).
**Status:** Planning only — no implementation in this document.
**Source material:** `PRD_Tennis_Mobile_App.md`, `Claude_Design_Prompt_Tennis_Mobile.md`, `/files/*.html` prototypes (home, map, collections, journal, profile, saved).
**Revision note:** This revision incorporates 16 structural decisions — see the "Decision #N" references throughout — most notably: Prisma now lives under `apps/api/prisma` (not repo root), and its Phase 0 schema is an explicitly disposable draft, finalized only in Phase 2 (Decision #13); there is no shared `packages/repositories` or `packages/ui` yet (web's repository interfaces live locally at `apps/web/src/domain/*` during Phase 1); a new `packages/mock-data` holds the reusable dataset; analytics storage is removed from MVP scope; auth and payments are deferred to Phase 4, after the mock-first web build; the `Entitlement` model is expanded to support lifetime, subscription, promo, and manual-grant flows with explicit revocation; `apps/admin` exists from Phase 0 only as an empty placeholder, with Refine not installed until Phase 3 (Decision #14); `apps/web` uses the latest stable Next.js major rather than a pinned "14+"; Court Detail (`app/courts/[slug]`) is a required Phase 1 screen despite having no dedicated HTML prototype (Decision #15); and `apps/web/app/api` is reserved exclusively for unavoidable framework plumbing, never business logic, which lives only in `apps/api` (Decision #16).

---

## 1. Recommended Monorepo Structure

Turborepo + pnpm workspaces. One repo, three deployables (web, api, admin). Flutter is **not** in this repo.

```
tennis-world/
├── apps/
│   ├── web/                     # Next.js, latest stable major (App Router) — public marketing + discovery site
│   │   └── src/domain/           # Repository INTERFACES + mock implementations (web-local, Phase 1 — see §5)
│   ├── admin/                   # Refine + React — internal CMS/ops panel, talks to API directly (see §6).
│   │                              #   Phase 0: empty workspace placeholder only — Refine is not installed/
│   │                              #   configured until Phase 3 (Decision #14).
│   └── api/                     # NestJS — REST API, auth, payments, CRM webhooks
│       └── prisma/               # schema.prisma + migrations — OWNED by api, not the repo root (see Decision #3)
│
├── packages/
│   ├── config/                   # Shared tooling config: eslint, base tsconfig, prettier — consumed by all
│   │                              #   three apps and both packages below. Justified from day one (3+ consumers).
│   ├── contracts/                # Shared TS types: DTOs, enums, zod schemas — single source of truth
│   │                              #   for API request/response shapes, consumed by web, admin, api.
│   └── mock-data/                 # Reusable mock dataset (ported from HTML prototypes): courts, collections,
│                                   #   collection-court membership, articles, site-stats, paywall-copy, users.
│                                   #   NOTE: carries `slug`s + BOTH `mapCoords` (screen %, for the stylized
│                                   #   Phase-1 map) AND real-geo lat/lng/approxLat/approxLng — never conflated.
│                                   #   Consumed by apps/web/src/domain mocks AND later by apps/api seed
│                                   #   scripts, so mock and seed data never diverge.
│
├── docker-compose.yml             # Postgres, (later) Redis, MinIO/S3-compatible for local dev
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

**Why separate repo for Flutter:** different toolchain/release cadence (App Store/Play submissions, native build agents), and the PRD treats mobile as a parallel-but-independent MVP track. It only needs the **published OpenAPI contract**, not monorepo access. Keep `packages/contracts` exportable as a versioned OpenAPI/JSON-schema artifact mobile can pull from.

**Why Prisma lives in `apps/api/prisma`, not a root `/prisma`:** the API is the only runtime that should own migrations, schema evolution, and the generated Prisma Client. A root-level `/prisma` implied shared ownership (e.g. admin importing the generated client directly), which this plan now avoids — admin talks to the API over HTTP only (see Decision #9 / §6), so it has no reason to see the schema directly. This keeps a single write-owner for the database and avoids two services racing to apply migrations.

**Why no `packages/repositories` and no `packages/ui` yet:** seeding a shared package for either before there's a second consumer is premature abstraction. Repository interfaces are needed once, by `apps/web`, during Phase 1 — they live at `apps/web/src/domain/*` (see §5 and Decision #7). A shared `packages/ui` is deferred until `apps/admin` or a future client actually needs to reuse web's components verbatim; until then Tailwind + design tokens live directly in `apps/web` (see Decision #6 and §9 Risk table).

**Why `packages/mock-data` exists even though `packages/repositories` doesn't:** the mock *data* (the actual courts/collections/articles arrays) is genuinely reusable — by web's mocks now, and by the API's seed script later — whereas the repository *interface* pattern is only needed by one consumer today. Data and interface are deliberately split: shared data, local interface.

---

## 2. Domain Entities

Derived from PRD feature set + prototype data shapes (`COURTS`, `COLLECTIONS`, articles, user, saved collections).

| Entity | Key Fields | Notes |
|---|---|---|
| **Court** | id, name, slug, countryId, regionName, cityName, latitude, longitude (exact), approxLatitude/approxLongitude (~10km offset, precomputed), surface (enum), setting, accessType (enum: Resort/Club/Academy/Private), indoorOutdoor (enum), isScenic, isFeatured, status (draft/published), heroImageId, blurb, createdAt, updatedAt | Coordinates split into exact vs. approximate to implement the paywall masking server-side, not client-side. **NB:** the HTML prototypes' `coords:[x,y]` are screen-percentage positions for the stylized map canvas, NOT geo — in `packages/mock-data` they become `mapCoords` and are kept entirely separate from `latitude/longitude` (see Risk #17). |
| **CourtImage** | id, courtId, url, alt, sortOrder, isHero | Gallery; CDN-backed |
| **Country** | id, name, isoCode, continent (enum) | Powers map hierarchy levels 1–2 |
| **Region** (City/Area) | id, countryId, name, lat/lng centroid | Powers map hierarchy level 3 |
| **Collection** | id, name, slug, description, coverImageId, type (editorial/system), sortOrder, isPublished | Coastal, Desert, Hidden, Historic, Mountain, Rooftop & seasonal |
| **CollectionCourt** | collectionId, courtId, sortOrder | Join table |
| **Article** (Journal) | id, title, slug, subtitle, category, bodyRichText, heroImageId, readTimeMinutes, publishedAt | Editorial guides |
| **User** | id, email, name, authProvider (email/apple/google), createdAt | Account creation deferred until save/unlock per PRD. Auth is a later phase — see §8 — but the entity is modeled now since `SavedCourt`/`UserCollection` reference it. |
| **Entitlement** | id, userId, kind (enum: `lifetime_unlock`/`subscription`/`promo_unlock`/`manual_grant`), status (enum: `active`/`revoked`/`refunded`/`expired`), source (enum: `stripe_web`/`iap_ios`/`iap_android`/`promo_code`/`admin`), receiptRef (nullable), grantedAt, expiresAt (nullable — null for lifetime, set for subscription/promo), revokedAt (nullable), revokedReason (nullable), grantedByAdminId (nullable, FK to AdminUser — set only when source=admin), metadata (jsonb — promo code, refund id, etc.) | See expanded model in §3 / Decision #12. Supports lifetime unlocks, recurring subscriptions, time-boxed promo unlocks, refund-driven revocation, and manual admin grants/comps, all through one table instead of a boolean flag. |
| **SavedCourt** | userId, courtId, savedAt | |
| **UserCollection** (Wishlist folder) | id, userId, name, createdAt | "Honeymoon 2026" style folders |
| **UserCollectionCourt** | userCollectionId, courtId, sortOrder | |
| **ConsultationRequest** | id, userId (nullable), name, email, destinationInterest, travelPeriodStart/End, isFlexible, skillLevel (enum), groupSize (enum), additionalRequest, source (court/paywall/profile), status (new/contacted/closed), createdAt | Forwarded to CRM via webhook |
| **AdminUser** | id, email, role (editor/admin/ops), passwordHash | Refine panel auth |

**Removed from MVP scope:** `AnalyticsEvent` table and its ingestion endpoint — see Decision #10. The PRD §11 event taxonomy (`app_open`, `court_view`, `paywall_view`, etc.) is preserved as **documentation only** (see `docs/IMPLEMENTATION_BACKLOG.md` and §9 Risk #5) so web/mobile emit comparable event names into a vendor SDK (Amplitude/Mixpanel) directly, without the backend owning storage.

**Enums:** `Surface{Clay,Hard,Grass}`, `Setting` (free text or curated list), `AccessType{Resort,Club,Academy,Private}`, `IndoorOutdoor{Indoor,Outdoor}`, `SkillLevel{Beginner,Intermediate,Advanced,Pro}`, `GroupSize{Solo,Couple,Family,Group}`, `Continent{Europe,Asia,Americas,Africa,Oceania}`, `EntitlementKind{lifetime_unlock,subscription,promo_unlock,manual_grant}`, `EntitlementStatus{active,revoked,refunded,expired}`, `EntitlementSource{stripe_web,iap_ios,iap_android,promo_code,admin}`.

---

## 3. Database Schema Draft (Prisma-shaped, conceptual)

**Location:** `apps/api/prisma/schema.prisma` (see Decision #3 / §1) — owned and migrated exclusively by the API service.

**Status note (Decision #13):** Phase 0 scaffolds this schema as a **draft** to unblock parallel work — it is explicitly not the finalized production schema and its first migration is not treated as authoritative. The schema is revisited and finalized in Phase 2, once the mock-first web model (Phase 1) has validated the actual shapes pages need (e.g. which fields a `CourtSummaryDTO` needs vs. a full `CourtDTO`). Treat any Phase 0 migration as disposable — expect to reset/regenerate it in Phase 2 rather than incrementally migrating away from early guesses.

```
model Country        { id, name, isoCode, continent, regions: Region[] }
model Region         { id, countryId, name, lat, lng, courts: Court[] }

model Court {
  id, slug, name
  regionId, countryId            // denormalized countryId for fast world/country zoom queries
  lat, lng                       // exact — server-only exposure, gated by entitlement check
  approxLat, approxLng           // ~10km jittered, always public
  surface, setting, accessType, indoorOutdoor
  isScenic, isFeatured, status
  blurb
  images: CourtImage[]
  collections: CollectionCourt[]
  savedBy: SavedCourt[]
  userCollections: UserCollectionCourt[]
  createdAt, updatedAt
}

model CourtImage     { id, courtId, url, alt, sortOrder, isHero }

model Collection      { id, slug, name, description, coverImageId, type, sortOrder, isPublished, courts: CollectionCourt[] }
model CollectionCourt { collectionId, courtId, sortOrder  @@id([collectionId, courtId]) }

model Article         { id, slug, title, subtitle, category, bodyRichText, heroImageId, readTimeMinutes, publishedAt }

model User {
  id, email (unique), name, authProvider, createdAt
  entitlements: Entitlement[]
  savedCourts: SavedCourt[]
  userCollections: UserCollection[]
  consultationRequests: ConsultationRequest[]
}

model Entitlement {
  id, userId
  kind                  // lifetime_unlock | subscription | promo_unlock | manual_grant
  status                // active | revoked | refunded | expired
  source                // stripe_web | iap_ios | iap_android | promo_code | admin
  receiptRef?           // platform receipt/transaction id, nullable for promo/admin grants
  grantedAt
  expiresAt?            // null for lifetime_unlock; set for subscription and time-boxed promo_unlock
  revokedAt?
  revokedReason?        // free text: "refund", "chargeback", "support comp reversed", etc.
  grantedByAdminId?     // FK -> AdminUser; set only when source = admin
  metadata              // jsonb: promo code used, Stripe refund id, RevenueCat event id, etc.
  createdAt, updatedAt
}
model SavedCourt        { userId, courtId, savedAt  @@id([userId, courtId]) }
model UserCollection    { id, userId, name, createdAt, courts: UserCollectionCourt[] }
model UserCollectionCourt { userCollectionId, courtId, sortOrder  @@id([userCollectionId, courtId]) }

model ConsultationRequest {
  id, userId?, name, email, destinationInterest
  travelStart?, travelEnd?, isFlexible
  skillLevel, groupSize, additionalRequest
  source, status, createdAt
}

model AdminUser { id, email (unique), passwordHash, role, createdAt }
```

**Indexing notes:**
- `Court(countryId)`, `Court(regionId)`, `Court(status, isFeatured)` for map/home queries.
- `Court(lat, lng)` — consider PostGIS extension (`geography` type) once map needs radius/bbox queries beyond simple clustering; defer to Phase 2 if MVP clustering can be done client-side or by country/region grouping alone.
- `SavedCourt`, `UserCollectionCourt` composite PKs double as uniqueness constraints.
- `ConsultationRequest(status, createdAt)` for ops queue in admin panel.
- `Entitlement(userId, status)` — the "is this user currently unlocked" check is the single hottest query against this table (runs on every gated `Court` detail fetch); a user's *effective* entitlement is computed as: any row with `status = active` AND (`expiresAt IS NULL` OR `expiresAt > now()`). Compute this in an `EntitlementService` helper, not duplicated inline across endpoints.

---

## 4. API Endpoint List (NestJS, REST, versioned `/v1`)

**Sequencing note (Decision #11):** Only the **Public / discovery** and **Consultation** groups below are needed to support the Phase 1 mock-first web build going live against real data (Phase 2). **Auth** and **Payments/entitlements** are explicitly later-phase work — see §8 Phase 4 — and are listed here for completeness of the eventual contract, not as something Phase 1–2 builds.

### Public / discovery (no auth, free-tier safe) — Phase 2
```
GET  /v1/courts                  ?country=&region=&collection=&surface=&access=&indoor=&scenic=&q=&page=
GET  /v1/courts/:slug            -> exact lat/lng OMITTED unless entitled (see auth variant below)
GET  /v1/courts/map               ?bbox=&zoom=   -> clustered/aggregated pins per PRD zoom hierarchy
GET  /v1/countries
GET  /v1/regions?countryId=
GET  /v1/collections
GET  /v1/collections/:slug
GET  /v1/articles
GET  /v1/articles/:slug
```

### Consultation / CRM — endpoints Phase 2, CRM webhook Phase 5
```
POST /v1/consultations                (Phase 2 — anonymous submission allowed, no auth dependency)
GET  /v1/consultations                (admin-only, paginated — Phase 3, surfaced in Refine)
GET  /v1/consultations/:id            (admin-only — Phase 3)
PATCH /v1/consultations/:id           (admin-only — status update — Phase 3)
```
*(The CRM webhook that fires on `ConsultationRequest` creation — HubSpot/Pipedrive — is Phase 5, not these endpoints. See §8 Phase 5.)*

### Admin (role-gated, used by Refine) — Phase 3
```
POST/PATCH/DELETE /v1/admin/courts
POST/PATCH/DELETE /v1/admin/courts/:id/images
POST/PATCH/DELETE /v1/admin/collections
POST/PATCH/DELETE /v1/admin/articles
GET/PATCH         /v1/admin/consultations
GET               /v1/admin/users
```

### Auth — Phase 4 (not part of the first web mock implementation)
```
POST /v1/auth/magic-link/request
POST /v1/auth/magic-link/verify
POST /v1/auth/apple
POST /v1/auth/google
POST /v1/auth/refresh
POST /v1/auth/logout
```

### Authenticated user — Phase 4
```
GET    /v1/me
GET    /v1/me/entitlements
GET    /v1/courts/:slug            (same route, but with valid JWT + entitlement -> exact coords included)
POST   /v1/me/saved-courts/:courtId
DELETE /v1/me/saved-courts/:courtId
GET    /v1/me/saved-courts
GET    /v1/me/collections
POST   /v1/me/collections
POST   /v1/me/collections/:id/courts/:courtId
DELETE /v1/me/collections/:id/courts/:courtId
DELETE /v1/me/account                 (App Store deletion requirement)
```

### Payments / entitlements — Phase 4
```
POST   /v1/payments/stripe/checkout-session     (web: one-time $29, or subscription — see Entitlement.kind)
POST   /v1/payments/stripe/webhook              (handles checkout completion AND refund/chargeback -> revokes Entitlement)
POST   /v1/payments/mobile/validate-receipt      (RevenueCat webhook or direct StoreKit/Play receipt)
GET    /v1/me/entitlements/restore
POST   /v1/me/entitlements/redeem-promo          (promo_unlock — Decision #12)
POST   /v1/admin/entitlements/grant              (manual_grant by AdminUser — Decision #12)
DELETE /v1/admin/entitlements/:id                (admin revoke — sets status=revoked, revokedReason required)
```

**Analytics ingestion: removed from MVP (Decision #10).** No `/v1/events` endpoint and no `AnalyticsEvent` table. Web/mobile clients emit events directly to a vendor SDK (Amplitude/Mixpanel). The PRD §11 event taxonomy is preserved as documentation only — see `docs/IMPLEMENTATION_BACKLOG.md`.

---

## 5. Web App Module Structure (Next.js, mock-first, data-driven)

Core principle (Decision #7 & #8): **UI components and pages depend only on repository interfaces local to the web app**, at `apps/web/src/domain/*` — not a shared package. Two implementations exist side by side; a single factory/DI switch decides which one is wired in, controlled by env var — no UI rewrite when swapping. The app is **mock-first and data-driven**: every page/component renders purely from data returned by a repository call, never from hardcoded JSX content, so the eventual swap to live data is a data-shape change only, never a markup change.

```
apps/web/
├── src/
│   ├── domain/                        # Phase-1-local repository layer (Decision #7) — promote to a shared
│   │   │                              #   package only if/when a second consumer genuinely needs it (see §9 Risk #4)
│   │   ├── interfaces/
│   │   │   ├── court.repository.ts        # interface CourtRepository { list(), getBySlug(), search(), getMapPins() }
│   │   │   ├── collection.repository.ts
│   │   │   ├── article.repository.ts
│   │   │   ├── user.repository.ts         # saved courts, user collections, entitlement status (Phase 4+)
│   │   │   └── consultation.repository.ts
│   │   ├── mock/
│   │   │   ├── mock-court.repository.ts    # reads from packages/mock-data, applies filter/search in-memory
│   │   │   ├── mock-collection.repository.ts
│   │   │   ├── mock-article.repository.ts
│   │   │   └── mock-consultation.repository.ts   # "submits" into an in-memory/log sink
│   │   ├── http/
│   │   │   ├── http-court.repository.ts    # calls NestJS API via shared `packages/contracts` types
│   │   │   └── ...                          # added in Phase 2, not Phase 1
│   │   └── index.ts                        # factory: process.env.DATA_SOURCE === 'mock' | 'api'
│   │
│   ├── app/
│   │   ├── (marketing)/
│   │   │   └── page.tsx                       # Home — hero, destinations, editor's cut, collections, journal teaser
│   │   ├── map/page.tsx                       # Map screen — search, filter chips, canvas, bottom sheet/list panel
│   │   ├── courts/[slug]/page.tsx             # Court Detail — REQUIRED in Phase 1 (Decision #15) even though no
│   │   │                                       #   standalone court-detail.html prototype exists; layout is derived
│   │   │                                       #   from the shared design language plus the court-detail content
│   │   │                                       #   structure already implied by map.html's CourtDetail component,
│   │   │                                       #   the paywall/location-mask requirements, and saved-state hooks.
│   │   ├── collections/page.tsx               # All collections grid
│   │   ├── collections/[slug]/page.tsx        # Collection detail (filtered court list)
│   │   ├── journal/page.tsx
│   │   ├── journal/[slug]/page.tsx
│   │   ├── saved/page.tsx                     # tabs: Courts | Collections | Wishlist Map — Phase 1 builds the UI
│   │   │                                       #   against mock saved-state; real auth-gating added Phase 4
│   │   └── profile/page.tsx                   # same — mock membership/stats in Phase 1, real auth in Phase 4
│   │   (No `app/auth/` or `app/api/` payment routes in Phase 1 — see Decision #11 / §8 Phase 4)
│   │   (No `app/api/*` business routes EVER, in any phase — see Decision #16 below)
│   │
│   ├── components/
│   │   ├── court/ (CourtCard, CourtGallery, LocationPreview, RelatedCourts)
│   │   ├── map/ (MapCanvas, FilterChips, SearchBar, BottomSheet/ListPanel, ClusterPin, CourtPin)
│   │   ├── collections/ (CollectionGrid, CollectionCard)
│   │   ├── journal/ (ArticleCard, ArticleBody)
│   │   ├── saved/ (SavedGrid, UserCollectionRow, WishlistMap)
│   │   ├── profile/ (StatsRow, MembershipBadge, MenuRow)
│   │   ├── paywall/ (PaywallModal, BenefitRow, PriceBlock)
│   │   ├── consultation/ (ConsultationForm, ConfirmationScreen)
│   │   └── shared/ (Nav, Footer, SectionHeader, Button variants per design tokens)
│   │
│   └── lib/
│       ├── repositories.ts             # imports factory from src/domain, exposes typed hooks/server actions
│       ├── auth/                       # Phase 4 — session handling (NextAuth or custom JWT in httpOnly cookie)
│       ├── payments/                   # Phase 4 — Stripe client helpers
│       └── analytics/                  # thin wrapper over Amplitude/Mixpanel SDK (Decision #10 — no backend ingestion)
│
└── styles/ (design tokens from Claude_Design_Prompt_Tennis_Mobile.md as Tailwind theme — already prototyped in HTML files; lives directly in apps/web, no shared packages/ui yet — see Decision #6)
```

**Mock-first, data-driven contract details:**
- Every repository method signature is defined once in `domain/interfaces/`, reused by both mock and HTTP implementations, and typed against `packages/contracts` DTOs from day one — so the DTO shape is never invented twice.
- Components/pages only ever import from `lib/repositories.ts`, never directly from `domain/mock/` or `domain/http/`.
- Mock data itself lives in `packages/mock-data` (Decision #5), not inside `domain/mock/` — the repository files in `domain/mock/` are thin adapters that shape/filter that shared data to match the interface, they don't own the dataset. This is what lets the same dataset later seed the real Postgres database via the API's seed script with zero copy-paste drift.
- "Data-driven" means: no page component should contain literal court names, prices, or copy in JSX — everything (including the $29 price point, benefit list copy, collection names) flows through a repository or a config object, even while that config object is presently the mock data. This is what makes the Phase 2 swap a true no-UI-rewrite event rather than a "mostly no rewrite."
- Switching `DATA_SOURCE=api` requires zero UI changes; only the factory's branch executes differently. CI should run the full page test suite against both modes to catch interface drift.
- Auth and payments are **not** wired into Phase 1 at all (Decision #11): saved-state, membership badges, and unlock status are driven by mock/local state (e.g. a mock `UserRepository` backed by `localStorage` or in-memory state), so the UI/UX for "saved", "locked", "unlocked" can be fully built and demoed before any real session or payment exists.
- **No business API routes inside `apps/web/app/api`, in any phase (Decision #16).** Business logic, data access, payment processing, and any publicly-callable endpoint live exclusively in `apps/api` (NestJS). `apps/web` is a presentation layer that calls out to `apps/api` via the `domain/http/*` repositories (Phase 2+) — it never re-implements or proxies that logic itself. Next.js route handlers under `app/api/*` are permitted **only** for framework-specific plumbing that has no other home (e.g. an OAuth provider callback that must redirect through the Next.js origin, or a webhook target that genuinely must be received by the web origin for a third-party SDK's redirect-URI requirements) — and only if that need turns out to be unavoidable later. Treat any new `app/api/*` route as something to justify explicitly, not a default place to put server-side code.

---

## 6. Admin Module Structure (Refine + React)

Per Decision #9, admin uses a Refine `dataProvider` **directly against the API** — no intermediate abstraction layer, no shared repository pattern, no GraphQL gateway. Refine's REST data provider (`@refinedev/simple-rest` or a thin custom one) talks to `/v1/admin/*` and `/v1/admin/entitlements/*` as-is; this is intentionally the most direct path available, since admin has exactly one consumer (internal ops/editorial staff) and no mock-first requirement.

**Timing (Decision #14):** `apps/admin` exists from Phase 0 only as an empty workspace package (a `package.json` and nothing else) so the monorepo's workspace graph is correct from day one. Refine itself — and everything in the structure below — is not installed or configured until Phase 3, once `/v1/admin/*` endpoints exist to point it at. Building admin UI against endpoints that don't exist yet would invert the dependency the wrong way.

```
apps/admin/
├── src/
│   ├── App.tsx                       # Refine <Refine> root, dataProvider -> NestJS REST directly
│   ├── authProvider.ts               # admin login against /v1/auth (admin role) — Phase 3/4
│   ├── dataProvider.ts               # maps Refine CRUD calls to /v1/admin/* endpoints, no extra indirection
│   ├── resources/
│   │   ├── courts/
│   │   │   ├── list.tsx              # table: name, country, status, featured, locked-state
│   │   │   ├── create.tsx / edit.tsx # form: all Court fields + image manager (CourtImage CRUD)
│   │   │   └── show.tsx
│   │   ├── collections/
│   │   │   ├── list.tsx / create.tsx / edit.tsx
│   │   │   └── court-assignment.tsx  # drag-sort courts within a collection
│   │   ├── articles/
│   │   │   └── list.tsx / create.tsx / edit.tsx   # rich text editor for bodyRichText
│   │   ├── consultations/
│   │   │   ├── list.tsx              # ops queue, filter by status
│   │   │   └── show.tsx              # detail + status update + notes
│   │   ├── users/
│   │   │   └── list.tsx / show.tsx   # entitlement status, saved counts (read-mostly)
│   │   └── entitlements/
│   │       ├── list.tsx              # all entitlements: kind, status, source, expiresAt
│   │       ├── grant.tsx             # manual_grant flow (Decision #12) -> POST /v1/admin/entitlements/grant
│   │       └── revoke.tsx            # revoke flow with required revokedReason -> DELETE /v1/admin/entitlements/:id
│   └── components/
│       ├── ImageUploader.tsx          # uploads to S3/Cloudflare Images via presigned URL endpoint
│       └── CourtMapPicker.tsx         # lat/lng + approx-offset picker on a map widget
```

**Why Refine:** built-in CRUD scaffolding against a REST data provider maps directly onto the `/v1/admin/*` endpoints with minimal custom code, and its resource model mirrors the Prisma models closely enough that schema changes propagate with small, localized edits.

**Analytics dashboard removed:** the earlier `analytics/dashboard.tsx` resource depended on the now-removed `/v1/admin/analytics-summary` endpoint (Decision #10). If a funnel view is needed later, it should query the vendor analytics platform's own dashboard/API (Amplitude/Mixpanel), not a backend-owned summary endpoint.

---

## 7. Mobile Handoff Requirements (Flutter — external consumer)

The Flutter app is **not** part of this monorepo and must integrate purely through the public API contract.

**What the backend must guarantee for mobile:**
1. **Stable versioned REST contract** (`/v1/...`) — no breaking changes without a `/v2` path; publish an OpenAPI spec (NestJS `@nestjs/swagger`) as the canonical artifact mobile consumes for codegen (e.g. `openapi_generator` Dart package).
2. **Entitlement reconciliation endpoint** — mobile purchases happen via StoreKit2/Play Billing (per PRD §9.1, RevenueCat-abstracted); backend needs a webhook/endpoint to record those entitlements into the same `Entitlement` table used by the web Stripe flow (now modeled with `kind`/`status`/`source` per Decision #12), so a user who buys on mobile is unlocked on web and vice versa, and a mobile refund correctly revokes web access too.
3. **Map data must support clustering server-side** — mobile needs `GET /v1/courts/map?bbox=&zoom=` to return pre-clustered counts per the PRD's 4-tier hierarchy (World → Region → City → Court), since Flutter's Mapbox SDK expects lightweight pin payloads, not the full Court object.
4. **Coordinate masking enforced server-side** — never trust a client to blur/obscure coordinates; `approxLat/approxLng` vs `lat/lng` selection happens in the NestJS resolver based on the request's entitlement claim, identical logic for web and mobile.
5. **Auth tokens usable cross-platform** — same JWT/refresh-token scheme; magic-link, Apple Sign-In, Google Sign-In all issue tokens through the same `/v1/auth/*` endpoints mobile can call directly (no web-only session cookies).
6. **Image CDN URLs are absolute and resizable** — Cloudflare Images/imgix style query params so Flutter can request device-appropriate resolutions without a separate mobile-specific image pipeline.
7. **Offline-friendly response shapes** — list/detail payloads should be self-contained (denormalized region/country names, not just IDs) so the Flutter app can cache last-viewed courts/maps per PRD §9.4 without extra joins.
8. **Consultation and save endpoints must accept unauthenticated submission where the PRD requires it** (offline-queued consultation forms, pre-login saves) — backend should allow anonymous `POST /v1/consultations` and support save-then-claim-on-login flow if account creation is deferred.
9. **Webhook contract for receipt validation** is mobile's responsibility to call, but its request/response schema must be published and versioned alongside the OpenAPI spec — treat it as part of the public contract, not an internal admin detail.
10. **Analytics event taxonomy shared as documentation, not an API** (Decision #10) — the event names/properties in PRD §11.1 are documented once (see `docs/IMPLEMENTATION_BACKLOG.md`) so mobile and web emit comparable events into the same Amplitude/Mixpanel project via their respective SDKs. There is no backend ingestion endpoint to integrate against — this is a naming-convention contract, not a network contract.

**Out of scope for backend changes purely for mobile:** no mobile-specific endpoints should be needed if the contract above holds — same endpoints serve both clients. If mobile needs a payload shape web doesn't, prefer query params (`?fields=`) over duplicate routes.

---

## 8. Implementation Phases

Detailed task breakdowns for Phase 0 and Phase 1 are in `docs/PHASE_0_FOUNDATION.md` and `docs/PHASE_1_WEB_MOCK_FIRST.md`. The full cross-phase backlog lives in `docs/IMPLEMENTATION_BACKLOG.md`.

### Phase 0 — Foundations (1–2 weeks)
- Monorepo scaffold: `apps/web` (Next.js, latest stable major), `apps/api` (NestJS), `apps/admin` (**empty workspace placeholder only — no Refine install yet, Decision #14**); CI, lint/format config.
- `packages/contracts` skeleton (DTOs, enums, zod schemas — empty but structured).
- `packages/mock-data` skeleton, seeded with the dataset ported from the HTML prototypes.
- `apps/api/prisma/schema.prisma` **draft** schema + local Postgres via docker-compose (schema only — no endpoints yet). This draft and its initial migration are disposable scaffolding, not the finalized production schema — finalization happens in Phase 2 (Decision #13).
- No auth, no payments, no `packages/ui`, no shared `packages/repositories` — none of these are created in Phase 0 (Decisions #6, #7, #11).

### Phase 1 — Web app, mock-first and data-driven (3–4 weeks)
- Build all web pages/components against `apps/web/src/domain/mock/*` repositories (Decision #7), reading from `packages/mock-data` (Decision #5).
- Includes `app/courts/[slug]/page.tsx` (Court Detail) as a required screen, designed from the shared luxury design language even without a dedicated HTML prototype (Decision #15).
- All server-side logic stays in `apps/api`; no `app/api/*` business routes are created in `apps/web` (Decision #16).
- Design tokens ported from `Claude_Design_Prompt_Tennis_Mobile.md` directly into `apps/web`'s Tailwind theme — no shared `packages/ui` unless a second consumer for those components materializes (Decision #6).
- No auth, no payments, no live API dependency (Decision #11) — saved/unlocked/membership state is mocked client-side. Fastest path to a demoable, stakeholder-reviewable site.

### Phase 2 — NestJS API + real data (parallel, 3–4 weeks)
- **Finalize the Prisma schema** (Decision #13): revisit the Phase 0 draft now that Phase 1 has validated the real shapes pages need; reset/regenerate the migration rather than patching the draft incrementally. This finalized schema and its first real migration are what Phase 2 actually ships.
- Implement public/discovery + consultation endpoints (no auth/payments yet — see §4), seed scripts that consume `packages/mock-data` so seed and mock data are provably identical.
- Build `apps/web/src/domain/http/*` repository implementations; flip `DATA_SOURCE=api` in a staging environment; verify zero UI changes needed (this is the proof of the mock-first contract).

### Phase 3 — Admin panel (2–3 weeks, can overlap Phase 2 tail)
- **Install and configure Refine** in `apps/admin` for the first time (Decision #14 — the Phase 0 placeholder becomes a real app here).
- Refine CRUD for courts/collections/articles/consultations, `dataProvider` talking directly to `/v1/admin/*` (Decision #9 — no intermediate abstraction).
- Editorial workflow: draft/publish status, image upload pipeline.

### Phase 4 — Auth, payments, and entitlements (2–3 weeks)
- **Auth** (Decision #11 — first introduced here, not Phase 1): magic-link + Apple/Google OAuth, JWT issuance, account-deferral logic (save/unlock triggers signup).
- **Payments & the expanded Entitlement model** (Decision #12): Stripe checkout (one-time + subscription-capable), RevenueCat/StoreKit/Play receipt validation, promo-code redemption, admin manual-grant/revoke flows, refund-driven revocation via Stripe webhook.
- Entitlement gating wired into `Court` detail (exact coords) using the `EntitlementService` "effective entitlement" check (see §3 indexing notes).
- Web's `domain/mock/user.repository.ts` is swapped for `domain/http/user.repository.ts` here — this is the second proof point of the mock-first contract, later than the discovery-data swap in Phase 2.

### Phase 5 — Consultation + CRM integration (1 week)
- CRM webhook (HubSpot/Pipedrive), admin ops queue refinements in Refine.

### Phase 6 — Mobile contract freeze + handoff (1 week)
- Publish OpenAPI spec, write integration doc for Flutter team using §7 above.
- Mobile team (separate repo/track) begins consuming the live API; backend enters "contract-stable" mode — changes require versioning.

### Phase 7 — Launch hardening (2 weeks)
- Performance pass (map query indexing, image CDN, caching headers), analytics SDK wiring (client-side only, per Decision #10), GDPR/consent, account deletion flow, monitoring/alerting.

*(Phases 1–2 can run concurrently with different engineers; Phase 6 mobile work proceeds independently per PRD's parallel mobile track once the contract is stable. Phase 4 is the first point at which auth and payments enter the system — nothing before it depends on either.)*

---

## 9. Risks and Decisions

| # | Risk / Decision | Recommendation |
|---|---|---|
| 1 | **Map clustering complexity** — true geospatial clustering (PostGIS, server-side bbox queries) vs. simple country/region grouping for MVP | Start with country/region-grouped counts (no PostGIS) for web+mobile MVP; this matches the PRD's discrete 4-tier hierarchy (World→Region→City→Court) rather than continuous zoom, so heavy geo infra isn't needed yet. Revisit PostGIS only if "courts near me" (explicitly a post-MVP PRD item) is greenlit. |
| 2 | **Coordinate masking trust boundary** | Must be enforced in the NestJS resolver layer (strip `lat/lng`, return only `approxLat/approxLng` for non-entitled requests), never in the client. This is a hard requirement shared by web and mobile — flag as a security-relevant code review gate. |
| 3 | **Entitlement reconciliation across multiple payment rails and grant types** (Stripe web, StoreKit iOS, Play Billing Android, promo codes, manual admin grants) | Single `Entitlement` table keyed by `userId` with `kind`/`status`/`source` (Decision #12), populated by distinct webhook/validation/admin-action paths, all funneled through one internal `EntitlementService` that computes "effective entitlement" (see §3). Decide early whether RevenueCat sits in front of all mobile rails (simpler reconciliation, added vendor dependency/cost) or backend validates receipts directly (more code, no vendor lock-in). Recommend RevenueCat for mobile per PRD §9.1, direct Stripe for web. |
| 4 | **Mock-first discipline drift** — engineers under deadline pressure importing `domain/mock/*` or `domain/http/*` directly in page components, bypassing the interface | Enforce via lint rule (no imports from `src/domain/mock/*` or `src/domain/http/*` outside `src/domain/index.ts`/`lib/repositories.ts`) and a CI check. This is the single biggest risk to the "no UI rewrite" promise — and it is now slightly higher-risk than before because the interfaces live inside `apps/web` itself (Decision #7) rather than in an externally-versioned package, so there's no package boundary forcing the discipline. Revisit promoting `src/domain` to a shared `packages/repositories` if this drift becomes a recurring problem, or if a second consumer (e.g. a future web client) needs the same interfaces. |
| 5 | **Analytics ownership** — `AnalyticsEvent` storage and `/v1/events` removed from MVP entirely (Decision #10) | Web/mobile emit events directly to Amplitude/Mixpanel SDKs; the PRD §11 taxonomy is preserved as documentation in `docs/IMPLEMENTATION_BACKLOG.md` so naming stays consistent across platforms without the backend owning storage. If a compliance/data-residency reason emerges later requiring backend-owned event storage, this is a new feature to scope deliberately, not a gap to silently fill. |
| 6 | **CMS-in-house (Refine+Postgres) vs. headless CMS (Strapi/Sanity/Directus)** per PRD §9.2 suggestion | This plan recommends in-house Refine+NestJS+Prisma instead of a third-party CMS, since the requirement explicitly asks for NestJS+Postgres+Prisma+Refine. Trade-off: more upfront engineering for editorial workflow (drafts, rich text, image management) that a headless CMS would give for free. Accept this cost deliberately — flagging so it isn't rediscovered mid-build as a surprise. |
| 7 | **Web auth session model** — cookie-based session (Next.js-native) vs. JWT-in-cookie shared verbatim with mobile | Use JWT (access + refresh) issued by NestJS, stored as httpOnly cookie for web and as secure storage for mobile. Avoids building two parallel auth systems; satisfies mobile handoff requirement #5 in §7. Not relevant until Phase 4 (Decision #11) — flagged now so the Phase 1 mock `UserRepository` shape anticipates it (e.g. mock returns a `User`-shaped object instead of a flat boolean) and doesn't need restructuring later. |
| 8 | **Pricing model flexibility** (PRD open question: one-time $29 vs. future subscription, plus promos and admin comps) | Addressed directly by the expanded `Entitlement.kind`/`status`/`source` model (Decision #12) — supports lifetime, subscription, promo, and manual grants from the first migration. No schema migration needed when a subscription tier or promo campaign is A/B tested per PRD §15. |
| 9 | **Image/video pipeline ownership** | Decide CDN provider (Cloudflare Images vs. imgix vs. S3+CloudFront) before Phase 1 ends — `CourtImage.url` shape (raw S3 key vs. fully-resolved CDN URL with transform params) affects both admin upload UX and mobile's resizing needs (§7 requirement #6). Recommend deciding this in Phase 0, not deferring. |
| 10 | **Admin/editorial workflow gaps** — PRD assumes a CMS with built-in draft/publish/preview; Refine doesn't give this for free | Plan explicit `status` (draft/published) fields on `Court`/`Collection`/`Article` from the first migration, and build a minimal preview link (e.g. `?preview=token`) rather than discovering mid-Phase-3 that editors have no way to stage content before publishing. |
| 11 | **`packages/ui` and `packages/repositories` may eventually be needed** (Decisions #6, #7) — deferring them is correct now but the trigger for creating them later should be explicit, not vibes-based | Promote to a shared package only when a second real consumer exists: `packages/ui` when `apps/admin` (or a future client) needs to reuse `apps/web` components verbatim, not just "similar-looking" ones; `packages/repositories` when a second app needs the exact same repository interfaces (not just similar data). Document this trigger in `docs/IMPLEMENTATION_BACKLOG.md` so it's a deliberate revisit, not a forgotten TODO. |
| 12 | **Prisma ownership boundary** (Decision #3) — `apps/api/prisma` is the only writer/migrator; admin must not get its own Prisma client pointed at the same database | Enforce via code review: `apps/admin` has no `@prisma/client` dependency and no direct DB connection string — all admin data access goes through `/v1/admin/*` over HTTP (Decision #9). This is what keeps "one schema owner" from silently eroding once someone wants a "quick" admin report. |
| 13 | **Phase 0 Prisma schema is draft, not final** — risk that the Phase 0 schema gets treated as authoritative simply because it exists and "works," skipping the deliberate Phase 2 finalization step | Explicitly label the Phase 0 migration as disposable in code/PR descriptions (e.g. a migration named `000_draft_do_not_build_on`). Phase 2 should default to resetting the dev database and regenerating from a finalized schema rather than layering "fix" migrations onto early guesses — the cost of a clean reset early is far lower than untangling migration history later. |
| 14 | **`apps/admin` sits empty for multiple phases** — risk that an empty placeholder workspace bit-rots, breaks the build, or gets "temporarily" filled with throwaway code before Phase 3 | Keep it to the absolute minimum needed to pass CI (a `package.json` with no real dependencies, possibly a placeholder entry file) and include it in the same lint/build/typecheck CI steps as the other apps from Phase 0 onward, so an empty-but-broken `apps/admin` would still be caught immediately rather than discovered in Phase 3. |
| 15 | **Court Detail page has no dedicated HTML prototype** — risk of inconsistent or under-specified layout decisions during Phase 1 since there's no pixel reference to match against, unlike Home/Map/Saved/Profile/Collections/Journal | Derive the layout deliberately from: (a) the luxury design tokens and component patterns already established across the other prototypes (CourtCard, meta-chips, sticky CTA sections, locked-location masking), (b) the court-detail-shaped content already embedded in `map.html`'s in-page `CourtDetail` component (hero gallery, blurb, location preview, related courts, sticky CTA), and (c) the PRD §6.4 feature requirements. Document the resulting layout decision (e.g. as a short design note or Figma-equivalent) before building it, rather than improvising directly in code, so it can be reviewed before implementation. |
| 16 | **`apps/web/app/api` could silently accumulate business logic** — the most common way this drifts is a "quick" webhook handler or a "just this one" data-fetching route added under deadline pressure | Treat any new file under `apps/web/app/api/*` as requiring explicit justification in code review against the narrow exception in §5 (framework-specific plumbing only, e.g. OAuth redirect callback or a third-party-mandated webhook target) — and even then, that route should immediately forward to `apps/api` rather than implementing logic itself. Default assumption in review: a new `app/api` route is wrong until proven otherwise. |
| 17 | **Prototype `coords` are fake map geometry, not geo-coordinates** — `map.html`'s `coords:[54,44]` are `[x%, y%]` positions for the stylized non-interactive map background, not lat/lng. Since `packages/mock-data` is BOTH the Phase-1 UI source and the Phase-2 Postgres seed (Decision #5), shipping these as a court's location would seed garbage into `lat/lng` and leave the coordinate-masking boundary (Risk #2) with no real data behind it. | In `packages/mock-data`, keep the screen position as `mapCoords` (used only by the Phase-1 stylized map canvas) entirely separate from the real-geo fields `lat/lng/approxLat/approxLng` (placeholder values acceptable in Phase 0, but typed and shaped as geo). Never let one field serve both roles. The Phase-2 masking test must run against real-geo data, not screen percentages. |
| 18 | **No `slug` in prototype data, but `slug` is a primary route/seed key** — courts/collections/articles in `/files/*.html` carry only short `id`s and human names; `app/courts/[slug]`, `getBySlug()`, and `/v1/courts/:slug` all assume a slug. | Author a stable `slug` for every court/collection/article in `packages/mock-data` (kebab-cased name or the existing id). It is the Phase-1 routing key and the Phase-2 seed value. Never improvise slug derivation inside a page component — that would violate data-driven discipline (§5). |
| 19 | **Prototype collection `count`s are decorative and exceed the dataset** — collections declare `count:14/22/11…` (70+) against only 12 courts, and no `CollectionCourt` membership is authored in the prototypes, so Phase-1's collection-detail court list has no real data. | Author a real `CollectionCourt` membership mapping in `packages/mock-data` and derive collection counts from it; treat the prototype `count` numbers as display-only mock figures to discard. This is the data-driven-correct choice and is exactly what the Phase-2 seed needs anyway. |

---

**End of plan.**
