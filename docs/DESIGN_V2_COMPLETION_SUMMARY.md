# Design V2 — Completion Summary & Handoff

**Status:** ✅ **Design V2 complete (Features 72–84, 87).** The mobile prototype
(`new design/tennis_world_v2_standalone.html`) has been ported to the real app as a
**presentation-layer redesign plus two additive data seams** (`tags`, reviews). Every screen
in the prototype except the **Map** now ships in its redesigned form. Auth, entitlements, the
exact-location gate, Stripe checkout/portal/webhook, the repository seam and mock/api parity
are **unchanged** — verified, not assumed (§6, §7).
**Deliberately NOT shipped:** Features **85/86** (Map screen chrome + pin-tap bottom sheet)
and the Home **map-preview band**, both blocked on a Leaflet → Google Maps + Snazzy Maps
migration (§8).
**Date:** 2026-09-09.
**Audience:** whoever picks up the Map migration, builds reviews display/moderation, or
touches any redesigned screen. This records the *as-built* state, the decisions and why, the
deliberate deferrals, and the known caveats.
**Companions:** `FEATURE_71_DESIGN_V2_INTAKE.md` (the intake/plan; §8 holds the binding
decisions table), `TASK_03`–`TASK_15_*.md` (per-feature briefs), `PHASE_5_COMPLETION_SUMMARY.md`
(as-built state through Feature 70), `MAP_PROVIDER_DECISION.md`, `PHASE_1_PLACEHOLDER_CTA_AUDIT.md`
(the living inert-control inventory, refreshed by Feature 87), `../CLAUDE.md` (the standing
rulebook, updated in this same change).

---

## 1. Executive summary

The redesign changed how the app *looks* without changing what it *does*:

- **One shared filter surface.** `components/filters` (`FilterSheet` + `court-filter-state`)
  replaced the ad-hoc per-screen filter UI. It is screen-agnostic and fetch-free — the state
  lives in whichever client boundary owns the screen, the data still comes from that screen's
  own server page. Home and Map consume the same component.
- **A closed tag vocabulary.** `Court.tags` (ten authored values, §4) closes the gap the
  prototype's `labels[]` array papered over. Surface / access / indoor-outdoor / scenic keep
  their existing fields and are rendered from those, never duplicated as tags.
- **Reviews are collection-only.** A `Review` model, an authenticated `POST /v1/reviews`, a
  web seam and a "Played here?" card exist. **Nothing displays a rating, an average or a
  review count anywhere in the app** — verified by sweep and click-through (§7).
- **Five mobile tabs.** `TAB_NAV` gained Collections and dropped Journal; `PRIMARY_NAV`
  (desktop) is untouched, so Journal stays a desktop nav destination and a Home section.
- **A new nested route.** `/profile/settings`, with the shared `BackButton` and
  `fallbackHref="/profile"`.
- **Invariants held.** Exact coordinates still leave the database through exactly one
  protected endpoint; no Stripe secret exists under `apps/web`; `/billing/return` still polls
  6 × 2000 ms and no UI path marks a user premium; only `src/domain/**` imports
  `mock-*`/`http-*`. All cited in §6.

Net product-code footprint: two new API modules (`countries`, `reviews`), one new web route
(`/profile/settings`), three new web seams (`components/filters`, `domain/countries`,
`domain/reviews`), two Prisma migrations (tags, Review), and the redesigned screen components.
No auth, billing, entitlement or routing behavior changed.

---

## 2. Feature table (72–84, 87)

