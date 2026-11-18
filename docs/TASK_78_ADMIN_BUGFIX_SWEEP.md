# TASK 78 — Admin bug-fix sweep (everything open from the TASK_73–77 reviews)

**Model: Sonnet 5, reasoning effort: high.** Four small, independent fixes. Each is a defect found while verifying the executor reports against the code; none is a new feature. Read the named files before touching them. Do the four in the order listed and keep each one's diff tight.

## Decisions already made (do not re-litigate)

### 1. `PATCH /v1/admin/courts/:id` still decides from a stale snapshot (API)

`AdminCourtsService.update()` reads `existing` **before** the transaction/lock and then (a) checks slug immutability against `existing.status`, and (b) builds the whole row as `dto.x ?? existing.x`. Two defects follow even though the court row is now locked for the write:
- **Lost update:** two admins (or two tabs) patching *different* fields at the same moment — A changes `name`, B changes `blurb` — both read the same snapshot; the later writer overwrites the other's field with the stale value.
- **Slug race:** a slug change validated against a stale `draft` status can land after a concurrent publish committed.

Fix inside `update()`: take the court row lock first (as today), then **re-read the court (with its images) inside the transaction after the lock** and compute everything that depends on stored state from that fresh row — slug-immutability check (`status === 'published'` → 409), the `dto.x ?? fresh.x` merge, `latLngChanged`/approx recomputation base values, the publish gate input, `assertNotZeroZero` on the merged lat/lng. Pure request-shape validation (DTO validators, `validateMapLinkUrl`, tag normalisation, slug pattern) stays outside. Unknown id → still 404 (check it from the in-lock read; you may keep one cheap pre-lock existence check for the early 404, but never use its data for decisions). Region/country consistency (`assertCountryRegion`) must use the **merged** country/region ids from the fresh row, evaluated in the transaction. All existing success/error behaviour of the endpoint (status codes, bodies, `missing` list, slug 409, derived fields) stays byte-identical.

Add a one-line note to the CLAUDE.md "Admin API" section (§11): "Slug immutability applies while a court is **published**; unpublishing re-allows a slug change (there is no 'was ever published' column — renaming a once-public slug breaks old links, so don't)."

### 2. Photo panel runs a side effect inside a state updater (admin UI)

`CourtPhotosPanel` calls `onChanged()` (which triggers the parent's refetch/state change) from inside the function passed to `setPendingUploads(...)`. State updaters must be pure: React may call them twice (StrictMode) and warns when another component is updated while one renders ("Cannot update a component … while rendering a different component").

Fix: keep the in-flight count and the "any success in this batch" flag in **refs** (or a tiny pure helper), update React state with plain `setPendingUploads(ref.current)` and call `onChanged()` **after** the count reaches 0, from the queued task's `finally`, never from an updater. Preferred shape: extract `apps/admin/src/lib/upload-batch.ts` exporting `createUploadBatchTracker({ onPendingChange, onDrained })` with `start()` / `finish(success: boolean)`; `onDrained(hadSuccess)` fires exactly once per drained batch, and not at all when every file failed. Unit-test it (see Testing). Behaviour must stay exactly as TASK_77 specified: spinner until the last queued file finishes, one refetch per batch, none if all files failed, serial order untouched.

### 3. `verify:admin-courts` can silently run fewer checks than it claims (API harness)

- The check "region from another country → 400" looks for *any* other country via `prisma.country.findFirst(...)` with no `orderBy` and **skips** when it picks one with no regions — the TASK_74 report's 221-vs-220 difference came from this nondeterminism (the report's explanation, "DB has one country", does not fit a database with 11 seeded countries). Replace it with a deterministic check: the harness **creates its own second fixture country + region** (prefix `f73-`, cleaned in the existing `finally`) and uses it as the "other" region. No DB-state-dependent conditionals may remain in the harness.
- `skip(...)` only prints a line; the final summary shows only passed/failed. Make the harness **count skips and print `Skipped: N`** in the summary line, list the skipped names again at the end, and **exit non-zero if any skip occurred** unless the env `ALLOW_SKIPS=1` is set (the boot-spawn checks at the three other `skip(` sites may legitimately skip on a machine that cannot spawn; they must then be visible and opt-in, never silent). Update the harness header comment accordingly.
- Re-run twice back-to-back and report that the total is identical both times. Note the documented 15-minute admin-login lockout: **restart the API between runs** (the limiter is in-memory).

