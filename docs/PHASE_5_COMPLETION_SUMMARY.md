# Phase 5 — Completion Summary & Handoff

**Status:** ✅ **Phase 5 complete (Features 60–69).** Payments, entitlements, and per-user
exact-coordinate unlock are built on the Phase-4 auth identity. An authenticated user can start a
real hosted **Stripe Checkout**; a signature-verified **webhook** fulfils/revokes an `Entitlement`;
membership on `/v1/me` is **derived** from those rows through **one** effective-entitlement service;
and exact `Court.lat`/`lng` are reachable **only** through the protected, entitlement-gated
`GET /v1/me/courts/:slug/exact-location`. The public `/v1/courts*` surface is **byte-unchanged** and
carries **no** exact coordinates (parity **35/35**). No UI screen was redesigned — the Phase-1 inert
paywall / directions / restore / portal CTAs were wired to real behavior behind stable seams.
**Date:** 2026-07-04.
**Audience:** whoever hardens billing (Redis limiter, real email/CRM), builds the Phase-3 admin
grant/revoke surface, or adds mobile IAP. Read this first; it records the _as-built_ Phase-5 state,
the deliberate deferrals, and the known caveats.
**Companions:** `FEATURE_60_PHASE_5_PAYMENTS_ENTITLEMENTS_INTAKE.md` (the intake/plan + the per-feature
implementation notes §15–§19), `PHASE_4_COMPLETION_SUMMARY.md` (auth + `/v1/me/*`),
`PHASE_2_COMPLETION_SUMMARY.md` (coordinate masking + seed), `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the
living inert-control inventory, now reflecting Features 64/67), `IMPLEMENTATION_BACKLOG.md`,
`../ARCHITECTURE_PLAN.md` (Decisions #11/#12/#16/#17).

---

## 1. Executive summary

Phase 5 turned the entitlement *stub* into a working payments-and-unlock loop while preserving every
Phase-2/4 invariant:

- **Entitlement is computed in exactly one place.** `EntitlementsService.getEffectiveEntitlement()`
  is the single source of truth for "is this user premium?"; every consumer (`/v1/me`, the exact-location
  gate, the auth `verify` response) reads it. No scattered `status === 'active'` checks exist.
- **`/v1/me` membership is real.** The hardcoded `membership: 'free'` is gone; the mapper is fed the
  derived value. A user with no entitlement rows (everyone by default) still reads `'free'`, so the
  response is byte-identical for them.
- **Coordinate masking held.** The public selects still cannot fetch `lat`/`lng`; a new **private**
  `courtExactLocationSelect` feeds the one protected, entitled endpoint. The parity harness's
  no-`lat`/`lng`-at-any-depth assertion still passes.
- **Stripe, server-side only.** Checkout + portal endpoints, a raw-body signature-verified webhook
  that fulfils/revokes entitlements idempotently, and a web wiring that sends only a plan **key** and
  navigates to an opaque hosted URL. **No Stripe.js, no publishable key, no price id, no secret ever
  reaches the browser.**
- **CI stays Stripe-free.** The deterministic gating/effective/exact-location/rate-limit checks run
  with **seeded** entitlements (no Stripe); the real-Stripe smoke is a **separate, secret-gated** lane
  that is a green no-op without secrets.
- **Rate limiting.** A lightweight in-memory per-user limiter fronts only checkout/portal.

Net product-code footprint: three new API modules (`entitlements`, `billing`, `webhooks`), one new
`me` endpoint (exact-location), the `me`/`auth` membership derivation, one Prisma migration (Feature
61 groundwork — provider-correlation columns + `User.stripeCustomerId` + `ProcessedWebhookEvent`), the
new contract DTOs, and the web billing seam + court-detail unlock wiring. No screen was redesigned.

---

## 2. Feature table (60–69)

| Feature | Delivered |
| --- | --- |
| **60** | Phase-5 intake / planning (docs only). Audited the entitlement/payment/coordinate state, designed the entitlement model, effective-entitlement service, coordinate-gating boundary, Stripe architecture, contracts/web plan, and the feature breakdown. |
| **61** | Schema + contracts groundwork. `Entitlement` gained `startsAt` / provider-correlation columns (`providerCustomerId`/`providerSubscriptionId`/`providerPurchaseId @unique`) / `revokedAt` / `revokedReason` / `grantedByAdminId`; `User.stripeCustomerId @unique`; new `ProcessedWebhookEvent` table; one back-safe migration; new billing/exact-location DTOs. **No runtime, no Stripe.** |
| **62** | `EntitlementsService` (the effective rule, §5) + real `/v1/me` + auth-`verify` membership derivation. `toUserProfileDTO` grows a `membership` param. **No Stripe, no endpoints beyond the derivation.** |
| **63** | Protected `GET /v1/me/courts/:slug/exact-location` — first `isEntitled()` consumer; private `courtExactLocationSelect`; 401/403/404/200 separation; server-built `directionsUrl`. |
| **64** | Web reads the unlock. `CourtRepository.getExactLocation()` (mock → null; http → the protected read, degrading 401/403/404 → null); court-detail `locked` derived from the real endpoint; "Get Directions" href = `directionsUrl` for entitled viewers. **No Stripe.** |
| **65** | Stripe **checkout + portal** endpoints (`POST /v1/billing/checkout`, `/portal`); lazy Stripe-customer create/reuse on `User.stripeCustomerId`; server-side plan registry; Stripe dep added (server-only). **No webhook, no grant.** |
| **66** | Stripe **webhook** (`POST /v1/webhooks/stripe`) — raw-body + signature verify; fulfils/revokes `Entitlement`; idempotent (`ProcessedWebhookEvent` + `providerPurchaseId @unique`); handles checkout/invoice/subscription.deleted/refund/dispute. |
| **67** | Web checkout/return/portal wiring. `BillingRepository` seam (mock throws `BillingNotAvailableError`; http → the endpoints); paywall checkout button, profile/footer portal buttons, `/billing/return` race-aware page. **No Stripe.js.** |
| **68** | Optional Stripe test-mode **E2E smoke** (`verify:stripe-e2e`, hybrid: real Stripe checkout/portal/customer + signed synthetic webhook) + a **separate secret-gated CI lane**. Required CI stays Stripe-free. |
| **69** | Lightweight **billing rate limiting** — in-memory per-user limiter on checkout (5/10min) + portal (10/10min) only; 429 + `Retry-After`; no new dependency. |
| **70** | **(this doc)** Phase-5 completion summary + final no-code audit + doc-pointer refresh. |

---

## 3. Final architecture

```
apps/api/src/
  entitlements/                # Feature 62 — the ONE effective-entitlement source
    entitlements.service.ts    #   getEffectiveEntitlement(userId) / isEntitled(userId)  [READ-ONLY]
    entitlements.types.ts      #   EffectiveEntitlement (server-internal; NOT a wire DTO)
    entitlements.module.ts     #   exports the service; no controller (no /v1/entitlements/*)
  me/
    exact-location.controller  # Feature 63 — GET /v1/me/courts/:slug/exact-location (AuthGuard)
    exact-location.service     #   existence(404) → isEntitled(403) → 200 ExactLocationDTO
    me.service.ts              # Feature 62 — GET/PATCH /v1/me derive membership via the service
  billing/                     # Feature 65 — the authed billing surface (AuthGuard)
    billing.controller.ts      #   POST /v1/billing/checkout, /portal  (+ BillingRateLimitGuard per method)
    billing.service.ts         #   Stripe Checkout/Portal; lazy customer create/reuse; safe error mapping
    billing.types.ts           #   server-side plan registry (plan key → price id + mode)
    billing.config.ts          #   one typed read of Stripe env (server-only) + rate-limit knobs
    billing-rate-limit.*       # Feature 69 — in-memory per-user limiter service + guard
  webhooks/                    # Feature 66 — PUBLIC, signature-verified
    stripe-webhook.controller  #   POST /v1/webhooks/stripe (reads req.rawBody; @HttpCode(200))
    stripe-webhook.service.ts  #   verify → idempotent tx → fulfil/revoke  [ALL writes centralized here]
  courts/courts.mapper.ts      # public selects (no lat/lng) + PRIVATE courtExactLocationSelect
  main.ts                      # NestFactory.create(AppModule, { rawBody: true })

