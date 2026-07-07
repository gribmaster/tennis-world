# Feature 47 — Dual-mode mock/API parity verification harness

**Status:** Implemented. Verification-only feature — **no product features, no UI changes, no
new routes/endpoints.** The one code change outside the harness is a serialization fix to the
article mapper to achieve byte parity (a real parity defect, documented below).

**Goal:** prove that the **mock** repositories (`NEXT_PUBLIC_DATA_SOURCE=mock`) and the **HTTP**
repositories (`NEXT_PUBLIC_DATA_SOURCE=api`) return **equivalent DTOs** for the public read
domains — courts, collections, journal. This is the executable form of the "mock-first proof
point" in `FEATURE_39_PHASE_2_API_PRISMA_INTAKE.md` §6.

---

## 1. Harness strategy

A single **plain Node/TS script** — `apps/web/scripts/verify-api-parity.ts` — run with **`tsx`**
(already a workspace dev dependency, used by the API seed). **No test framework was added**
(prompt task 1: "do not overbuild"; intake R12's Vitest/CI runner remains a later step — see
§9). The script:

- Instantiates the concrete repository classes **directly** (`MockCourtRepository`,
  `HttpCourtRepository`, …), bypassing the env-driven factory, so **one process drives both data
  sources at once**: the mock repos read `@tennis/mock-data` in-process; the HTTP repos `fetch`
  the live API.
- Resolves the API base URL from `NEXT_PUBLIC_API_BASE_URL` (default
  `http://localhost:3001/v1`) — the same resolution the real `http-client` uses.
- For each method the pages actually call, runs **both** implementations and asserts **deep
  equality** after a canonical key-sort. **List order is significant** (mock and API both define
  a stable order), so arrays are compared **positionally**, never sorted.
- Adds **coordinate-masking** (security) and **shape** invariants on the HTTP responses.
- **Preflight:** if the API is unreachable it exits non-zero with an actionable message (see §6).
- Exits non-zero if any check fails (CI-ready), zero on full parity.

It imports the repositories by **relative path** (not the `@/` alias) because `tsx` does not read
the Next `tsconfig` `paths`. It imports **no UI/React code** and **never mutates** data.

## 2. Script command

`apps/web/package.json` (the harness itself):

```json
"verify:api-parity": "tsx scripts/verify-api-parity.ts"
```

Root `package.json` (Feature 48 — convenience pass-through, no duplicated logic):

```json
"verify:api-parity": "pnpm --filter @tennis/web verify:api-parity"
```

Run it (either form is equivalent):

```bash
pnpm verify:api-parity                       # root script (Feature 48)
pnpm --filter @tennis/web verify:api-parity  # the web package directly
```

