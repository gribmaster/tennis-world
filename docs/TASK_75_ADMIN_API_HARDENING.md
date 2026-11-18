# TASK 75 — Admin API hardening (follow-up to TASK_73)

**Model: Sonnet 5, reasoning effort: high.** Small, surgical task: four fixes found while verifying the TASK_73 report against the code. Read `docs/TASK_73_ADMIN_COURTS_API.md` and the files named below first. No new features, no refactors beyond what is listed.

## Goal

TASK_73 passed its own harness (169/169) but review found one concurrency hole that breaks an invariant the UI will rely on, one deployment-time bug that turns the login rate limit into a lock-out switch, and two smaller gaps. Fix them before TASK_74 (the UI) is built on top.

## Decisions already made (do not re-litigate)

1. **Image mutations on one court are serialized.** `AdminImagesService.upload` computes `isHero: count === 0` and `sortOrder = max + 1` inside a default-isolation transaction, so two concurrent first uploads both see `count === 0` → **two heroes and duplicate `sortOrder`s**, violating the "exactly one hero" invariant (TASK_73 decision 16). The UI uploads several files in quick succession, so this will happen in practice. Fix at the API (the source of the invariant), not by asking clients to be polite: inside every transaction that reads-then-writes a court's images (`upload`, `patch` with `isHero`, `delete`, `reorder`), first take a row lock on the court — `SELECT id FROM "Court" WHERE id = $1 FOR UPDATE` via `tx.$queryRaw` — and do all reads **after** the lock. Do not use `Serializable` isolation (retry handling is not worth it here). Check the real table name in the Prisma schema/migrations before writing the SQL.
2. **Client IP must be trustworthy behind a proxy, and only then.** The API never sets Express `trust proxy`, so on the real host (Railway, behind a reverse proxy) `req.ip` is the proxy's address for every client. The admin login limiter keys failures by IP (`ip:${req.ip}`), so **five failed logins from anyone lock the IP bucket for everybody for 15 minutes** — an attacker can keep every admin out, and the per-IP protection is meaningless. The magic-link, billing and review limiters already key on `req.ip` and have the same flaw.
   - Add `TRUST_PROXY_HOPS` (integer ≥ 0, **default 0 = do not trust any forwarded header**, so a spoofed `X-Forwarded-For` can never choose the key). In `main.ts` apply `app.set('trust proxy', hops)` only when `hops > 0`. Invalid value (negative, non-integer, > 5) → refuse to boot with a clear message. Put the parsing in one small testable function next to `auth.config.ts` and read it from there (same style as the other env readers).
   - Document it in `apps/api/.env.example` and CLAUDE.md (one rule: "set `TRUST_PROXY_HOPS=1` on Railway; leave 0 locally"; and that the admin login limiter also has the per-email key, which is the part that survives a wrong setting).
   - Do **not** change any limiter's logic or thresholds.