apps/web/src/
  domain/billing/              # BillingRepository interface + MockBillingRepository (throws)
  domain/http/http-billing.repository.ts   # POST /v1/billing/checkout, /portal (auth transport)
  domain/http/http-court.repository.ts      # getExactLocation() — the one protected court read
  features/billing/            # PaywallCheckoutButton, ManageBillingButton, BillingReturn, use-billing-action
  app/billing/return/page.tsx  # post-checkout landing (server shell + client island)

packages/contracts/src/billing.ts   # billing/entitlement wire DTOs (no provider ids)
packages/contracts/src/court.ts     # ExactLocationDTO (the only coord-bearing DTO)
```

**Module graph (no cycles):** `Auth → Entitlements → Prisma`; `Me → Entitlements → Prisma`;
`Billing → Prisma` (+ `AuthModule` for the guard); `Webhooks → Prisma` (+ `BILLING_CONFIG`).
`EntitlementsService` is **read-only**; the webhook service is the **only** writer of `Entitlement`
rows.

---

## 4. Entitlement model and lifecycle

The `Entitlement` row (Feature 61 groundwork over the pre-existing model):

| Field | Role |
| --- | --- |
| `kind` | `lifetime_unlock` / `subscription` / `promo_unlock` / `manual_grant` |
| `status` | `active` / `revoked` / `refunded` / `expired` — only `active` can be effective |
| `source` | `stripe_web` / `iap_ios` / `iap_android` / `promo_code` / `admin` |
| `startsAt` | when access begins (`@default(now())`); part of the effective window |
| `expiresAt` | period end for subscriptions; `null` = lifetime/forever |
| `providerCustomerId` | Stripe `cus_…` (indexed) — server-only, never in a DTO |
| `providerSubscriptionId` | Stripe `sub_…` (indexed) — subscription renewals key off this |
| `providerPurchaseId` **@unique** | PaymentIntent/session id (or IAP txn) — the idempotency anchor |
| `revokedAt` / `revokedReason` | audit trail on refund/chargeback/lapse (`refund`/`chargeback`/`subscription_deleted`) |
| `grantedByAdminId` | soft ref for future admin grants (schema-ready; surface is Phase 3) |

`User.stripeCustomerId @unique` is the one Stripe-customer anchor (lazy-created on first
checkout/portal). `ProcessedWebhookEvent(id = evt_…, provider, type, processedAt)` is the webhook
idempotency ledger.

**Lifecycle:** lifetime purchase → `active`, `expiresAt=null`, effective forever unless revoked.
Subscription → `active`, `expiresAt = period end`; `invoice.paid` pushes it forward and re-activates;
`customer.subscription.deleted` flips it to `expired` (`revokedReason='subscription_deleted'`).
Refund → `refunded` (reason `refund`); dispute → `revoked` (reason `chargeback`). Rows are **never
deleted** on revoke — the audit stays truthful. Expiry needs **no write**: `expiresAt < now` makes a
row non-effective on read.

---

## 5. Effective entitlement rule (exactly one definition)

`EntitlementsService.getEffectiveEntitlement(userId)` (`apps/api/src/entitlements/entitlements.service.ts`):

1. **One indexed read** — `entitlement.findMany({ where: { userId, status: 'active' } })`, selecting
   only `id/kind/source/startsAt/expiresAt` (**never** the provider/audit columns → the result
   structurally cannot carry a `cus_`/`sub_`/`pi_`).
2. **Effective window (in code, single `now`):**
   `status === 'active'  AND  startsAt <= now  AND  (expiresAt === null OR expiresAt > now)`.
3. **Entitled iff any row is effective.** When several are effective, pick the strongest
   **deterministically**: a non-expiring row beats an expiring one → among expiring the **latest**
   `expiresAt` wins → final tie-break on `id` (never depends on DB row order).
4. **`membership`** = `'lifetime'` when entitled, else `'free'` (the contract enum has only those two;
   a `subscription` still surfaces as `'lifetime'` for the badge — a `'subscriber'` member is a
   deferred contract change, §14).

`isEntitled(userId)` is the thin boolean wrapper the exact-location gate reads. Computing on read is
correct-by-construction (time-dependent, multi-row) — never a denormalized `User.isPremium` that would
drift when a subscription lapses without a write.

---

## 6. Coordinate masking and exact-location gating

**Masking is structural and unchanged.** The public Prisma selects (`courtSummarySelect`,
`courtDetailSelect`, `mapPinSelect` in `courts.mapper.ts`) **omit** `Court.lat`/`lng`, so the row
payload types have no such field and the mappers are incapable of attaching them ("can't leak what you
didn't fetch"). `toCourtDTO` still leaves exact coords undefined — `/v1/courts/:slug` does **not**
carry them. `approxLat`/`approxLng` (~10km jitter) and `mapCoords` (decorative screen %, not geo) stay
public.

**The one exact path.** A **private** `courtExactLocationSelect` (`id/slug/status/lat/lng`) is used
**exclusively** by `ExactLocationService`. It deliberately does **not** spread the public selects, so
the public surface can never inherit coords. `GET /v1/me/courts/:slug/exact-location`
(class-level `@UseGuards(AuthGuard)`):

| Situation | Status |
| --- | --- |
| No/invalid/expired session | **401** (AuthGuard, before handler) |
| Unknown/unpublished slug | **404** (existence checked **first**) |
| Real court, not entitled | **403** |
| Entitled + published court | **200** `ExactLocationDTO` `{ courtId, slug, lat, lng, directionsUrl }` |

`directionsUrl` is built server-side (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`)
so the client never re-derives geo. The **web** court-detail page calls `getExactLocation` only when
`court.isLocked`; every "not unlocked" outcome (401/403/404) collapses to `null` → `locked`, so a
public court page never crashes; a real 5xx propagates (a fault must not masquerade as "locked").