### 4. Nothing else
Do not change anything outside the files these three fixes need. In particular, leave the `/map` grid/count behaviour, the public API, and all route paths alone.

## Testing

Extend `apps/api/scripts/verify-admin-courts.ts` and `apps/admin/scripts/verify-admin-ui.ts` (same `record()` style; keep every existing check green) and report both new totals:

**API**
1. **Lost update:** for a draft court, fire `PATCH {name}` and `PATCH {blurb}` in parallel (`Promise.all`), repeat 8× on fresh courts; afterwards the court has **both** new values every time. **Prove the test can fail:** temporarily make `update()` merge from the pre-lock snapshot again, show at least one run losing a field (report numbers), restore. If it cannot be made to fail, say so and explain.
2. **Slug race:** on a draft court that is publishable, fire `PATCH {status:'published'}` and `PATCH {slug:'<new>'}` in parallel, 8×. Invariant (assert every run): it is **never** the case that the slug-change returned 200 **and** the publish response still carries the old slug **and** the final status is `published` (= slug changed after publication committed). Valid outcomes are the two serial orders: {publish 200, slug 409, slug unchanged} or {slug 200, publish 200 with the new slug}.
3. **Existing behaviour unchanged:** slug 409 on a published court, 422 `missing` list, derived-field recomputation, region/country mismatch 400, 404 for unknown id — all still covered by existing checks.
4. **Deterministic harness:** the region-mismatch check now always runs; the summary prints `Skipped: 0`; two consecutive runs (API restarted between) have the same total.
5. Regression (unchanged): `verify:court-geo-redaction` 66/66 (disable `DEV_FORCE_MEMBERSHIP=subscribed` in the local `apps/api/.env` for the run and **restore it**), `verify:effective-entitlement` 155/155, `verify:api-parity` 42/42, `verify:api-auth` (all sub-harnesses).

**Admin UI**
6. `createUploadBatchTracker`: `onDrained` fires exactly once per drained batch; with `finish(false)` for every file it never fires; mixed success/failure fires once with `hadSuccess = true`; a second batch after a drain behaves independently; `onPendingChange` reports the exact counts; **none of the callbacks is ever invoked re-entrantly from inside another's call stack in a way that nests** (assert call order with a log array).
7. Source scan: no call to `onChanged`/`onDrained`-style callbacks inside a `setState(updater)` function in `CourtPhotosPanel.tsx` (a simple regex scan is enough — fail if `set\w+\(\s*\(?\w*\)?\s*=>` is followed within its body by `onChanged(`).
8. If you have a browser tool: in dev mode (React StrictMode on) upload 3 files and confirm the browser console shows no "Cannot update a component" warning; otherwise state that it was not observed.

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; **delete `apps/web/.next` before restarting dev**).

## Do not touch

`apps/web`, migrations/Prisma schema, any route path or response shape, `/map` page behaviour, the importer, limiter logic, and any file not needed by the four fixes. No new dependency. No git commit or push unless asked.

## Report

1. Files changed.
2. Fix 1: the before/after of the lost-update test (and whether it failed without the fix), the slug-race outcomes observed, and the final structure of `update()` (what is read outside vs inside the lock).
3. Fix 2: the tracker's API and test results; whether the StrictMode warning was observed before/after (or not observed).
4. Fix 3: new `verify:admin-courts` total, `Skipped: N`, and the two-run comparison.
5. Regression table, no unexplained skips.
6. Anything else you noticed (report only).
7. The exact commands run.
