# TASK 05 — Two dev-tooling fixes (seed idempotency, parity harness default port)

**Model: Sonnet 5, reasoning effort: medium.** Two small, well-diagnosed fixes. No design
judgment required.

Task:
Fix two pre-existing dev-tooling defects that each cost a developer a debugging round
during Feature 72. Neither is a product bug; both will recur on every remaining redesign
feature if left alone.

Context:
- Repo root: D:\work\tennis. Read `CLAUDE.md` §8 (Prisma) and §9 (scope discipline) first.
- These are **not** part of any redesign feature. Keep this change self-contained so it can
  be committed on its own.

## Fix 1 — `prisma/seed.ts` upserts on the wrong key

`seedCourts()` in `apps/api/prisma/seed.ts` (~line 186) does:

```ts
await prisma.court.upsert({
  where: { id: c.id },
  create: { id: c.id, ...data },
  update: data,
});
```

`Court.slug` is `@unique`. When the target database already holds a court with the same
slug but a different id, the upsert misses on `id`, takes the create branch, and dies with
`P2002 Unique constraint failed on the fields: (slug)`.

This is reachable in normal use, not a corner case: `packages/mock-data/src/courts.ts`
(what the seed writes) and `content/*/info.txt` (what
`scripts/import-courts-from-content.ts` writes) are different court sets that **share two
slugs** — `hotel-du-cap-eden-roc` and `monte-carlo-country-club`. Any database that has
ever had the content importer run against it can never be seeded again without a full
reset.

**Fix:** key the upsert on `slug`, the unique business key, rather than `id`. `id` is an
authored constant in mock-data, not an identity the database is guaranteed to share.
Keep `id` in the `create` branch so a fresh seed still produces the mock-authored ids that
other seed functions depend on (`seedCourtImages()` builds image ids as
`${c.id}-img-${sortOrder}`, and the collection join rows reference court ids) — verify
that dependency yourself before changing anything, and say in the report what you found.

Consider whether the same wrong-key pattern exists in the other `seed*` functions in that
file (collections, articles, images, join rows). Fix any that have it; report any that
are already correct. **Do not restructure the seed beyond this** — no rewrite, no
reordering, no new abstractions.

**Note for the report:** if keying on `slug` means a re-seed would now overwrite a
content-imported row that shares a slug, say so explicitly. The seed is a local/CI tool
(`CLAUDE.md` §2: the CI parity job runs `migrate deploy` → `seed`) and is never run
against production, but the behavior change should be stated, not discovered later.

## Fix 2 — parity harness defaults to a port the project does not use

`apps/web/scripts/verify-api-parity.ts:200`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';
```

The project's local API is `http://127.0.0.1:18001/v1` — `PORT=18001` in
`apps/api/.env`, and `CLAUDE.md` §3 documents 18001 as the local API. `3001` is the
NestJS code default, not this project's. The script runs under `tsx`, which does not load
`apps/web/.env.local`, so the correct value sitting in that file is never picked up and
the harness fails its preflight against the wrong port.

**Fix:** make the default match the documented local API (`http://127.0.0.1:18001/v1`).
`NEXT_PUBLIC_API_BASE_URL` must still override it. Update the two places that print the
old default — the header comment at ~line 24 and the preflight error message at ~line 224
— so the error no longer instructs the developer to use a port nothing listens on.

Then check the sibling harnesses in `apps/web/scripts/` and `apps/api/scripts/` for the
same hardcoded `3001` default and fix each the same way. Report which files you changed
and which were already correct.

**Do not** make the scripts load `.env.local` — that is a Next.js runtime concern and
wiring a dotenv loader into these harnesses is more change than the problem warrants.
Fixing the default is enough.

Do not change:
- Any product code: nothing under `apps/web/src/**`, `apps/api/src/**`, or
  `packages/contracts/**`.
- The Prisma schema or any migration.
- The parity assertions themselves — only the base-URL default and the messages naming it.
- Feature 72's changes, if they are still uncommitted in the working tree.
- No package installs. No git commit or push.

Testing:
- `pnpm typecheck` and `pnpm build`.
- `pnpm verify:api-parity` with the API running on 18001 and **without**
  `NEXT_PUBLIC_API_BASE_URL` set — this proves the new default works. Expect 35/35.
- Re-run the seed against the already-seeded local database
  (`pnpm --filter @tennis/api db:seed`) — it must now succeed on a second run instead of
  throwing P2002. That idempotency is the whole point of Fix 1; a seed that only works on
  an empty database is not fixed.

Report back:
1. The `where` key each `seed*` function now uses, and which ones you had to change.
2. What you found about `id` dependencies between seed functions, and how you preserved
   them.
3. Whether a re-seed can now overwrite a content-imported row, stated plainly.
4. Every file whose `3001` default you changed.
5. Pass/fail for typecheck, build, the two seed runs, and parity (with the count).