---

## 7. Billing checkout / portal flow

`POST /v1/billing/checkout` `{ plan }` and `POST /v1/billing/portal` (no body), both
`AuthGuard`-protected, both returning **only** a hosted redirect `{ url }` (no session id, no
`cus_`/`sub_`/`pi_`/`cs_`, no secret):

- **Plan registry (server-side)** — the client sends only a plan **key** (`'lifetime'` /
  `'subscription'`); the server maps it to a Stripe price id + mode. A `subscription` request with no
  configured price → clean **400**; the client can never send a price id.
- **Customer create/reuse** — one Stripe Customer per user, lazily created on first checkout/portal
  and persisted to `User.stripeCustomerId @unique`, reused thereafter; a concurrent double-create is
  reconciled via the P2002 unique violation (re-read + reuse). Portal creates the customer lazily if
  missing (so a signed-in user can open it pre-purchase) and always resolves the customer from the
  session — **own customer only**, never a client-supplied id.
- **`client_reference_id = userId`** + `metadata { userId, plan }` are stamped for the webhook.
- **Error mapping (no Stripe leak)** — unauth → 401; unknown/disabled plan → 400; server misconfig
  (missing secret/lifetime price) → 500 ("Billing is not configured"); Stripe API failure → 502;
  session-without-url → 502. Raw Stripe messages are logged, never returned. Missing config **does not
  crash boot** — the Stripe client is a lazy singleton.

