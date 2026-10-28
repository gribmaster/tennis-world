# TASK 65 — Local dev switch: force every signed-in user to `free` or `subscribed` from an env var

**Model: Sonnet 5, reasoning effort: medium.** Small, but it touches the entitlement gate, so safety in production matters more than the amount of code.

## Goal

On a local machine, a Stripe test payment can't be completed end to end without the Stripe CLI and webhook forwarding (entitlement is granted only by the webhook). The developer wants to look at the app as a free user and as a subscribed user without paying. Add an **API-side, env-driven override** of the *effective entitlement*: one variable, three values, no payment, no database writes.

## Decisions already made (do not re-litigate)

1. **Env var `DEV_FORCE_MEMBERSHIP`** in `apps/api/.env`, read once at API boot. Allowed values:
   - unset / empty → **no override** (the real entitlement logic runs, exactly as today);
   - `free` → every user is treated as **not entitled**, *even if they have a real active entitlement row* (this is how to see the paywall as a paying user would not);
   - `subscribed` → every user is treated as an active **subscription** member;
   - anything else → the API **refuses to boot** with a clear message listing the allowed values (a typo must not silently mean "no override").
2. **Applies to every authenticated user** of that API instance. No per-user targeting.
3. **It is implemented in exactly one place: `EntitlementsService.getEffectiveEntitlement` / `isEntitled`** (`apps/api/src/entitlements/entitlements.service.ts`). That service is the single source of "effective entitlement" (CLAUDE.md §7); `auth.service.ts`, `me.service.ts` and `exact-location.service.ts` already read it. **Do not** add the override at any call site, in the web app, in a controller, or in a guard. Before coding, grep every place that decides membership/locked-court visibility (profile membership badge, court masking for the viewer, exact-location, paywall/consultation gating, `Review`/saved flows if they check it) and **confirm in the report that every one of them goes through the service**. If you find one that reads the `Entitlement` table directly or computes membership itself, don't "fix" it silently — list it in the report with file and line.
4. **Value returned for `subscribed`:** `{ isEntitled: true, membership: 'subscription', reason: 'subscription', source: 'stripe_web', activeUntil: <now + 30 days, ISO>, cancelAtPeriodEnd: false }`. Read how the web Profile membership card and the billing UI consume these fields (`ProfileMembershipCard`, the billing return, anything that shows "renews on …" or a Manage button) and choose values that make those screens render the normal subscribed state without errors. The "Manage subscription" button will still fail against Stripe because there is no real Stripe customer — that is expected; do not add a fake portal, but say in the report what the button does in this mode.
   `free` returns the existing `NOT_ENTITLED` constant.
5. **Safety (the part that matters).** The override must be impossible to leave on by accident in a real deployment:
   - If `DEV_FORCE_MEMBERSHIP` is set (non-empty) **and** `NODE_ENV === 'production'`, the API **refuses to boot**.
   - If it is set **and** `STRIPE_SECRET_KEY` starts with `sk_live_`, the API **refuses to boot**, whatever `NODE_ENV` is.
   - When it is active (non-production, valid), log one loud `warn` at boot (`[DEV] DEV_FORCE_MEMBERSHIP=subscribed — every user is treated as subscribed; real entitlements are ignored`) — one boot line is enough, no per-request logging.
   - Put the parse + checks in one small pure function (e.g. `loadDevMembershipOverride(env: NodeJS.ProcessEnv)` in `apps/api/src/entitlements/dev-membership-override.ts`) so it can be tested without booting Nest. Inject the result into `EntitlementsService` via the module (a provider/token), not by reading `process.env` inside the service on every call.
6. **No database writes, no schema change, no new dependency, no change to the public API's response shapes.** The web app needs no change in `api` data-source mode (it simply reflects what the API returns). In `mock` data-source mode this flag does nothing — state that in the docs.
7. The Stripe/billing endpoints are **not** touched: with the override on, `POST /v1/billing/checkout` behaves as before (it does not know about the override). Don't special-case it.

## What to build

1. `apps/api/src/entitlements/dev-membership-override.ts` — the parser/validator (decision 1, 5) and a type `DevMembershipOverride = 'free' | 'subscribed' | null`.
2. Wire it: provide it from `EntitlementsModule` (read env once at module init), inject into `EntitlementsService`, short-circuit at the top of `getEffectiveEntitlement` (before the Prisma query — no DB read at all when the override is on). `isEntitled` keeps delegating to `getEffectiveEntitlement`.
3. `apps/api/.env.example`: a commented `# DEV_FORCE_MEMBERSHIP=` block explaining the three values, the "local only, never in production" rule, and the two boot-time refusals.
4. CLAUDE.md §7 (billing rules): a 4–6 line rule — what the variable is, that it lives only in `EntitlementsService`, that it must never be read anywhere else, and the production refusals. Also update the "Local development: Stripe webhooks" subsection added earlier to mention this switch as the way to look at both states without the Stripe CLI.
5. Harness: extend `apps/api/scripts/verify-effective-entitlement.ts` (read its structure first and follow it) with a section for the override — **do not** change any existing check:
   - parser: unset/empty → `null`; `free` and `subscribed` → themselves (case-insensitive, trimmed); `Subscribed `→ ok; `premium`/`true`/`1` → throws; set + `NODE_ENV=production` → throws; set + `sk_live_…` key → throws; unset + production → fine (`null`);
   - service with an injected override: `subscribed` returns the decision-4 shape (and `activeUntil` is in the future) for a user with **no** rows; `free` returns `NOT_ENTITLED` for a user who **has** a real active entitlement row (create the fixture the way the existing checks do and clean it up); `null` keeps the existing 136 checks' behaviour (they must still pass untouched).
   Update the check count wherever CLAUDE.md quotes it.
6. Manual run (report the result, don't skip): with a real local API and `DEV_FORCE_MEMBERSHIP=subscribed`, sign in (use the dev magic link from the API log, or `ci:issue-token`), then `GET /v1/me` shows `membership: 'subscription'` and a locked court's exact location is returned from `/v1/me/courts/:slug/exact-location`; with `free` and a user who has a real active entitlement, `/v1/me` shows `free` and the same locked court is refused; with the variable unset, behaviour is as before. Clean up fixtures. Then once in a browser at 1280px with `subscribed`: Profile shows the member state, a locked court detail is unlocked, and the paywall/Unlock CTAs are gone; with `free`: they are back. Name the pages you looked at. (Restart the API after each change of the variable.)

## Do not touch

The Stripe webhook, billing service/controller, `BillingReturn`, the web app, the Prisma schema, contracts, the admin work in `docs/TASK_64_*.md` (not started), and the three harnesses that already fail on the `grand-hotel-tremezzo` fixture (`verify:exact-location`, `verify:web-exact-location`, `verify:stripe-webhook`) — they must keep failing exactly the same checks, no more.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first), `verify:effective-entitlement` (all old checks + the new ones), and a re-run of `verify:billing-checkout` (21/21), `verify:billing-rate-limit` (11/11), `verify:api-parity` (42/42), all with the variable **unset**. No git commit or push.

## Report

1. Files changed, one line each.
2. The list of places that decide membership/locked visibility and whether each goes through `EntitlementsService` (decision 3) — with any exception.
3. What the Profile membership card and "Manage" button do in `subscribed` mode.
4. New `verify:effective-entitlement` total and the other suites' results.
5. The manual-run results from §6, with the pages checked.
6. Exact commands run, and the exact lines the developer should put in `apps/api/.env` to use the switch.
