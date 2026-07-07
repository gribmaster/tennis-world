# Implementation Backlog — Tennis World

**Status:** Planning only — no implementation. Companion to `../ARCHITECTURE_PLAN.md`.
**Purpose:** Cross-phase backlog of concrete, trackable work items, plus the standing reference material (event taxonomy, deferred-package triggers) that doesn't belong in code yet but must not be lost.

This backlog is organized by phase to match §8 of the architecture plan. Phase 0 and Phase 1 have their own detailed docs (`PHASE_0_FOUNDATION.md`, `PHASE_1_WEB_MOCK_FIRST.md`) — this file lists them at summary level and carries the full detail for Phases 2–7.

---

## Phase 0 — Foundations

See `docs/PHASE_0_FOUNDATION.md` for full detail. **Phase 0 builds skeletons only — stub or omit anything only needed by Phase 2+; resist completeness.** Summary:
- Monorepo scaffold: `apps/web` (Next.js, latest stable major), `apps/api` (NestJS), `apps/admin` (**empty workspace placeholder only — no Refine yet, Decision #14**); Turborepo + pnpm, `packages/config` (shared eslint/tsconfig/prettier), CI, lint/format.
- `packages/contracts` skeleton (enums + core DTOs; `UserDTO`/`EntitlementDTO` stubbed minimally).
- `packages/mock-data` skeleton, seeded from HTML prototype data — with authored `slug`s, separate `mapCoords` (screen %) vs. real-geo `lat/lng/approxLat/approxLng`, a real `CollectionCourt` membership mapping (derived counts), and `site-stats`/`paywall-copy` config exports.
- `apps/api/prisma/schema.prisma` **draft** schema (Decision #13), migration named `000_draft_do_not_build_on`, + docker-compose Postgres — explicitly disposable, not production-final. **Entitlement stubbed minimally** (full Decision #12 shape is Phase 4).
- CDN/image provider is a **human decision, not a Phase 0 blocker** (Architecture Plan §9 Risk #9): `CourtImage.url` is an opaque URL string in Phase 0/1; the provider must be chosen before Phase 2 seed finalization / Phase 3 upload work — do not have the implementer pick one.

---

## Phase 1 — Web app, mock-first and data-driven

See `docs/PHASE_1_WEB_MOCK_FIRST.md` for full detail. Summary:
- `apps/web/src/domain/interfaces/*` repository interfaces.
- `apps/web/src/domain/mock/*` implementations reading from `packages/mock-data`.
- All pages/components built data-driven against those interfaces — no hardcoded content in JSX.
- Includes `app/courts/[slug]/page.tsx` (Court Detail) as a required screen, built from the shared design language since no dedicated prototype exists (Decision #15).
- No auth, no payments, no live API calls.
- No business logic under `apps/web/app/api` — that directory should not exist in this phase at all (Decision #16).

---

## Phase 2 — NestJS API + real data

- [ ] **Finalize the Prisma schema** (Decision #13) — revisit and, where needed, replace the Phase 0 draft now that Phase 1 has validated real data shapes. Reset the dev database and regenerate a clean initial migration rather than patching forward from the draft; the draft was explicitly disposable scaffolding, not a baseline to preserve.
- [ ] Migration: the real, finalized initial schema (supersedes the Phase 0 draft migration entirely).
- [ ] Seed script: reads from `packages/mock-data`, writes into Postgres — must produce data provably identical to what Phase 1's mock repositories return (write a diff test if feasible).
- [ ] Implement public/discovery endpoints (Architecture Plan §4): `/v1/courts`, `/v1/courts/:slug`, `/v1/courts/map`, `/v1/countries`, `/v1/regions`, `/v1/collections`, `/v1/collections/:slug`, `/v1/articles`, `/v1/articles/:slug`.
- [ ] Implement `/v1/consultations` (POST + admin-only GET/PATCH) — anonymous submission must be allowed (no auth dependency yet).
- [ ] Coordinate masking logic: every court-returning endpoint must omit exact `lat/lng` and return only `approxLat/approxLng` (no entitlement system exists yet in Phase 2, so at this stage **all** requests are treated as non-entitled — exact coordinates are not exposed by any endpoint until Phase 4 wires entitlement checks in).
- [ ] Country/region-grouped map clustering (no PostGIS) — see Architecture Plan §9 Risk #1.
- [ ] OpenAPI/Swagger setup (`@nestjs/swagger`) — start publishing the spec now even though mobile handoff is Phase 6; catching contract drift early is cheaper than discovering it at handoff.
- [ ] Build `apps/web/src/domain/http/*` implementations against the live endpoints, typed via `packages/contracts`.
- [ ] Flip `DATA_SOURCE=api` in a staging deploy of `apps/web`; run full page test suite against both `mock` and `api` modes; verify zero UI changes were needed (the mock-first proof point).
- [ ] CI: add the dual-mode test run (mock + api) as a permanent pipeline step, not a one-time verification.

## Phase 3 — Admin panel

- [ ] **Install Refine into `apps/admin` for the first time** (Decision #14) — the Phase 0 placeholder workspace becomes a real app here, not before. `dataProvider` pointed directly at `/v1/admin/*` (no abstraction layer — Architecture Plan Decision #9).
- [ ] Resources: courts (list/create/edit/show + image manager), collections (+ court-assignment drag-sort), articles (rich text editor), consultations (ops queue + detail/status update), users (read-mostly).
- [ ] `status` (draft/published) field workflow on Court/Collection/Article — wired into list filters and a minimal preview link (Architecture Plan §9 Risk #10).
- [ ] Image upload pipeline: presigned URL endpoint + `ImageUploader` component, against the CDN provider decided in Phase 0.
- [ ] `CourtMapPicker` component: sets both exact `lat/lng` and computes/allows override of `approxLat/approxLng`.
- [ ] Verify (code review gate): `apps/admin` has no `@prisma/client` dependency and no direct DB connection string (Architecture Plan §9 Risk #12).

## Phase 4 — Auth, payments, and entitlements

- [ ] Auth: magic-link request/verify, Apple Sign-In, Google Sign-In, JWT issuance (access + refresh), `/v1/auth/*`.
- [ ] Account-deferral logic: anonymous save/consultation flows can later be "claimed" by a newly created account.
- [ ] `EntitlementService`: single internal service computing "effective entitlement" (`status = active` AND (`expiresAt IS NULL` OR `expiresAt > now()`)) — used everywhere entitlement is checked, never duplicated inline.
- [ ] Stripe one-time checkout (web) + Stripe webhook (checkout completion, refund/chargeback → revoke).
- [ ] RevenueCat/StoreKit/Play Billing receipt validation endpoint (mobile-facing, but build/test now since mobile doesn't exist yet — use Postman/manual receipts for testing).
- [ ] Promo-code redemption endpoint (`promo_unlock` kind) — needs a promo code definition/management surface (could start as an admin-only manually-inserted table row; doesn't need its own UI in Phase 4).
- [ ] Admin manual-grant and revoke flows (`manual_grant` kind) in `apps/admin` — `grant.tsx` and `revoke.tsx` resources, revoke requires a `revokedReason`.
- [ ] Wire entitlement gating into `GET /v1/courts/:slug`: exact `lat/lng` included only when `EntitlementService` resolves the requesting user as currently entitled.
- [ ] Swap `apps/web/src/domain/mock/user.repository.ts` → `domain/http/user.repository.ts`. This is the second mock-first proof point (saved state, membership, unlock status) — repeat the dual-mode verification done in Phase 2.
- [ ] `DELETE /v1/me/account` — App Store account-deletion requirement.

## Phase 5 — Consultation + CRM integration

- [ ] CRM webhook integration (HubSpot or Pipedrive free tier) — fires on `ConsultationRequest` creation.
- [ ] Auto-responder email (24-hour SLA messaging per PRD §13).
- [ ] Admin ops queue refinements: status transitions, notes field, assignment (if a human ops team needs routing).

## Phase 6 — Mobile contract freeze + handoff

- [ ] Finalize and publish the OpenAPI spec as a versioned artifact.
- [ ] Write a standalone integration document for the Flutter team covering Architecture Plan §7 (all 10 mobile handoff requirements) — this should be readable without access to this monorepo.
- [ ] Confirm coordinate masking, entitlement reconciliation, and auth token scheme all work identically when exercised by a non-web client (manual curl/Postman pass against every endpoint mobile will use).
- [ ] Establish API versioning policy doc: what counts as a breaking change, how `/v2` would be introduced.

## Phase 7 — Launch hardening

- [ ] Performance pass: confirm `Court(countryId)`, `Court(regionId)`, `Court(status, isFeatured)`, `Entitlement(userId, status)` indexes are in place and used (EXPLAIN ANALYZE on hot queries).
- [ ] Image CDN caching headers, response caching for public discovery endpoints.
- [ ] Wire Amplitude/Mixpanel SDKs into `apps/web` (client-side) per the event taxonomy below — no backend changes required (Decision #10).
- [ ] GDPR/consent flow (EU users), Apple ATT prompt copy review (mobile, but coordinate timing with backend privacy policy content served via Article/CMS).
- [ ] Account deletion flow end-to-end test (web + verify mobile parity once mobile exists).
- [ ] Monitoring/alerting on the API (error rates, entitlement-check latency, webhook failure alerting for Stripe/RevenueCat).

---

## Standing Reference: Analytics Event Taxonomy (documentation only — no backend storage)

Per Architecture Plan Decision #10, there is no `AnalyticsEvent` table and no `/v1/events` endpoint in MVP scope. This taxonomy — carried over from PRD §11.1 — exists purely so that whichever client (web now, mobile later) emits events to Amplitude/Mixpanel, the event names and properties stay consistent. Treat this table as the contract; update it here if the taxonomy changes, not in code comments scattered across clients.

| Event | Properties | Emitted by |
|---|---|---|
| `app_open` | `source`, `is_first_session` | web (Phase 7), mobile (its own track) |
| `onboarding_complete` | `seconds_to_complete` | mobile only (web has no onboarding flow per current prototypes) |
| `home_cta_explore_map` | — | web, mobile |
| `map_pin_tap` | `court_id`, `pin_state` (open/locked/featured) | web, mobile |
| `court_view` | `court_id`, `source` (home/map/search/related) | web, mobile |
| `court_save` | `court_id` | web, mobile |
| `paywall_view` | `source` (court/map/profile) | web, mobile |
| `paywall_cta_tap` | — | web, mobile |
| `purchase_complete` | `price`, `currency` | web, mobile |
| `purchase_failed` | `error_code` | web, mobile |
| `consultation_submit` | `source`, `destination` | web, mobile |
| `search_query` | `query`, `results_count` | web, mobile |

**Funnels to monitor** (same across platforms, per PRD §11.2):
- Install/visit → Map open → Court view → Save
- Court view → Paywall view → Purchase complete (conversion rate)
- Court view → Consultation submit (lead rate)

**If this ever needs to become a real contract** (e.g. a compliance reason emerges to own event storage server-side), promote it to `packages/contracts` as a typed event schema and reintroduce `/v1/events` deliberately — don't let it sneak back in as an ad-hoc addition to an unrelated endpoint.

---

## Standing Reference: Triggers for Promoting Deferred Packages

Per Architecture Plan §9 Risks #4 and #11, `packages/ui` and `packages/repositories` are deliberately not created yet. Revisit only when:

- **`packages/repositories`**: a second application (not just `apps/web`) needs the *exact same* repository interfaces (`CourtRepository`, `CollectionRepository`, etc.) against the *exact same* contracts. A new web-adjacent client (e.g. a marketing microsite) reusing court/collection lookups would qualify. `apps/admin` does **not** qualify — it talks to the API directly (Decision #9) and has no mock-first requirement.
- **`packages/ui`**: `apps/admin` (or any future client) needs to render the *same* components as `apps/web` — not just visually similar ones. A shared `CourtCard` used identically in both web and admin would qualify; admin's own table/form components (which are Refine-idiomatic, not marketing-idiomatic) do not.

When either trigger fires, the migration is mechanical (move files, update imports, add a `package.json`) precisely because the interfaces were already cleanly isolated inside `apps/web/src/domain/*` — this is the payoff of Decision #7's "local first" approach.

---

## Standing Reference: Decisions #13–#16 (final pre-implementation clarifications)

These four decisions were added after the initial architecture review, specifically to prevent premature commitment before implementation starts. Restated here as a single checklist since they cut across Phases 0, 1, 2, and 3:

- **Decision #13 — Prisma draft vs. final.** Phase 0's `apps/api/prisma/schema.prisma` and its first migration are scaffolding only. Do not build Phase 2+ features against assumptions baked into that draft; expect Phase 2 to reset and regenerate it. If you find yourself "preserving" the Phase 0 migration history into Phase 2, that's a sign this decision is being violated.
- **Decision #14 — `apps/admin` is empty until Phase 3.** No Refine dependency, no admin UI, no `dataProvider` code should exist before Phase 3. If admin-shaped work seems necessary earlier (e.g. "we need a quick way to edit court data before the real admin exists"), prefer a temporary Prisma Studio session or direct SQL against the dev database over building informal admin tooling — don't let Phase 3 leak backward.
- **Decision #15 — Court Detail has no prototype but is required.** Do not skip or stub this screen in Phase 1 waiting for a prototype that isn't coming. Use the three-source derivation method documented in `PHASE_1_WEB_MOCK_FIRST.md` §3.4 (map.html's inline detail component + shared design tokens + PRD §6.4) and get the resulting layout note reviewed before implementation.
- **Decision #16 — No business logic in `apps/web/app/api`.** This is a hard boundary, not a default-but-overridable preference. The only acceptable exception is framework-mandated plumbing (e.g. an OAuth callback that must land on the web origin) — and even then, that route should immediately delegate to `apps/api` rather than implement logic. If unsure whether something qualifies as "framework-mandated," it almost certainly doesn't — ask before adding the route.