---

## 8. Stripe webhook flow and idempotency

`POST /v1/webhooks/stripe` — **public** (no `AuthGuard`; the `Stripe-Signature` HMAC is the auth),
`@HttpCode(200)`, in its own `webhooks` module so the unguarded boundary is unmistakable.

- **Raw body** — `NestFactory.create(AppModule, { rawBody: true })` in `main.ts` attaches a
  raw-capturing `verify` to the **same** express json parser; `req.body` stays parsed for every other
  route and the global `ValidationPipe` is unaffected. The controller reads `req.rawBody`.
- **Signature verify first** — `constructEvent(rawBody, sig, secret)`. Missing/empty body → 400;
  missing signature → 400; bad/tampered → 400 — **all before any DB work**. Missing config → safe 500
  at request time (never a boot crash).
- **Idempotency (two anchors)** — in one `prisma.$transaction`,
  `ProcessedWebhookEvent.create({ id: event.id })` runs **first**; a re-delivery hits the PK (P2002) →
  **200 no-op**. Second anchor: fulfillment **upserts on `Entitlement.providerPurchaseId @unique`**, so
  even a distinct event for the same purchase yields one row. A real internal error rolls the tx back
  and 500s so Stripe retries safely.
- **Events → lifecycle:** `checkout.session.completed` → grant lifetime (anchor = PaymentIntent) or
  subscription (anchor = subscription id, `expiresAt` = period end); `invoice.paid` /
  `invoice.payment_succeeded` → renew (push `expiresAt`, re-activate); `customer.subscription.updated`
  (Feature 71) → sync: live status (`active`/`trialing`) keeps the entitlement `active` and refreshes
  `expiresAt` to `current_period_end` (this is also the `cancel_at_period_end=true` path — Stripe keeps
  `status='active'` until the period ends, so the existing `expiresAt > now` window in
  `EntitlementsService` already drops access at the right moment with no early revoke; `cancelAtPeriodEnd`
  is recorded in `metadata` for display, no schema change); lapsed status (`canceled`/`unpaid`/
  `incomplete_expired`) → `expired`, same as `.deleted`; other transitional statuses (`past_due`/
  `incomplete`/`paused`) refresh `expiresAt`/metadata only, status untouched.
  `customer.subscription.deleted` → `expired`; `charge.refunded` → `refunded`; `charge.dispute.created`
  → `revoked`. Any other event → recorded 200 no-op. Well-formed-but-unresolvable events are logged +
  no-op'd, not 500'd.
