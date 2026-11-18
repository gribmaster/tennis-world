# TASK 76 — Two small admin API fixes (map-link validator bypass, publish-vs-delete race)

**Model: Sonnet 5, reasoning effort: medium.** Tiny, surgical. Read `apps/api/src/admin/courts/admin-map-link.util.ts`, `apps/api/src/admin/courts/admin-courts.service.ts` and `apps/api/src/admin/images/admin-images.service.ts` first. No other changes.

## Goal

Review of the TASK_75 report found two real defects that the harness does not cover.

## Decisions already made (do not re-litigate)

1. **`validateMapLinkUrl` host allowlist is bypassable through the prototype chain.** `HOST_PATH_RULES` is a plain object and is indexed with the URL's hostname, so a hostname that names an `Object.prototype` member resolves to an inherited function: `https://constructor/anything` is **accepted** today (`HOST_PATH_RULES['constructor']` is `Object`, called with the pathname it returns a truthy `String`), and `https://__proto__/x` throws a `TypeError` → HTTP 500. The hostnames are single-label so they are not publicly routable, but an allowlist that accepts hosts it never listed is a defect.
   - Fix: look the host up in a `Map<string, (pathname: string) => boolean>` (or guard with `Object.hasOwn(HOST_PATH_RULES, hostname)`); pick one, keep the rule table and messages exactly as they are. Any hostname not explicitly listed → the same 400 as today. Nothing may throw a non-`HttpException` for any input string.
2. **Publish can race an image delete.** `AdminImagesService` now row-locks the court (`lockCourtRow`) for every image mutation, and `delete` re-reads inside the lock — correct. But `AdminCoursesService.patch` evaluates the publish gate against `existing.images` read **outside any transaction or lock**. Interleaving: admin A publishes (gate sees 1 image, passes); admin B (second tab) deletes that image while the court is still `draft` (allowed); A's update commits → a **published court with zero images** and no hero, which the public API then serves with an empty `heroImageUrl`.
   - Fix: in `patch` (and in `create` when `status: 'published'` — there it is trivially safe because a new court has no images, leave it), take the **same court row lock** (`SELECT id FROM "Court" WHERE id = $1 FOR UPDATE`, as `lockCourtRow` does) as the first statement of the transaction that performs the update, **re-read the court's images and current status inside that transaction after the lock**, evaluate `publishGateMissing` on those fresh rows, and only then write. A 422 must still be thrown from inside the transaction (it rolls back).
   - Reuse, don't duplicate: move `lockCourtRow` to a tiny shared helper (e.g. `apps/api/src/admin/courts/court-lock.ts`) imported by both services. Do not change what it locks or how.
   - Behaviour for every existing success/error path of `PATCH /v1/admin/courts/:id` (200 shape, slug immutability 409, validation 400, 422 `missing` list, derived-field recomputation) must be byte-identical.

## Testing

Extend `apps/api/scripts/verify-admin-courts.ts` (same harness, `f73-` fixtures, keep all 198 checks green) and report the new total:

1. **Validator:** `https://constructor/x`, `https://toString/x`, `https://valueOf/x`, `https://hasOwnProperty/x`, `https://__proto__/x`, `https://prototype/x`, `https://constructor/maps` → all **400** (never 200, never 500), through the real `POST/PATCH /v1/admin/courts` endpoints and directly against the function. Every previously accepted/rejected case from TASK_75 Testing §3 still behaves identically.
2. **Race:** for a draft court with exactly **one** image, fire in parallel `PATCH { status: 'published' }` and `DELETE` of that image; repeat on 8 fresh courts. After each run assert the invariant "**a published court always has ≥ 1 image and exactly one hero**" — i.e. the outcomes are either {publish 200, delete 409} or {delete 204, publish 422}, never {both succeed}. **Prove the test can fail:** temporarily remove the new lock, show the invariant breaking at least once in N runs (report the numbers), then restore it. If it cannot be made to fail without the lock, say so and explain.
3. **Regression:** `verify:court-geo-redaction` 66/66 (disable `DEV_FORCE_MEMBERSHIP=subscribed` in the local `apps/api/.env` for the run and restore it), `verify:effective-entitlement` 155/155, `verify:api-parity` 42/42, `verify:api-auth` (all sub-harnesses), and the full `verify:admin-courts`. Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; delete `apps/web/.next` before restarting dev).

## Do not touch

Anything not named above: the public API, `apps/web`, `apps/admin`, the Prisma schema/migrations, route paths, the limiter code, the importer. No new dependency. No git commit or push unless asked.

## Report

1. Files changed (and the new shared helper's path).
2. The before/after result of the race check, including whether it failed without the lock.
3. The validator results for every hostname listed in Testing §1.
4. New `verify:admin-courts` total and the regression table, no skips unexplained.
5. Anything else security-relevant you noticed (report only).
6. The exact commands run.
