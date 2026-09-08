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
           health, prisma.
  web/     Next.js 15 App Router + React 19 + Tailwind. All user-facing UI.
           src/app (routes), src/features (screen features), src/components
           (ui / layout / navigation / court / filters), src/domain (repository
           interfaces + mock & http implementations), src/lib (repository factories,
           session, demo auth, server actions), scripts (verify:* harnesses).
  admin/   PLACEHOLDER ONLY. No Refine, no build. Exists so the workspace graph and
           CI are correct. MUST NOT be built out without an explicit request.
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
pnpm verify:stripe-e2e     # optional, real Stripe test mode (opt-in)
```

`pnpm --filter @tennis/web …`: `verify:api-parity`, `verify:user-saved-http`,
`verify:persisted-saved-flow`, `verify:saved-court-toggle`, `verify:web-exact-location`,
`verify:web-billing`, `verify:ux-pending-states`, `verify:map-autofocus`.

`pnpm --filter @tennis/api …`: `verify:effective-entitlement`, `verify:exact-location`,
`verify:billing-checkout`, `verify:billing-rate-limit`, `verify:stripe-webhook`,
`verify:stripe-e2e`, `verify:staging-demo-auth`, `verify:google-oauth`.

Most harnesses need a running API (and some a seeded DB); each script's header comment
states its own prerequisites. Touching UI pending/back-navigation ⇒ run
`verify:ux-pending-states`. Touching billing UI ⇒ `verify:web-billing`.

**Do not accept a skip as a pass.** Several harnesses skip silently when an env var is
absent, and only one of those skips (real-Stripe) is genuinely opt-in:

- Token-gated: `verify:web-exact-location` and `verify:web-billing` read
  `FREE_BEARER_TOKEN` / `ENTITLED_BEARER_TOKEN`; `verify:saved-court-toggle`,
  `verify:user-saved-http` and `verify:persisted-saved-flow` read `AUTH_BEARER_TOKEN`
  (a different name — supplying only the first two silently skips the authed half).
  Mint tokens through the real `POST /v1/auth/verify` path the way
  `apps/api/scripts/ci-issue-token.ts` and `verify-exact-location.ts` do; seed an active
  `Entitlement` row for the entitled one.
- Config-gated: `verify:staging-demo-auth` and `verify:google-oauth` skip against a
  default local API because the features are correctly off by default. Run them against a
  second API instance started with the feature enabled (fake Google credentials are
  sufficient — no real Google call is made). See
  `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §7.1 for the exact commands.
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
/ `google-auth.config.ts`, not `@nestjs/config`.

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

`verify:ux-pending-states` (92 checks) asserts these invariants against the source. Run it
after any change in this area.

**Real usage from the current code**

```tsx
// apps/web/src/components/court/CourtCard.tsx — whole-card navigation
<PendingCardLink href={href} className="block" ariaLabel={court.name}>
  {card}
</PendingCardLink>

// apps/web/src/features/home/HomeHero.tsx — CTA link
<PendingLink href={primaryCta.href} className="btn btn-over-image gap-2.5">
  {primaryCta.label}
  <ArrowGlyph />
</PendingLink>

// apps/web/src/features/profile/ProfileMenuRow.tsx — row that renders its own spinner
<PendingLink href={href} pendingId={pendingId} className={rowClass} spinnerPosition="none">
  {rowContent}
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
  - Court detail (`app/courts/[slug]/page.tsx`): `fallbackHref="/map"` label `Courts`
    (there is no `/courts` list route).
  - Collection detail (`CollectionDetailHero`): `/collections`.
  - User collection detail (`UserCollectionHero`): `/saved`.
  - Article detail (`ArticleHero`): `/journal`.
  - Billing return (`BillingReturn`): `/profile`.
  - Settings (`app/profile/settings/page.tsx`): `/profile`.
- **MUST NOT** add a Back button to top-level navigation pages (`/`, `/map`,
  `/collections`, `/journal`, `/saved`, `/profile` — see `components/layout/nav-items.ts`).
  `/profile/settings` is NESTED, not top-level: it keeps its Back button, and
  `isActiveRoute`'s prefix match correctly lights the Profile tab while it is open.
- `nav-items.ts` is the single source for both navs, and the two sets differ on purpose:
  mobile `TAB_NAV` is **five** tabs (Home · Map · Collections · Saved · Profile) while
  desktop `PRIMARY_NAV` is **four** (Home · Map · Collections · Journal). Journal left the
  MOBILE TAB BAR only — it is still a desktop nav destination and a Home section, so do not
  "restore" it to `TAB_NAV` or drop it from `PRIMARY_NAV`.
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