- **Write centralization** — all row writes live in `StripeWebhookService`; `EntitlementsService`
  stays read-only. Provider ids are written **only** to server-only `Entitlement` columns + a minimal
  secret-free `metadata` blob (`{ stripeObjectId, eventType, ...extra }`), never selected into any DTO.

---

## 9. Web UX flow

All additive behind stable seams — no screen redesigned (Phase-1 CTA audit refreshed):

- **Paywall checkout** — `PaywallCheckoutButton` (was `<button disabled>`) starts a `'lifetime'`
  checkout via `billing.createCheckout('lifetime')` and does a full `window.location.assign(url)` to
  the hosted page.
- **Portal / restore** — the profile "Subscription & Purchases" row and the footer "Restore" link
  (both were `href="#"`) open the Customer Portal via `billing.createPortalSession()` through
  `ManageBillingButton`.
- **Exact directions** — for an **entitled** viewer the court-detail "Get Directions" href is the
  server-built `directionsUrl`; otherwise it stays the paywall/placeholder path. `locked` is derived
  from the real exact-location endpoint (not `UserProfileDTO.membership`), so the page adds no extra
  `/v1/me` call.
- **Auth transport** — browser islands pass `auth: 'include'` (the httpOnly session cookie); a 401 →
  `AuthRequiredError` → redirect to `/signin?redirectTo=<current path>`; any other failure → a calm
  inline error, no navigation.
- **Return page** (`/billing/return`) — re-reads `/v1/me` and **tolerates the webhook-vs-redirect
  race** with a bounded poll (6 × 2s): success the instant membership is `lifetime`, otherwise a calm
  "payment is processing" state; `?status=cancelled` → neutral cancelled message; `/v1/me` 401 →
  sign-in prompt. Adopt by pointing `STRIPE_SUCCESS_URL` at `${WEB_APP_URL}/billing/return` (the API
  default `/profile?checkout=success|cancelled` also works — the profile page renders a small banner).
- **Mock mode** — `MockBillingRepository` throws `BillingNotAvailableError` (no fabricated redirect);
  `getExactLocation` returns `null`. Buttons render; clicking is a no-op-with-message.

**No Stripe.js / publishable key / price id / `NEXT_PUBLIC_STRIPE*` in the web bundle** — asserted
statically by `verify:web-billing`.

---

## 10. Rate limiting

A lightweight, **in-memory, per-user** fixed-window limiter (`BillingRateLimitService` +
`BillingRateLimitGuard`, Feature 69) fronts **only** the two billing routes:

| Action | Route | Default | Env override |
| --- | --- | --- | --- |
| checkout | `POST /v1/billing/checkout` | 5 / 10 min | `BILLING_CHECKOUT_RATE_LIMIT_MAX` |
| portal | `POST /v1/billing/portal` | 10 / 10 min | `BILLING_PORTAL_RATE_LIMIT_MAX` |
| window | — | 600 s | `BILLING_RATE_LIMIT_WINDOW_SECONDS` |

