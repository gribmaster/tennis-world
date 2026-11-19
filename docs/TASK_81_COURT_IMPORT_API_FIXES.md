# TASK 81 — Court import API: follow-up fixes (CORS on error paths, batched lookups, harness determinism)

**Model: Sonnet 5, reasoning effort: high.** Three small, independent fixes found while verifying the TASK_79 report against the code. Read `apps/api/src/main.ts`, `apps/api/src/admin/courts/admin-court-import-body-limit.ts`, `admin-court-import.service.ts` (`resolveItems`/`resolveOne`/`writeAll`) and `apps/api/scripts/verify-admin-courts.ts` (the publish-vs-delete race block) first. Do them in order; keep each diff tight. Nothing else changes.

## Decisions already made (do not re-litigate)

### 1. The route-scoped body parser sits **before** CORS, so its error responses have no CORS headers

In `main.ts` the line `app.use(ADMIN_COURT_IMPORT_ROUTE, createJsonBodyLimitMiddleware(...))` is registered **before** `cookieParser()` and `app.enableCors(...)`. On the success path the middleware calls `next()` and CORS still runs later, so normal responses are fine. But on its **error** path (`next(err)` for a body over 1 MB → 413, or malformed JSON → 400) the chain jumps straight to the error handler and **skips the CORS middleware**: the admin app runs on another origin, so the browser blocks the response and the UI shows "Can't reach the server" instead of the real "File is too large" / "invalid JSON" message. The harness did not see it because it calls the API without an `Origin`.

Fix: register the import body middleware **after** `cookieParser()` and `app.enableCors(...)` but still **before** Nest's own global body parser is installed (keep the existing explanation comment about why order matters, and re-verify that `rawBody` capture for the Stripe webhook and every other route is unchanged). Do not change the middleware's behaviour, the 1 MB limit, or the route scope.

Test (new, in `verify-admin-court-import.ts`): with `Origin: <an allowed origin from API_CORS_ORIGINS / ADMIN_APP_URL>` on the request, (a) an over-1-MB body → 413, (b) a malformed JSON body → 400, (c) a normal dry run → 200; **all three** carry `Access-Control-Allow-Origin` equal to that origin and `Access-Control-Allow-Credentials: true`; the same three with `Origin: https://evil.example` carry **no** `Access-Control-Allow-Origin`. Also assert the `OPTIONS` preflight for the route still answers correctly. **Prove it can fail:** temporarily move the line back above `enableCors`, show (a)/(b) failing the header assertion, restore.

### 2. `resolveItems` does ~4–5 sequential queries per court, inside a 20-second transaction

`resolveOne` runs `country.findUnique`, `country.findFirst` (name clash), `region.findFirst`, `court.findUnique` (slug), and the name+country duplicate lookup **per item**, sequentially, and the commit re-runs the whole pass **inside** the advisory-locked transaction (`{ timeout: 20_000 }`), followed by the writes. For 50 courts that is a few hundred round trips while holding the lock. It is fine on local Postgres; on the real deployment (API on Railway, database on Supabase through a pooler) each round trip is tens of milliseconds and 50 courts can approach the transaction timeout, which would surface as a confusing 500 after the lock was held for 20 s.

Fix: make the number of **read** queries in `resolveItems` independent of the number of items. Pre-load, once per pass and per `DbClient`, with a **fixed small number** of queries: all countries whose `isoCode` is in the file; all countries whose name (case-insensitive) matches any name in the file (for the name-clash check); all regions of those countries (case-insensitive name match done in JS on the loaded set); all existing courts whose `slug` is in the candidate set; all existing courts that could be name+country duplicates (by name, case-insensitive, with their country). Then run the **same per-item logic** against these in-memory maps. The behaviour, error/warning texts, paths and ordering of the report must stay **byte-identical** (the whole existing `verify:admin-court-import` suite is the safety net; do not edit its expectations). The per-court **writes** stay as they are.

Evidence required: instrument the Prisma client in a throw-away script or in the harness (e.g. a `$extends` query counter or `$on('query')`) and report the number of read queries `resolveItems` issues for a file of **1, 10 and 50** items — the number must be the same (a small constant) for all three. Add that as a harness check (constant ≤ 10, independent of N). Keep `{ timeout: 20_000 }`; do not raise it.

### 3. Harness determinism

- `verify:admin-courts` reports 260 checks in one run and 259 in another: in the TASK_76 **publish-vs-delete race** block, the second assertion ("the published outcome has ≥ 1 image and exactly 1 hero") is inside `if (freshRow?.status === 'published')`, so it only runs when the publish side of the race wins. Make it **always record**: when the court is not published the assertion passes trivially with an explanatory name (e.g. `…the published outcome (if any) has >= 1 image and exactly 1 hero`). Two consecutive runs (restart the API in between — the admin login limiter is in-memory) must report the **same** total. Report both totals.
- Document in `CLAUDE.md` §2 (the harness inventory), in one line, which suites require `DEV_FORCE_MEMBERSHIP` to be **unset/commented out** in `apps/api/.env`: `verify:court-geo-redaction`, `verify:effective-entitlement`, `verify:web-profile` (check C2 compares two `activeUntil` values that the override recomputes per request). **Append/edit text only; do not renumber any section.**

## Testing

Beyond the new checks above: re-run `verify:admin-court-import` (all existing checks unchanged and green; new total), `verify:admin-courts` twice (same total, `Skipped: 0`), `verify:court-geo-redaction` 66/66 and `verify:effective-entitlement` 155/155 (comment out `DEV_FORCE_MEMBERSHIP=subscribed` in the local `apps/api/.env` for these and **restore it**), `verify:api-parity` 42/42, `verify:api-auth` (all sub-harnesses). Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; delete `apps/web/.next` before restarting dev). Restart the API between harness runs.

## Do not touch

`apps/admin`, `apps/web`, the Prisma schema/migrations, the kit documents in `docs/court-import/`, any route path/response shape, the limiter code, the import's validation rules or messages, the 1 MB limit, the transaction timeout. No new dependency. No git commit or push unless asked.

## Report

1. Files changed.
2. Fix 1: the new registration order, the three CORS assertions before/after (including the before-fix failure) and confirmation that the Stripe webhook and a normal route still receive their bodies as before.
3. Fix 2: the query counts for N = 1, 10, 50 before and after, and confirmation the existing import checks are untouched and green.
4. Fix 3: both totals of the two consecutive `verify:admin-courts` runs.
5. Regression table, no unexplained skips.
6. Anything else you noticed (report only).
7. The exact commands run.
