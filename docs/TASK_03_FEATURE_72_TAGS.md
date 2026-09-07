# TASK 03 / FEATURE 72 — `Court.tags` data groundwork

Task:
Add a persisted, filterable `tags` field to Court, end to end: Prisma schema + back-safe
migration, `@tennis/contracts` DTO, API select/mapper, a `tags` query filter, mock-data
authoring, and the content importer. **No UI work in this feature** — no component under
`apps/web/src/features/**` or `apps/web/src/components/**` changes.

Context:
- Read `CLAUDE.md` first (standing rulebook — §8 Prisma, §9 scope discipline apply hard
  here), then `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §1.3, §1.4 and §3 "D3", which planned
  this work. This task **supersedes the intake's D3 implementation plan on one point** —
  see TAG VOCABULARY below.
- This is Feature 72, the first implementation feature of the Design v2 redesign and a
  hard dependency of Features 73, 74, 77 and 78. Nothing else in the redesign starts until
  this lands.

## DECISIONS THAT OVERRIDE THE INTAKE

**The intake proposed deriving tags by parsing `content/*/info.txt`'s `type:` line. Do not
do that.** That field holds free text like
`"FRENCH RIVIERA, clay courts · pampelonne beach · boutique hotel"` and
`"hard court · garden court · historic park · public court"`. Parsing it yields an
open-ended set containing one-off values (`pampelonne beach`, `saint-tropez hills`) and
values that duplicate fields that already exist (`clay courts` duplicates `surface`,
`indoor court` duplicates `indoorOutdoor`, `private club` duplicates `access`). A filter
UI needs a closed set, and a chip row must not show the same fact twice.

**TAG VOCABULARY — closed, exactly these ten values, in this exact casing:**

```
Sea View
Beach Club
Mountains
Lakeside
Garden
Historic
Jungle
Island
Rooftop
Countryside
```

This vocabulary covers the "Experience" dimension only. It deliberately does NOT contain
surface, access, indoor/outdoor or scenic values, because those already have fields:

| Fact | Comes from | NOT a tag |
|---|---|---|
| Clay / Hard / Grass | `surface` | ✓ |
| Resort / Club / Academy / Private | `access` | ✓ |
| Indoor / Outdoor | `indoorOutdoor` | ✓ |
| Scenic | `isScenic` | ✓ |

The vocabulary is closed for this feature: do not add, rename or re-case a value, and do
not introduce a "misc"/"other" escape hatch. If you find a court that genuinely fits none
of the ten, give it an empty tag list and say so in the report rather than inventing a
value.

## THE TWO COURT DATASETS — read this before authoring anything

`packages/mock-data/src/courts.ts` and `content/*/info.txt` describe **different courts**.
Confirm this yourself before starting; it is the main trap in this feature.

- `packages/mock-data/src/courts.ts` — 12 demo courts, worldwide (Grand Hotel Tremezzo,
  Hotel Punta Tragara, Royal Mansour, Belmond La Residencia, Como Shambhala Estate, The
  Little Nell, Cheval Blanc Randheli, Aman Tokyo, Soho Farmhouse, Monte-Carlo Country
  Club, Six Senses Douro, Hotel du Cap-Eden-Roc). This is what `prisma/seed.ts` writes and
  therefore what the CI parity job and `NEXT_PUBLIC_DATA_SOURCE=mock` both see.
- `content/*/info.txt` — 12 real French Riviera / France courts, imported into the
  production database by `apps/api/scripts/import-courts-from-content.ts` (commit
  `657b5d4 feat(courts): replace demo courts with new content`).

**Both sets need tags.** Mock-data needs authored tags so mock↔api parity holds in CI;
the importer needs to produce tags so production courts get them on the next import.

## Requirements

1. **Schema.** Add the tags field to `model Court` in `apps/api/prisma/schema.prisma`.
   Choose between a Postgres `String[]` column and a normalized tag table, and justify the
   choice in the report against: the filter query in requirement 4, the closed
   ten-value vocabulary, and the fact that no admin UI exists to manage a tag table
   (Phase 3 is unbuilt). Default to the simpler option unless you find a concrete reason
   not to.

2. **Migration.** One migration, back-safe per CLAUDE.md §8: authored with
   `prisma migrate diff`, applied with `prisma migrate deploy`. **Do not run
   `prisma migrate dev`** — it hangs in this non-interactive shell. Existing rows must
   survive: the column defaults to empty, is backfilled, and only then gains any
   constraint. Never edit an already-applied migration. Nothing is run against staging or
   production by this task.

3. **Contracts.** Add the field to `CourtSummarySchema` in
   `packages/contracts/src/court.ts` (it is needed on cards, so it belongs on the summary,
   not only the detail DTO). It inherits into `CourtSchema`. This is public, always-visible
   metadata — it is **not** location data and must not be entangled with the
   exact-location gate in any way.

4. **API.** Extend the court mapper's public selects to carry tags, and add a `tags` query
   parameter to `GET /v1/courts` alongside the existing `q`/`country`/`surface`/… filters
   in `apps/api/src/courts/courts.service.ts`. Decide and document the semantics for
   multiple tags — AND (court has every listed tag) or OR (court has any) — picking what
   the prototype's filter sheet implies, and state which you chose in the report. Keep the
   existing filter behavior byte-identical; this is additive only.

5. **Author the mock-data tags.** For each of the 12 courts in
   `packages/mock-data/src/courts.ts`, assign tags from the vocabulary. **Ground every tag
   in that court's own existing data** — its `setting`, `blurb`, `name` and location — and
   in the report quote the words that justify it. Do not assign a tag from outside
   knowledge about the real-world hotel: if the court's own record does not support the
   tag, do not add it. Zero tags is an acceptable answer for a court.

6. **Extend the importer.** `apps/api/scripts/import-courts-from-content.ts` must emit
   tags for the `content/*/info.txt` courts, mapping the free-text `type:` phrases onto
   the closed vocabulary through **one explicit, readable mapping table in code** — not a
   regex guess, not a fuzzy match. The same table is the single source of truth, so the
   mapping is auditable and reproducible. Report the resulting tag list per content court.
   **Do not run the importer against any database** in this task; building and typechecking
   it is enough.

7. **Parity.** Mock and API must agree exactly — same tags, same order, same casing — or
   `verify:api-parity` fails deterministically (intake §5 Risk #4). Decide the canonical
   ordering (vocabulary order is the obvious choice; authored order is not stable) and
   enforce it in one place so both paths produce it.

Do not change:
- Any file under `apps/web/src/features/**` or `apps/web/src/components/**`. No UI.
- The `Surface` enum — `Carpet` is NOT being added (intake §7 Q6, decided).
- Any auth, entitlement, exact-location, billing, Stripe or webhook code or behavior.
- The existing court filter semantics, response shapes, status codes or route paths.
- The 12 pre-existing modified `content/*/info.txt` files in the working tree — leave
  those edits alone, they are not yours; add tags through the importer's mapping table,
  not by rewriting content files.
- No package installs. No git commit or push. No database migration run against staging
  or production.

Testing:
- `pnpm --filter @tennis/api prisma:generate`
- `pnpm typecheck` and `pnpm build` (or the filtered API/contracts equivalents)
- `pnpm verify:api-parity` — this is the harness that matters for this feature. If it
  cannot run because no seeded local database is available, say so explicitly and state
  what would be needed; do not silently skip it and report success.

Report back:
1. Which schema shape you chose for tags, and why.
2. The migration file name and the exact back-safe sequence it performs.
3. The multi-tag filter semantics you chose (AND or OR) and the reasoning.
4. **A table: the 12 mock-data courts × their assigned tags, with the quoted source words
   justifying each tag.**
5. **A table: the 12 content courts × their assigned tags, and the `type:` phrases each
   was mapped from.**
6. Any court that ended up with zero tags, and why.
7. Files changed, and the pass/fail counts from every check above — including any that
   could not be run, and why.
