# CLAUDE.md — Tennis World (Tennis Map) monorepo

Persistent implementation rules for Claude Code tasks in this repository. Everything
here was verified against the current codebase. When a rule and the code disagree,
trust the code and update this file in the same change.

`MUST` / `MUST NOT` mark hard constraints. Everything else is strong guidance.

---

## 1. Project structure

Turborepo + pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).
Node `>=22.13.0`, pnpm `11.0.8` (`packageManager` pin).

```txt
apps/
  api/     NestJS 10 — the ONLY backend. Global prefix /v1. Owns Prisma
           (apps/api/prisma: schema, migrations, seed). Modules: auth (magic link +
           Google OAuth), me (profile, saved-courts, collections, exact-location),
           courts, collections, countries, articles, consultations, reviews,
           entitlements, billing (Stripe checkout/portal), webhooks (Stripe),
           admin (TASK_73 — a separate privileged /v1/admin/* surface, see "Admin
           API" below), health, prisma.
  web/     Next.js 15 App Router + React 19 + Tailwind. All user-facing UI.
           src/app (routes), src/features (screen features), src/components
           (ui / layout / navigation / court / filters), src/domain (repository
           interfaces + mock & http implementations), src/lib (repository factories,
           session, demo auth, server actions), scripts (verify:* harnesses).
  admin/   TASK_74 — Vite + React 18 + Refine + Ant Design. The internal admin app:
           sign in, list/create/edit courts, add countries/regions inline, upload
           and arrange photos, publish/unpublish. src/lib (apiFetch, authProvider,
           dataProvider, the countries/regions/images helper calls, the maps-link
           parser and slug helper), src/components, src/pages, scripts (the
           verify:admin-ui harness). Talks to /v1/admin/* over HTTP only — no
           Prisma, no database connection string. See "Admin app" below.
packages/
  contracts/   @tennis/contracts — shared DTOs / enums / zod schemas. Single source
               of truth for the API↔web contract. TS-source main (see §9).
  mock-data/   @tennis/mock-data — the mock dataset; also the Phase-2 seed source.
  config/      @tennis/config — shared tsconfig / eslint / prettier bases.
```

There is no `packages/ui` (deliberate — web UI primitives live in
`apps/web/src/components`). There is no jest/vitest/playwright anywhere: this repo's
test convention is the `verify:*` scripts (§2).

---

## 2. Commands

All commands run from the repo root.

| Purpose | Command |
|---|---|
| Install deps | `pnpm install` (CI: `pnpm install --frozen-lockfile`) |
| Run web locally | `pnpm --filter @tennis/web dev` |
| Run API locally | `pnpm --filter @tennis/api dev` |
| Run admin app locally | `pnpm --filter @tennis/admin dev` (port 18002) |
| Run everything | `pnpm dev` |
| Start local Postgres | `pnpm db:up` (stop: `pnpm db:down`) |
| Prisma generate | `pnpm --filter @tennis/api prisma:generate` |
| Create a migration | `pnpm --filter @tennis/api prisma:migrate` (⚠ see §8) |
| Apply migrations | `pnpm --filter @tennis/api prisma:migrate:deploy` |
| Reset dev DB | `pnpm --filter @tennis/api prisma:migrate:reset` (destructive) |
| Seed | `pnpm --filter @tennis/api db:seed` |
| Web typecheck | `pnpm --filter @tennis/web typecheck` |
| API typecheck | `pnpm --filter @tennis/api typecheck` |
| All typecheck | `pnpm typecheck` |
| Web build | `pnpm --filter @tennis/web build` |
| API build | `pnpm --filter @tennis/api build` |
| All build / lint / format | `pnpm build` / `pnpm lint` / `pnpm format` |

Other real API data scripts: `db:update-images`, `db:import-courts-content`,
`ci:issue-token`, `ci:clean-auth-fixtures`.

### Verification scripts (this repo's tests)

Root aggregates:

```bash
pnpm verify:api-parity     # web mock↔api parity harness
pnpm verify:api-auth       # verify:user-saved-http + verify:persisted-saved-flow
                           #   + verify:web-profile   (all three read AUTH_BEARER_TOKEN)
pnpm verify:stripe-e2e     # optional, real Stripe test mode (opt-in)
```

`pnpm --filter @tennis/web …`: `verify:api-parity`, `verify:user-saved-http`,
`verify:persisted-saved-flow`, `verify:saved-court-toggle`, `verify:web-exact-location`,
`verify:web-billing`, `verify:web-profile`, `verify:ux-pending-states`,
`verify:map-autofocus`.

`pnpm --filter @tennis/api …`: `verify:effective-entitlement`, `verify:exact-location`,
`verify:billing-checkout`, `verify:billing-rate-limit`, `verify:stripe-webhook`,
`verify:stripe-e2e`, `verify:staging-demo-auth`, `verify:google-oauth`,
`verify:admin-courts` (TASK_73 + TASK_75 + TASK_78, 260 checks — admin auth/CSRF/roles,
courts CRUD + publish gate, countries/regions, images incl. both storage drivers,
concurrent-upload row-lock proof, lost-update/slug-race proof, trust-proxy behavior; run
with `COURT_IMAGE_STORAGE=local`; the summary also reports `Skipped: N` and fails the run
if `N > 0` unless `ALLOW_SKIPS=1`), `verify:admin-court-import` (TASK_79, 115 checks — the
bulk import endpoint: auth/CSRF, dry-run-is-default, happy path, all-or-nothing, dup/
idempotency, the advisory-lock concurrency proof, the full per-field validation matrix,
body-size/rate limits, create-vs-import parity, and a drift check between the agent kit
in `docs/court-import/` and the live DTO/contract; same skip policy, run with
`COURT_IMAGE_STORAGE=local`).

`pnpm --filter @tennis/admin …`: `verify:admin-ui` (TASK_74 + TASK_77 + TASK_78, 58 checks — the
maps-link parser, the slug helper against the API's own `slugify`, the data-provider's
request mapping, the serial upload queue, a source scan for token
persistence/`dangerouslySetInnerHTML`, an env-var name scan). Pure logic only — needs no
running API.

