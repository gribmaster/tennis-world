# Phase 0 — Foundation

**Status:** Planning only — no implementation. Companion to `../ARCHITECTURE_PLAN.md` §1, §3, §8.
**Goal:** Stand up the monorepo skeleton and shared contracts/data packages so Phase 1 (web, mock-first) and Phase 2 (API) can both start without blocking on each other.
**Explicit non-goals:** No auth, no payments, no `packages/ui`, no shared `packages/repositories`, no real admin app work yet (Decisions #6, #7, #9, #11, #14). No API endpoints are implemented — only a **draft, disposable** Prisma schema (Decision #13). `apps/admin` is created as an empty workspace placeholder only — Refine is not installed or configured until Phase 3 (Decision #14).

> **Prime directive — Phase 0 builds skeletons only.** This phase stands up structure, not features. If a model, field, endpoint, component, or package is only needed by Phase 2 or later, **stub it minimally or omit it** — do not build it out just because it is fully specified elsewhere in these docs. Resist completeness. When in doubt, build less and flag the gap for human review rather than inventing a business answer (e.g. a CDN provider, a pricing tier, a finalized schema field). The fully-specified Entitlement model, the complete `/v1` endpoint list, and the mobile handoff requirements are **reference for later phases**, not a Phase 0 build list.

---

## 1. Repository & tooling scaffold

- [ ] Initialize monorepo root: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`.
- [ ] Create `apps/web` (Next.js, latest stable major — App Router; do not pin to a specific historical version like "14+", install whatever is current stable at scaffold time) and `apps/api` (NestJS) with a hello-world entry point each, enough to confirm the build pipeline works. **Once installed, the exact resolved version is locked by the lockfile and recorded in the PR description** — "latest stable" selects the version at scaffold time; it must not silently drift if Phase 0 is ever re-run.
- [ ] Create `apps/admin` as a **bare empty workspace package only** — a `package.json` with no real dependencies and no app code, not even a hello-world entry point beyond what's needed to satisfy the workspace graph and pass CI. Refine is explicitly not installed here (Decision #14) — that happens in Phase 3, once `/v1/admin/*` endpoints exist for it to point at.
- [ ] Shared `packages/config`: eslint config, tsconfig base, prettier config — used by all three apps and both packages below.
- [ ] CI pipeline (lint + typecheck + build) wired for all workspaces, even though most are near-empty — catching a broken pipeline now is cheaper than discovering it in Phase 1.
- [ ] `.env.example` at root documenting expected env vars per app (`DATABASE_URL` for api, `DATA_SOURCE` for web, etc.) — values not filled in, just the shape.

## 2. `packages/contracts` skeleton

Single source of truth for DTOs, enums, and zod schemas (Architecture Plan Decision #4) — consumed by `apps/web`, `apps/api`, and (read-only, via generated types) `apps/admin` where useful.

- [ ] Package scaffold: `packages/contracts/package.json`, `tsconfig.json`, `src/index.ts`.
- [ ] Define enums first (cheapest, highest-leverage): `Surface`, `AccessType`, `IndoorOutdoor`, `SkillLevel`, `GroupSize`, `Continent`, `EntitlementKind`, `EntitlementStatus`, `EntitlementSource` — matching Architecture Plan §2.
- [ ] Define core DTO shapes as zod schemas with inferred TS types: `CourtDTO`, `CourtSummaryDTO` (lighter shape for list/map views), `CollectionDTO`, `ArticleDTO`, `ConsultationRequestDTO`. Do **not** define `UserDTO`/`EntitlementDTO` yet in full detail — stub them minimally, since auth/payments are Phase 4; avoid speculative shape-guessing this early.
- [ ] No publishing/versioning infrastructure needed yet — it's consumed via workspace linking (`workspace:*`) until there's an external consumer (mobile uses the OpenAPI spec in Phase 6, not this package directly).

## 3. `packages/mock-data` skeleton

Reusable mock dataset (Architecture Plan Decision #5) — consumed by `apps/web`'s mock repositories in Phase 1, and later by `apps/api`'s seed script in Phase 2, so the two are provably the same data.

- [ ] Package scaffold: `packages/mock-data/package.json`, `src/index.ts`.
- [ ] Port the exact dataset already authored in the HTML prototypes (`/files/*.html`) verbatim:
  - `src/courts.ts` — the 12-court array (Grand Hotel Tremezzo, Hotel Punta Tragara, Royal Mansour, Belmond La Residencia, Como Shambhala Estate, The Little Nell, Cheval Blanc Randheli, Aman Tokyo, Soho Farmhouse, Monte-Carlo Country Club, Six Senses Douro, Hotel du Cap-Eden-Roc) with all fields: name, country, region, surface, setting, access, indoor/outdoor, scenic, locked, featured, hero image, gallery images, blurb — plus `slug` and the coordinate fields described below.
  - `src/collections.ts` — the 6 collections (Coastal, Desert, Hidden Resorts, Historic Clubs, Mountain, Rooftop & Urban) with name/cover image and a `slug`. **Counts are derived from the membership mapping below, not hardcoded** (the prototype's `count:14/22/11…` values are decorative display numbers that exceed the 12-court dataset — do not copy them as ground truth).
  - `src/collection-courts.ts` — a real **`CollectionCourt` membership mapping** (`{ collectionSlug, courtSlug, sortOrder }[]`) so collection→court lists actually render in Phase 1 and seed correctly in Phase 2. Collection counts are computed from this mapping. Without it, Phase 1's collection-detail page has no court list to show.
  - `src/articles.ts` — journal articles (title, subtitle, image, read time, category) as found in `journal.html`, each with a `slug`.
  - `src/users.ts` — a small set of representative mock user profiles (matching `profile.html`'s shape: name, initials, membership status, stats) — used by web's mock user repository in Phase 1, even though the real `User`/`Entitlement` backend doesn't exist until Phase 4.
  - `src/site-stats.ts` — the home hero statistic as **data, not JSX** (capture the prototype's actual string, e.g. `"11 islands · 50 countries · 1000 tennis courts"`, plus headline/CTA copy). Phase 1 §3.2 reads this so the hero is data-driven.
  - `src/paywall-copy.ts` — paywall benefit list + price block ($29 · One-time · Lifetime) as a config export. Phase 1 §3.6 reads this so the paywall is data-driven and Phase 4 can swap the source without touching the component.
- [ ] **Coordinates — two distinct concepts, do not conflate (Architecture Plan §9 Risk: prototype `coords` is fake map geometry).** The HTML prototypes' `coords:[54,44]` field is an **`[x%, y%]` position for the stylized non-interactive map canvas**, NOT a geographic location. Store it as **`mapCoords`** for Phase 1's map background. Separately include the real-geo schema fields **`lat`, `lng`, `approxLat`, `approxLng`** (placeholder values are acceptable in Phase 0 — they only need to exist and be typed correctly). Never reuse `mapCoords` as a court's geographic location: the entire coordinate-masking security boundary (Architecture Plan §9 Risk #2) and the Phase 2 Postgres seed depend on `lat/lng` being real-geo-shaped, not screen percentages.
- [ ] **Slugs (routing keys).** Every court/collection/article must carry a stable `slug` (kebab-cased name, or reuse the prototype's short `id`). This is the Phase 1 routing key (`app/courts/[slug]`, `getBySlug()`) and the Phase 2 seed value — prototype data has only short `id`s and human names, so slugs must be authored here, never improvised inside a page component.
- [ ] Each exported array should be typed against `packages/contracts` DTOs where the shapes already align, to catch mismatches between prototype data and the real schema as early as possible.
- [ ] No transformation/filtering logic lives here — that belongs in the mock repository adapters in Phase 1 (`apps/web/src/domain/mock/*`). This package is data only.

## 4. `apps/api/prisma` schema — DRAFT ONLY, not final (Decision #13)

Per Architecture Plan Decision #3, Prisma is owned exclusively by `apps/api` — not a root-level package. Per Architecture Plan Decision #13, everything in this section produces a **draft** that is explicitly not the production schema. The real, finalized schema and its first authoritative migration are Phase 2 work, done after Phase 1 has validated the actual data shapes pages need. Treat this draft as scaffolding to unblock Phase 1/2 in parallel — not as something to defend or incrementally patch later.

- [ ] `apps/api/prisma/schema.prisma`: rough first pass at the model list from Architecture Plan §3 (`Country`, `Region`, `Court`, `CourtImage`, `Collection`, `CollectionCourt`, `Article`, `User`, `Entitlement`, `SavedCourt`, `UserCollection`, `UserCollectionCourt`, `ConsultationRequest`, `AdminUser`) — good enough to compile and migrate, not necessarily final on every field.
- [ ] **Entitlement: stub minimally in Phase 0, do not build the full Decision #12 shape.** The draft only needs `Entitlement { id, userId, kind, status, source, expiresAt?, metadata }` — enough to compile and migrate. The expanded model (`receiptRef`, `grantedAt`, `revokedAt`, `revokedReason`, `grantedByAdminId`, refund/revocation flows) is **Phase 4 work** and stays documented in Architecture Plan §3 as the eventual target, not built into this disposable draft. Building the full revocation/refund model now is effort spent on a schema you have already committed to throwing away (Decision #13).
- [ ] Indexes from Architecture Plan §3 can be sketched now but aren't load-bearing yet: `Court(countryId)`, `Court(regionId)`, `Court(status, isFeatured)`, `Entitlement(userId, status)`, `ConsultationRequest(status, createdAt)`.
- [ ] No `AnalyticsEvent` model (Decision #10 — removed from MVP scope entirely).
- [ ] Generate and apply a migration against local Postgres, named exactly **`000_draft_do_not_build_on`** (commit to this exact, greppable string — not an "equivalent"), so nobody mistakes it for production-ready. This validates the schema compiles and migrates cleanly — that's the only goal at this stage.
- [ ] Confirm `apps/admin` has **no** dependency on `@prisma/client` and no database connection string in its env — this boundary should be true from day one, not retrofitted later (Architecture Plan §9 Risk #12).
- [ ] **Do not build production features against this schema.** Phase 1 doesn't touch it at all (web is mock-first against `packages/mock-data`); Phase 2 explicitly revisits and finalizes it, expecting to reset the dev database rather than migrate forward from these early guesses (Architecture Plan §9 Risk #13).

## 5. Local dev environment

- [ ] `docker-compose.yml` at root: Postgres service (matching the version targeted for production), volume-mounted for persistence across restarts.
- [ ] Defer Redis/MinIO/S3-compatible storage containers until a feature actually needs them (image upload pipeline in Phase 3) — don't add infrastructure speculatively.

## 6. Decisions to track (human-owned — do NOT let the implementer invent answers)

These are called out in Architecture Plan §9 as risks that get worse the longer they're left open. They are **human business/cost decisions** — Phase 0's implementer should surface them, not resolve them by picking a default.

- [ ] **CDN/image provider** (Risk #9): Cloudflare Images vs. imgix vs. S3+CloudFront. This determines the eventual shape of `CourtImage.url` (raw key vs. resolved CDN URL with transform params). **This is NOT a Phase 0 blocker:** Phase 0/1 treat `CourtImage.url` as an opaque absolute URL string (the prototypes' existing image URLs are fine), so nothing in Phase 0 or Phase 1 depends on the choice. It only needs to be decided by a human **before Phase 2 finalizes the seed `CourtImage.url` shape and before Phase 3 builds the image-upload pipeline.** Do not block Phase 0 closure on it, and do not have the implementer pick a provider to satisfy a checkbox.
- [ ] **Confirm the "no PostGIS" decision for MVP** (Risk #1): country/region-grouped counts are sufficient for the PRD's discrete 4-tier map hierarchy; revisit only if "courts near me" is greenlit. Just confirm this is still the agreed direction before Phase 2 builds the map endpoint around it.

---

## Exit criteria for Phase 0

- All three apps (`web`, `api`, `admin`) build and lint cleanly in CI, even though `admin` contains no real code yet and `web`/`api` contain little.
- `apps/web` is scaffolded on the latest stable Next.js major (App Router) — not a pinned older version.
- `apps/admin` exists only as an empty workspace package — no Refine dependency, no admin UI code.
- `packages/contracts` and `packages/mock-data` are installable via workspace linking from any app.
- `apps/api/prisma` has a schema that compiles and an applied **draft** migration named `000_draft_do_not_build_on` against local Postgres — explicitly labeled as non-final, with Phase 2 owning the real schema finalization.
- `packages/mock-data` carries authored `slug`s, separate `mapCoords` (screen %) vs. real-geo `lat/lng/approxLat/approxLng` fields, a real `CollectionCourt` membership mapping (with derived counts), and `site-stats`/`paywall-copy` config exports — so Phase 1 is fully data-driven and the Phase 2 seed inherits clean data.
- `CourtImage.url` is treated as an opaque absolute URL string; the CDN provider is **not** chosen in Phase 0 (it is a human decision deferred to before Phase 2 seed finalization / Phase 3 upload work — see §6).