3. **`mapLinkUrl` host rules are tightened** (TASK_73 decision 12 was too loose: `google.com` and `maps.google.com` were accepted with *any* path, which includes Google's `/url?q=` redirect endpoint — an admin mistake or a compromised admin could plant an off-site redirect that entitled visitors then click as "Directions"). New rule in `admin-map-link.util.ts`, https only, no credentials, **no explicit port**, ≤ 2000 chars, hostname exactly matched (as today), and the **path must match** per host:
   - `www.google.com`, `google.com`: path is `/maps` or starts with `/maps/`;
   - `maps.google.com`: path is `/` or `/maps` or starts with `/maps/` (the legacy `https://maps.google.com/?q=…` form), and the path must **not** be `/url`;
   - `goo.gl`: path is `/maps` or starts with `/maps/`;
   - `maps.app.goo.gl`: any path (Google's own Maps-only shortener).
   Everything else → 400 as before. Update the message text accordingly.
4. **Stale comments:** the `AdminAuthController` header comment says `GET /v1/admin/me`; the real route is `GET /v1/admin/auth/me` (controller prefix `admin/auth`). **Keep the route as it is** (TASK_74 is being written against `/v1/admin/auth/me`); fix the comment, and fix the same wording in CLAUDE.md §11 and `docs/TASK_73_ADMIN_COURTS_API.md` if they say `/v1/admin/me`.

## Testing

Extend `apps/api/scripts/verify-admin-courts.ts` (same `record()` harness, `f73-` fixtures + cleanup; keep the existing 169 checks green) and report the new total:

1. **Concurrent uploads:** for a fresh court, fire **5 uploads in parallel** (`Promise.all`, tiny valid PNG/JPEG fixtures), repeat the whole scenario 5 times on 5 fresh courts. After each: exactly **one** `isHero`, `sortOrder` values are `0..4` with no duplicates, all 5 rows exist. Then run a parallel mix on one court — two `PATCH isHero:true` on different images plus a delete of the current hero — and assert exactly one hero remains. **Prove the test can fail:** temporarily remove the lock, show the concurrency check failing at least once in N runs (report it), then restore it. If it cannot be made to fail without the lock, say so and explain what you did instead.
2. **Trust proxy:** unit-test the parser (`""`/unset → 0, `"1"` → 1, `"-1"`, `"1.5"`, `"abc"`, `"6"` → throws). Integration, with the API started twice (child process, as the boot-guard checks already do): (a) `TRUST_PROXY_HOPS` unset → requests carrying different `X-Forwarded-For` values still hit the **same** IP bucket (6th failed login from "different" IPs → 429) — the header is ignored; (b) `TRUST_PROXY_HOPS=1` → failures with different `X-Forwarded-For` values land in different buckets (5 failures as client A → A is 429, client B is still 401, and a *correct* login as B succeeds).
3. **`mapLinkUrl`:** accepted: `https://www.google.com/maps/place/Foo/@45.4,9.1,15z`, `https://google.com/maps?q=45.4,9.1`, `https://maps.google.com/?q=45.4,9.1`, `https://maps.google.com/maps?ll=45.4,9.1`, `https://goo.gl/maps/abc123`, `https://maps.app.goo.gl/AbCd1234`. Rejected: `https://www.google.com/url?q=https://evil.example`, `https://google.com/search?q=x`, `https://www.google.com/mapsfoo`, `https://maps.google.com/url?q=https://evil.example`, `https://goo.gl/abc` (not `/maps`), `https://www.google.com:8443/maps`, plus every case from TASK_73 Testing 6 (still rejected).
4. **Regression:** re-run `verify:court-geo-redaction` (66/66; remember `DEV_FORCE_MEMBERSHIP=subscribed` in the local `apps/api/.env` makes it fail — disable it for the run and restore it), `verify:effective-entitlement` 155/155, `verify:billing-checkout` 21/21, `verify:billing-rate-limit` 11/11, `verify:api-parity` 42/42, `verify:api-auth` (all sub-harnesses), and **`verify:staging-demo-auth` and `verify:google-oauth` with their feature flags ON**. In the TASK_73 report both showed SKIP; earlier reports had them at 11/11 and 19/19, so a SKIP is *not* a pass here — start the API with the env those harnesses need (read their headers and CLAUDE.md §2) and report the real counts. If you cannot enable them, say exactly why.

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; delete `apps/web/.next` before restarting dev).

## Do not touch

Limiter thresholds/logic, the public API, `apps/web`, `apps/admin`, the Prisma schema and migrations (a row lock needs none), any admin route path, the importer, and everything else not named above. No new dependency. No git commit or push unless asked.

## Report

1. Files changed, and the new env var.
2. The lock: the exact SQL used, where it is taken, and the before/after result of the concurrency check (including whether it failed without the lock).
3. The trust-proxy behaviour in both settings, as observed.
4. The final `mapLinkUrl` rule table as implemented.
5. New `verify:admin-courts` total and the regression table with **no skips unexplained**.
6. Anything else security-relevant you noticed (report only).
7. The exact commands run.
