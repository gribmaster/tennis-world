# TASK 08 / FEATURE 75 — Country aggregate endpoint

**Model: Opus 5, reasoning effort: high.** Small surface, but it crosses API, contracts,
both web repositories and the parity harness — the places where a careless choice becomes
a contract you have to live with.

Task:
Add a `GET /v1/countries` read that returns each country with its published-court count and
a representative image, plus the web repository seam and parity coverage. **No UI in this
feature** — nothing under `apps/web/src/features/**` or `apps/web/src/app/**` changes. The
Collections screen consumes this in Feature 76.

Context:
- Read `CLAUDE.md` first — §8 (Prisma), §9 (scope discipline). Then
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.5 (the Collections screen's "By Country" strip)
  and §8 (the decisions table).
- `/v1/countries` was planned in `docs/IMPLEMENTATION_BACKLOG.md` under Phase 2 and never
  built. Confirm that for yourself: there is no `countries` module under `apps/api/src`.
- The prototype's strip shows, per country: a circular photo, the country name, and
  "N courts" (`CollectionsScreen`, the "By Country" section). Read it from the stripped
  prototype — the base64-stripping recipe is in `docs/TASK_07_FEATURE_74_HOME.md`.

## THE IMAGE GAP — decide this deliberately

`model Country` is `{ id, name, isoCode, continent, regions, courts }`. **There is no image
field.** The prototype fakes it with a hardcoded Unsplash photo per country. So the image
has to come from somewhere real.

Take the option that needs no schema change: **derive the image from a representative
published court in that country**, using `CourtSummaryDTO.heroImageUrl`, which every court
already has.

"Representative" must be **deterministic** — the same country must produce the same image on
every request and in both mock and API modes, or `verify:api-parity` fails intermittently,
which is far worse than failing outright. Choose an explicit, stated ordering (the existing
`seedOrder` column exists precisely to make court ordering reproducible; `isFeatured` is
available as a first-level preference). Write the rule down in a comment and in your report.
A country with no published court must not appear in the response at all — a zero-count
country with no image is not a thing the strip can render.

Do NOT add `Country.imageUrl` and a migration in this feature. Curated per-country
photography is a content decision with no content behind it yet; if it is wanted later it is
an additive column plus an admin surface, and the derived value becomes the fallback.

## Requirements

1. **API module.** A new `countries` module under `apps/api/src`, following the shape the
   existing `collections` module already uses (controller / service / mapper / module).
   `GET /v1/countries`. Read-only. Do not bolt this onto the courts controller.

2. **Only published courts count.** The count and the representative-image pick must both
   respect `status = published`, exactly as `courts.service.ts` does. A draft court must not
   inflate a count or supply an image.

3. **DTO.** A new schema in `packages/contracts/src/` (its own file, following
   `collection.ts`'s shape). Carry what the strip needs and nothing more: the country's name,
   its ISO code, its continent, the published-court count, and the representative image URL.
   **`Region.lat` / `Region.lng` must not appear anywhere in this response**, directly or
   nested. Country/region geo is not part of this read and the public surface stays free of
   it. State in your report that you checked.

4. **Ordering.** The endpoint returns a stable, meaningful order — decide it and say why.
   Alphabetical by name and descending by court count are both defensible; an
   insertion-order accident is not. Whatever you choose, mock and API must produce the same
   order.

5. **Web repository seam.** A new `apps/web/src/domain/countries/` with the repository
   interface plus mock and http implementations, wired through the existing factory in
   `apps/web/src/domain/index.ts`. Follow the collections domain exactly — do not invent a
   different pattern. Per the ESLint boundary, only `src/domain/**` may import `mock-*` /
   `http-*` modules.
   The mock implementation derives its answer from `@tennis/mock-data` using the SAME rules
   the API service uses. Those rules are the thing most likely to drift; say in your report
   how you kept them from drifting.

6. **Parity coverage.** Extend `apps/web/scripts/verify-api-parity.ts` with a countries
   section comparing mock and HTTP, in the style of the existing court/collection/journal
   sections: deep equality on the list, plus a shape assertion that the DTO carries exactly
   the expected keys and no Prisma internals and no lat/lng at any depth. The total check
   count rises above 35 — report the new number.

Do not change:
- The Prisma schema, or add any migration. This feature is a read over existing tables.
- Anything under `apps/web/src/features/**` or `apps/web/src/app/**`. No UI.
- `apps/web/src/components/filters/**` (Features 73/74's shared module).
- The existing `/v1/courts*`, `/v1/collections*`, `/v1/articles*` responses — byte-unchanged.
  If you find yourself editing `courts.mapper.ts`'s public selects, stop and reconsider.
- Auth, entitlements, the exact-location gate, billing.
- No package installs. No git commit or push.

Testing:
- `pnpm --filter @tennis/api prisma:generate`, `pnpm typecheck`, `pnpm build`, `pnpm lint`.
- `pnpm verify:api-parity` — with the API running on 18001 and a seeded local database.
  Report the new total. A parity failure here is the whole point of the harness; do not
  report the feature complete without a clean run, and if you cannot run it, say so plainly
  rather than implying it passed.
- `curl` the new endpoint once and paste the actual response for the 12 seeded courts, so
  the counts and the derived images can be eyeballed.

Report back:
1. The exact "representative court" rule, and why it is deterministic.
2. The response ordering you chose and why.
3. The DTO's fields, and confirmation that no `lat`/`lng` appears at any depth.
4. How the mock and API implementations are prevented from drifting on the count and image
   rules.
5. The raw response body for the seeded data.
6. The new `verify:api-parity` total, and pass/fail for every check above.