> **No test framework was added.** Feature 47 intentionally avoided Vitest, and Feature
> 48 keeps it that way — the harness is a plain `tsx` script that exits non-zero on
> drift, which is all CI needs. (Intake R12's full Vitest runner remains a later step.)

## 3. Domains & methods compared

**Courts — `MockCourtRepository` vs `HttpCourtRepository`:**

- `list()`, `list({ featured: true, limit: 6 })`, `list({ collection: 'coastal-courts' })`,
  `list({ surface: 'Clay' })`, `list({ access: 'Club' })`
- `search('Como')`, `list({ q: 'lake' })`
- `getBySlug('grand-hotel-tremezzo')` (hit), `getBySlug('not-a-real-court')` → `null`
- `getMapPins()`
- `getRelated('tremezzo', 4)`, `getRelated('como', 4)` → `[]` (no such court **id**),
  `getRelated('tremezzo', 2)`

**Collections — `MockCollectionRepository` vs `HttpCollectionRepository`:**

- `list()`, `list({ limit: 4 })`, `list({ featured: true })`
- `getBySlug('coastal-courts')` (hit), `getBySlug('not-a-real-collection')` → `null`

**Journal — `MockArticleRepository` vs `HttpArticleRepository`:**

- `list()`, `list({ limit: 3 })`, `list({ featured: true })`
- `getBySlug('the-world-as-a-tennis-map')` (hit), `getBySlug('not-a-real-article')` → `null`

> The `saved` and `user` domains stay on the **mock** even in `api` mode (Phase 4 / no `/v1/me`
> endpoints) and are **intentionally not** part of this harness.

Filter values (`Clay`, `Club`, `coastal-courts`, `lake`, …), the court id `tremezzo`, and the
slugs are taken from real `@tennis/mock-data` content so each filter exercises a non-empty path.
`getRelated('como', …)` deliberately uses a **non-existent court id** (the mock keys `getRelated`
off **id**, and no court has id `como`) — both sides must return `[]`.

## 4. Intentional normalizations

There is exactly **one** deliberate non-byte difference, and it is **narrow, documented, and
designed — not a bug being hidden** (prompt task 3 / hard rule "do not hide real parity bugs"):

| Field | Mock | API | Harness handling |
|---|---|---|---|
| `CourtDTO.lat` / `lng` (detail only) | present (Phase 1 has no entitlement gating, so the mock does not blur) | **omitted** (the public Prisma select never reads `Court.lat`/`lng`; the field is `.optional()` in the contract for exactly this reason) | strip `lat`/`lng` from the **mock** side before the `getBySlug` deep-equal (`stripExactCoords`). Nothing is added to the API side. |

This strip is the **only** place the harness normalizes, and it is scoped to exactly `lat`/`lng`
on court detail. Removing them cannot mask a leak: coordinate masking is asserted **independently**
by `assertNoExactCoords` (a separate, always-on check), so a real leak would fail that assertion
regardless of the strip.

`publishedAt` was originally a second expected difference (mock date-only `YYYY-MM-DD` vs API full
ISO `…T00:00:00.000Z`). Rather than normalize it in the harness, we fixed it at the source for
**true byte parity** — see §8.

## 5. Coordinate-masking assertions (prompt task 4)

On the **HTTP** responses the harness asserts:

- **No `lat` / `lng` key at ANY nesting depth** in `courts.list`, `courts.getBySlug`,
  `courts.getMapPins`, `courts.getRelated` (recursive key scan).
- **`approxLat` / `approxLng` + `mapCoords` are present** on every list element, every related
  element, and on the detail object.

(Rendered-HTML coordinate-leak scanning was assessed and deferred — the DTO-level guarantee plus
the structural masking in the service `select` is the stronger, faster check. See §10.)

## 6. Shape assertions (prompt task 5)

- **`courts.getBySlug`** returns exactly the `CourtDTO` keys (no Prisma internals, no `lat`/`lng`);
  `images` are present and ordered by `sortOrder` ascending.
- **`courts.getMapPins`** pins carry only `courtId`, `slug`, `mapCoords`, `state`.
- **`collections.getBySlug`** is a `CollectionDTO` **only** — it has `count`, **no `courts` key**,
  and no unknown keys (Risk #10 regression guard). `description` is optional and absent for
  `coastal-courts`, so the check verifies a subset relationship against the allowed key set rather
  than an exact list.
- **`journal.list`** returns full `ArticleDTO[]` — every item has `bodyRichText`, `author`, and
  `publishedAt`.

## 7. How to run locally

```bash
# 1. Postgres
pnpm db:up

# 2. Apply the clean init migration + seed (idempotent). If the dev DB is already
#    migrated + seeded (12 courts / 6 collections / 3 articles / 15 memberships) you
#    can skip this. A fresh DB needs a reset, which is destructive and (per the
#    Prisma AI-agent guardrail) must be run BY A HUMAN:
pnpm --filter @tennis/api prisma:migrate:reset   # applies init migration + runs seed
#    (or, if already migrated, just re-seed — non-destructive upserts):
pnpm --filter @tennis/api db:seed

# 3. Start the API (either form)
pnpm --filter @tennis/api dev
#    or, against the compiled output:
pnpm --filter @tennis/api build && node apps/api/dist/main.js

# 4. Run the parity harness
pnpm --filter @tennis/web verify:api-parity
```

Optional: `NEXT_PUBLIC_API_BASE_URL` overrides the base URL (default
`http://localhost:3001/v1`). No secrets are read or added.

If the API is not running the harness prints:

```
Cannot reach the API for parity verification.
  Tried: http://localhost:3001/v1/courts
  ...
  Start the dependencies first:
    pnpm db:up
    pnpm --filter @tennis/api db:seed
    pnpm --filter @tennis/api dev    # (or: node apps/api/dist/main.js)
```

## 8. Parity bug found & fixed: `Article.publishedAt`

**Real parity defect.** The mock `ARTICLES` store `publishedAt` as date-only `'YYYY-MM-DD'`. The
seed parses each via `new Date('YYYY-MM-DD')` → UTC midnight, and the article mapper serialized it
with `Date.prototype.toISOString()` → `'YYYY-MM-DDT00:00:00.000Z'`. That is a valid ISO-8601 string
(the contract is `z.string()`), but **not byte-identical** to the mock, so a `journal` deep-equal
diverged.

**Fix (source, not harness):** `apps/api/src/articles/articles.mapper.ts` now serializes
`value.toISOString().slice(0, 10)` → `'YYYY-MM-DD'`, exactly matching the mock. This was the
**already-documented intended fix** (the prior mapper comment flagged `.slice(0, 10)` as the path
"if a future HTTP-repository parity test demands the exact date-only form" — this harness is that
test). It is timezone-safe (`toISOString()` is always UTC, so the date never shifts) and the UI is
**unaffected**: `ArticleCard`/`ArticleMeta`/`ArticleByline` do `new Date(iso).toLocaleDateString(…)`
and `<time dateTime={iso}>`, both of which parse the date-only form to the same instant the full
timestamp produced. No UI change, no contract change.

The stale comment on `http-article.repository.ts` (which said `publishedAt` arrives as a full
timestamp) was updated to match.

## 9. Live result

API up (Postgres seeded: 12 courts / 6 collections / 3 articles / 15 memberships), `tsx` harness:

```
Total checks: 35   Passed: 35   Failed: 0
PARITY VERIFIED — mock and API return equivalent DTOs.
```

The harness's discriminating power was confirmed in practice: the first run **failed** on the two
real differences (the masked `lat`/`lng` on detail, plus a too-strict shape assertion), then
**passed** once the `publishedAt` source fix + the documented detail-coord normalization + the
corrected shape check were in place.

## 10. Out of scope / deferred (unchanged from the hard rules)

- **No** product UI changes, new routes, new endpoints, auth, payments, entitlements, `/v1/me`,
  admin, or saved/user HTTP persistence. The saved/user mock behavior and the `ConsultationModal`
  UX are untouched.
- **Vitest/Turbo `test` task:** still **not** added — a full test runner remains intake R12. The
  harness is a runnable `tsx` script that already exits non-zero on failure, which is all the CI
  gate needs. Feature 48 promoted it into CI (see §12) **without** introducing a test framework.
- **Rendered-HTML coordinate scan:** deferred in favor of the DTO-level masking assertions plus the
  structural service-`select` guarantee (exact coords are never fetched for public reads). A full
  page-render scan would require booting the Next app and is heavier than this feature warrants.
- **Consultation** (`POST /v1/consultations`) is a write and is **not** part of read parity; it is
  excluded by design.

## 12. CI gate (Feature 48)

The harness now runs automatically on every PR and on pushes to `main`, as a second job
(`parity`) in **`.github/workflows/ci.yml`** (added alongside the existing `verify` job rather
than as a separate workflow file, to keep all CI in one place). The job is Linux (Ubuntu) and
self-contained:

1. **checkout** + **pnpm/Node setup** (`pnpm/action-setup@v4` v11, `setup-node@v4` Node 20, pnpm
   cache) — identical to the `verify` job.
2. **`pnpm install --frozen-lockfile`** + **`prisma:generate`**.
3. **Postgres 16** as a GitHub Actions **service container** (user/pw/db `tennis`/`tennis`/
   `tennis_world`, port 5432 — matching `docker-compose.yml`), gated on a `pg_isready` health
   check so steps only start once the DB accepts connections.
4. **`prisma migrate deploy`** — applies the committed migrations to the fresh, disposable CI DB.
   Deliberately **not** `migrate reset`: `deploy` is non-interactive and needs no destructive-reset
   confirmation (the Prisma AI-agent guardrail blocks reset without a human), and the CI DB is
   empty so there is nothing to reset. `DATABASE_URL` is set as a job-level env var.
5. **`db:seed`** — the idempotent upsert seed (12 courts / 6 collections / 3 articles / 15
   memberships).
6. **Build + start the API** — `pnpm --filter @tennis/api build`, then `node apps/api/dist/main.js`
   in the background (PID stashed in `$GITHUB_ENV`).
7. **Wait for `/v1/health`** — a plain `curl` retry loop (30 attempts × 1 s; **no `wait-on`
   dependency added**), failing the job if the API never becomes healthy.
8. **`pnpm verify:api-parity`** — the root pass-through to the harness. Exits non-zero on any drift,
   which fails the job. `NEXT_PUBLIC_API_BASE_URL` is set to the default for clarity.
9. **Stop API** (`if: always()`) — kills the background process for a clean teardown; the service
   container is torn down by the runner automatically.

**What 35/35 means in CI:** every deep-equal, coordinate-masking, and shape check in §3–§6 passed —
the mock and the live API returned equivalent DTOs for all public read domains. Any single failing
check turns the harness exit code non-zero and fails the `parity` job, surfacing the drift on the PR.

> **Known non-blocking issue (unchanged):** `pnpm format:check` has a **pre-existing, unrelated**
> failure — `prettier.config.js` can't resolve `@tennis/config`. It is **not** wired into either CI
> job and does not gate parity. Left as-is (out of scope for this infra feature).

## 11. Next recommended feature

**Feature 49: Promote the parity comparison logic into a Vitest workspace runner (intake R12).**
Now that parity is a CI gate, the natural next step is to wrap the deep-equal/masking/shape
comparisons from `verify-api-parity.ts` in a real test framework (Vitest at the workspace root),
add a Turbo `test` task, and have the `parity` CI job invoke `pnpm test` — giving per-check
reporting, watch mode, and a home for future unit tests, while reusing the existing comparison
helpers verbatim.