The guard is applied **per method** as `@UseGuards(AuthGuard, BillingRateLimitGuard)` so **AuthGuard
runs first** (a 401 is never masked by a 429, and a real `userId` is always present); it keys on
`userId + action` (independent budgets, one user can't exhaust another's), fails **closed** (401) if
`req.auth` is somehow absent, and on over-budget sets `Retry-After` and throws **429** with a safe
message. No `@nestjs/throttler`, no Redis, no global guard — the webhook and every public/auth route
are untouched. **MVP limitation:** counters are per-instance; a shared store (Redis) is the
multi-instance production path (the `hit()` interface is shaped for a drop-in).

---

## 11. Verification matrix

All harnesses are `tsx` scripts. Legend: **[always-on]** deterministic, no Stripe, CI-safe;
**[Stripe-opt]** skips cleanly (exit 0) without Stripe env; **[synthetic]** signs synthetic events (no
live Stripe API); **[real+synthetic]** real Stripe test-mode objects + a signed synthetic webhook.

| Harness | Command | Kind | Result (this audit) |
| --- | --- | --- | --- |
| Public mock/API parity | `pnpm verify:api-parity` | always-on | ✅ **35/35** |
| Effective entitlement | `pnpm --filter @tennis/api verify:effective-entitlement` | always-on (seeds rows directly) | ✅ **111/111** |
| Exact-location gating | `pnpm --filter @tennis/api verify:exact-location` | always-on (seeds rows) | ✅ **18/18** |
| Web exact-location | `pnpm --filter @tennis/web verify:web-exact-location` | always-on (token-gated) | ✅ **14/14**, 0 skipped |
| Billing rate limit | `pnpm --filter @tennis/api verify:billing-rate-limit` | always-on (Stripe-independent) | ✅ **11/11** |
| Web billing seam | `pnpm --filter @tennis/web verify:web-billing` | always-on (token-gated + 1 real-Stripe optional) | ✅ **9/9** (1 real-Stripe URL check skipped) |
| Auth (user/saved + persisted) | `pnpm verify:api-auth` | always-on (mints its own token) | ✅ **17/17** + **21/21** |
| Billing checkout/portal | `pnpm --filter @tennis/api verify:billing-checkout` | Stripe-opt | ⏭ **skipped, exit 0** (no Stripe env) |
| Stripe webhook | `pnpm --filter @tennis/api verify:stripe-webhook` | Stripe-opt, **synthetic** signature | ⏭ **skipped, exit 0** (no Stripe env) |
| Stripe E2E smoke | `pnpm verify:stripe-e2e` | Stripe-opt, **real+synthetic** | ⏭ **skipped, exit 0** (no Stripe env) |
| Lint / typecheck / build | `pnpm lint` · `pnpm typecheck` · `pnpm build` | always-on | ✅ 7/7 typecheck, 5/5 build, lint clean |

**Notes on the Stripe checks.** `verify:billing-checkout` needs `STRIPE_SECRET_KEY` +
`STRIPE_PRICE_LIFETIME` (real test-mode create/reuse/plan/portal, no grant).
`verify:stripe-webhook` signs **synthetic** events with
`stripe.webhooks.generateTestHeaderString` (the exact HMAC `constructEvent` verifies) and POSTs them
to the real endpoint — a **signature-path + fulfillment** test, **not** a live Stripe API delivery.
`verify:stripe-e2e` is the hybrid full-loop smoke: **real** Stripe test-mode checkout/portal/customer
objects + a **signed synthetic** `checkout.session.completed` / `charge.refunded` carrying the real
ids (Stripe test mode never delivers `checkout.session.completed` unattended). For a truly live event
delivery, use the Stripe CLI (`stripe listen` + `stripe trigger`).

**Known Windows flake (still relevant):** the two `verify:api-auth` scripts print all PASS lines and
the summary, then a benign Node-on-Windows libuv teardown assertion (`UV_HANDLE_CLOSING`) may fire on
process exit — an environment quirk, **not** a test failure. Run them individually (not chained with
`&&`) for a clean exit. In this audit they exited 0 cleanly when run singly.

---

## 12. CI behavior

`.github/workflows/ci.yml` has **three** jobs; the required gate is **Stripe-free**:

- **`verify`** (required) — install → `prisma:generate` → `lint` → `typecheck` → `build`. No Stripe,
  no Postgres.
- **`parity`** (required) — Postgres 16 service → `migrate deploy` → `db:seed` (12/6/3/15) → build +
  start API → wait `/v1/health` → `verify:api-parity` (35/35) → mint a bearer token deterministically
  through the genuine `/v1/auth/verify` path (`ci:issue-token`) → `verify:user-saved-http` (17/17) +
  `verify:persisted-saved-flow` (21/21) → `ci:clean-auth-fixtures` (`if: always()`) → stop API. **No
  Stripe env, no billing/entitlement harness references.**
- **`stripe-e2e`** (**optional, secret-gated**) — a separate job. Because Actions can't put
  `secrets.*` in a job-level `if`, a `guard` step reads whether `STRIPE_SECRET_KEY` /
  `STRIPE_PRICE_LIFETIME` / `STRIPE_WEBHOOK_SECRET` repo/org secrets are present (via env indirection —
  the value never appears in a condition or log) and sets `outputs.configured`. Every real step is
  `if: steps.guard.outputs.configured == 'true'`. **With no secrets the job prints a clear SKIP and
  passes green** — nothing Stripe runs. With secrets present it boots Postgres + the API and runs
  `verify:stripe-e2e` with `RUN_STRIPE_E2E=1` (a config gap becomes a hard fail). Secrets are only ever
  passed as `env:`, never echoed; `continue-on-error` is not set.

> The always-on entitlement/exact-location/rate-limit harnesses are **not yet promoted** into the
> required CI gate (recommended follow-up, §14) — they are Stripe-free and deterministic and can join
> the `parity` job. They run locally today (this audit ran them all green).

---

## 13. Environment variables