Most harnesses need a running API (and some a seeded DB); each script's header comment
states its own prerequisites. Touching UI pending/back-navigation ⇒ run
`verify:ux-pending-states`. Touching billing UI ⇒ `verify:web-billing`. Touching the
profile-edit path (`PATCH /v1/me`, the `UserProfileDTO` shape, or the name-validation
rules in `me.dto.ts`/`me.service.ts`) ⇒ `verify:web-profile` (31 checks) — it is the only
coverage of that mutation, and the only assertion that email stays immutable.

**Do not accept a skip as a pass.** Several harnesses skip silently when an env var is
absent, and only one of those skips (real-Stripe) is genuinely opt-in:

- Token-gated: `verify:web-exact-location` and `verify:web-billing` read
  `FREE_BEARER_TOKEN` / `ENTITLED_BEARER_TOKEN`; `verify:saved-court-toggle`,
  `verify:user-saved-http`, `verify:persisted-saved-flow` and `verify:web-profile` read
  `AUTH_BEARER_TOKEN` (a different name — supplying only the first two silently skips the
  authed half).
  Mint tokens through the real `POST /v1/auth/verify` path the way
  `apps/api/scripts/ci-issue-token.ts` and `verify-exact-location.ts` do; seed an active
  `Entitlement` row for the entitled one.
- Config-gated: `verify:staging-demo-auth` and `verify:google-oauth` skip against a
  default local API because the features are correctly off by default. Run them against a
  second API instance started with the feature enabled (fake Google credentials are
  sufficient — no real Google call is made). See
  `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §7.1 for the exact commands.
- `DEV_FORCE_MEMBERSHIP`-sensitive: `verify:court-geo-redaction`, `verify:effective-entitlement`,
  and `verify:web-profile` (its check C2, which compares two `activeUntil` values the
  override recomputes per request) require `DEV_FORCE_MEMBERSHIP` to be
  **unset/commented out** in `apps/api/.env` while they run, or they fail/misreport against
  the forced entitlement instead of the real one — restore it afterward.
- Genuinely opt-in: the real-Stripe checks (`RUN_STRIPE_CHECKOUT=1`, `verify:stripe-e2e`).

CI (`.github/workflows/ci.yml`): `verify` job = install → prisma:generate → lint →
typecheck → build; `parity` job = migrate deploy → seed → build+start API → parity +
authed harnesses; `stripe-e2e` is a separate, secret-gated, non-required job.
**Required CI MUST stay Stripe-free.**

---

## 3. Environment rules

| | Value |
|---|---|
| Local web | `http://127.0.0.1:18000` (`next dev -p 18000 -H 127.0.0.1`) |
| Local API | `http://127.0.0.1:18001/v1` (health: `/v1/health`; `PORT` env, code default 3001) |
| Local Postgres | host port **15432** → container 5432 (`docker-compose.yml`) |
| Production web | `tennismap.app` |
| Production API | `api.tennismap.app` |

Env files: root `.env`, `apps/api/.env`, `apps/web/.env.local`; templates are the
matching `.env.example` files. `apps/api/src/main.ts` imports `dotenv/config` — Nest does
not load `.env` on its own. Config is read through `loadAuthConfig` / `billing.config.ts`
/ `google-auth.config.ts`, not `@nestjs/config`. **Note for any script that spawns
`node apps/api/dist/main.js` as a child process with a custom `env`:** `dotenv/config`
resolves `.env` relative to that file's own directory (`apps/api/`), NOT the child's
`cwd`, and only skips a key already present as an OWN property of `process.env` — an
*absent* key (not even `''`) gets silently backfilled from the real `apps/api/.env` on
disk. A test harness that wants a variable truly unset must still set it to `''`.

**`TRUST_PROXY_HOPS`** (TASK_75, `auth/trust-proxy.config.ts`, integer, default **0**):
how many `X-Forwarded-For` hops Express trusts when deriving `req.ip`
(`app.set('trust proxy', hops)` in `main.ts`, only when > 0). Every IP-keyed in-memory
limiter (admin login, magic-link, billing, reviews) reads `req.ip` — at 0 behind a real
reverse proxy, `req.ip` is the proxy's address for every client, so those limiters key on
one shared bucket. Set `TRUST_PROXY_HOPS=1` on Railway (one reverse-proxy hop); leave it
**0 locally** (no proxy — trusting a header here would let a client's own
`X-Forwarded-For` choose its rate-limit key). An invalid value (negative, non-integer, or
> 5) refuses to boot.

Web data source: `NEXT_PUBLIC_DATA_SOURCE` = `mock` | `api`, resolved in
`apps/web/src/domain/index.ts`. That file is the ONLY place that picks a repository
implementation — pages never read the env var or construct a repository.

### `DATABASE_URL` vs `DIRECT_URL`

Both are declared in `apps/api/prisma/schema.prisma` (`url` / `directUrl`).

- **`DATABASE_URL`** — runtime. Every query the generated Prisma Client makes. In
  production this is the Supabase **transaction pooler (pgbouncer), port 6543** — short
  lived pooled connections, correct for a request-scoped API.
- **`DIRECT_URL`** — Prisma **CLI only** (`migrate dev/deploy/diff/status`, `db push`).
  Never read by the running API. In production this is the Supabase **session pooler,
  port 5432** — the migration engine needs advisory locks / prepared statements that the
  transaction pooler does not support (this was the cause of a P2028 `$transaction`
  timeout). `DIRECT_URL` is REQUIRED by the schema: a missing value makes
  `prisma migrate deploy` fail outright rather than silently fall back.

Locally both point at the same docker-compose Postgres (no pooler distinction).

### Secrets

- **MUST NOT** commit any real secret, key, token, password, price id, or connection
  string with credentials. `.env`, `.env.local` are gitignored — keep it that way.
- **MUST NOT** copy production values into any `.env.example`. Templates carry SHAPES and
  comments only.
