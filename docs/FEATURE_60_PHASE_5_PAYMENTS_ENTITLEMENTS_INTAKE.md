# Feature 60 — Phase 5: Payments + Entitlements + Exact-Coordinate Unlock (Intake / Planning)

**Status:** 📋 **Planning / intake only — no product code.** This document audits the current
entitlement/payment/coordinate-masking state, designs the entitlement model + effective-entitlement
service + coordinate-gating boundary, plans the Stripe/billing architecture and the contracts/web
integration, and breaks Phase 5 into small implementable features. It changes **only**
documentation — no `apps/api`, `apps/web`, `packages/*`, Prisma schema, migration, dependency, CI,
or UI change is made here.
**Date:** 2026-06-30.
**Audience:** whoever implements the Phase-5 feature group (Features 61+).

> **✅ Phase 5 is now complete (Features 60–69).** This intake is the plan + the per-feature
> implementation notes (§15–§19); for the as-built handoff — final architecture, verification matrix,
> CI behavior, security posture, and deferred work — read **`PHASE_5_COMPLETION_SUMMARY.md`** (Feature
> 70). Everything planned below was delivered.

**Read alongside:** `PHASE_4_COMPLETION_SUMMARY.md` (the as-built auth + `/v1/me/*` state — read it
first; §7/§10 there set Phase 5 up), `PHASE_2_COMPLETION_SUMMARY.md` (§3/§6 coordinate masking, the
seeded schema), `FEATURE_50_PHASE_4_AUTH_USER_PERSISTENCE_INTAKE.md` (the intake/feature-breakdown
template this doc mirrors), `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the living inert-control inventory —
every paywall/restore/directions CTA is catalogued there), `IMPLEMENTATION_BACKLOG.md` (line items),
`../ARCHITECTURE_PLAN.md` (Decisions #11/#12/#16/#17).

**The Phase-5 contract:** an authenticated user can eventually **purchase/unlock premium access**;
an **entitled** user may receive **exact court coordinates / directions**; a **non-entitled** user
(and every unauthenticated request) must continue receiving **masked / no-exact `lat`/`lng`**, with
the public `/v1/courts*` parity harness (35/35) staying **byte-stable**. Payments run through Stripe
(web) first, with the schema/DTOs shaped so mobile IAP, promo codes, and admin grants slot in later.

> **Phase numbering note.** The original `IMPLEMENTATION_BACKLOG.md` labels payments/entitlements as
> "Phase 4" and Consultation+CRM as "Phase 5". The completion summaries **renumbered** the roadmap:
> Phase 4 became *auth + user persistence* (Features 50–59, done) and **Phase 5 is now
> payments + entitlements** (this intake), per `PHASE_4_COMPLETION_SUMMARY.md` §10. This doc follows
> the summary numbering. The CRM-webhook work the backlog called "Phase 5" is folded in as a small
> later/parallel item (it rides the same Stripe-webhook idempotency machinery; see §13 / open
> questions), not the headline of this phase.

---

## 1. Current state audit — entitlement / payment / coordinates

Confirmed by file reads (paths cited), not memory.

### 1.1 Entitlement — schema exists, runtime does not

The `Entitlement` model is **already richly shaped** in `apps/api/prisma/schema.prisma:242` — it is
**not** the bare Phase-0 stub the older comments imply:

```prisma
model Entitlement {
  id        String            @id @default(cuid())
  userId    String
  user      User              @relation(fields: [userId], references: [id])
  kind      EntitlementKind          // lifetime_unlock | subscription | promo_unlock | manual_grant
  status    EntitlementStatus @default(active)   // active | revoked | refunded | expired
  source    EntitlementSource        // stripe_web | iap_ios | iap_android | promo_code | admin
  expiresAt DateTime?
  metadata  Json?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  @@index([userId, status])
}
```

The three enums (`EntitlementKind` / `EntitlementStatus` / `EntitlementSource`) are fully defined in
both the schema (`schema.prisma:80-100`) and the contracts (`packages/contracts/src/enums.ts:37-55`).
What is **absent**:

- **No provider-correlation columns.** There is no `providerCustomerId`, `providerSubscriptionId`,
  `providerPaymentIntentId`, `providerCheckoutSessionId`, or `providerEventId` — so today there is no
  way to map a Stripe object back to an `Entitlement`, no idempotency anchor for webhooks, and no
  Stripe `Customer` ↔ `User` link. **This is the main schema gap** (§2).
- **No row is ever created.** Grep confirms **zero** reads or writes of `entitlement` in
  `apps/api/src` — no service, no controller, no seed. `prisma/seed.ts` explicitly does **not** seed
  `Entitlement` (Phase-2 summary §3 "Not seeded"). Every user has **zero** entitlement rows.
- **No effective-entitlement logic.** Nothing computes "is this user currently premium?". The single
  place membership is decided is the mapper (§1.2).

### 1.2 Where "membership" comes from today — one hardcoded constant

`membership` is surfaced exactly once and is **hardcoded `'free'`**:

- `apps/api/src/auth/user-profile.mapper.ts:62` → `toUserProfileDTO()` returns
  `membership: 'free'` unconditionally (comment: *"HARDCODED 'free'. Entitlement is out of scope"*).
- This mapper backs **both** `POST /v1/auth/verify` (the `AuthSessionDTO.user`) **and** `GET /v1/me`
  / `PATCH /v1/me` (`apps/api/src/me/me.service.ts` calls the same mapper). So **every** authenticated
  identity is `'free'`, everywhere, by construction.
- `MembershipStatus` (`packages/contracts/src/user.ts:16`) is the enum `['free', 'lifetime']`. The
  web derives unlock from it: `apps/web/src/app/profile/page.tsx:65` →
  `const unlocked = user.membership === 'lifetime'`. Because the API only ever emits `'free'`,
  `unlocked` is always `false`.

### 1.3 Where coordinates are intentionally masked

The masking is **structural** and asserted, exactly as Phase 2/4 left it:

- **Exact `Court.lat` / `Court.lng` are stored** (`schema.prisma:131-135`) and seeded, but the
  **public Prisma selects never select them** — `courtSummarySelect` and `courtDetailSelect`
  (`apps/api/src/courts/courts.mapper.ts:32,59`) omit `lat`/`lng`, so the row payload **types**
  literally have no such field and the mappers are *structurally incapable* of attaching them
  ("can't leak what you didn't fetch"). `toCourtDTO` (`courts.mapper.ts:129`) explicitly leaves
  `lat`/`lng` undefined.
- **The contract already allows exact coords on the wire but optionally:** `CourtSchema`
  (`packages/contracts/src/court.ts:55-58`) has `lat: z.number().optional()` /
  `lng: z.number().optional()` — *"omitted for non-entitled requests (Phase 4 gating)"*. So the
  detail DTO **type** is already entitlement-ready; only the population path is missing.
- **`/v1/me/*` court reads reuse the public select.** `SavedCourtsService`
  (`apps/api/src/me/saved-courts.service.ts:58`) and the user-collections service both join via
  `courtSummarySelect`, so saved/collection courts are masked too. The Phase-4 summary §3 asserts
  *"no exact `lat`/`lng` is ever present in `/v1/me/*` court data."*
- **The parity harness guards it:** `apps/web/scripts/verify-api-parity.ts` does a recursive key
  scan asserting **no `lat`/`lng` key at any depth** in `/v1/courts*` responses (Phase-2 summary §7),
  independently of the deep-equal — a real leak fails that assertion regardless.
- **`approxLat`/`approxLng` (~10km jitter) and `mapCoords` (`[mapX, mapY]`, decorative screen %, not
  geo — Risk #17) are always public.** They are unaffected by entitlement.

### 1.4 The paywall / locked / directions UI (all presentational, all inert)

From `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (§2/§4/§5/§7) + the component reads:

- **6 paywall CTAs** all open the shared **Paywall modal** via `<PaywallTrigger>` (presentational —
  the modal's own checkout button is `<button disabled>`): Home band, Court Detail ×2
  (`CourtDetailCtaPanel` locked branch + `CourtDetailLocationPreview` locked overlay), Profile
  membership card (`ProfileMembershipCard`), Footer ×2.
- **`locked` is a page-level stand-in.** `apps/web/src/app/courts/[slug]/page.tsx:86` hardcodes
  `const unlocked = false; const locked = court.isLocked && !unlocked;` (comment: *"Phase 4 replaces
  this with userRepository.getEntitlementStatus()"*). The CTA panel + location preview render from
  that prop; they never derive it.
- **2 directions CTAs are inert `href="#"`** — `CourtDetailCtaPanel` (unlocked branch) and
  `CourtDetailLocationPreview` (unlocked). The location preview renders a **styled placeholder box,
  never a map, and never receives `lat`/`lng`**.
- **Restore purchase** = `<a href="#">` in the Footer; **Subscription & Purchases** =
  `<a href="#">` in `ProfileMenuList`. Both Phase-5 entitlement flows.
- `AppShell`/`AppHeader` take an `unlocked` prop (drives the "Unlock Map" header CTA); Profile passes
  `unlocked={user.membership === 'lifetime'}`.

### 1.5 What this means for Phase 5 (the seams are ready)

| Seam | State today | Phase-5 target |
| --- | --- | --- |
| `Entitlement` row | never created | created/updated by Stripe webhook + admin grant |
| `UserProfileDTO.membership` | hardcoded `'free'` in one mapper | derived from effective-entitlement service |
| `locked` (court detail) | `court.isLocked && !false` page constant | `court.isLocked && !effectiveEntitlement` |
| Exact `lat`/`lng` | stored, never selected for any read | selected **only** in a new protected, entitled path |
| Paywall checkout | `<button disabled>` in the modal | opens a real Stripe Checkout session |
| Restore / Subscription rows | `href="#"` | entitlement status read / Stripe customer portal |
| Directions CTAs | `href="#"`, no coords | maps URL built from the entitled exact coords |

Everything is shaped for an **additive** swap behind stable interfaces — the same discipline Phases
2 and 4 used.

---

## 2. Entitlement model — recommended schema changes

**The existing model is ~80% there.** Keep `id / userId / kind / status / source / expiresAt /
metadata / createdAt / updatedAt` and the `@@index([userId, status])`. The required additions are
the **provider-correlation columns** (the idempotency + reconciliation anchors) and one lifecycle
timestamp set. Document only — **no schema change in this feature.**

### 2.1 Proposed `Entitlement` additions

| Field | Type | Why |
| --- | --- | --- |
| `startsAt` | `DateTime @default(now())` | When access begins. Today implicit at `createdAt`; making it explicit supports future-dated grants and trials. Effective-window math reads `startsAt`/`expiresAt`. |
| `providerCustomerId` | `String?` | Stripe `Customer` id (`cus_…`). Also where an IAP "app account token" / original-transaction-id would live for mobile. Indexed for webhook lookups. |
| `providerSubscriptionId` | `String?` | Stripe `Subscription` id (`sub_…`) for `kind=subscription`. Null for one-time/lifetime. |
| `providerPurchaseId` | `String?` | The one-time anchor: Stripe `PaymentIntent` (`pi_…`) or `Checkout Session` (`cs_…`) id for `kind=lifetime_unlock`; the IAP transaction id for mobile. **Unique** (idempotent fulfillment — see §2.3). |
| `revokedAt` | `DateTime?` | Set when a refund/chargeback/admin-revoke flips `status` away from `active`. Pairs with `status` for an audit trail (Decision #12 named `revokedAt`/`revokedReason`). |
| `revokedReason` | `String?` | `refund` / `chargeback` / `admin` / `expired` — human-readable audit. |
| `grantedByAdminId` | `String?` | FK-ish ref to `AdminUser.id` for `kind=manual_grant` (Decision #12). Nullable; only set for admin grants. Admin surface is Phase 3, so this can be added now and populated later. |

Plus a **partial unique index** to enforce "**one active premium entitlement per user**" is **not**
recommended as a hard DB constraint (a user may legitimately hold a lapsed subscription row *and* a
later lifetime row); instead the service collapses many rows into one effective answer (§3). Add a
**unique index on `providerPurchaseId`** (where non-null) and an **index on `providerCustomerId`** /
`providerSubscriptionId` for webhook reconciliation.

### 2.2 `User` addition (Stripe customer link)

A single nullable column on `User` is the cleanest Stripe-customer anchor, so we don't create a
customer per entitlement:

| Field | Type | Why |
| --- | --- | --- |
| `stripeCustomerId` | `String? @unique` | One Stripe `Customer` per `User`. Created lazily on first checkout, reused for portal + future purchases. `@unique` so a webhook can resolve `customer` → `User` in one indexed read. Lives on `User`, **never** in any DTO. |

> Keeping the customer id on `User` (not only on `Entitlement`) means the **customer portal** and
> **restore** flows have a stable anchor even when the user holds zero/expired entitlements.

### 2.3 Webhook idempotency model

Two layers, both schema-backed:

1. **`providerPurchaseId @unique`** on `Entitlement` — fulfilling the same purchase twice is a no-op
   upsert (the row already exists), so a re-delivered `checkout.session.completed` can't double-grant.
2. **A dedicated `ProcessedWebhookEvent` table** (recommended, small):
   ```prisma
   model ProcessedWebhookEvent {
     id          String   @id            // the provider event id (evt_… for Stripe)
     provider    String                  // "stripe" | "apple" | "google"
     type        String                  // event type, for triage
     processedAt  DateTime @default(now())
   }
   ```
   The webhook handler does `create({ id: event.id })` **first**, inside the same transaction as the
   fulfillment; a duplicate delivery hits the PK and is short-circuited as already-processed. This is
   the canonical Stripe-recommended idempotency pattern and also serves the future CRM webhook and
   IAP server-notification handlers. (Alternative: rely solely on `providerPurchaseId` uniqueness —
   simpler but doesn't cover non-fulfilling events like refunds cleanly; the dedicated table is the
   safer default.)

### 2.4 Lifecycle the model must express

- **Lifetime purchase** — `kind=lifetime_unlock`, `source=stripe_web` (or `iap_*`), `expiresAt=null`,
  `status=active`. Effective forever unless revoked.
- **Subscription** — `kind=subscription`, `expiresAt` = current period end; renewed by
  `invoice.paid` (push `expiresAt` forward), cancelled by `customer.subscription.deleted` (let it
  lapse at `expiresAt` or set `status=expired`).
- **Promo unlock** — `kind=promo_unlock`, `source=promo_code`, `expiresAt` optional.
- **Manual/admin grant** — `kind=manual_grant`, `source=admin`, `grantedByAdminId` set.
- **Revocation / refund / chargeback** — `status` → `refunded`/`revoked`, `revokedAt`/`revokedReason`
  set. The row is **kept** (audit trail), never deleted.
- **Expiry** — `expiresAt < now()` makes a row non-effective *without* a write (the service computes
  it); an optional housekeeping job may stamp `status=expired` for reporting, but correctness never
  depends on that job running.
- **Restore purchase** — re-reads the user's entitlements (web: by `stripeCustomerId`; mobile: by
  re-validating the platform receipt) and re-derives effective access; idempotent because
  `providerPurchaseId` is unique.
- **Account deletion** — deleting a `User` must cascade/anonymize `Entitlement` rows (and the
  `stripeCustomerId`); the Stripe customer itself should be deleted/detached via API. (Account
  deletion endpoint is still its own deferred feature — Phase-4 summary §7.)

### 2.5 Backfill safety

All additions are **nullable** or **defaulted**, so the migration is back-safe with no data
(`Entitlement` is empty today; `User.stripeCustomerId` defaults null). Follow the established
non-interactive migration discipline (`migrate diff` → `migrate deploy`; NOT-NULL adds via
temp-default → backfill → drop-default) — see the `prisma-migrate-noninteractive` memory.

---

## 3. Effective-entitlement service — one source of truth

**The single most important architectural decision in Phase 5:** entitlement is computed in **one
place** and every consumer calls it. Do **not** spread `status === 'active' && …` checks across
controllers (the backlog's explicit instruction, `IMPLEMENTATION_BACKLOG.md:60`).

### 3.1 Shape

A `EntitlementService` (NestJS provider in a new `entitlement` module, exported so `me`/`courts` can
import it) exposing one core method:

```ts
// server-internal type (NOT a wire DTO)
interface EffectiveEntitlement {
  isEntitled: boolean;                 // the one boolean every gate reads
  membership: MembershipStatus;        // 'free' | 'lifetime' — what UserProfileDTO needs
  reason: EntitlementKind | null;      // why entitled (which row won), or null
  source: EntitlementSource | null;    // where it came from
  activeUntil: string | null;          // ISO expiry (null = lifetime/none)
}

class EntitlementService {
  getEffectiveEntitlement(userId: string): Promise<EffectiveEntitlement>;
  // convenience: isEntitled(userId): Promise<boolean>  (thin wrapper)
}
```

### 3.2 The effective rule (exactly one definition)

A row is **effective** when:

```
status === 'active'  AND  (startsAt === null OR startsAt <= now)  AND  (expiresAt === null OR expiresAt > now)
```

(the backlog's rule, `IMPLEMENTATION_BACKLOG.md:60`, extended with the `startsAt` window). A user is
**entitled** iff **any** of their rows is effective. When several are effective, pick the "strongest"
deterministically for `reason`/`activeUntil`: prefer `expiresAt === null` (lifetime/promo-forever)
over the **latest** `expiresAt`. `membership` maps to `'lifetime'` when entitled, else `'free'` (the
contract enum only has those two; a future "subscriber" badge would extend `MembershipStatus`, a
contract change tracked as an open question).

Query: `prisma.entitlement.findMany({ where: { userId, status: 'active' }, … })` (covered by the
existing `@@index([userId, status])`), then filter the time window in code — cheap, one indexed read.

### 3.3 The consumers (all four go through this service)

| Consumer | Use |
| --- | --- |
| **`GET /v1/me`** (`me.service.ts`) | Replace the hardcoded `membership: 'free'` — derive it from `getEffectiveEntitlement(userId).membership`. The `toUserProfileDTO` mapper grows a `membership` param (no longer hardcoded). |
| **Court-detail exact-coordinate gating** | The new protected exact-location endpoint (§4) calls `isEntitled(userId)` → 200 with coords or 403. |
| **Profile membership** | Already derives from `UserProfileDTO.membership` → flows automatically once `/v1/me` is real (no separate call). |
| **Payments / webhooks** | After writing/updating an `Entitlement`, no special read — the next `/v1/me` reflects it. (Optionally returns the fresh effective status in the webhook ack for logging.) |

### 3.4 Why a service, not a column

Effective access is **time-dependent** (`expiresAt > now()`) and **multi-row** (a user may hold a
lapsed sub + a lifetime). A denormalized `User.isPremium` boolean would drift the moment a
subscription lapsed without a write. Computing on read (one indexed query) is correct-by-construction
and cheap; if it ever becomes hot, cache it per-request (it's already one query per request) or add a
short TTL cache — but **never** make the boolean the source of truth.

---

## 4. Coordinate gating — recommended approach

### 4.1 The invariant to preserve

- Public `/v1/courts*` responses **never** include `lat`/`lng` (structural masking, §1.3).
- The **parity harness asserts no `lat`/`lng` at any depth** in `/v1/courts*` and must stay 35/35.
- Exact `lat`/`lng` exist in the DB; only an **entitled, authenticated** caller may obtain them, and
  only through a **protected** path.

### 4.2 Options considered

| Option | Description | Verdict |
| --- | --- | --- |
| **A.** Enhance `GET /v1/courts/:slug` to include `lat`/`lng` when authenticated + entitled | One endpoint, content varies by caller | ❌ **Rejected.** Makes a *public, cacheable, parity-asserted* endpoint auth-varying. Risks the parity harness (an authed run would see coords), breaks HTTP caching, and couples public discovery to auth. The whole Phase-2/4 masking guarantee leans on "this endpoint *structurally cannot* return coords." |
| **B.** New protected endpoint `GET /v1/me/courts/:slug/exact-location` (a.k.a. directions) | Coords live **only** behind `/v1/me/*` (already guarded) | ✅ **Recommended.** Public parity stays byte-identical; the entitled path is an explicit, separately-tested surface; 401/403/404 separation is clean; mobile uses the same bearer path. |
| **C.** `?includeExact=true` query param on the public endpoint requiring entitlement | Flag flips behavior on the public route | ❌ **Rejected.** Same coupling problem as A, plus a param that "sometimes 403s" muddies a public contract and the parity harness. |

### 4.3 Recommended endpoint

```
GET /v1/me/courts/:slug/exact-location     (guarded by AuthGuard; class-level @UseGuards on a Me-scoped controller)
```

- Lives under `/v1/me/*` (the already-guarded surface), so **logged-out → 401** comes from the guard
  for free, before any handler runs.
- Handler: resolve the published court by `slug` (404 if missing/unpublished) → call
  `entitlement.isEntitled(userId)` → **403** if not entitled → **200** `ExactLocationDTO` if entitled.
- Uses a **new private select** that *does* include `lat`/`lng` (a `courtExactLocationSelect` defined
  next to — but never merged into — the public selects; the `satisfies Prisma.CourtSelect` guard and
  a code comment forbid widening the public ones).

### 4.4 Response DTO

```ts
// packages/contracts/src/court.ts (new)
ExactLocationSchema = z.object({
  courtId: z.string(),
  slug: z.string(),
  lat: z.number(),
  lng: z.number(),
  // convenience for the "Get Directions" CTA — a deep link the client opens
  directionsUrl: z.string(),   // e.g. https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
});
```

`directionsUrl` is built server-side from the exact coords so the client never has to assemble it
(and the masking boundary stays server-owned). A `DirectionsDTO` alias can equal `ExactLocationDTO`
or be a thinner `{ directionsUrl }` — kept as one DTO unless the UI needs them split.

### 4.5 Failure semantics (precise)

| Situation | Status | Source |
| --- | --- | --- |
| No/invalid/expired session | **401** | `AuthGuard` (before handler) |
| Authenticated but **not entitled** | **403** `ForbiddenException` | handler, after `isEntitled` is false |
| Court slug missing/unpublished | **404** `NotFoundException` | handler (checked **before or after** the entitlement check — see note) |
| Entitled + court exists | **200** `ExactLocationDTO` | handler |

> **404-vs-403 ordering note:** check **court existence first**, then entitlement — i.e. a missing
> court is **404 even for an entitled user**, and a real court is **403 for a non-entitled user**.
> This avoids leaking court existence via a 403 (an unentitled user probing slugs always gets 403 for
> *any* real-or-fake slug only if we check entitlement first; checking existence first means
> non-entitled users can distinguish real/fake slugs via 404-vs-403 — which is acceptable here because
> court existence is **already fully public** via `/v1/courts/:slug`, so it leaks nothing new).
> Document the chosen order in the handler; recommended: **existence (404) → entitlement (403)**,
> since court existence is public anyway and a clean 404 is friendlier.

### 4.6 Masking guarantees retained

- Public selects are **untouched**; the new exact select is private and only this endpoint uses it.
- `toCourtDTO` still omits `lat`/`lng` (the detail DTO stays masked — exact coords do **not** ride on
  `/v1/courts/:slug`, they come from the new endpoint).
- `/v1/me/saved-courts` and collection courts keep `courtSummarySelect` (no coords).
- The parity harness is **unchanged and still passes** (it never touches `/v1/me/*`).

---

## 5. Payment provider approach — Stripe (web first), plan only

**Do not implement, do not add the dependency.** This section specifies the target.

### 5.1 Product / price mapping

- **One product, two prices** to start: a **one-time** price (lifetime unlock, the $29 the UI already
  shows) and optionally a **recurring** price (subscription). Stripe Price ids live in **server-only
  env** (`STRIPE_PRICE_LIFETIME`, `STRIPE_PRICE_SUBSCRIPTION`), never `NEXT_PUBLIC_*`.
- A small server-side **plan registry** maps an internal plan key (`'lifetime' | 'subscription'`) →
  `{ stripePriceId, kind, mode }`. The client only ever sends the **plan key**, never a price id, so
  the client can't pick an arbitrary price.

### 5.2 Endpoints (under `/v1/billing/*`, all `AuthGuard`-protected except the webhook)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/billing/checkout` | Create a Stripe **Checkout Session** for the authed user (creates/reuses `stripeCustomerId`); returns `{ url }`. Body `{ plan }`. |
| `POST` | `/v1/billing/portal` | Create a **Customer Portal** session for the authed user; returns `{ url }`. Only their own customer. |
| `GET` | `/v1/billing/status` *(optional)* | Thin convenience over the effective-entitlement service; or **rely on `/v1/me`** (preferred — one identity read already carries `membership`). Lean toward **not** adding this and letting `/v1/me` be the status source. |
| `POST` | `/v1/webhooks/stripe` | **Public** (no `AuthGuard`) but **signature-verified**. Receives `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` → creates/updates/revokes `Entitlement`. Idempotent (§2.3). |

### 5.3 Webhook security + correctness

- **Signature verification is mandatory** — verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`
  using the **raw request body** (Nest must expose the raw body for this route; a `rawBody`/raw-parser
  carve-out is needed, since the global `ValidationPipe`/JSON parsing would otherwise consume it).
  Reject unverified payloads with **400** before any DB work.
- **Idempotency** — record `event.id` in `ProcessedWebhookEvent` (§2.3) inside the fulfillment
  transaction; duplicate deliveries short-circuit. Fulfillment also upserts on
  `providerPurchaseId @unique`.
- **Customer ↔ User mapping** — resolve `event.data.object.customer` (`cus_…`) →
  `User.stripeCustomerId` (`@unique`). For `checkout.session.completed`, also stamp the `client_reference_id`
  (we set it to `userId` at session creation) as a belt-and-braces fallback.
- **Always 200 quickly** for accepted events (after recording), do heavy work synchronously-but-fast
  or enqueue; never 500 on a duplicate.

### 5.4 Local dev + test mode

- **Stripe CLI** (`stripe listen --forward-to localhost:3001/v1/webhooks/stripe`) for local webhook
  delivery + `stripe trigger` for synthetic events.
- **Test mode only first** — `sk_test_…` keys; no live keys in the repo or CI.
- **Env vars (server-only, never `NEXT_PUBLIC_*`):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_LIFETIME`, `STRIPE_PRICE_SUBSCRIPTION` (optional), `STRIPE_SUCCESS_URL`,
  `STRIPE_CANCEL_URL` (or derive from `WEB_APP_URL`). The **publishable** key is only needed if we
  ever do client-side Stripe.js; the redirect-to-Checkout flow doesn't require it client-side, so we
  avoid `NEXT_PUBLIC_STRIPE_*` entirely for the MVP.

### 5.5 Future mobile IAP + admin (designed-for, not built)

- **App Store / Google Play IAP** — `source=iap_ios`/`iap_android`, `providerPurchaseId` = the
  platform transaction id; fulfillment via server-side receipt validation + the platforms'
  server-to-server notifications (same `ProcessedWebhookEvent` idempotency table, a different
  `provider`). **Restore purchase** re-validates the platform receipt and re-derives effective access.
- **Promo codes** — `kind=promo_unlock`; could begin as admin-inserted rows (no UI), redeemed via a
  small `POST /v1/billing/redeem` later.
- **Manual/admin grants** — `kind=manual_grant`, `grantedByAdminId`; depends on the Phase-3 admin app
  (`apps/admin` is empty). The schema column lands now; the surface later.

---

## 6. Contracts / DTOs plan

New shapes in `packages/contracts` (zod schemas + inferred types; API derives class-validator request
classes **type-only**, the `api-contracts-type-only-import` rule). **No provider internals leak into
any DTO** — no `cus_`/`sub_`/`pi_`/secret ever appears in a response shape.

| DTO | Shape | Notes |
| --- | --- | --- |
| `EntitlementStatusDTO` | `{ membership, isEntitled, activeUntil: string \| null, source: EntitlementSource \| null }` | The *public* projection of `EffectiveEntitlement` (§3.1) if a `/v1/billing/status` endpoint is added; otherwise folded into `UserProfileDTO`. **No row ids, no provider ids.** |
| `UserProfileDTO` (change) | existing + real `membership` | **No shape change** — `membership` already exists; only its *derivation* changes (mapper reads the service). Keeps web byte-compatible. |
| `BillingPlanDTO` | `{ plan: 'lifetime' \| 'subscription', priceLabel: string, kind: EntitlementKind }` | What the paywall renders; **no Stripe price id** (that's server-only). |
| `CheckoutRequestDTO` | `{ plan: 'lifetime' \| 'subscription' }` | Client sends a plan **key**, never a price id (§5.1). |
| `CheckoutSessionDTO` | `{ url: string }` | The redirect URL only. No session secret. |
| `CustomerPortalRequestDTO` | `{}` (empty) | Identity comes from the session; no body needed (or omit the DTO). |
| `CustomerPortalSessionDTO` | `{ url: string }` | Portal redirect URL only. |
| `ExactLocationDTO` / `DirectionsDTO` | `{ courtId, slug, lat, lng, directionsUrl }` | §4.4. The **only** DTO that ever carries exact `lat`/`lng`, and only from the protected entitled path. |

The **existing** `EntitlementSchema`/`EntitlementDTO` (`user.ts:121`) is an internal-ish stub; it can
stay or be retired in favor of `EntitlementStatusDTO` (the row-level DTO is not needed on the wire —
the public surface only needs *effective* status). **Mobile-friendly:** every DTO is a flat
JSON-serializable shape, dates are ISO strings, no nested provider objects.

---

## 7. Web integration plan (audit + plan, no implementation)

Current paywall/locked UI is fully catalogued in §1.4 / `PHASE_1_PLACEHOLDER_CTA_AUDIT.md`. Phase-5
web work is again **additive behind stable seams** — the `UserRepository`/`SavedRepository`
interfaces gain entitlement/billing reads, the factory wires HTTP impls, and **no screen is
redesigned**.

| Surface | Today | Phase-5 plan |
| --- | --- | --- |
| **Profile membership card** (`ProfileMembershipCard`) | renders when `!unlocked`; `unlocked` is always false | Reads real `membership` from `/v1/me` (already flows via `user.getCurrentUser()`); card shows/hides correctly once the service is live. **No component change** — the data just becomes real. |
| **Unlock CTA** (`PaywallTrigger` → Paywall modal checkout) | modal checkout is `<button disabled>` | Checkout button calls a new `BillingRepository.createCheckout(plan)` (browser island, `credentials:'include'`) → `POST /v1/billing/checkout` → `window.location = url`. |
| **Restore purchase** (Footer `href="#"`) | inert | Calls a restore read (web: re-derive from `/v1/me` after portal; mobile: receipt re-validate). For web, "restore" mostly means "open portal / re-read status." |
| **Paywall modal CTA** | disabled | As Unlock CTA above. |
| **Exact directions CTA** (`CourtDetailCtaPanel` / `LocationPreview` unlocked branch, `href="#"`) | inert | For an **entitled** viewer, the unlocked branch fetches `GET /v1/me/courts/:slug/exact-location` and sets the button `href` to `directionsUrl`; for non-entitled it stays the Paywall path. `locked` is computed from real effective entitlement at the page level (replacing the `unlocked = false` constant in `courts/[slug]/page.tsx:86`). |
| **Logged-out premium CTA** | n/a (always free) | Clicking unlock while logged-out → redirect to `/signin?redirectTo=<current>` (the existing `loadOrSignIn` / `redirectTo` machinery, `lib/auth-redirect.ts`). |
| **Post-checkout return** | n/a | Stripe success URL → a `/billing/return` (or `/profile?checkout=success`) page that re-reads `/v1/me`; the entitlement may arrive via webhook slightly after redirect, so the return page **polls/re-reads** or shows "processing" until `membership` flips. |
| **Cancel / failed checkout** | n/a | Cancel URL → back to the paywall context with a non-blocking "checkout cancelled" state (no error). |

New seam: a **`BillingRepository`** interface (`createCheckout`, `createPortalSession`, maybe
`getEntitlementStatus`) with mock + HTTP impls, wired in the factory exactly like
`user`/`saved` (request-scoped auth transport). The exact-location read can live on `SavedRepository`
or a small `CourtsRepository.getExactLocation(slug)` addition — **recommend a new method on the
court/saved repo** rather than a whole new domain, to match the "exact location is a court-detail
concern" mental model.

---

## 8. Verification plan

Mirrors the Phase-4 approach: small `tsx` harnesses + the CI gate. Each future feature ships its
checks; this intake only enumerates them.

| Check | Asserts |
| --- | --- |
| **Public parity still 35/35** | `verify:api-parity` unchanged — the new endpoints don't touch `/v1/courts*`; no `lat`/`lng` leak anywhere public. **This is the non-negotiable regression guard.** |
| **Non-entitled exact-location → 403** | Authed user with no effective entitlement hitting `GET /v1/me/courts/:slug/exact-location` gets **403** (not 200, not 404 for a real slug). |
| **Entitled exact-location → 200 + coords** | A test fixture entitlement makes the same call return `{ lat, lng, directionsUrl }`. |
| **Unauthenticated exact-location → 401** | No session → 401 from the guard. |
| **Non-entitled public court detail still masked** | `GET /v1/courts/:slug` for an entitled *and* non-entitled caller is byte-identical and has **no** `lat`/`lng` (coords never ride the public route). |
| **`/v1/me` membership reflects entitlement** | Seed an effective entitlement → `/v1/me` returns `membership: 'lifetime'`; revoke/expire → back to `'free'`. |
| **Effective rule edge cases** | expired (`expiresAt < now`) → not entitled; `status=revoked/refunded` → not entitled; `startsAt` in future → not entitled; lifetime (`expiresAt=null, active`) → entitled. |
| **Webhook idempotency** | Same `event.id` delivered twice grants **once** (one `Entitlement` row); `providerPurchaseId` uniqueness holds. |
| **Checkout session creation** | `POST /v1/billing/checkout` returns a `url`; reuses `stripeCustomerId` on a second call; sets `client_reference_id = userId`. |
| **Portal authorization** | A user can only open **their own** portal (no cross-user customer id). |
| **No raw provider secrets client-side** | grep the web bundle/env for `sk_`, `whsec_`, `STRIPE_SECRET` → none; no `NEXT_PUBLIC_STRIPE_*` secret. |
| **Profile membership UI updates** | Web: entitled user sees the membership card hidden / unlocked state; route table unchanged. |

**CI strategy (Stripe in CI without live Stripe):** the entitlement/exact-location/`/v1/me` checks
need **no Stripe** — they seed `Entitlement` rows directly (a `ci-seed-entitlement` fixture, like
`ci-issue-token`) and exercise the gating. The **Stripe-specific** checks (checkout/portal/webhook)
run against a **local fake / Stripe mock** or are gated behind a `STRIPE_TEST_*` secret that CI may
not have — so split them: the **gating + effective-entitlement harness runs in CI unconditionally**
(seeded fixtures, deterministic), and the **Stripe-integration harness is opt-in** (skipped when
`STRIPE_SECRET_KEY` is absent, run locally via the Stripe CLI). This keeps the permanent CI gate
green without a Stripe dependency, exactly as the auth harness mints its own token.

---

## 9. Proposed implementation sequence (Features 61+)

Small, additive, each independently verifiable — refined from `PHASE_4_COMPLETION_SUMMARY.md` §10.

| Feature | Scope | Gate |
| --- | --- | --- |
| **61 — Entitlement schema + contracts groundwork** | Add the provider-correlation columns + `startsAt`/`revokedAt`/`revokedReason`/`grantedByAdminId` to `Entitlement`, `User.stripeCustomerId`, the `ProcessedWebhookEvent` table; migration (back-safe); new DTOs (`EntitlementStatusDTO`, `ExactLocationDTO`, billing DTOs). **No runtime.** | typecheck/build; migration applies clean; parity 35/35 unchanged |
| **62 — EffectiveEntitlementService + `/v1/me` membership** | New `entitlement` module + service (§3); `me.service`/`user-profile.mapper` derive real `membership`; seed-fixture harness for the effective rule + `/v1/me` reflection. | new effective-rule + `/v1/me` harness; parity 35/35 |
| **63 — Protected exact-location endpoint** | `GET /v1/me/courts/:slug/exact-location` (§4): private exact select, 401/403/404 separation, `ExactLocationDTO` + `directionsUrl`; masking-regression harness (public still masked). | exact-location 401/403/200 harness; parity 35/35 |
| **64 — Web reads entitlement + exact location** | `BillingRepository` interface + mock; `user.getCurrentUser()` membership flows to Profile; court-detail `locked` derived from real entitlement; exact-directions CTA reads the protected endpoint for entitled viewers. **No Stripe yet.** | web lint/typecheck/build; route table stable; web entitlement harness |
| **65 — Stripe checkout + portal endpoints** | `POST /v1/billing/checkout` + `/portal`; `stripeCustomerId` lazy-create; plan registry; **test mode**; Stripe dep added (server-only). | checkout/portal harness (opt-in, local Stripe CLI); secrets server-only check |
| **66 — Stripe webhook + entitlement updates** | `POST /v1/webhooks/stripe` (raw-body + signature verify); fulfillment → `Entitlement`; idempotency (`ProcessedWebhookEvent` + `providerPurchaseId`); refund/chargeback → revoke. | webhook idempotency + lifecycle harness (Stripe CLI / fake) |
| **67 — Web checkout/return/portal wiring** | Paywall/restore/portal CTAs call the billing repo (browser islands); post-checkout return page re-reads `/v1/me`; cancel/failed states. | web lint/typecheck/build; manual checkout walkthrough |
| **68 — Billing/entitlement CI harness** | Promote the seeded entitlement + exact-location + `/v1/me` checks into the CI gate (the Stripe-integration ones stay opt-in); a `ci-seed-entitlement` fixture + cleanup. | CI green with new gated checks |
| **69 — Phase 5 completion summary** | `PHASE_5_COMPLETION_SUMMARY.md`; refresh `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (paywall/restore/directions no longer inert). | docs lint only |

> Sequencing logic: **data → derivation → gating → web-read** (61–64) lands the *entitlement* half
> with **no Stripe at all** (seeded fixtures), so coordinate unlock is fully testable before any
> payment code exists. **Stripe** (65–67) is layered on top and is the only part that needs the
> dependency/secrets. CI (68) and the summary (69) close it out. Each feature keeps public parity
> 35/35.

### Feature 65 — Stripe checkout + portal endpoints (DONE)

Server-side billing surface only. **No webhook, no entitlement grant, no web UI wiring** — those are
Features 66/67. Checkout only *starts* a payment; `/v1/me` stays `'free'` until the webhook fulfils.

- **Endpoints (both `AuthGuard`-protected):** `POST /v1/billing/checkout` `{ plan }` → `CheckoutSessionDTO`
  `{ url }`; `POST /v1/billing/portal` (no body) → `CustomerPortalSessionDTO` `{ url }`. Response is a
  hosted redirect URL only — **no session id / `cus_`/`sub_`/`pi_`/`cs_`/secret** on the wire.
- **Module:** new `apps/api/src/billing/` (`billing.module` wired into `AppModule`; `billing.config`
  = env-derived `BILLING_CONFIG` provider; `billing.service`; `billing.controller`; `billing.dto`
  class-validator request (`@IsIn` on plan, `type`-only contract parity); `billing.types` plan registry).
  Imports `AuthModule` for the guard; **does not** import `EntitlementsModule` (grants nothing).
- **Plan registry (server-side):** client sends only the plan **key**; the server maps
  `lifetime → { STRIPE_PRICE_LIFETIME, mode 'payment' }` and `subscription → { STRIPE_PRICE_SUBSCRIPTION,
  mode 'subscription' }`. A `subscription` request with no configured price → clean **400** (disabled
  plan); `lifetime` still works. The client can never send a price id.
- **Customer create/reuse:** one Stripe Customer per `User`, created lazily on the first
  checkout/portal call and persisted to `User.stripeCustomerId` (`@unique`), reused thereafter; a
  concurrent double-create is reconciled via the P2002 unique violation (re-read + reuse). Portal
  **creates the customer lazily if missing** (task 7 recommended) so a signed-in user can open it
  pre-purchase; it always resolves the customer from the session (own-customer only).
- **Env vars (server-only, never `NEXT_PUBLIC_*`):** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_LIFETIME`
  (both required for real checkout), `STRIPE_PRICE_SUBSCRIPTION` (optional), `STRIPE_SUCCESS_URL` /
  `STRIPE_CANCEL_URL` / `STRIPE_PORTAL_RETURN_URL` (optional; default off `WEB_APP_URL`). Added to
  `.env.example` (commented, no real keys). `STRIPE_WEBHOOK_SECRET` intentionally deferred to F66.
  Missing secret/lifetime-price → the API still boots; a request returns **500 "Billing is not
  configured"** (never a boot crash). Stripe SDK `apiVersion` omitted (uses the account default).
- **Error mapping (no Stripe leak):** unauth → 401 (guard); unknown/disabled plan → 400; server
  misconfig → 500; Stripe API failure → **502**; created-session-without-url → 502. Raw Stripe
  messages are logged internally, never returned.
- **Verification:** `verify:billing-checkout` (opt-in — **skips + exits 0** when `STRIPE_SECRET_KEY`
  is absent, so CI stays green without Stripe; run locally with test-mode keys for the full
  create/reuse/plan/portal + no-grant assertions). Live smoke with **no Stripe env** confirmed
  401 gating, the 500 misconfig path, 400 validation, and `/v1/me` still `free` with 0 entitlement
  rows. Existing harnesses unchanged: parity **35/35**, effective-entitlement **111/111**,
  exact-location **18/18**, api-auth unauth paths green.
- **Next:** Feature 66 — `POST /v1/webhooks/stripe` (raw-body + signature verify) that fulfils the
  `Entitlement` grant idempotently; then Feature 67 wires the web paywall/portal CTAs.

### Feature 66 — Stripe webhook + entitlement fulfillment (DONE)

The signature-verified, idempotent webhook that turns a Stripe event into an `Entitlement`
write. **This is where checkout finally becomes access:** a `checkout.session.completed` grants
the row that flips `/v1/me` `free → lifetime` and unlocks exact-location. **No schema/migration,
no web UI, no checkout/portal change, no public-court change** (Features 67 wires the web CTAs).

- **Endpoint:** `POST /v1/webhooks/stripe` in a NEW `apps/api/src/webhooks/` module —
  **PUBLIC (no `AuthGuard`)** but **signature-authenticated** (Stripe posts server-to-server; the
  HMAC IS the auth). `@HttpCode(200)` ack `{ received: true }`. A dedicated module (not folded into
  the guarded `BillingModule`) so the unguarded boundary is unmistakable.
- **Raw body:** `NestFactory.create(AppModule, { rawBody: true })` in `main.ts`. Nest attaches a
  raw-capturing `verify` to the SAME express json parser it already registers — it does **not**
  disable JSON parsing, so every other route keeps its parsed `req.body` and the global
  `ValidationPipe` is **unchanged**. The controller reads `req.rawBody` (a `Buffer`) — the exact
  bytes `stripe.webhooks.constructEvent` must verify. Confirmed against `@nestjs/platform-express`
  10.4.x (`getBodyParserOptions` adds the `verify` only when `rawBody === true`).
- **Signature verification (`StripeWebhookService`):** `constructEvent(rawBody, sig, secret)`.
  Missing/empty raw body → 400; missing `Stripe-Signature` → 400; bad/ tampered signature → 400 —
  ALL before any DB work. Raw Stripe errors are logged, never returned. Missing
  `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` → safe **500** "Webhook is not configured" at request
  time (never a boot crash).
- **Idempotency (two anchors, §2.3):** in ONE `prisma.$transaction`, `ProcessedWebhookEvent.create({
  id: event.id })` runs FIRST; a re-delivered event hits the PK (P2002) → the whole thing is a
  **200 no-op** (no double-grant). Second anchor: fulfillment **upserts on
  `Entitlement.providerPurchaseId @unique`**, so even a DISTINCT event for the same purchase yields
  ONE row. A real internal error rolls the tx back and 500s so Stripe RETRIES safely.
- **Events handled → entitlement lifecycle:**
  - `checkout.session.completed` — resolve user (`client_reference_id` verified against a real
    `User`, else `customer` → `User.stripeCustomerId`). `mode 'payment'` → upsert `kind=lifetime_unlock`,
    `expiresAt=null`, anchor = PaymentIntent (fallback session id). `mode 'subscription'` →
    `kind=subscription`, anchor = subscription id, `expiresAt` = current period end (retrieved from
    Stripe if the payload lacks it).
  - `invoice.paid` / `invoice.payment_succeeded` — renewal: resolve subscription+customer→user, push
    `expiresAt` forward, re-activate (clears stale revocation). Creates the row if the invoice beat
    the checkout event.
  - `customer.subscription.deleted` — `updateMany` the matching `providerSubscriptionId` active rows
    → `status=expired`, `revokedReason='subscription_deleted'` (no longer effective).
  - `charge.refunded` → `status=refunded`, reason `refund`; `charge.dispute.created` → `status=revoked`,
    reason `chargeback`. Both match by the charge/dispute PaymentIntent = `providerPurchaseId`,
    `revokedAt=now`, and only touch still-`active` rows (audit stays truthful).
  - Any **unsupported** event — recorded in `ProcessedWebhookEvent`, **200 no-op** (never throws, so
    Stripe doesn't retry events we don't act on). Unresolvable-but-well-formed events are logged +
    no-op'd, not 500'd.
- **Write centralization (task 8):** all row writes live in `StripeWebhookService` (`upsertEntitlement`
  / `revokeByPurchase`); **`EntitlementsService` stays read-only** (effective-access derivation is NOT
  duplicated here). Provider ids (cus_/sub_/pi_/cs_) are written ONLY to server-only `Entitlement`
  columns + a minimal secret-free `metadata` blob; never selected into any DTO.
- **Config:** `STRIPE_WEBHOOK_SECRET` added to `billing.config.ts` (`configuredForWebhook` =
  secret-key + webhook-secret, independent of the checkout gate) and `.env.example` (commented,
  server-only, never `NEXT_PUBLIC_*`).
- **Verification:** `verify:stripe-webhook` (opt-in — **skips + exits 0** without
  `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY`; NOT in required CI). It signs SYNTHETIC events with
  `stripe.webhooks.generateTestHeaderString` (the same HMAC `constructEvent` verifies) and POSTs them
  to the real endpoint — **signature-path + fulfillment verification with synthetic payloads, NOT a
  live Stripe API delivery** (for that, use the Stripe CLI `stripe listen` / `stripe trigger`).
  **Ran 20/20 green** end-to-end against a live API + Postgres: unsigned/bad-sig→400, unsupported→200
  recorded, duplicate→200 & one ledger row, checkout→one active lifetime row (idempotent on redelivery
  AND same-purchase distinct events), `/v1/me` `free→lifetime`, exact-location 200, refund→`refunded`
  + `/v1/me` `free` + exact-location 403, and no provider-id/secret leak in any response. Existing
  harnesses unchanged with F66 live: **parity 35/35, effective-entitlement 111/111, exact-location
  18/18, web-exact-location 14/14, user-saved-http 17/17**; `verify:billing-checkout` still skips
  cleanly with no Stripe env.
- **Next:** Feature 67 — wire the web paywall/portal CTAs (`POST /v1/billing/checkout` from the modal,
  `/v1/billing/portal` from the profile), and a post-checkout return page that re-reads `/v1/me`
  (tolerating the webhook-vs-redirect race with a brief "processing" poll, §5.3).

### Feature 67 — web checkout / return / portal wiring (DONE)

The WEB side of Phase 5: the paywall/profile/footer CTAs (Phase-1 inert placeholders) now drive the
real billing endpoints. **No Stripe.js, no publishable key, no price id, no `NEXT_PUBLIC_STRIPE*`
ever enters the browser** — the client sends only a plan KEY and navigates to an opaque hosted `url`.
**No API schema/webhook/billing-logic change, no public-court change** (verified by the unchanged
harnesses below).

- **BillingRepository seam** (`apps/web/src/domain/billing/*` + `http/http-billing.repository.ts`):
  same interface/factory pattern as courts/saved/user. `createCheckout(plan)` → `POST /v1/billing/checkout`
  `{ plan }` → `{ url }`; `createPortalSession()` → `POST /v1/billing/portal` (no body) → `{ url }`.
  Thin adapters over the shared `http-client` `postJson` (carrying the auth transport); a 401 →
  `AuthRequiredError`, any other non-2xx → `HttpError`. **MockBillingRepository** has no provider, so
  both methods throw a typed `BillingNotAvailableError` (no fabricated redirect) — the mock BUILD
  stays stable. Wired into BOTH factory branches; `billing` added to the `Repositories` interface.
- **Shared client action** (`features/billing/use-billing-action.ts`): a browser hook used by every
  CTA. Flips to `pending` (disables the button), calls the repo through `getClientRepositories()`
  (`credentials:'include'`), then `window.location.assign(url)` — a FULL navigation to the hosted
  page, not a client route. `AuthRequiredError` → `window.location.assign('/signin?redirectTo=<current path>')`.
  Any other failure → a calm inline `error` state, **never** the raw API/Stripe detail, and **no** navigation.
- **Paywall checkout** (`PaywallCheckoutButton` in `PaywallModal`): the previously `disabled`
  primary CTA is now an active island — clicking starts a `'lifetime'` checkout, shows a loading label,
  and navigates to the returned URL. Modal chrome (copy/benefits/price) stays presentational.
- **Portal wiring:** the profile **"Subscription & Purchases"** row (`ProfileMenuRow` gained an
  `action:'portal'`) and the footer **"Restore"** link both open the Customer Portal via
  `ManageBillingButton`. Loading disables the control; a logged-out click → `/signin`; a failure shows a
  calm inline error (the footer suppresses its error via `hideError` so the dark column stays quiet).
- **Return page** (`/billing/return`, `BillingReturn` island): re-reads `/v1/me` and **tolerates the
  webhook-vs-redirect race** — a BOUNDED poll (`MAX_ATTEMPTS=6` × `2s`), success the instant membership
  is `lifetime`, otherwise a calm **"payment is processing"** state (never an infinite spin, never a
  false failure) with a manual "Check again". `?status=cancelled` short-circuits to a neutral cancelled
  message; a `/v1/me` 401 → a sign-in prompt. **Adopt by pointing the server-only `STRIPE_SUCCESS_URL`
  at `${WEB_APP_URL}/billing/return`** (and optionally `STRIPE_CANCEL_URL` at
  `…/billing/return?status=cancelled`). The API's built-in DEFAULTS remain `/profile?checkout=success|cancelled`
  — those still work: the profile page renders a small presentational `CheckoutStatusBanner` for that
  query. **No API change is required to adopt either target.**
- **No Stripe.js / secret leakage:** the web bundle gains no Stripe dependency; the redirect-to-hosted
  flow needs no publishable key. The `verify:web-billing` harness statically asserts this (below).
- **Verification (`verify:web-billing`, no real Stripe):** always-on checks (no API, no Stripe,
  CI-safe): no `@stripe/*` dep in `apps/web`; **no `NEXT_PUBLIC_STRIPE*` / `sk_`/`pk_`/`whsec_`/`price_`
  literal anywhere in the web source tree**; the `billing` seam is factory-wired in both modes (mock
  throws `BillingNotAvailableError`, no url); `/billing/return` route exists. **Ran 7/7 green** (3
  token-gated/optional skipped without a session/Stripe). Token-gated (skip without a bearer token):
  `FREE_BEARER_TOKEN` → `/v1/me` `free` (return "processing"), `ENTITLED_BEARER_TOKEN` → `lifetime`
  (return "success") — the return page's state is a pure function of `/v1/me`, so it's provable without
  Stripe. Optional (`RUN_STRIPE_CHECKOUT=1` + token + API Stripe test env): `createCheckout` returns a
  hosted `https` url (NOT followed, NOT faked). **Existing harnesses unchanged with F67 present:**
  parity 35/35, effective-entitlement 111/111, exact-location 18/18, web-exact-location 7/7,
  api-auth checks pass (`user-saved-http` 1/1, `persisted-saved-flow` 3/3 — the nonzero exit is the
  known tsx/libuv Windows teardown flake AFTER the checks pass), `verify:stripe-webhook` still skips
  cleanly with no Stripe env. `pnpm build` green (16/16 pages; `/billing/return` static, `/profile` now
  dynamic for its `searchParams`).
- **Next:** Feature 68 — the optional Stripe test-mode end-to-end smoke + CI lane (§9 risk 4),
  then the redemption-code / admin surfaces (Phase 3 per §14).

### Feature 68 — optional Stripe test-mode E2E smoke + CI lane (DONE)

The ONE harness that drives the WHOLE payment loop against a **live Stripe TEST-MODE account** in a
single run, plus a **separate, secret-gated CI lane** that runs it only when Stripe test secrets are
configured. **Required CI stays 100% Stripe-free.** **No product runtime change, no schema/migration,
no new endpoint, no Stripe.js, no client secret, no public-court change** — this feature is
verification + CI + docs only.

- **Script:** `apps/api/scripts/verify-stripe-e2e.ts` → `pnpm --filter @tennis/api verify:stripe-e2e`
  (root alias `pnpm verify:stripe-e2e`). Does **not** replace `verify:billing-checkout` /
  `verify:stripe-webhook` / `verify:web-billing` — it's the missing *full-loop* smoke on top of them.
- **What is REAL vs SYNTHETIC (honest by design — the headline of the file):**
  - **REAL Stripe test-mode API calls:** `POST /v1/billing/checkout` makes the API call
    `stripe.checkout.sessions.create` + `stripe.customers.create` for real (asserts a genuine hosted
    `checkout.stripe.com` `url` and a real `cus_…` persisted on the User); a 2nd checkout proves the
    **same real customer is reused**; `POST /v1/billing/portal` calls
    `stripe.billingPortal.sessions.create` for real; the script then does a **real
    `stripe.checkout.sessions.retrieve`** to read back the real customer/session/payment-intent ids.
  - **SIGNED SYNTHETIC fulfillment:** Stripe test mode never delivers `checkout.session.completed`
    unattended (it needs a browser + test card on the hosted page, or the Stripe CLI). So the script
    hand-builds that event **carrying the REAL session/customer/payment-intent ids**, signs it with
    `stripe.webhooks.generateTestHeaderString` (the exact HMAC `constructEvent` verifies) using the
    **real `STRIPE_WEBHOOK_SECRET`**, and POSTs it to the real `POST /v1/webhooks/stripe`. This is a
    **HYBRID: real Stripe checkout objects + a signed synthetic delivery**, NOT full Stripe-CLI event
    delivery. For a true end-to-end delivery run `stripe listen --forward-to
    localhost:3001/v1/webhooks/stripe` + `stripe trigger checkout.session.completed` (needs the CLI
    binary — hard to automate in CI, documented as the manual path).
- **Downstream product coverage (all real):** after the signed fulfillment → one **active lifetime
  Entitlement** anchored on the (real) payment intent, idempotent on redelivery; `/v1/me` flips
  `free → lifetime`; the protected **exact-location** endpoint unlocks (200) for a real seeded court;
  a signed synthetic `charge.refunded` (same real payment intent) revokes it → `/v1/me` `free`,
  exact-location 403; **no provider id (`cus_/sub_/pi_/cs_`) leaks** in any `/v1/me` or exact-location
  response. Pre-fulfillment it also asserts `/v1/me` is still `free` and exact-location is 403
  (checkout ≠ fulfillment).
- **Web `/billing/return`:** an **optional structural** check — with `WEB_APP_URL` set + Next running
  it fetches `/billing/return` and asserts a **200 + the "Confirming your membership" shell renders**.
  It deliberately does **not** drive the client poll or assert "unlocked" copy: that state is rendered
  client-side from `/v1/me` via the browser session cookie the island reads, which a Node `fetch`
  can't carry, and the prompt forbids adding Playwright. The return page's membership logic is already
  proven by `verify:web-billing`'s token-gated `/v1/me` checks (`free`→"processing", `lifetime`→
  "success"). Documented limitation.
- **Required env (real run):** `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_PRICE_LIFETIME=price_…`,
  `STRIPE_WEBHOOK_SECRET=whsec_…` (the **same** value the running API uses), `DATABASE_URL`, and the
  API base (`NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:3001/v1`). **Optional:** `WEB_APP_URL`
  (enables the return-page render check).
- **Opt-in gate + safety:** with **any required Stripe env missing and `RUN_STRIPE_E2E` unset** →
  **SKIP cleanly, exit 0** (a green no-op; never fakes a pass). With **`RUN_STRIPE_E2E=1` and env
  missing** → **hard FAIL (exit 1)** ("I asked for the real thing and it isn't configured" is loud).
  It **refuses an `sk_live_…` key outright** (this creates real Stripe objects — test account only),
  and **never logs a secret**. Fixtures are namespaced (`f68-…@tennis.test`, `evt_f68_…`) and
  self-cleaned at start + end + on crash, so a reused DB stays deterministic.
- **Local run:**
  ```
  pnpm db:up && pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
  # apps/api/.env: STRIPE_SECRET_KEY=sk_test_…  STRIPE_PRICE_LIFETIME=price_…  STRIPE_WEBHOOK_SECRET=whsec_…
  pnpm --filter @tennis/api dev            # API on :3001 (loads the SAME env)
  DATABASE_URL=… NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
    STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_LIFETIME=price_… STRIPE_WEBHOOK_SECRET=whsec_… \
    pnpm --filter @tennis/api verify:stripe-e2e
  # optional return-page render check: also set WEB_APP_URL=http://localhost:3000 (Next running)
  ```
- **CI lane:** a NEW **`stripe-e2e`** job in `.github/workflows/ci.yml`, kept **entirely separate** from
  the required `verify` + `parity` jobs (which reference NO Stripe). Because GitHub Actions can't put
  `secrets.*` in a job-level `if`, it gates at the **step** level: a `guard` step tests whether the
  `STRIPE_SECRET_KEY` / `STRIPE_PRICE_LIFETIME` / `STRIPE_WEBHOOK_SECRET` **repo/org secrets** are
  present (via an `env` indirection — the secret VALUE never appears in a condition or a log) and sets
  `outputs.configured`; every real step is `if: steps.guard.outputs.configured == 'true'`. **With no
  secrets configured the job prints a clear SKIP and passes green** — nothing Stripe runs. With secrets
  present it boots Postgres + the API (inheriting the Stripe env), waits for health, and runs the smoke
  with `RUN_STRIPE_E2E=1` (so a config gap is a hard fail). Secrets are only ever passed as `env:`,
  never echoed; `continue-on-error` is not set. **No required check depends on Stripe; no live key is
  in the repo.** If a repo prefers zero CI-secret surface, the job is a clean no-op and the script
  remains a documented local/manual harness.
- **Verification (this feature):** `verify:stripe-e2e` **skips cleanly (exit 0)** with no Stripe env
  (no Stripe test account was available here — a real green run is NOT claimed). Existing harnesses
  unchanged with F68 present: parity 35/35, effective-entitlement 111/111, exact-location 18/18,
  web-exact-location 7/7, api-auth (`user-saved-http` / `persisted-saved-flow`) pass,
  `verify:billing-checkout` / `verify:stripe-webhook` / `verify:web-billing` still skip cleanly with no
  Stripe env. `pnpm lint`, `pnpm typecheck`, `pnpm build` green.
- **Limitations (stated honestly):** (1) fulfillment delivery is a **signed synthetic** POST, not a
  real Stripe-CLI event delivery — the Stripe *checkout/customer/portal* objects it uses ARE real, but
  a genuine `checkout.session.completed` requires a browser+card or `stripe trigger`. (2) The
  `/billing/return` check is a **structural render** only (no browser session → no "unlocked" copy
  assertion; no Playwright by rule). (3) Real Stripe TEST customers/sessions are left in the test
  account (disposable), same trade-off as `verify:billing-checkout`.

---

## 10. Security + compliance baseline

| Concern | Requirement |
| --- | --- |
| **Webhook signature verification** | Mandatory; verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` on the **raw body**; reject unverified with 400 before DB work. |
| **Idempotent webhooks** | `ProcessedWebhookEvent(event.id)` recorded in the fulfillment transaction; `Entitlement.providerPurchaseId @unique`. No double-grant on redelivery. |
| **No provider secrets in the client** | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / price ids are **server-only**, **never** `NEXT_PUBLIC_*`. The redirect-to-Checkout flow needs no client secret. A grep gate asserts no `sk_`/`whsec_` in the web bundle. |
| **No exact `lat`/`lng` in public endpoints** | Unchanged structural masking; parity harness asserts it; coords only via the protected entitled path. |
| **401 vs 403 separation** | 401 = not authenticated (guard); 403 = authenticated but not entitled (handler); 404 = court missing. Never conflate. |
| **Billing-portal scoping** | A user may open **only their own** customer portal; resolve the customer from the session, never from a client-supplied id. |
| **Account deletion implications** | Deleting a `User` must remove/anonymize `Entitlement` rows + `stripeCustomerId` and detach/delete the Stripe customer. (Deletion endpoint is its own deferred feature; entitlement cascade must be designed in when it lands.) |
| **Audit trail** | Entitlement rows are **never deleted** on revoke/refund — `status` + `revokedAt`/`revokedReason` + `grantedByAdminId` preserve who/why/when. |
| **Rate limiting (checkout)** | ✅ **Done (Feature 69).** `POST /v1/billing/checkout` (5/10min) and `/portal` (10/10min) are rate-limited **per authenticated user id** by a lightweight **in-memory** limiter guard applied ONLY to those two routes (over budget → **429** + `Retry-After`, safe message). No dependency added (no `@nestjs/throttler`, no Redis); the webhook + public/auth routes are untouched. Limits are env-configurable. See §19. **MVP limitation:** counters are per-instance — a shared store (Redis) is the multi-instance production path. |
| **GDPR / privacy** | `email` already never leaves the API in any DTO (Phase-4 §3); no exact coords for non-entitled; Stripe is the PCI surface (we never touch card data — Checkout/Portal are hosted). Document the Stripe data-processing relationship when going live. |

---

## 11. Risks / open questions

1. **`MembershipStatus` only has `free`/`lifetime`.** A `subscription` entitlement maps to `'lifetime'`
   for the badge today — fine for unlock gating, but a true "Subscriber" badge would need a contract
   enum change (`packages/contracts/src/user.ts:16`) that ripples to the web. **Q:** ship subscriptions
   as `'lifetime'`-equivalent for MVP, or add a `'subscriber'` member now?
2. **Raw-body carve-out for the webhook.** The global `ValidationPipe` + JSON parsing must **not**
   consume the Stripe webhook body before signature verification. Nest needs a `rawBody: true` /
   route-scoped raw parser. **Q:** confirm the `main.ts` bootstrap can expose raw body for one route
   without disturbing the global pipe used by every other endpoint.
3. **Webhook-vs-redirect race.** The user is redirected to the success URL possibly **before** the
   webhook fulfills the entitlement. The return page must tolerate a brief "processing" window
   (poll/re-read `/v1/me`). **Q:** poll, or also fulfill synchronously from the checkout-session
   retrieve on the return page (belt-and-braces)?
4. **CI without live Stripe.** The gating/effective/exact-location harnesses run with **seeded**
   entitlements (no Stripe) — solid. The Stripe checkout/portal/webhook harnesses need the Stripe CLI
   or a fake. **Q:** stand up a tiny fake-Stripe in CI, or keep those opt-in/local-only and gate CI on
   the seeded-entitlement half? (Recommended: opt-in, like the auth token bootstrap.)
5. **`toggleSavedCourt` / global save heart** is still unimplemented (Phase-4 §7) — orthogonal to
   payments but often bundled with "premium" UX. **Q:** in scope for Phase 5 or its own track?
   (Recommend: out of scope — it's an auth feature, not entitlement.)
6. **Rate limiting** — ✅ **Resolved (Feature 69).** A custom in-memory per-user limiter guard was
   chosen over `@nestjs/throttler` (no new dependency, no global/IP-based default to bend, no Redis)
   and applied ONLY to the two billing endpoints. See §19. A distributed (Redis) limiter remains the
   recommended multi-instance production follow-up.
7. **Existing `EntitlementDTO` stub** (`user.ts:121`) — retire in favor of `EntitlementStatusDTO`, or
   keep for an admin/debug read? (Recommend: don't expose row-level entitlements on the user wire;
   `EntitlementStatusDTO` is the public projection.)
8. **Promo codes / admin grants** depend on surfaces that don't exist (no `/v1/admin/*`, `apps/admin`
   empty — Phase 3). The **schema columns** land in Feature 61; the **redemption/admin UI** are
   explicitly later. Confirm that's acceptable for Phase-5 scope.

---

## 12. Commands run (this doc-only feature)

This feature changes **only** documentation — no product/API/schema/web/contracts code, no Stripe
dependency, no endpoints, no migrations, no CI change.

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm typecheck` | ✅ 7/7 packages pass |
| `pnpm build` | ✅ 5/5; web emits the unchanged 17-route table (incl. `/verify`) — no route/UI drift |
| `pnpm verify:api-parity` | ⏸ **Not re-run** — docs-only change; the live API + Postgres were not started for this planning task and nothing on the public surface changed. It gates CI on every PR and last passed **35/35** (Phase-4 CI). Not faked here. |

---

## 13. Confirmation — docs-only / no product code

This feature adds exactly **one file** (`docs/FEATURE_60_PHASE_5_PAYMENTS_ENTITLEMENTS_INTAKE.md`).
**No** `apps/api` source, **no** `apps/web` source, **no** `packages/*` source, **no** Prisma schema
or migration, **no** Stripe (or any) dependency, **no** payment endpoints, **no** entitlement
runtime, **no** exact-`lat`/`lng` exposure, **no** UI change, **no** CI change. The existing
coordinate-masking invariant and the 35/35 public parity are untouched.

---

## 14. Next recommended feature

**Feature 61 — Entitlement schema + contracts groundwork:** add the provider-correlation columns
(`providerCustomerId`/`providerSubscriptionId`/`providerPurchaseId @unique`), `startsAt` /
`revokedAt` / `revokedReason` / `grantedByAdminId` to `Entitlement`, `User.stripeCustomerId @unique`,
and the `ProcessedWebhookEvent` idempotency table — plus the new contract DTOs (`EntitlementStatusDTO`,
`ExactLocationDTO`, `BillingPlanDTO`, `CheckoutRequestDTO`, `CheckoutSessionDTO`,
`CustomerPortalSessionDTO`). Schema + contracts only, back-safe migration, **no runtime, no Stripe** —
it unblocks the EffectiveEntitlementService (62) and keeps public parity at 35/35.

**End of Feature 60 — Phase 5 payments + entitlements intake.**

---

## 15. Feature 61 — implementation note (schema + contracts groundwork, DONE)

**Status:** ✅ **Implemented.** Schema + contracts groundwork only — **no runtime, no Stripe, no
endpoints, no UI, no factory, no seed-data change.** Everything below is the additive,
back-safe groundwork §2/§6 specified; the runtime that consumes it is still Features 62+.

### Schema changes (`apps/api/prisma/schema.prisma`)

- **`Entitlement`** gained: `startsAt DateTime @default(now())`; `providerCustomerId String?`;
  `providerSubscriptionId String?`; `providerPurchaseId String? @unique` (the webhook idempotency
  anchor — Postgres allows many NULLs under a UNIQUE index, so the constraint only bites populated
  values); `revokedAt DateTime?`; `revokedReason String?`; `grantedByAdminId String?` (soft ref to
  `AdminUser.id`, **not** a DB FK). New indexes: `@@index([providerCustomerId])`,
  `@@index([providerSubscriptionId])`. The existing fields + `@@index([userId, status])` are
  unchanged. The old "STUB ONLY" header comment was updated.
- **`User`** gained `stripeCustomerId String? @unique` — one Stripe customer per user, resolvable in
  one indexed read; lives only on the row, never in a DTO.
- **`ProcessedWebhookEvent`** added exactly as §2.3: `id @id` (the provider event id, e.g. `evt_…`),
  `provider`, `type`, `processedAt @default(now())`. No Stripe-specific table, no billing-plan table,
  no refresh-token/passwordHash, no exact-coord exposure.

### Migration

- **`apps/api/prisma/migrations/20260630000000_phase5_entitlement_groundwork/migration.sql`** —
  one forward migration, history **not** reset, no existing migration deleted.
- **Back-safe:** every new column is nullable except `Entitlement.startsAt`, added
  `NOT NULL DEFAULT CURRENT_TIMESTAMP` so any pre-existing rows backfill to `now()`. Unlike the
  Feature-51 `updatedAt` case, the default is **kept** (not dropped) because `startsAt` maps to
  `@default(now())` in the datamodel — so schema-vs-history stays drift-free. `User.stripeCustomerId`
  is nullable (no backfill). The two new UNIQUE indexes are safe on existing data (all values NULL
  today; Postgres permits many NULLs under UNIQUE). No drop, no enum change, no data loss.
- Authored offline via `prisma migrate diff --from-schema-datamodel <pre-61> --to-schema-datamodel
  <current> --script` (the dev shell is non-interactive, so `migrate dev` can't run — same discipline
  as Feature 51 / `prisma-migrate-noninteractive`). The hand-authored SQL **equals** the Prisma-derived
  datamodel delta statement-for-statement.

### Contracts (`packages/contracts`)

- **`court.ts`:** added `ExactLocationSchema` / `ExactLocationDTO` (`{ courtId, slug, lat, lng,
  directionsUrl }`) — the **only** DTO that ever carries exact `lat`/`lng`, populated only by the
  future protected entitled path (§4.4). No select/mapper/endpoint added.
- **`billing.ts` (new file):** `BillingPlanKey` (`'lifetime' | 'subscription'`, shared enum);
  `EntitlementStatusSchema`/`DTO` (`{ membership, isEntitled, activeUntil: string|null, source:
  EntitlementSource|null }` — the public projection of `EffectiveEntitlement`, no row/provider ids);
  `BillingPlanSchema`/`DTO` (`{ plan, priceLabel, kind }`, no Stripe price id); `CheckoutRequestSchema`/`DTO`
  (`{ plan }`); `CheckoutSessionSchema`/`DTO` (`{ url }`); `CustomerPortalSessionSchema`/`DTO`
  (`{ url }`). No `CustomerPortalRequestDTO` (identity comes from the session — §6).
- **Enums unchanged.** `MembershipStatus` stays `free`/`lifetime` (no `subscriber` — open question #1
  left stable for MVP). Existing `EntitlementKind`/`Status`/`Source` reused as-is.
- **Existing `EntitlementSchema`/`EntitlementDTO` stub (`user.ts`) kept** (already exported and
  harmless — §6); `EntitlementStatusDTO` is the new effective-status projection, not a replacement.
- **Barrel:** `index.ts` now `export * from './billing'`; `court`/`user` already exported, so
  `ExactLocationDTO` and the reused enums flow through. No existing import broken. The API will import
  these `type`-only when it consumes them (the established rule); no zod contract enters the API runtime
  here.

### Seed

- **No change.** The seed never touches `Entitlement`/`User`/`ProcessedWebhookEvent`; it still writes
  only the public-discovery data (12 courts / 6 collections / 3 articles / 15 editorial memberships)
  and compiles against the regenerated client. No entitlements, no users, no Stripe data seeded.

### Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/api prisma:generate` | ✅ Client generated (v6.19.3) |
| `prisma validate` | ✅ Schema valid |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm --filter @tennis/api typecheck` | ✅ Clean (incl. `seed.ts`) |
| `pnpm --filter @tennis/api build` | ✅ Clean |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm typecheck` | ✅ 7/7 packages |
| `pnpm build` | ✅ 5/5; web emits the unchanged 17-route table — no route/UI drift |
| `migrate deploy` / `db:seed` / `verify:api-parity` / `verify:user-saved-http` / `verify:persisted-saved-flow` | ⏸ **Not run** — Postgres is not up in this shell (port 5432 closed, no docker). DB-free `migrate diff` confirms the authored SQL is the exact datamodel delta; the **public surface is untouched** (no court select/mapper/endpoint/public-DTO change), so parity has no reason to change and last passed **35/35**. |

### Confirmation

No `EntitlementService`/runtime, no `/v1/me` membership-derivation change, no exact-location endpoint,
no billing endpoints, no Stripe dependency, no webhook endpoint, no web/UI change, no factory change,
no seed entitlements, no public court mapper/select change, no exact `lat`/`lng` exposure, no admin,
no OAuth/password auth, no Prisma 7 / `prisma.config.ts` migration. The parity/auth harnesses are
untouched.

**Next:** Feature 62 — `EffectiveEntitlementService` + real `/v1/me` membership derivation (§3, §9).

---

## 16. Feature 62 — implementation note (EffectiveEntitlementService + `/v1/me` membership, DONE)

**Status:** ✅ **Implemented.** Runtime entitlement *derivation* only — **no Stripe, no billing
endpoints, no webhook, no exact-location endpoint, no UI, no schema/migration, no seed change.** The
hardcoded `membership: 'free'` is gone; `/v1/auth/verify` and `/v1/me` now derive real membership from
`Entitlement` rows via one service (§3). Public `/v1/courts*` is byte-untouched (parity **35/35**).

### What landed

- **New `entitlements` module** (`apps/api/src/entitlements/`):
  - `entitlements.types.ts` — the server-internal `EffectiveEntitlement`
    (`{ isEntitled, membership, reason, source, activeUntil }`, §3.1) + a `NOT_ENTITLED` constant. NOT
    a wire DTO; it is a strict superset of `EntitlementStatusDTO` (it adds `reason`). Enum imports are
    `type`-only ([[api-contracts-type-only-import]]).
  - `entitlements.service.ts` — `EntitlementsService.getEffectiveEntitlement(userId)` +
    `isEntitled(userId)` (the thin wrapper the future exact-location gate reads). **The one place the
    rule lives** (§3, §3.4 — no scattered `status === 'active'` checks).
  - `entitlements.module.ts` — provides + **exports** the service; no controller (no
    `/v1/entitlements/*` endpoint). Depends only on the global `PrismaService`.

### Effective rule (exactly §3.2)

A row is **effective** when `status === 'active'` **AND** `startsAt <= now` **AND**
(`expiresAt === null` **OR** `expiresAt > now`). A user is **entitled** iff **any** row is effective.
When several are effective, the "strongest" is picked **deterministically** for `reason`/`source`/
`activeUntil`: **non-expiring** (`expiresAt === null`) beats expiring → among expiring the **latest
`expiresAt`** → final tie-break on `id` (so the winner never depends on DB row order). `membership`
maps `entitled → 'lifetime'`, else `'free'` (a `kind=subscription` row still surfaces as `'lifetime'`
for the badge — no `'subscriber'` member; open question #1 left stable). One indexed read
(`@@index([userId, status])`); the time window is filtered in code against a single `now`. The
service selects only `id/kind/source/startsAt/expiresAt` — **never** the provider/audit columns, so
the result structurally cannot carry a `cus_`/`sub_`/`pi_` id.

### Mapper + call-site changes

- `apps/api/src/auth/user-profile.mapper.ts` — `toUserProfileDTO(user, membership = 'free')` now takes
  membership as an argument (default `'free'` only for a context-free caller). **No shape change** —
  the DTO is still exactly `{ id, name, initials, membership }`, no `email`.
- `apps/api/src/auth/auth.service.ts` — `issueSession` is now `async`; it calls
  `entitlements.getEffectiveEntitlement(userId)` and passes the derived membership into the mapper, so
  **`POST /v1/auth/verify`** returns the real `AuthSessionDTO.user.membership`. `AuthModule` imports
  `EntitlementsModule` (one-directional Auth → Entitlements → Prisma, no cycle).
- `apps/api/src/me/me.service.ts` — both **`GET /v1/me`** and **`PATCH /v1/me`** derive membership via
  the service and pass it to the mapper (so PATCH-after-name-edit and GET agree). `MeModule` imports
  `EntitlementsModule`.

### Verification — `apps/api/scripts/verify-effective-entitlement.ts` (new)

Seeds `Entitlement` rows directly with Prisma (no Stripe — the §8 CI strategy), mints a real bearer
token through the production `/v1/auth/verify` path (same technique as `ci-issue-token.ts`), then
asserts both the verify-response membership AND `GET /v1/me` membership per scenario, that they
**agree**, and that no response leaks `email`/exact coords/provider ids. Self-cleaning (namespaced
`f62-…@tennis.test` identities deleted at start and end). Registered as
`pnpm --filter @tennis/api verify:effective-entitlement`.

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/api prisma:generate` | ✅ Client generated (v6.19.3) |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm --filter @tennis/api typecheck` | ✅ Clean |
| `pnpm --filter @tennis/api build` | ✅ Clean |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm typecheck` | ✅ 7/7 packages |
| `pnpm build` | ✅ 5/5; web emits the unchanged 17-route table — no route/UI drift |
| `migrate deploy` + `db:seed` (live Postgres via `docker compose up`) | ✅ Phase-5 migration applied; seed = 12 courts / 6 collections / 15 memberships / 3 articles |
| `verify:effective-entitlement` | ✅ **111/111** — all 10 scenarios (no-entitlement→free; lifetime-no-expiry→lifetime; future-start→free; expired→free; revoked/refunded/expired-status→free; active-subscription→lifetime; non-expiring-wins; latest-expiry-wins) + every privacy invariant |
| `pnpm verify:api-parity` | ✅ **35/35** — public surface byte-unchanged |
| `pnpm verify:api-auth` (`verify:user-saved-http` + `verify:persisted-saved-flow`) | ✅ **17/17** + **21/21** — the no-entitlement CI user still reads `membership: 'free'`; saved/user behavior unchanged |

The `/v1/me`/verify response for a user with **no** entitlement rows (every real user today) is
**byte-identical** to before — only entitled (seeded/future-paid) users now flip to `'lifetime'`.

### Confirmation

No Prisma schema change, no new migration, no Stripe dependency, no billing endpoints, no webhook
endpoint, no exact-location endpoint, no `/v1/entitlements/*` endpoint, no public court select/mapper
change, no exact `lat`/`lng` exposure, no UI change, no admin, no OAuth/password auth, no Prisma 7 /
`prisma.config.ts` migration. The parity/auth harnesses are **not weakened** (both still pass with the
same assertions). `MembershipStatus` stays `free`/`lifetime`.

**Next:** Feature 63 — protected `GET /v1/me/courts/:slug/exact-location` (§4): private exact select,
401/403/404 separation, `ExactLocationDTO` + `directionsUrl`, masking-regression harness. It is the
first consumer of `EntitlementsService.isEntitled()` (already shipped here).

---

## 17. Feature 63 — implementation note (protected exact-location endpoint, DONE)

**Status:** ✅ **Implemented.** The first exact-coordinate unlock surface —
`GET /v1/me/courts/:slug/exact-location` (§4) — guarded, entitlement-gated, returning the only
coord-bearing DTO. **No Stripe, no billing/webhook endpoints, no UI, no Prisma schema/migration, no
seed change, no public court select/mapper widening.** Public `/v1/courts*` stays byte-untouched
(parity **35/35**). This is the first runtime consumer of `EntitlementsService.isEntitled()` (Feature 62).

### Endpoint added

`GET /v1/me/courts/:slug/exact-location` → **200** `ExactLocationDTO`
(`{ courtId, slug, lat, lng, directionsUrl }`). Lives in the **Me module** (under `me/*`, alongside
profile + saved-courts + collections) — class-level `@UseGuards(AuthGuard)`, identity from
`@CurrentUser()`. It is a Me-scoped sibling of the public `/v1/courts/:slug` (which remains masked).
The route registers cleanly next to the existing `GET /v1/me/courts/:courtId/collection-ids` — same
`me/courts/:param/…` family, **distinct static suffix** (`exact-location` vs `collection-ids`), so no
route collision.

### 401 / 403 / 404 / 200 semantics (intake §4.5)

| Situation | Status | Where |
| --- | --- | --- |
| No/invalid/expired session | **401** | `AuthGuard`, before the handler |
| Real (published) court, **not entitled** | **403** `ForbiddenException` | service, after `isEntitled` is false |
| Unknown/unpublished slug | **404** `NotFoundException` | service — **existence checked FIRST** |
| Entitled + published court | **200** `ExactLocationDTO` | service |

**Order is existence (404) → entitlement (403)** (intake §4.5): a missing court is **404 even for an
entitled user**, and a non-entitled user gets **404 for an unknown slug, 403 for a real one**. This
leaks nothing new — court existence is *already fully public* via `/v1/courts/:slug` — and a clean 404
is friendlier than a misleading 403.

### Exact select kept separate (masking safety, intake §4.6)

A new **private** `courtExactLocationSelect` (`apps/api/src/courts/courts.mapper.ts`) selects only
`id/slug/status/lat/lng` and is used **exclusively** by this handler. It deliberately does **not**
spread `courtSummarySelect`, so the public selects can never inherit coords and this select can never
widen the public surface. `courtSummarySelect` / `courtDetailSelect` / `mapPinSelect` are
**untouched**; their `Prisma.CourtGetPayload` row types remain structurally incapable of carrying
`lat`/`lng`. `toCourtDTO` still omits exact coords — `/v1/courts/:slug` does **not** carry them.
`CourtDTO` is unchanged; exact coords ride only the `ExactLocationDTO` from this path. The
saved/collection court DTOs keep `courtSummarySelect` (no coords).

### directionsUrl (server-built, no external call, intake §4.4)

Built in the new `toExactLocationDTO` mapper from the exact coords:
`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`. No external API call, no map-provider
dependency — a plain deep link assembled server-side so the masking boundary stays server-owned.

### Contracts

Uses the existing `ExactLocationDTO` from `packages/contracts/src/court.ts` (Feature 61) **as-is** —
no contract change. No provider/payment contracts added.

### Verification — `apps/api/scripts/verify-exact-location.ts` (new)

Seeds an active non-expiring `Entitlement` directly with Prisma (no Stripe — the §8 CI strategy),
mints real bearer tokens through the production `/v1/auth/verify` path (same technique as
`verify-effective-entitlement.ts` / `ci-issue-token.ts`), and drives the live endpoint. Self-cleaning
(namespaced `f63-…@tennis.test` identities deleted at start and end). Registered as
`pnpm --filter @tennis/api verify:exact-location` (no CI promotion yet — that is Feature 64/68 per §9).

| Scenario | Result |
| --- | --- |
| no auth + real slug → **401** | ✅ |
| authed, no entitlement, real slug → **403** (and 403 body carries no lat/lng) | ✅ |
| authed, entitled, real slug → **200** + body is exactly `{courtId,directionsUrl,lat,lng,slug}` | ✅ |
| 200 `lat`/`lng` are numbers, **EQUAL** the court's real exact coords, **DIFFER** from public approx | ✅ |
| 200 `directionsUrl` = the server-built Google Maps deep link; `courtId`/`slug` match the fixture | ✅ |
| 200 body carries **no** provider-id keys or `cus_/sub_/pi_/cs_` values | ✅ |
| authed, entitled, unknown slug → **404** | ✅ |
| authed, no entitlement, unknown slug → **404** (existence checked first, not 403) | ✅ |
| public masking regression: `/v1/courts/:slug`, `/v1/courts`, `/v1/courts/map`, `/v1/courts/:slug/related` carry no `lat`/`lng` | ✅ |

### Commands run

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/api prisma:generate` | ✅ Client generated (v6.19.3) |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm --filter @tennis/api typecheck` | ✅ Clean |
| `pnpm --filter @tennis/api build` | ✅ Clean |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm typecheck` | ✅ 7/7 |
| `pnpm build` | ✅ 5/5; web emits the unchanged 17-route table — no route/UI drift |
| `migrate deploy` + `db:seed` (live Postgres) | ✅ No pending migrations (4 found); seed = 12 courts / 6 collections / 15 memberships / 3 articles |
| `verify:exact-location` | ✅ **18/18** (the full 401/403/404/200 matrix + exact-vs-approx + directionsUrl + no-provider-leak + public-masking regression) |
| `verify:effective-entitlement` | ✅ **111/111** — unchanged |
| `verify:api-parity` | ✅ **35/35** — public surface byte-unchanged |
| `verify:api-auth` (`verify:user-saved-http` + `verify:persisted-saved-flow`) | ✅ **17/17** + **21/21** — saved/user behavior unchanged |

### Confirmation

No Prisma schema change, no new migration, no Stripe dependency, no billing endpoints, no webhook
endpoint, no `/v1/entitlements/*` endpoint, no public court select/mapper widening, no exact
`lat`/`lng` on `/v1/courts*`, no saved/collection court DTO change, no UI change, no admin, no
OAuth/password auth, no Prisma 7 / `prisma.config.ts` migration. The parity/auth/effective-entitlement
harnesses are **not weakened** (all still pass with the same assertions).

**Next:** Feature 64 — WEB entitlement + exact-location wiring (consume this endpoint from the court
detail UI; no Stripe) — see §18. Stripe checkout-session creation (`POST /v1/billing/checkout-session`,
§5.2) and CI promotion of the seeded-entitlement checks (§9) move to a later Phase-5 feature.

---

## 18. Feature 64 — implementation note (web entitlement + exact-location wiring, DONE)

**Status:** ✅ **Implemented.** The WEB court-detail UI now derives its locked/unlocked state from the
REAL protected exact-location unlock (Feature 63's `GET /v1/me/courts/:slug/exact-location`) and wires
"Get Directions" to the server-built `directionsUrl` for an entitled viewer. **No Stripe, no checkout,
no billing endpoints, no webhook, no API endpoint change, no Prisma schema/migration/seed change, no
public court select/mapper widening.** Public `/v1/courts*` stays byte-untouched (parity **35/35**).

### Repository method added (web domain)

`CourtRepository.getExactLocation(slug): Promise<ExactLocationDTO | null>` — the ONLY web court method
that ever yields exact `lat`/`lng`; `getBySlug`/`list`/`getMapPins`/`getRelated` stay coord-free.

- **`HttpCourtRepository.getExactLocation`** → `GET /v1/me/courts/:slug/exact-location` carrying the
  caller's `HttpAuthOptions` (a new optional constructor arg, `{}` by default — public reads ignore it).
  Every "not unlocked" outcome collapses to `null`: **401** (`AuthRequiredError` — logged out), **403**
  (`HttpError.status===403` — authed, not entitled), **404** (`allowNull` — unknown/unpublished slug).
  Any OTHER error propagates (a real fault must not masquerade as "locked"). One `null` return ⇔ locked
  keeps the page's check a single `exactLocation !== null`.
- **`MockCourtRepository.getExactLocation`** → returns `null`. Mock mode has no auth/entitlement seam
  (`DEFAULT_MOCK_USER` is "free"), so locked courts stay locked exactly as before; it never surfaces the
  mock court's exact coords and never requires auth.
- **Factory** (`src/domain/index.ts`): in `api` mode `courts` now receives the same `auth` transport as
  saved/user, SOLELY for `getExactLocation`. With no auth (the bare public singleton) the protected read
  simply resolves to `null` — a public court page never crashes.

### Court detail page — locked/unlocked derivation

`apps/web/src/app/courts/[slug]/page.tsx` (public server component) now, AFTER the public court read:
attempts `protectedRepos.courts.getExactLocation(court.slug)` **only when `court.isLocked`** (an unlocked
court has nothing to unlock — no protected call is made). It uses `getRepositoriesForRequest()` so the
incoming session cookie is forwarded in `api` mode. `unlocked = exactLocation !== null`;
`locked = court.isLocked && !unlocked`. `exactLocation?.directionsUrl ?? null` flows to both section
components. The endpoint (NOT `UserProfileDTO.membership`) is the source of truth, so the page adds **no**
extra `/v1/me` call. Court EXISTENCE is still settled by the public `getBySlug` (unchanged `notFound()`).

### Directions CTA behavior

`CourtDetailCtaPanel` + `CourtDetailLocationPreview` take a new `directionsUrl: string | null`. Unlocked
branch: when `directionsUrl` is set → a REAL `<a href={directionsUrl} target="_blank" rel="noopener
noreferrer">` (the server-built Google Maps deep link); when `null` (mock mode, or an unlocked court
with no exact-location fetch) → the prior inert `href="#"` placeholder (nothing regresses). The raw
exact coords never reach a component — only the opaque URL, and only in an href.

### Logged-out / non-entitled / entitled behavior (api mode)

- **Logged out** → protected read 401 → repo `null` → `locked` → paywall/sign-in CTA. The public page
  renders 200 and NEVER redirects (only private routes redirect, via `loadOrSignIn`, untouched here).
- **Logged in, not entitled** → 403 → repo `null` → `locked` → paywall CTA.
- **Logged in, entitled** → 200 → repo returns the DTO → `unlocked` → "Get Directions" = real link.

### Mock behavior

Unchanged. `getExactLocation` returns `null`, so locked courts keep the paywall and unlocked courts keep
the inert "Get Directions" placeholder — no auth required, `pnpm build` unaffected (still 17 routes;
`/courts/[slug]` stays a dynamic `ƒ` route).

### Verification — `apps/web/scripts/verify-web-exact-location.ts` (new)

Drives the REAL `getRepositories('api', auth).courts.getExactLocation(...)` (the same factory entry
`lib/repositories.server.ts` uses) — no Prisma import (the web package can't resolve `@prisma/client`),
so entitlement SEEDING stays the API harness's job and the 403/200 paths are token-gated (operator
supplies `FREE_BEARER_TOKEN` / `ENTITLED_BEARER_TOKEN` via the magic-link flow + a directly-seeded
Entitlement, exactly as `verify-exact-location.ts` documents). Registered as
`pnpm --filter @tennis/web verify:web-exact-location`.

| Scenario | Result |
| --- | --- |
| logged-out `getExactLocation` → **null** (401 degraded, no throw) | ✅ |
| unknown-slug `getExactLocation` → **null** (404 degraded, no throw) | ✅ |
| non-entitled `getExactLocation` → **null** (403 degraded, no throw) | ✅ |
| entitled `getExactLocation` → non-null `ExactLocationDTO` (exactly `{courtId,directionsUrl,lat,lng,slug}`) | ✅ |
| entitled DTO `directionsUrl` is the Google Maps dir deep link and encodes the DTO coords | ✅ |
| public `getBySlug`/`list`/`getMapPins`/`getRelated`: **no** exact `lat`/`lng` keys (web-side masking) | ✅ |

### Commands run

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/api prisma:generate` | ✅ Client generated (v6.19.3) |
| `pnpm --filter @tennis/api lint` / `typecheck` / `build` | ✅ Clean |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm typecheck` | ✅ 7/7 |
| `pnpm build` | ✅ 5/5; web emits the unchanged 17-route table (`/courts/[slug]` dynamic) |
| `migrate deploy` + `db:seed` (live Postgres) | ✅ No pending migrations (4 found); seed = 12 courts / 6 collections / 15 memberships / 3 articles |
| `verify:web-exact-location` (both tokens) | ✅ **14/14**, 0 skipped |
| `verify:exact-location` | ✅ **18/18** — endpoint unchanged |
| `verify:effective-entitlement` | ✅ **111/111** — unchanged |
| `verify:api-parity` | ✅ **35/35** — public surface byte-unchanged |
| `verify:api-auth` (`verify:user-saved-http` + `verify:persisted-saved-flow`, authed) | ✅ **17/17** + **21/21** — saved/user behavior unchanged |

> Note: the two `verify:api-auth` tsx scripts print all PASS lines and the VERIFICATION-PASSED summary,
> then a benign Node-on-Windows libuv teardown assertion (`UV_HANDLE_CLOSING`) fires on process exit —
> a pre-existing environment quirk, not a test failure and not touched by this feature. Run them
> individually (not the `&&` chain) to read a clean exit.

### Confirmation

No Prisma schema change, no migration, no Stripe dependency, no billing/checkout/webhook endpoint, no
API endpoint change, no public court select/mapper widening, no exact `lat`/`lng` on `/v1/courts*` (nor
in any web public court read), no admin, no OAuth/password auth, no Prisma 7 / `prisma.config.ts`
migration, no Playwright. The paywall modal checkout stays a disabled placeholder. The parity / auth /
effective-entitlement / exact-location harnesses are **not weakened** (all still pass, same assertions).

**Next:** Feature 65 — Stripe checkout-session creation (`POST /v1/billing/checkout-session`, §5.2) +
the web paywall's real checkout entry point, or promote the seeded-entitlement + exact-location + web
wiring checks into the CI gate (§9).

---

## 19. Feature 69 — implementation note (billing rate limiting, DONE)

**Status:** ✅ **Implemented.** The remaining Phase-5 security-baseline item (§10, open question #6):
a **lightweight, per-user, in-memory** rate limiter on the two billing endpoints. **No Stripe change,
no schema/migration, no web UI change, no new dependency, no Redis, no public/auth/webhook change.** It
resolves §10's "Rate limiting (checkout)" row and open question #6.

### What landed (API only, isolated to `apps/api/src/billing/`)

- **`billing-rate-limit.service.ts` (new)** — `BillingRateLimitService`, a dependency-free in-memory
  **fixed-window** counter. `hit(userId, action)` opens/increments a per-`${userId}:${action}` window
  and returns `{ allowed, limit, remaining, retryAfterSeconds }`. Expired windows are pruned lazily on
  access (plus an amortized sweep past a 10k-key threshold) so the map can't grow unbounded. Injectable
  `now` for deterministic tests. The interface is shaped so a Redis-backed impl can drop in behind the
  same `hit()` without touching the guard/controller.
- **`billing-rate-limit.guard.ts` (new)** — `BillingRateLimitGuard`, applied **per method** on the
  controller as `@UseGuards(AuthGuard, BillingRateLimitGuard)` so **AuthGuard runs FIRST** (a 401 is
  never masked by a 429, and a real `userId` is always present). It reads `req.auth.userId`, derives the
  action from the handler name (`createCheckout → 'checkout'`, `createPortal → 'portal'`), calls `hit()`,
  and on `allowed=false` sets a `Retry-After` header and throws **429** with the safe message
  `"Too many billing requests. Please try again later."` — no counters/user id/window internals leak.
  If `req.auth` were ever absent it fails **closed** (401), never keying on an anonymous bucket.
- **`billing.controller.ts`** — the two methods each gained `@UseGuards(AuthGuard, BillingRateLimitGuard)`
  (kept the class-level `@UseGuards(AuthGuard)` too). Per-method (not class-level) so it is unmistakable
  that ONLY checkout + portal are limited.
- **`billing.module.ts`** — provides `BillingRateLimitService` + `BillingRateLimitGuard`. **No `APP_GUARD`,
  no global guard** — nothing outside the two routes is touched.
- **`billing.config.ts`** — `BillingConfig` gained a `rateLimit: { windowSeconds, checkoutMax, portalMax }`
  block, derived from env via a `positiveIntEnv` parser (a missing/non-numeric/non-positive value falls
  back to the default — a misconfig can never *disable* the limiter or crash boot). Independent of the
  Stripe gates (the limiter runs even with no Stripe env).

### Limits + configuration (intake §10 defaults)

| Action | Route | Default | Env override |
| --- | --- | --- | --- |
| checkout | `POST /v1/billing/checkout` | **5 / 10 min** | `BILLING_CHECKOUT_RATE_LIMIT_MAX` |
| portal | `POST /v1/billing/portal` | **10 / 10 min** | `BILLING_PORTAL_RATE_LIMIT_MAX` |
| window (both) | — | **600 s** | `BILLING_RATE_LIMIT_WINDOW_SECONDS` |

**Per-user, per-action:** the key is `userId + action`, so (a) one user cannot exhaust another's budget,
and (b) checkout and portal have **independent** budgets. All three env vars are optional and documented
(commented) in `apps/api/.env.example`.

### 429 behavior (task 3)

Over budget → **429 Too Many Requests**, body `{ "message": "Too many billing requests. Please try
again later.", ... }` (safe, no internal detail), and a `Retry-After: <whole seconds until reset>`
header. A limited request still consumes budget (standard fixed-window semantics — hammering while
limited isn't "free").

### MVP limitation + future (task 7 / §10)

The counters live in **this process's memory**, so the limit is **per API instance**. On a
single-instance dev/MVP deployment that IS the real per-user limit; behind N instances a user gets up to
N× the limit until a **shared store (Redis)** backs it. The service is deliberately shaped so a
Redis-backed `hit()` drops in with no guard/controller change — the recommended multi-instance
production hardening.

### Verification — `apps/api/scripts/verify-billing-rate-limit.ts` (new)

`pnpm --filter @tennis/api verify:billing-rate-limit`. **Stripe-INDEPENDENT** (the limiter runs before
the billing service, so it needs no Stripe env — it asserts the STATUS DISTINCTION: "under limit" = NOT
429 i.e. it reaches the service; "over limit" = 429). Deterministic + self-cleaning: every user is
uniquely namespaced **per run** (`f69-<runId>-…@tennis.test`) so its in-memory counter always starts
empty even on a re-run within the long window; it reads the configured limits from the shared env
(defaulting to 5/10) and sends exactly `limit` allowed requests then one more. Fixtures deleted at start
+ end + on crash.

| Scenario | Result |
| --- | --- |
| no-auth checkout/portal → **401** (auth before limiter, never 429) | ✅ |
| first `checkoutMax` checkouts NOT limited (reach billing service) | ✅ |
| checkout #(max+1) → **429** + safe message (no digits/counters) + positive `Retry-After` | ✅ |
| portal budget **independent** of checkout (same user) — first `portalMax` not limited, then 429 | ✅ |
| a **different** user's first checkout NOT limited (independent counters) | ✅ |
| the Stripe **webhook** never 429s (not rate-limited by this limiter) | ✅ |
| public **`/v1/courts`** never 429s (limiter is billing-only) | ✅ |

### Commands run

| Command | Result |
| --- | --- |
| `pnpm --filter @tennis/api lint` | ✅ Clean |
| `pnpm --filter @tennis/api typecheck` | ✅ Clean |
| `pnpm --filter @tennis/api build` | ✅ Clean |
| `pnpm --filter @tennis/web lint` | ✅ No ESLint warnings or errors |
| `pnpm typecheck` | ✅ 7/7 packages |
| `pnpm build` | ✅ 5/5; web emits the unchanged 18-route table — no route/UI drift |
| `migrate deploy` + `db:seed` (live Postgres) | ✅ No pending migrations (4); seed = 12 courts / 6 collections / 15 memberships / 3 articles |
| `verify:billing-rate-limit` (low limits 3/4 AND default 5/10, both re-run) | ✅ **11/11** each — deterministic across re-runs within one window |
| `verify:billing-checkout` / `verify:stripe-webhook` / `verify:stripe-e2e` | ✅ **skip cleanly (exit 0)** with no Stripe env — unchanged |
| `verify:effective-entitlement` | ✅ **111/111** — unchanged |
| `verify:exact-location` | ✅ **18/18** — unchanged |
| `verify:api-parity` | ✅ **35/35** — public surface byte-unchanged |
| `verify:api-auth` (`user-saved-http` + `persisted-saved-flow`) | ✅ **17/17** + **3/3** — saved/user behavior unchanged |
| `verify:web-billing` (both tokens) | ✅ **9/9** (1 real-Stripe-URL check skipped, no Stripe) |
| `verify:web-exact-location` (both tokens) | ✅ **14/14**, 0 skipped |

> The two `verify:api-auth` scripts print all PASS lines + the summary, then the pre-existing benign
> Node-on-Windows libuv teardown assertion (`UV_HANDLE_CLOSING`) fires on exit — an environment quirk,
> not a test failure, unrelated to this feature.

### Confirmation

No Prisma schema change, no migration, no Stripe dependency (no `@nestjs/throttler`, no Redis, no new
dep at all), no web UI change, **no webhook rate limiting**, no public-endpoint behavior change, no
Stripe.js/client secret, no provider ids in DTOs, no admin, no OAuth/password auth, no Prisma 7 /
`prisma.config.ts` migration. The billing/checkout/webhook/parity/auth/effective-entitlement/
exact-location harnesses are **not weakened** (all still pass, same assertions). Required CI stays
Stripe-free — the new harness is Stripe-independent and can join the required gate.

**Next:** promote `verify:billing-rate-limit` into the required CI gate (it's Stripe-free and
deterministic), and/or a distributed (Redis) limiter for multi-instance production; then the
`PHASE_5_COMPLETION_SUMMARY.md` (§9 Feature 69 slot) and refreshing
`PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (paywall/restore/directions no longer inert).

---

## 20. Feature 70 — Phase 5 completion summary + final audit (DONE)

**Status:** ✅ **Phase 5 closed.** Docs/audit only — no product/schema/runtime/CI-behavior change.
Feature 70 wrote **`PHASE_5_COMPLETION_SUMMARY.md`** (the as-built handoff: executive summary, feature
table 60–69, final architecture, entitlement model + lifecycle, the effective rule, coordinate masking
+ exact-location gating, checkout/portal flow, webhook flow + idempotency, web UX, rate limiting, the
verification matrix, CI behavior, env vars, security notes, deferred work, and next phases), added the
pointer above, and refreshed `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` for Features 64/67 (directions CTAs no
longer inert for entitled viewers). A **no-code final audit** re-read the source and confirmed every
Phase-5 invariant against the running system.

**Audit re-run (live API + Postgres, this feature):** `verify:api-parity` **35/35**,
`verify:effective-entitlement` **111/111**, `verify:exact-location` **18/18**,
`verify:web-exact-location` **14/14**, `verify:billing-rate-limit` **11/11**, `verify:web-billing`
**9/9** (1 real-Stripe URL check skipped), `verify:api-auth` **17/17 + 21/21**;
`verify:billing-checkout` / `verify:stripe-webhook` / `verify:stripe-e2e` **skip cleanly (exit 0)**
with no Stripe env. `pnpm lint` clean, `pnpm typecheck` 7/7, `pnpm build` 5/5. All verification
fixtures cleaned; DB ends at 0 users / 0 entitlements / 12 courts (seed intact).

**End of Feature 60 doc — see `PHASE_5_COMPLETION_SUMMARY.md` for the Phase-5 handoff.**