All Stripe/billing env is **server-only** — never `NEXT_PUBLIC_*` (they'd ship in the web bundle).
Commented, keyless examples live in `apps/api/.env.example`.

| Var | Role | Required for |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` (`sk_test_…`) | Stripe secret API key | checkout, portal, webhook |
| `STRIPE_PRICE_LIFETIME` (`price_…`) | one-time lifetime price | lifetime checkout |
| `STRIPE_PRICE_SUBSCRIPTION` (`price_…`) | recurring price (optional) | subscription checkout (400 without it) |
| `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | signature secret | webhook |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | Checkout redirects | optional (default `${WEB_APP_URL}/profile?checkout=…`) |
| `STRIPE_PORTAL_RETURN_URL` | Portal return | optional (default `${WEB_APP_URL}/profile`) |
| `BILLING_RATE_LIMIT_WINDOW_SECONDS` | limiter window | optional (default 600) |
| `BILLING_CHECKOUT_RATE_LIMIT_MAX` | checkout budget | optional (default 5) |
| `BILLING_PORTAL_RATE_LIMIT_MAX` | portal budget | optional (default 10) |

The web app needs **none** of these — the redirect-to-Checkout flow hands the browser a hosted URL, so
no publishable key or client Stripe.js exists. The gates (`configuredForCheckout` = secret + lifetime
price; `configuredForWebhook` = secret + webhook secret) are **independent**; a missing gate is a
safe request-time 500, never a boot crash.

---

## 14. Security / compliance notes

| Concern | Posture |
| --- | --- |
| **Webhook signature** | Mandatory; verified on the **raw body** against `STRIPE_WEBHOOK_SECRET` before any DB work; failures → 400. |
| **Webhook idempotency** | `ProcessedWebhookEvent(event.id)` recorded in the fulfillment transaction; `providerPurchaseId @unique`. No double-grant on redelivery. |
| **No provider secrets in the client** | Secret/webhook/price env are server-only, never `NEXT_PUBLIC_*`. `verify:web-billing` asserts no `sk_`/`pk_`/`whsec_`/`price_`/`NEXT_PUBLIC_STRIPE*` in the web source tree. |
| **No exact coords public** | Structural masking retained; parity harness asserts no `lat`/`lng` at any depth; coords only via the protected entitled path. |
| **No provider ids in DTOs** | `EntitlementsService` doesn't select provider columns; the effective/exact-location harnesses assert no `cus_`/`sub_`/`pi_`/`cs_` value or provider key in any response. |
| **401 vs 403 vs 404** | 401 = unauthenticated (guard); 403 = authed but not entitled; 404 = court missing (existence public via `/v1/courts/:slug`). Never conflated. |
| **Portal scoping** | A user opens **only their own** portal; the customer is resolved from the session, never a client-supplied id. |
| **Audit trail** | Entitlement rows are never deleted on revoke/refund — `status` + `revokedAt`/`revokedReason` preserve who/why/when. |
| **PCI / GDPR** | Checkout + Portal are hosted by Stripe — we never touch card data. `email` never leaves the API in any DTO (Phase-4). Document the Stripe data-processing relationship before going live. |
| **Rate limiting** | Per-user in-memory limiter on checkout/portal only (§10). |

---

## 15. Known limitations / deferred work

- **Rate limiter is per-instance** — counters live in process memory; behind N instances a user gets
  up to N× the limit. Redis is the multi-instance path (drop-in behind `hit()`).
- **`MembershipStatus` is `free`/`lifetime` only** — a `subscription` entitlement surfaces as
  `'lifetime'` for the badge. A true "Subscriber" badge needs a contract enum change that ripples to
  the web.
- **Real event delivery is not automated in CI** — `verify:stripe-webhook` and the E2E smoke use a
  **signed synthetic** POST (real signature, real ids for E2E) rather than a Stripe-CLI delivery; a
  genuine `checkout.session.completed` needs a browser + test card or `stripe trigger`.
- **`/billing/return` E2E check is structural only** — the return page's "unlocked" copy is rendered
  client-side from `/v1/me` via the browser session cookie a Node `fetch` can't carry, and Playwright
  is out of scope; the membership logic is proven by `verify:web-billing`'s token-gated `/v1/me`
  checks instead.
- **Always-on entitlement harnesses not yet in required CI** — they run locally and are Stripe-free;
  promoting them into the `parity` job is a recommended follow-up.
- **No promo-code redemption / admin grant surface** — the schema columns
  (`kind=promo_unlock`/`manual_grant`, `grantedByAdminId`) exist; the redemption endpoint and admin
  app (`apps/admin` empty) are Phase 3.
- **No mobile IAP** — the model is IAP-ready (`source=iap_*`, `providerPurchaseId` = platform txn,
  shared `ProcessedWebhookEvent` idempotency), but no receipt validation / store notifications are
  built.
- **No real email provider / CRM webhook** — carried from Phase 4; the dev mailer logs the magic link;
  the consultation CRM webhook is still unbuilt.
- **Account-deletion cascade** — deleting a `User` must remove/anonymize `Entitlement` rows +
  `stripeCustomerId` and detach the Stripe customer; the deletion endpoint is its own deferred feature
  and must design this in when it lands.
- **`apps/api/package.json#prisma` deprecation** — carried from Phase 2; Prisma-7 config migration out
  of scope.

---

## 16. Next recommended phases / features

1. **Promote the always-on Phase-5 harnesses into required CI** (`verify:effective-entitlement`,
   `verify:exact-location`, `verify:web-exact-location`, `verify:billing-rate-limit`,
   `verify:web-billing`) — Stripe-free, deterministic, seeded fixtures. Small, high-value.
2. **Redis-backed rate limiter** for multi-instance production (drop-in behind `hit()`).
3. **Phase 3 admin** — `apps/admin` + `/v1/admin/*` for `manual_grant` / revoke (schema-ready),
   feeding the same `EntitlementsService`.
4. **Promo-code redemption** — `POST /v1/billing/redeem` → `kind=promo_unlock` (admin-inserted rows
   first, then a redeem UI).
5. **Mobile IAP** — App Store / Google Play receipt validation + server-to-server notifications on the
   shared `ProcessedWebhookEvent` machinery; "restore purchase" re-validates the platform receipt.
6. **Auth hardening (parallel, non-blocking)** — real email provider, refresh-token rotation, OAuth,
   account deletion (`DELETE /v1/me`) with the entitlement/Stripe-customer cascade.
7. **`'subscriber'` membership** (contract enum) if subscriptions need a distinct badge.

**End of Phase 5 completion summary.**