- **MUST NOT** put a secret behind `NEXT_PUBLIC_*` — that ships it in the browser bundle.
  Server-only names have no prefix (e.g. `STAGING_DEMO_AUTH_SECRET`), and the split in
  `apps/web/.env.example` (public flag + private secret) is deliberate.
- **`SUPABASE_SERVICE_ROLE_KEY` (TASK_73) is server-only**, same rule, same reasoning —
  never `NEXT_PUBLIC_*`, never logged, never in any response. This is unrelated to §6's
  "no Supabase Auth" rule: Supabase is used here ONLY as a Storage backend for admin-
  uploaded court photos (`apps/api/src/admin/images`), never as an auth provider.
- Never echo secret values into logs, commit messages, or this file.

---

## 4. UI pending / loading rules (mandatory)

Primitives live in `apps/web/src/components/navigation` (barrel: `@/components/navigation`)
and `apps/web/src/components/ui` (barrel: `@/components/ui`).

| Primitive | Import | Use for |
|---|---|---|
| `PendingLink` | `@/components/navigation` | row / menu-item / CTA links that navigate |
| `PendingCardLink` | `@/components/navigation` | whole-card links (court, collection, article, saved row, map row) |
| `PendingButton` | `@/components/navigation` | async-action buttons (wraps `Button`) |
| `BackButton` | `@/components/navigation` | the one Back control (§5) |
| `useElementPending` | `@/components/navigation` | local pending state for an async action (`{ pending, run }`) |
| `NavigationPendingProvider` | `@/components/navigation` | mounted ONCE in `AppShell` — do not add a second |
| `InlineSpinner` | `@/components/ui` | the only spinner glyph (`role="status"` + `sr-only` label) |
| `Button` | `@/components/ui` | base button. **Has no `loading` prop** — compose `PendingButton` |

Mechanism: `NavigationPendingProvider` holds a single shared pending id, so only the
clicked element is pending; it clears on `usePathname()` change, plus a 4s safety-net
timeout in each primitive.

**Rules**

1. Every new internal navigational card or link **MUST** use `PendingCardLink`
   (whole-card) or `PendingLink` (row/CTA).
2. Every new database/API-backed button **MUST** use `PendingButton`, or — when the
   control is not a `Button` (icon button, custom CTA) — the same triad the existing call
   sites use: local pending state (`useElementPending` or `useState`) + `disabled={pending}`
   + `aria-busy={pending}` + `<InlineSpinner label="…" />`.
3. The loading indicator **MUST** appear only on the clicked element.
4. **MUST NOT** introduce a full-page blocking loader/overlay for ordinary navigation or
   mutations. No `fixed inset-0` overlay; `PendingCardLink`'s overlay is deliberately
   `absolute inset-0`, scoped to the card box.
5. Element dimensions **MUST** stay stable while pending — render the spinner alongside
   existing content (or swap an icon 1:1), never reflow the box.
6. Disable only the active element. Other cards/links/buttons stay interactive.
7. Pending state **MUST** be cleared after failures — reset in `finally` (or an
   unconditional `.finally()`), roll back optimistic UI on error, never leave a control
   stuck disabled.
8. Use `aria-busy` on the host control and an accessible loading label on the spinner
   (`<InlineSpinner label="Saving…" />`). Links also set `aria-disabled` rather than a
   real `disabled` attribute.
9. **MUST NOT** use a raw `<Link>` or raw `<button>` where one of the primitives above
   covers the case.
10. Modal open/close toggles, purely local UI controls (filters, tabs, disclosure),
    external links, and decorative controls need NO API/navigation loading behavior.

`verify:ux-pending-states` (91 checks) asserts these invariants against the source. Run it
after any change in this area.

**Real usage from the current code**

```tsx
// apps/web/src/components/court/CourtCard.tsx — card image wrapped in a navigating link
<PendingCardLink
  href={`/courts/${court.slug}`}
  ariaLabel={display.name}
  className="relative block h-[170px] overflow-hidden rounded-[14px] md:h-[340px]"
>
  <Image src={court.heroImageUrl} alt="" fill priority={priority} sizes={imageSizes} className="object-cover" />
  …
</PendingCardLink>

// apps/web/src/features/saved/SavedEmptyState.tsx — CTA link
<PendingLink href={cta.href} className="btn btn-primary mt-6 h-10 px-5 text-[11px]">
  {cta.label}
</PendingLink>

// apps/web/src/components/layout/AppHeader.tsx — nav pill item, renders its own spinner
<PendingLink
  key={item.href}
  href={href}
  spinnerPosition="none"
  pendingLabel={`Loading ${item.label}…`}
  aria-current={active ? 'page' : undefined}
  className={...}
>
  {item.label}
</PendingLink>

// The button primitive for new async actions
<PendingButton pending={pending} pendingLabel="Saving…" onClick={() => void run(save)}>
  Save Court
</PendingButton>

// The equivalent triad existing async buttons use
// (apps/web/src/features/court-detail/CourtSaveButton.tsx)
<button type="button" onClick={handleClick} disabled={pending} aria-busy={pending}
        aria-disabled={pending || undefined} aria-pressed={saved}>
  {pending ? <InlineSpinner label="Saving…" /> : <HeartGlyph filled={saved} />}
  {saved ? 'Saved' : 'Save Court'}
</button>
```

---

## 5. Navigation rules

- Nested/detail pages **MUST** use the shared `BackButton` from `@/components/navigation`.
  Do not re-implement a "← Parent" link or a local chevron glyph.
- `BackButton` calls `router.back()` only when `useInAppHistory()` reports real in-app
  history for this tab (a `sessionStorage` counter keyed off `usePathname`); otherwise it
  navigates to the required explicit `fallbackHref`.