| Feature | Delivered |
| --- | --- |
| **72** | **`tags` data groundwork.** Prisma migration, `CourtSummarySchema`/`CourtDTO` field, API select/mapper/filter param, mock-data authoring, importer extended. Closed ten-value vocabulary (§4). No UI change. |
| **73** | **Shared `FilterSheet` + tag-driven chips.** New `components/filters` (`FilterSheet.tsx`, `court-filter-state.ts`). Pure presentation + client filter logic; no new endpoint. Consumed by Map, then Home. |
| **74** | **Home redesign.** Hero, search + inline results, icon shortcuts wired to the tag vocabulary, featured-courts carousel, collections teaser, journal list. `HomeEditorsCut` and `HomePaywallBand` **kept** and restyled (intake §8 Q1). Map-preview band deferred (§8). |
| **75** | **Country aggregate endpoint.** Additive `GET /v1/countries` + `countries` module + contract DTO. No schema change (Country/Region already existed). |
| **76** | **Collections redesign.** Featured strip, By-Country strip (consumes F75), curated list restyle. |
| **77** | **Saved redesign.** Tab pills, full-bleed court cards, collections grid, Dream List CTA. The third **Wishlist Map** tab was **kept** (intake §8 Q2). |
| **78** | **Court Detail (unlocked).** Hero gallery, tag-chip strip, description clamp, location box, gallery strip, nearby-courts strip (client-side distance), CTA panel restructure. Logic unchanged. |
| **79** | **Court Detail (locked) + paywall copy.** Locked-branch restructure; the stale `$29` / "one-time" / "lifetime offer" strings replaced with plan-neutral copy. **No entitlement/gate logic change.** |
| **80** | **Review submission.** `Review` model + migration, `packages/contracts/src/review.ts`, `apps/api/src/reviews/` (authenticated `POST /v1/reviews`, rate-limited), `domain/reviews/` seam, `CourtDetailReviewCard` + `ReviewModal`. **No display.** |
| **81** | **Profile redesign.** Avatar + edit trigger, stats strip, membership card, my-collections strip. Email is **read-only** in the edit modal (intake §8 Q4). |
| **82** | **Settings (new route).** `/profile/settings` with `BackButton fallbackHref="/profile"`, composing the existing `ManageBillingButton`, profile-edit and contact. "Account settings" points at the same edit-profile capability (intake §8 Q5). |
| **83** | **Billing return redesign.** The prototype's success/failed visuals grafted onto the existing six-state machine. Polling and the `?status=cancelled` branch preserved. |
| **84** | **Bottom nav → 5 tabs.** `TAB_NAV` gains Collections, drops Journal. `PRIMARY_NAV`/desktop untouched. |
| **87** | **Final QA + docs (this pass).** Full harness suite with every skip resolved, three-identity click-through at mobile and desktop widths, leftover sweep, invariant re-verification, this document, and the `CLAUDE.md` / CTA-audit updates. One bug found and fixed (§9). |

Features **85** and **86** (Map) are **not** in this table — see §8.

---

## 3. As-built architecture of the new shared pieces

### 3.1 `apps/web/src/components/filters` — the filter seam

```txt
components/filters/
  FilterSheet.tsx          the bottom-sheet UI (modal open/close = local UI state only)
  court-filter-state.ts    the vocabulary + pure predicate/query helpers
  index.ts                 barrel
```

Deliberately **feature-agnostic**: nothing here imports a screen module and nothing here
fetches. The filter *state* lives in the client boundary that owns the screen (e.g.
`features/map/MapExplorer.tsx`); the data still comes from that screen's own server page.
`court-filter-state.ts` exports pure helpers (`matchesCourtFilterState`, `matchesCourtQuery`,
`narrowCourts`, `toCourtQuery`, `toggleFilterValue`, `countActiveFilters`, …), which is what
lets Home and Map share one implementation instead of each growing its own.

Four groups ship: **Experience** (the ten tags), **Surface**, **Access**, **Setting**.
Per CLAUDE.md §4 rule 10 the sheet's open/close and the chip toggles carry **no** pending
primitive — they are local UI state, not navigation or mutation.

**"Show results" is really wired.** The prototype's version was a documented no-op
(intake §4); here it applies the selected filters and closes the sheet. Verified by
click-through: selecting *Mountains* narrows the Home featured list to the Mountains courts.

### 3.2 The countries seam