- Current fallbacks — keep them:
  - Court detail (`app/courts/[slug]/page.tsx`): `fallbackHref="/map"` (there is no
    `/courts` list route). TASK_59 (v3) renders TWO `BackButton` instances here — the
    mobile pill overlay, label `Courts`, `md:hidden`, and a desktop plain-text link above
    the grid, label `Back to Courts`, `hidden md:inline-flex`. Same `fallbackHref` both.
  - Collection detail (`CollectionDetailHero`): `fallbackHref="/collections"`. TASK_60
    (v3) renders TWO `BackButton` instances here — the mobile pill overlay, label
    `Collections`, `md:hidden`, and a desktop plain-text link above the hero frame,
    label `Back to Collections`, `hidden md:inline-flex`. Same `fallbackHref` both.
  - User collection detail (`UserCollectionHero`), `fallbackHref="/saved"`, label
    `Back to Saved`. TASK_61 (v3): ONE `BackButton` instance (no photo hero to split a
    mobile pill from), visible at every size.
  - Article detail (`ArticleHero`): `/journal`.
  - Billing return (`BillingReturn`): `/profile`.
  - Settings (`app/profile/settings/page.tsx`), `fallbackHref="/profile"`. TASK_61 (v3)
    renders TWO `BackButton` instances here — a mobile icon back inside the header row,
    `md:hidden`, and a desktop plain-text link above the heading, label `Back to Profile`,
    `hidden md:inline-flex`. Same `fallbackHref` both.
- **MUST NOT** add a Back button to top-level navigation pages (`/`, `/map`,
  `/collections`, `/profile` — the four `PRIMARY_NAV` routes — plus `/saved` and
  `/journal`, which are still top-level even though they are not in the nav; see
  `components/layout/nav-items.ts`). `/profile/settings` is NESTED, not top-level: it
  keeps its Back button, and `isActiveRoute`'s prefix match correctly lights the Profile
  tab while it is open.
- `nav-items.ts` is the single source for the nav: one `PRIMARY_NAV` of four items (Atlas
  `/` · Courts `/map` · Collections `/collections` · Profile `/profile`), rendered by the
  single floating pill (`AppHeader`) at every width — there is no separate mobile tab bar
  or desktop-only list. Saved is not in the nav and lights the Profile item (as do
  `/signin`, `/signup`, `/verify`); Courts also lights for `/courts/*`. Journal is not in
  the nav either and stays reachable from the Footer. **MUST NOT** add a second nav or a
  bottom tab bar — `AppShell` mounts the one pill.
- Use App Router utilities only: `next/link`, `useRouter`/`router.push`/`router.back`,
  `usePathname` from `next/navigation`.
- **MUST NOT** use `javascript:history.back()` or a bare `history.back()`, and **MUST NOT**
  derive a navigation target from `document.referrer`.

---

## 6. Authentication rules

- Email **magic-link auth remains the primary, supported flow** (`apps/api/src/auth`,
  `/v1/auth/*`, web `/signin`, `/signup`, `/verify`). Do not remove or bypass it.
- **Google OAuth is additive** (`google-auth.controller.ts`, `GET /v1/auth/google` +
  `/callback`), gated by `GOOGLE_AUTH_ENABLED` (off ⇒ 404; on-but-misconfigured ⇒ 503;
  never a boot crash). Account linking is **email-primary**: look up by verified email,
  backfill `User.googleId` only when null, never overwrite. Do not switch to `sub`-primary
  lookup without an explicit decision.
- Both flows mint the **same application session cookie** (`AUTH_COOKIE_NAME`, default
  `tennis_session`, httpOnly) via `AuthService.issueSessionForUser`. There is exactly one
  session system.
- **MUST NOT** introduce NextAuth/Auth.js, Passport, Supabase Auth, or any other auth
  framework without explicit approval.
- `GOOGLE_CLIENT_SECRET` (and `JWT_SECRET`) belong **only** on the API. The web app reads
  no Google env — it just navigates the browser to `GET /v1/auth/google`.
- **MUST NOT** expose tokens in URLs beyond the existing single-use magic-link token; the
  OAuth `redirectTo` is carried in a short-lived state cookie, deliberately not in Google's
  `state` param.
- Staging demo auth (`X-Tennis-Demo-Auth`, `STAGING_DEMO_AUTH_ENABLED`) **MUST remain
  disabled in production** unless explicitly requested. It is off by default, never
  enabled by `NODE_ENV`, grants no entitlement, and its secret is server-only (client
  mutations route through the server actions in `lib/saved-actions.ts`).
- The auth pages (`/signin`, `/signup`, `/verify`) render the floating pill nav
  (`AppHeader`) at md+ only, via `AuthLayout` — mobile keeps the standalone `AuthTopBar`
  instead (`hidden md:block` / `md:hidden`, never both). There is no Apple sign-in
  control anywhere in the app (removed in TASK_62 — the API has no Apple sign-in).

---

## 7. Billing rules

- Stripe Checkout Sessions and Portal Sessions are created **only by the API**
  (`apps/api/src/billing`, `POST /v1/billing/checkout` → 201, `POST /v1/billing/portal`).
  The browser receives an opaque hosted URL and navigates to it.
- **MUST NOT** put `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or any Price ID in the web
  app. No Stripe.js, no publishable key — the web sends only a plan key
  (`monthly` | `quarterly` | `yearly`).
- Membership/entitlement is updated **only** through the signature-verified webhook
  (`POST /v1/webhooks/stripe`, `apps/api/src/webhooks`). `StripeWebhookService` is the sole
  writer; `EntitlementsService` stays read-only. Idempotency via `ProcessedWebhookEvent` +
  `providerPurchaseId` upsert in one transaction. `main.ts` needs `rawBody: true`.
- **MUST NOT** mark a user premium from the success redirect. `/billing/return`
  (`features/billing/BillingReturn.tsx`) re-reads `/v1/me` with a **bounded** poll
  (6 attempts × 2s) and falls back to a calm "processing" state — never a failure, never an
  infinite poll. Preserve this flow, its `?status=cancelled` branch, and its `/profile`
  Back fallback.
- `BillingReturn`'s six states **MUST** all reach the screen through a post-mount
  `setState`, including `cancelled` — it starts at `'checking'` and the effect commits
  `'cancelled'`. Initialising straight to the final state in `useState` leaves this island
  (which sits under the route's `<Suspense>`) with no re-render after hydration, so the
  boundary never resolves and the visitor is stuck on the "Confirming your membership…"
  fallback while the real markup sits in the DOM under `display:none`. Setting the same
  value from the effect does NOT fix it — React bails out of an identical-value `setState`.
  Verified in a production build; re-check the cancelled branch in the browser (not only
  via `verify:web-billing`, which asserts the seam, not the render) after touching this file.
- Use test keys with test Price IDs together (`sk_test_…` + test `price_…`). The E2E script
  refuses `sk_live`. Missing Stripe env must stay a clean runtime error (500/400), never a
  boot crash.
- Billing endpoints are rate-limited in memory per user (checkout 5, portal 10 per window);
  keep the guard ordering (after `AuthGuard`, per-method).
- `DEV_FORCE_MEMBERSHIP` (`apps/api/.env`; unset by default) force-overrides the
  *effective* entitlement to `free` or `subscribed` for every signed-in user — a
  local-dev-only shortcut for looking at both states without the Stripe CLI (§ below).
  It lives in **exactly one place**, `EntitlementsService.getEffectiveEntitlement`
  (`apps/api/src/entitlements/dev-membership-override.ts` parses it) — **MUST NOT** be
  read anywhere else (not a controller, guard, or the web app). The API **refuses to
  boot** if it's set to anything but `free`/`subscribed`, if `NODE_ENV=production`, or if
  `STRIPE_SECRET_KEY` is a live key.

### Local development: Stripe webhooks

- A completed test payment that leaves `/billing/return` stuck on "processing" locally is
  expected: entitlement is granted only by the webhook (§7), and Stripe cannot reach
  `127.0.0.1`. Fix: `stripe login` once, then in a separate terminal run
  `stripe listen --forward-to http://127.0.0.1:18001/v1/webhooks/stripe` and copy the
  printed `whsec_…` into `apps/api/.env` `STRIPE_WEBHOOK_SECRET`, restarting the API.
- Pay with test card `4242 4242 4242 4242` while `stripe listen` is running; expect
  `checkout.session.completed → 200` in its output. A payment made before `listen` was
  started is never replayed — pay again.
- `stripe trigger` sends events with no `userId` metadata, so it **cannot** test
  fulfilment end-to-end (`could not resolve a User` in the API log is the tell).
- To look at the `free`/`subscribed` states without any of the above, set
  `DEV_FORCE_MEMBERSHIP` instead (above) and restart the API — no CLI, no payment.