```txt
apps/api/src/countries/      controller (@Controller('countries')) + service + mapper + module
packages/contracts/          the country aggregate DTO
apps/web/src/domain/countries/   country.repository.ts + mock-country.repository.ts
apps/web/src/domain/http/http-country.repository.ts
```

A small **additive read** backing the Collections "By Country" strip. No schema change —
`Country`/`Region` already existed; this aggregates over them. It follows the same
interface + mock + http shape as every other domain, so `mock` and `api` modes stay at parity.

### 3.3 The reviews seam

```txt
apps/api/src/reviews/            controller/dto/mapper/module/service, mirroring consultations
packages/contracts/src/review.ts submit schema + record schema
apps/web/src/domain/reviews/     review.repository.ts + mock + http
apps/web/src/features/court-detail/  CourtDetailReviewCard.tsx, ReviewModal.tsx, review-copy.ts
```

Modelled on the existing `consultations` module rather than inventing a parallel shape.
`POST /v1/reviews` is guarded by `@UseGuards(AuthGuard, ReviewsRateLimitGuard)` — the same
`AuthGuard` `me` and `billing` use, plus the billing limiter's shape reused for an
authenticated write a bored user could hammer. `Review.userId` is **nullable** at the schema
level (mirroring `ConsultationRequest`) while submission still **requires sign-in**, so
anonymous review stays possible later without a migration (intake §8 Q7).

**The write path is real and the read path does not exist.** The card appears on the
**unlocked** branch only — a viewer who cannot be told where the court is has not played
there. The modal collects a 1–5 rating as a proper `radiogroup` (arrow-key navigable,
per-option accessible names) because collecting is the point; it renders no aggregate. The
confirmation says so honestly: *"Your review has been recorded. We'll start showing ratings
once we have enough of them."*

---

## 4. The tag vocabulary (D3, as built)

Closed at **ten** values, covering the **Experience** dimension only:

```txt
Sea View · Beach Club · Mountains · Lakeside · Garden
Historic · Jungle · Island · Rooftop · Countryside
```