- A `400` from the webhook means the wrong secret is set (likely the Dashboard endpoint
  secret, not the CLI's) or the API wasn't restarted after updating it.
- Approximate coordinates of locked courts are never sent to or plotted for non-entitled
  viewers; enforced in `redactCourtGeo` (API) and `courtHasPublicGeo` (web).

---

## 8. Database and Prisma rules

- The Prisma schema, migrations, and seed are **owned exclusively by `apps/api`**
  (`apps/api/prisma`). No other app or package may define models or run migrations.
- Every schema change **MUST** ship with a committed migration in
  `apps/api/prisma/migrations`. Never edit an already-applied migration.
- `prisma migrate dev` (`prisma:migrate`) aborts/hangs in this non-interactive shell. Author
  migrations with `prisma migrate diff` and apply with `prisma migrate deploy`. Make
  `NOT NULL` additions back-safe: add with a temporary `DEFAULT` → backfill → `DROP DEFAULT`.
- **MUST NOT** run `prisma db push` (or `migrate reset`) against staging or production.
- Production/staging migrations use **`prisma migrate deploy`** only, with `DIRECT_URL` set
  to the session pooler (§3). Against a pooled Supabase connection `migrate deploy` /
  `migrate status` can hang — if it does, apply the migration SQL manually and record it.
- **MUST NOT** baseline, drop, or otherwise touch the `public` schema by accident. The
  production application database uses the **`tennis`** schema; the repo templates and CI
  use `?schema=public` for the local/CI Postgres, so never assume the deployed search path
  matches a template. Confirm the target schema before running anything destructive.
- **MUST NOT** run two production migration deployments at once — the migration engine
  takes an advisory lock, and concurrent deploys (e.g. a Railway redeploy racing a manual
  run) can leave a failed migration row behind.
- Long bulk operations over pgbouncer need an explicit `$transaction` timeout (P2028).

---

## 9. Scope discipline

- **MUST NOT** do unrelated refactors, renames, or reformatting; touch only what the task
  requires.
- **MUST NOT** add speculative features, abstractions, or config "for later".
- **MUST NOT** upgrade or add packages unless the task genuinely requires it; versions are
  pinned by `pnpm-lock.yaml` and `pnpm-workspace.yaml`'s build allowlist.
- Preserve the current design language (`globals.css` `.btn-*` / typography utilities,
  Tailwind tokens). No new design system, no visual redesign as a side effect.
- Inspect existing abstractions before creating new ones: `src/components/navigation`,
  `src/components/ui`, `src/domain/*` repositories, `packages/contracts` DTOs,
  `apps/api/src/*` services. Reuse and compose.
- Respect the boundaries: pages/components never construct repositories (use
  `lib/repositories.ts`, `lib/repositories.server.ts`, `lib/repositories.client.ts`); only
  `src/domain/**` may import `mock-*`/`http-*` modules (ESLint enforces this via
  `apps/web/.eslintrc.json`). `apps/api` **MUST** import `@tennis/contracts` type-only —
  its TS-source `main` cannot be `require`d by Node at runtime.
- **MUST NOT** change API, auth, Stripe, database, or routing behavior outside the task's
  scope — including response shapes, status codes, cookie attributes, and route paths.
- Before committing: run the relevant typecheck and build (`pnpm typecheck`, `pnpm build`,
  or the filtered equivalents) plus any `verify:*` harness covering the touched area.
- Report what changed: list files changed and which checks/harnesses were run, with their
  pass/fail counts. If something was skipped, say so.

---

## 10. Git rules

- **MUST NOT** commit secrets, `.env` files, database dumps, or anything under `backups/`.
- Keep commits focused — one logical change per commit, with a descriptive message.
- **MUST NOT** rewrite history (rebase, amend of pushed commits, force push) without
  explicit approval.
- **Commit and push only when the user explicitly asks.** Do not stage unrelated
  pre-existing working-tree changes into a commit.
- After pushing, report the commit hash (and branch) back to the user.
- **MUST** add new CLAUDE.md sections at the end; never insert before an existing number —
  section numbers are cited from immutable migration SQL and across the repo.

---

## 11. Admin API

TASK_73 — `apps/api/src/admin` (`AdminModule`, sub-folders `auth/`, `courts/`, `geo/`,
`images/`). A minimal admin surface for publishing/editing courts; the UI
(`apps/admin`) is a separate task (TASK_74) and does not exist yet.

- **A completely SEPARATE identity**, never the user `AuthGuard`/`AuthService`/session
  cookie. Admin rows live in `AdminUser` (`email`, `passwordHash`, `role`). The admin JWT
  has its **own secret `ADMIN_JWT_SECRET`** and the verifier requires `aud: 'tennis-admin'`
  (via the jsonwebtoken `audience` sign/verify option) — a user token on an admin route and
  an admin token on a user route (`/v1/me`, `/v1/reviews`, …) are both 401.
- **Cookie `tennis_admin_session`, `Path=/v1/admin`, `HttpOnly`**; `Secure`/`SameSite`/
  `Domain` are read from the EXISTING `AuthConfig` (`loadAuthConfig()`, called directly as a
  pure function — not via AuthModule's DI) so the two cookies share the same deployment
  posture without sharing a module. Cookie-first, then `Authorization: Bearer`.
- **CSRF**: every state-changing request authenticated BY COOKIE must carry
  `X-Tennis-Admin: 1`, or 403 (`AdminCsrfGuard`). GET and bearer-authenticated requests are
  exempt.
- **Routes exist only when enabled**: `ADMIN_JWT_SECRET` set, OR `NODE_ENV !== 'production'`.
  In production with no secret, `AdminModule.register()` (a `DynamicModule`, registered as
  `AdminModule.register()` in `app.module.ts`, NOT the bare class) returns NO
  controllers/providers at all — `/v1/admin/*` is a plain Express 404, and the rest of the
  API still boots. In production, setting `ADMIN_JWT_SECRET` to the obvious dev sentinel
  value refuses to boot.
- **Passwords**: `crypto.scrypt`, format `scrypt$N$r$p$<saltB64>$<hashB64>`
  (`admin/auth/admin-password.util.ts`), `timingSafeEqual` compare, ≥ 12 characters. An
  unknown login email still burns one real scrypt derivation (against a precomputed dummy
  hash) — no timing oracle for account enumeration.
- **Only one role has access today**: `AdminUser.role === 'admin'`. Any other value can log
  in and read `GET /v1/admin/auth/me` but gets 403 on everything else. Default-deny:
  `AdminRolesGuard` 403s a route that has no `@AdminRoles(...)` metadata — a forgotten
  decorator can never leave a route open. Compose auth + CSRF + roles with the one decorator
  `@AdminOnly('admin')` (`admin/auth/admin-roles.guard.ts`); `GET /v1/admin/auth/me` is the one
  exception (`AdminAuthGuard` only — any role).
- **No self-signup, no endpoint creates an `AdminUser`.** The first admin (and any password
  rotation) is minted by `pnpm --filter @tennis/api admin:create -- --email … --role admin`
  / `admin:set-password` (`apps/api/scripts/admin-user.ts`). Password from `ADMIN_PASSWORD`
  env or a no-echo TTY prompt — never a CLI argument. Refuses under
  `NODE_ENV=production` without `--yes-i-am-sure`.
- **Admin responses never contain `passwordHash`.** They MAY contain a court's exact
  `lat`/`lng`/`mapLinkUrl` (`packages/contracts/src/admin.ts`'s `AdminCourtDetailDTO`) —
  that is the point of the editing tool — but ONLY on `/v1/admin/*`, never on a public route;
  the public court selects/mappers (`courts/courts.mapper.ts`) are untouched and stay
  structurally incapable of leaking coordinates.
- **Derived court fields are server-computed, never admin-typed**: `approxLat`/`approxLng`
  (~10km jitter) and `mapX`/`mapY` (decorative) come from `slugify` / `approxFromExact` /
  `mapCoordsFromSeed` in `courts/court-derived-fields.ts` — extracted verbatim from the
  content importer (`scripts/import-courts-from-content.ts`, which now imports from the
  same module) so both paths stay byte-for-byte identical. `approx*` is recomputed ONLY
  when `lat`/`lng` change; `mapX`/`mapY` are set once at creation and never recomputed;
  `seedOrder` is `max(seedOrder) + 1` at creation, inside the creating transaction, and
  never changed afterward.
- **Publish gate**: `status` may become `published` only with ≥ 1 image and EXACTLY ONE
  hero, a non-empty `blurb`, and valid `lat`/`lng` — otherwise 422 with
  `{ message, missing: string[] }`. Checked on create-as-published, on PATCH, and
  (implicitly, as a 409 on the delete itself) when deleting a published court's last image.
- **Slug is immutable once a court has ever been published** — a PATCH that changes the
  slug of a `published` court is 409. Changing it on a draft is fine.
  Slug immutability applies while a court is **published**; unpublishing re-allows a
  slug change (there is no "was ever published" column — renaming a once-public slug
  breaks old links, so don't).
- **Image hero invariant**: a court with ≥ 1 image has EXACTLY ONE `isHero` image at all
  times, restored inside the same transaction as every mutation that could break it. You
  set a hero by promoting another image (`PATCH .../images/:id { isHero: true }`) —
  `isHero: false` is rejected (400). Deleting the hero promotes the lowest-`sortOrder`
  remaining image; deleting the LAST image of a **published** court is 409 (unpublish
  first). Legacy `/courts/<slug>/…` and `/placeholders/…` image urls are never touched by
  delete — only a url carrying a storage driver's own prefix is removed from storage.
- **Upload validation (never trust the client)**: magic-byte sniffing accepts only JPEG /
  PNG / WebP (`admin/images/admin-image-sniff.util.ts`) — anything else, including an SVG,
  a GIF, or an HTML file renamed `.jpg`, is 415. The client's `mimetype` and `originalname`
  are ignored entirely; the stored object name is always `<random uuid>.<sniffed ext>`
  (closes path-traversal and content-type-spoofing). Max 8 MB (`FileInterceptor`'s multer
  `limits.fileSize`; NestJS's own multer-error translation already maps an exceeded limit to
  413 — no custom exception filter needed). Rate-limited per admin, 30 uploads / 10 minutes.
- **Two storage drivers**, selected by `COURT_IMAGE_STORAGE` = `supabase` | `local`
  (`admin/images/admin-image-storage.ts` / `admin-image-storage.config.ts`). `local`
  (dev/CI only, the default outside production) writes under
  `apps/web/public/uploads/courts/<courtId>/` and is gitignored. **`local` is refused at
  boot in production**, and production with the value unset is ALSO refused at boot — the
  value MUST be set explicitly in production. `supabase` talks to the Storage REST API with
  plain `fetch` (no `@supabase/supabase-js` dependency); an incomplete Supabase config fails
  the UPLOAD endpoint with a clean 503 at request time, never at boot.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (see §3) — never logged, never returned in any
  response, even on a storage-driver error.
- `mapLinkUrl` is user-visible (the entitled-viewer "Directions" link is built from it —
  `courts.mapper.ts#toExactLocationDTO`), so it is validated strictly
  (`admin/courts/admin-map-link.util.ts`): `https:` only, no embedded credentials, no
  explicit port, ≤ 2000 chars, hostname EXACTLY one of `google.com` / `www.google.com`
  (path `/maps` or `/maps/…`), `maps.google.com` (path `/`, `/maps`, or `/maps/…` — never
  `/url`, which is Google's own open-redirect endpoint), `goo.gl` (path `/maps` or
  `/maps/…`), `maps.app.goo.gl` (any path). `null`/empty clears.
- Login rate limiting: in-memory, keyed by IP **and** separately by email, 5 failures / 15
  min per key → 429 + `Retry-After`; a SUCCESSFUL login resets only that email's counter
  (`admin/auth/admin-login-rate-limit.service.ts`). **`TRUST_PROXY_HOPS`** (default 0 — see
  §3) directly determines what `req.ip` the IP half of this key sees: with the default 0
  behind a real reverse proxy, every client shares one IP bucket and 5 failures from
  anyone locks out everyone for 15 minutes; the per-EMAIL key is what still protects an
  individual admin account when that setting is wrong.
- One `Logger` line per successful admin mutation (adminId, action, target type/id, the
  NAMES of changed fields, never their values) and per login success/failure (failures
  carry the lower-cased email + IP, never the password) — never a token, password, or the
  Supabase key.
- `pnpm --filter @tennis/api verify:admin-courts` is this surface's test coverage (run with
  `COURT_IMAGE_STORAGE=local`) — see §2.

### Court bulk import (TASK_79)

`POST /v1/admin/courts/import` — `@AdminOnly('admin')` on the same
`AdminCourtsController`, CSRF as every other admin mutation.

- **Create-only, drafts only, no photos.** Every imported court is created
  `status: 'draft'`. A `status` key anywhere in an item is an error — the
  agent never decides publication. No `images`/`imageUrls` field exists.
  An existing court is never updated: a slug that already exists is an
  **error**, never a skip.
- **`isLocked` defaults to `true`** for every imported court (matches the
  content importer's default — all courts are premium by default);
  `isFeatured` defaults to `false`. The template may override `isLocked` per
  court.
- **All or nothing, under an advisory lock.** If any item has an error,
  **nothing is written** — no courts, no countries, no regions. The commit
  runs in one `prisma.$transaction`; its first statement takes
  `pg_advisory_xact_lock` on a constant key, serializing concurrent imports
  (countries/regions have no unique constraint on name, so two parallel
  imports could otherwise create duplicate regions — proven by temporarily
  removing the lock: 4 of 5 concurrent-pair runs produced a duplicate region;
  with the lock restored, 0 of 5). The whole DB-dependent validation
  (country/region resolution, slug collision) is **re-run inside the lock**
  for a commit, not trusted from an earlier dry-run read.
- **Dry run is the default** (`dryRun` omitted ⇒ `true`); writing requires
  an explicit `"dryRun": false`.
- **Per-item validation, never a whole-request 400.** The body DTO is
  `{ courts: unknown[], dryRun?: boolean }`, manually parsed (NOT a
  `class-validator` class — see the "deliberately not a DTO" note below) with
  `courts` 1–50 items. Each item is independently validated
  (`plainToInstance(ImportCourtItemDTO, item)` + `validate(..., {
  whitelist: true, forbidNonWhitelisted: true })` in
  `AdminCourtImportService`, plus a few rules a decorator can't express —
  tag vocabulary with an exact `tags[i]` path, 0/0, ≤7-decimal-place lat/lng,
  blurb paragraph count), so one bad court yields a precise per-court error
  list and never hides another item's result. An item that is `null`, a
  string, an array, or a number is a clean item error, never a 500; so are
  `__proto__`/`constructor`/`prototype` anywhere in an item.
- **Deliberately NOT a `class-validator` DTO on `@Body()`.** The global
  `ValidationPipe`'s `plainToInstance` crashes
  (`TypeError: Cannot read properties of undefined (reading 'constructor')`)
  while generically deep-cloning a nested plain object that carries an own
  `constructor` key — exactly one of the keys this endpoint must reject as a
  clean error. `AdminCourtImportController`'s handler types `@Body()` as
  `Record<string, unknown>` (no metatype ⇒ the global pipe skips it entirely,
  the same mechanism `main.ts` already documents for
  `@Query() query: Record<string, unknown>`) and parses it manually
  (`parseImportRequestBody` in `admin-court-import.dto.ts`), so `req.body`
  reaches the service completely untouched and the forbidden-key check
  actually fires.
- **Route-scoped 1 MB JSON body limit**, this route only (50 long blurbs
  don't fit the default 100 kB). Hand-rolled in
  `admin-court-import-body-limit.ts` (no `express`/`body-parser` dependency —
  neither is resolvable from `apps/api`'s own `node_modules` under pnpm's
  strict per-package isolation) and mounted via
  `app.use(ADMIN_COURT_IMPORT_ROUTE, …)` in `main.ts`, in the window between
  `NestFactory.create()` returning and `app.listen()` — Nest's own global
  body-parser is registered lazily inside `listen()`, so this one runs first
  for this one path and every other admin route keeps the default limit.
- **Single source of truth for the pure per-field rules** — slug
  resolution and the 0/0 check live in `admin-court-pure.ts`, shared
  verbatim by `AdminCourtsService.create()`/`update()` and the import;
  `validateAdminTags` and `validateMapLinkUrl` (already-shared functions)
  are reused as-is. A court created via import and one created via
  `POST /v1/admin/courts` with equivalent input produce byte-identical
  derived fields.
- **Country/region resolution**: country matched by `isoCode` (existing →
  reused, a mismatched given name/continent is a **warning**, never an
  update); not existing but the same name under a **different** isoCode is
  an **error**. Region matched by (country, name) case-insensitive; a new
  region's `lat`/`lng` = **the court's own** `lat`/`lng` (not the country's
  centroid). Two items proposing the same new country/region in one file
  reuse a single planned creation.
- Rate-limited in-memory per admin, independently of every other admin
  limiter: commits 10 / 10 min, dry runs 60 / 10 min →
  429 + `Retry-After` (`admin-court-import-rate-limit.service.ts`).
- The agent-facing kit lives in `docs/court-import/`
  (`court-import.schema.json`, `AGENT_PROMPT.md`, `example.json`,
  `CLIENT_GUIDE.ru.md`) — single source of truth for what an AI agent and a
  non-technical admin are told; `verify:admin-court-import` asserts it never
  drifts from the live DTO/contract (enum lists, required fields, that
  `example.json` dry-runs clean).
- `pnpm --filter @tennis/api verify:admin-court-import` is this surface's
  test coverage (run with `COURT_IMAGE_STORAGE=local`) — see §2.

---

## 12. Admin app

TASK_74 — `apps/admin` (Vite + React 18 + `@refinedev/core`/`@refinedev/antd` +
`@refinedev/react-router` + Ant Design 5). A thin internal client over exactly the
`/v1/admin/*` endpoints in §11 — courts list/create/edit, countries/regions, photos,
publish/unpublish. No Refine admin UI framework existed before this; do not confuse it
with `apps/web` (public site) or the user auth system.

- **HTTP-only to `/v1/admin/*`** (`VITE_API_BASE_URL`) — **MUST NOT** add
  `@prisma/client`, a database connection string, or any import from `apps/api`/
  `apps/web`. Types come from `@tennis/contracts` (`admin.ts` + the shared enums);
  never hand-copy an enum's values into this app.
- **Auth is the TASK_73 admin cookie session, not the user session.** Every
  `fetch` goes through the single `apiFetch` wrapper in `src/lib/api-client.ts`:
  `credentials: 'include'` always, `X-Tennis-Admin: 1` on every non-GET, and the
  ONE place a 401 triggers a redirect to `/login` (registered by
  `components/SessionBoundary.tsx`). **The access token a login response carries
  is never stored** — no `localStorage`, no `sessionStorage`; the httpOnly cookie
  is the session. `verify:admin-ui`'s source scan enforces this.
- **Custom `dataProvider`**, not `@refinedev/simple-rest` — the API's
  `{ items, page, pageSize, total }` list shape and `PATCH`-based writes don't fit
  the generic adapter. Only the `courts` resource goes through Refine's data
  hooks; countries/regions/images are plain helper calls (`geo-api.ts` /
  `images-api.ts`) that bypass the resource system entirely.
- **React 18.3 is pinned in this package** — `@refinedev/antd` 6/antd 5 don't
  officially support React 19, and `apps/web` stays on 19. pnpm isolates the two;
  **MUST NOT** hoist or change `apps/web`'s React version to "fix" this.
- **Dev port 18002** (`vite --port 18002 --host 127.0.0.1`); the API's
  `ADMIN_APP_URL` must be `http://127.0.0.1:18002` locally (appended to
  `API_CORS_ORIGINS`, see §3).
- Photo uploads through `CourtPhotosPanel` run through a small FIFO
  `createSerialQueue()` (`lib/serial-queue.ts`), not just the `uploading` flag —
  Ant Design's `Upload` with `customRequest` fires one `customRequest` call per
  selected file immediately, so the queue (not the flag) is what keeps the actual
  upload requests serial and in selection order, which in turn keeps "first
  selected file becomes hero" deterministic (TASK_77).
- The maps-link parser (`lib/maps-link-parser.ts`) is a **pure, offline** function —
  no network call, no geocoding. A place pin (`!3d!4d`) wins over the viewport
  centre (`@lat,lng`) when a URL contains both; a short link (`goo.gl`,
  `maps.app.goo.gl`) always reports "unreadable".
- The slug auto-fill (`lib/slugify.ts`) **MUST** stay byte-for-byte identical to
  `apps/api/src/courts/court-derived-fields.ts`'s `slugify` — `verify:admin-ui`
  imports the API's version relatively (harness-only) and asserts equality.
- `pnpm --filter @tennis/admin verify:admin-ui` is this surface's test coverage
  (pure logic, no running API needed) — see §2.