The intake's original plan — deriving tags by parsing `content/*/info.txt`'s `type:` line —
was **superseded** (intake §8 "Correction to §3"): that field is free text, and parsing it
yields an open set with one-off values that duplicate `surface`/`access`/`indoorOutdoor`. A
filter needs a closed set. Assignment is **authored** per court, grounded in that court's own
record, through one explicit mapping table shared by mock-data and the importer — which is
also what keeps `verify:api-parity` deterministic (intake §5 Risk #4).

`Carpet` was **not** added to the `Surface` enum (intake §8 Q6): it is dead CSS in the
prototype, used by no court.

---

## 5. Navigation as built

- **Mobile `TAB_NAV` (5):** Home · Map · Collections · Saved · Profile.
- **Desktop `PRIMARY_NAV` (4, unchanged):** Home · Map · Collections · Journal.
- Journal left the *mobile tab bar* only. It remains a desktop nav destination and a Home
  section, exactly as D1 intended.
- `isActiveRoute` prefix-matches, so `/profile/settings` correctly lights the **Profile** tab
  (verified in the click-through).
- **Back buttons** exist only on nested pages — court detail (`/map`, label "Courts"),
  collection detail (`/collections`), user collection (`/saved`), article (`/journal`),
  billing return (`/profile`), and the new settings page (`/profile/settings` → `/profile`).
  No top-level route has one.

---

## 6. Invariants — re-verified in Feature 87, with citations

| Invariant | Evidence |
| --- | --- |
| Exact `lat`/`lng` appear in no public response | `apps/api/src/courts/courts.service.ts:27` ("never select `Court.lat`/`lng`"); the private select is `apps/api/src/courts/courts.mapper.ts:92` (`courtExactLocationSelect`), used only by `apps/api/src/me/exact-location.service.ts`. Runtime: `verify:exact-location` 18/18 and `verify:web-exact-location` 14/14 scan detail/list/map/related for `lat`/`lng` keys at any depth. |
| `locked` derives only from the exact-location call, never `court.isLocked` | `apps/web/src/app/courts/[slug]/page.tsx:177-178` — `const exactLocation = await protectedRepos.courts.getExactLocation(court.slug); const locked = exactLocation === null;`. Derived once and passed down as props. Every other `isLocked` reference in `apps/web/src` is **presentation** (badge, marker state, text masking), never the gate. |
| No Stripe secret / publishable key / price id / plan id under `apps/web` | Grep for `sk_test|sk_live|pk_test|pk_live|price_…|STRIPE_SECRET|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_STRIPE` across `apps/web/src` → **no hits**. `verify:web-billing` asserts the same two checks ("no Stripe.js/stripe dependency", "no NEXT_PUBLIC_STRIPE / secret key / price id literal") — both pass. |
| `/billing/return` polls 6 × 2000 ms | `apps/web/src/features/billing/BillingReturn.tsx:54-55` — `MAX_ATTEMPTS = 6`, `POLL_INTERVAL_MS = 2000`. Confirmed live: a `free` user settles into "Your payment is processing" after the full bounded poll. |
| No UI path marks a user premium | Membership is only ever **read** from `/v1/me` (`ProfileHeader.tsx:69`, `ProfileMembershipCard`, `BillingReturn`). No assignment exists in `apps/web/src`. Only `StripeWebhookService` writes entitlements. |
| `nav-items.ts` is the single navigation source; no top-level Back button | `apps/web/src/components/layout/nav-items.ts:23` (`TAB_NAV`) — consumed by both `AppHeader` and `BottomNavigation`. Every `BackButton` call site is a nested page (§5). |
| Only `src/domain/**` imports `mock-*`/`http-*` | Grep for `from '…mock-…'`/`from '…http-…'` outside `src/domain/` → **no hits**. Enforced by `apps/web/.eslintrc.json` (the `@/domain/*/mock-*.repository` / `**/http-*` restricted-import groups); `pnpm lint` passes. |

---

## 7. Verification matrix (Feature 87 run, 2026-09-09)

Local Postgres (`pnpm db:up`), migrated + seeded, API on `:18001`, `NEXT_PUBLIC_DATA_SOURCE=api`.
Bearer tokens minted through the **real** `POST /v1/auth/verify` path (the technique
`ci-issue-token.ts` / `verify-exact-location.ts` already use), so no harness skipped for want
of a token.

| Harness | Passed | Failed | Skipped |
| --- | ---: | ---: | --- |
| `verify:api-parity` | 42 | 0 | — |
| `verify:ux-pending-states` | 92 | 0 | — |
| `verify:web-exact-location` | 14 | 0 | 0 (was skipping without tokens) |
| `verify:web-billing` | 13 | 0 | 1 — real-Stripe checkout URL, opt-in via `RUN_STRIPE_CHECKOUT=1` |
| `verify:saved-court-toggle` | 11 | 0 | — (needs `AUTH_BEARER_TOKEN`, not `FREE_BEARER_TOKEN`) |
| `verify:persisted-saved-flow` | 21 | 0 | — |
| `verify:user-saved-http` | 17 | 0 | — |
| `verify:map-autofocus` | 78 | 0 | — |
| `verify:effective-entitlement` | 136 | 0 | — |
| `verify:exact-location` | 18 | 0 | — |
| `verify:billing-checkout` | 21 | 0 | — |
| `verify:billing-rate-limit` | 11 | 0 | — |
| `verify:stripe-webhook` | 44 | 0 | — |
| `verify:staging-demo-auth` | 11 | 0 | 0 — needs an API started with demo auth on (§7.1) |
| `verify:google-oauth` | 19 | 0 | 0 — needs `GOOGLE_AUTH_ENABLED` + fake creds + `RUN_GOOGLE_OAUTH_VERIFY=1` (§7.1) |

`pnpm typecheck` ✅ · `pnpm build` ✅ · `pnpm lint` ✅ (no warnings or errors).

### 7.1 The two config-gated harnesses

`verify:staging-demo-auth` and `verify:google-oauth` skip against a **default** local API
because the features they test are off by default — correctly so (CLAUDE.md §6: demo auth must
stay disabled; Google OAuth is gated by `GOOGLE_AUTH_ENABLED`). They are **not** token-gated
and must not be left skipping. To run them, start a second API instance with the feature on
and point the harness at it:

```bash
# demo auth — 11/11
PORT=18002 STAGING_DEMO_AUTH_ENABLED=true STAGING_DEMO_AUTH_SECRET=<secret> \
  pnpm --filter @tennis/api dev
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18002/v1 STAGING_DEMO_AUTH_SECRET=<same> \
  pnpm --filter @tennis/api verify:staging-demo-auth

# google oauth — 19/19 (fake credentials; no real Google call is made)
PORT=18002 GOOGLE_AUTH_ENABLED=true \
  GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com \
  GOOGLE_CLIENT_SECRET=fake-client-secret \
  GOOGLE_REDIRECT_URI=http://127.0.0.1:18002/v1/auth/google/callback \
  pnpm --filter @tennis/api dev
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18002/v1 RUN_GOOGLE_OAUTH_VERIFY=1 \
  pnpm --filter @tennis/api verify:google-oauth
```

Still **not** covered by any script (documented gap, not an oversight): the real Google
code-exchange, ID-token signature verification, and account linking — these need a human
consent click against a real Google OAuth client. See `verify-google-oauth.ts`'s header for
the four manual steps.

### 7.2 Click-through coverage

Every screen was walked at **390 px** and **1280 px** as three identities — logged out, signed
in without entitlement, and entitled: Home · Map · Collections · a collection detail · Saved
(all three tabs) · a user collection · Court Detail unlocked · Court Detail locked · Profile ·
Settings · Journal · an article · `/billing/return` in each of its six states · sign-in ·
sign-up · the legal pages.

Findings: **no horizontal overflow on any screen at 390 px** (this specifically clears the
earlier concern that Saved's three tab chips would overflow); the correct tab highlights
everywhere including `/profile/settings`; Back behaves correctly from in-app history **and**
from a cold deep link (with JS disabled the court-detail Back is still a real
`<a href="/map">`, not a dead `history.back()`); the entitlement gate is visibly correct —
logged out and free viewers get "Unlock to reveal court name" and no "Played here?" card,
entitled viewers get the real name, description, map and review card. One bug was found; see §9.

---

## 8. Deliberate deferrals

- **The Map screen redesign (Features 85 + 86)** — chrome restyle and the pin-tap bottom-sheet
  interaction model. **Blocked** on a Leaflet → Google Maps + Snazzy Maps migration. The
  existing Leaflet integration (real markers from `approxLat`/`approxLng`, geolocation
  nearest-court auto-focus, `MapFilterBar`, the persistent desktop list panel) is untouched and
  working; `verify:map-autofocus` still passes 78/78. Feature 86 in particular is a real
  interaction-model change — today a marker click navigates straight to `/courts/[slug]`
  (`LeafletMapInner.tsx`), whereas the prototype opens a preview sheet and only navigates on an
  explicit second tap. That change should carry explicit before/after documentation
  (intake §5 Risk #2).
- **The Home map-preview band** — same blocker. The prototype's band is a static base64 PNG
  that the intake explicitly forbids recovering (§4); it needs a real asset or a real map
  decision, which is the same migration.
- **Editorial-collection bookmarks** — not built, deliberately. Saving applies to **courts**;
  editorial collections are curated reading, not a user-owned list.
- **Reviews display and moderation** — by design (D4). Reviews are collected and stored with a
  `status` defaulting to `new`; nothing reads them. A display surface needs a moderation
  decision first.

---

## 9. The one bug found and fixed in Feature 87

**`/billing/return?status=cancelled` never showed the cancelled screen.** The visitor was left
looking at the route's Suspense fallback — *"Confirming your membership…"* — indefinitely, while
the correct "Checkout cancelled" markup sat in the DOM under `display:none`. Reproduced in a
**production build**, not just dev.

**Cause.** `BillingReturn` initialised its state to `'cancelled'` directly from `useState`'s
initializer when `?status=cancelled` was present, and the effect then deliberately skipped
polling. That made `cancelled` the **one** state that never changes after mount. Every other
state (`success`/`processing`/`signed-out`/`error`) arrives via a post-mount `setState` from the
poll, and it is that commit which resolves the route's `<Suspense>` boundary on the client and
drops the fallback. With no re-render, the boundary was never resolved.

**Fix** (`apps/web/src/features/billing/BillingReturn.tsx`): always start at `'checking'` and
let the existing effect commit `'cancelled'` on mount, so the cancelled path transitions like
every other state. Setting the *same* value from the effect is **not** sufficient — React bails
out of an identical-value `setState` — which is why the initial state had to change too.

**No product behavior changed:** the same six states, the same copy, still no polling for a
cancelled checkout, `MAX_ATTEMPTS`/`POLL_INTERVAL_MS` untouched. Re-verified: all six states
render correctly with exactly one visible `<h1>`; `verify:web-billing` 13/13 and
`verify:ux-pending-states` 92/92 still pass.

---

## 10. Known caveats

- **Fabricated scale numbers survive in five places.** "120+ courts" appears in
  `features/court-detail/CourtDetailCtaPanel.tsx`, `features/home/HomePaywallBand.tsx`,
  `features/paywall/paywall-copy.ts` (×2) and `features/static-pages/AboutPage.tsx`, which also
  claims "50 Countries". The database holds **12 courts and 11 countries**. Feature 83 correctly
  dropped this copy from the billing-return screen and left a comment saying why; the other call
  sites were never swept. This is **marketing copy, not a code defect**, so Feature 87 left it
  alone rather than silently rewriting the product's pricing pitch — but it should be an
  explicit editorial decision, not an oversight. See §11.
- **`legal-content.ts` names the wrong payment provider.** The Privacy Policy says payments are
  processed by "RevenueCat/App Store/Play Store"; the app uses **Stripe**. The file is
  self-labelled placeholder copy pending counsel review, so this is pre-existing and outside the
  redesign's scope — but it is wrong today.
- **The "Continue with Apple" button is inert** on `/signin` and `/signup`, and in `mock` mode
  the Google button is inert too (in `api` mode Google is a real OAuth navigation). Both are
  documented placeholders, not regressions — but the Apple button is visually
  indistinguishable from the working one.
- **`desert-courts`** is still the slug of the collection displayed as *Riviera Icons*; it was
  renamed in place, keeping its id and slug.
- **The staging/production databases have not been touched** by this work. Both migrations
  (tags, Review) have been applied locally only.
- **Building while `pnpm dev` runs corrupts `apps/web/.next`** (symptom: routes 500 with
  404-shaped bodies). Stop the dev server, wipe `.next`, rebuild. This bit this QA pass before
  it was recognised.

---

## 11. Open items

1. **The Map migration (Features 85/86)** — Leaflet → Google Maps + Snazzy Maps, then the
   chrome restyle and the pin-tap bottom sheet. The single largest remaining piece.
2. **The Home map-preview band** — unblocks with (1).
3. **Reviews display + moderation** — decide the moderation workflow (`Review.status` already
   exists, defaulting to `new`) before building any read surface.
4. **Editorial-collection bookmarks** — deliberately not built; revisit only as a real product
   decision.
5. **The "120+ / 50" scale copy** (§10) — an editorial call: use real numbers, drop the figures,
   or keep aspirational copy knowingly.
6. **`legal-content.ts`'s payment-provider paragraph** — correct to Stripe when the legal copy
   goes to counsel.
7. **Apple sign-in** — either implement it or make its inert state visible.
8. **Rate limiting is still per-instance in-memory** (billing and now reviews). Redis remains
   the documented follow-up.
