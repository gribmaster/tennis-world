# TASK 50 — Court tags: close the phrase-map gap so more real courts get tagged

**Model: Sonnet 5, reasoning effort: medium.**

## Context (confirmed by reading the actual code + the local content set)

Reported symptom: on live, most/all court cards show no "Experience" tag chips,
while locally they do. Traced this to DATA, not a code bug that strips tags in one
environment — confirmed `tags` is selected/returned unconditionally, no env gating,
in both `courts.mapper.ts` (`tags: true` in the select, `tags: orderCourtTags(row.tags)`
in every DTO mapper) and the contracts schema (`packages/contracts/src/court.ts`:
`tags: z.array(CourtTag)`, always present).

The real cause: `Court.tags` (`String[] @default([])` since migration
`20260907120000_add_court_tags`) is populated two different ways depending on how a
court entered its database:

- **Locally, via `pnpm db:seed`**: `apps/api/prisma/seed.ts` sets `tags: c.tags`
  straight from `packages/mock-data`'s hand-curated `COURTS` array — every one of
  those courts has tags authored directly in code, so they always show.
- **On a real deployment, via the content importer**
  (`apps/api/scripts/import-courts-from-content.ts`): tags are DERIVED by matching
  each court's `type:` phrase list (from its `content/<court>/info.txt`) against
  `TAG_PHRASE_MAP` — a small, explicit, intentionally-non-fuzzy table (its own
  comment: "TAGS ARE NOT GUESSED... no fuzzy matching... A phrase with no entry
  contributes no tag; that is a deliberate outcome"). A court whose content phrasing
  doesn't happen to match one of the mapped phrases gets `tags: []` — not a bug,
  exactly as designed, but the table is thinner than it needs to be:

**The closed vocabulary (`COURT_TAG_VALUES`, 10 values) has phrase-map coverage for
only 6 of them.** `Jungle`, `Island`, `Rooftop`, and `Countryside` have **zero**
entries in `TAG_PHRASE_MAP` — no phrase, however worded, can ever produce one of
these four tags today. That's independent of whatever real content says; it's a gap
in the table itself.

(Checked the 13 courts in this repo's own `content/` folder as a sanity check —
their `type:` lines already match the 6 currently-mapped categories fine
individually — e.g. "sea view", "lake estate", "art deco" are all present and do
match. So this small local set isn't itself the missing-tags evidence; it's
whatever larger/different content set produced the live database that's presumably
hitting the gap, especially the 4 completely unmapped categories.)

## The fix

### `apps/api/scripts/import-courts-from-content.ts` — extend `TAG_PHRASE_MAP`

**1) Add entries for the 4 completely unmapped tags.** These are unambiguous —
regardless of what real content says, today NO phrase can ever produce them, so
this closes a real gap. Follow the existing table's style (a documentation
`phrase` label + a case-insensitive, word-boundary-anchored `pattern`):

```ts
// Jungle / tropical
{ phrase: 'jungle', pattern: /\bjungle\b/i, tags: ['Jungle'] },
{ phrase: 'rainforest', pattern: /\brainforest\b/i, tags: ['Jungle'] },
{ phrase: 'tropical garden', pattern: /\btropical\b/i, tags: ['Jungle'] },
// Island
{ phrase: 'island', pattern: /\bisland\b/i, tags: ['Island'] },
// Rooftop
{ phrase: 'rooftop court', pattern: /\brooftop\b/i, tags: ['Rooftop'] },
{ phrase: 'roof terrace', pattern: /\broof\s*terrace\b/i, tags: ['Rooftop'] },
// Countryside
{ phrase: 'countryside estate', pattern: /\bcountryside\b/i, tags: ['Countryside'] },
{ phrase: 'vineyard estate', pattern: /\bvineyard\b/i, tags: ['Countryside'] },
{ phrase: 'château', pattern: /\bch[aâ]teau\b/i, tags: ['Countryside'] },
```

Place each group in its own comment block, matching the existing "Sea / coast",
"Relief", "Water", "Greenery", "Heritage" section style — add "Jungle / tropical",
"Island", "Rooftop", "Countryside" sections in `COURT_TAG_VALUES` order.

**2) Broaden a few of the already-mapped 6 categories with additional common
synonyms** a real property listing is plausibly worded with, that this table's
current single example-phrase-per-category doesn't catch:

```ts
// Sea / coast — add alongside the existing 'sea view' / 'riviera' entries
{ phrase: 'oceanfront', pattern: /\bocean(front)?\b/i, tags: ['Sea View'] },
{ phrase: 'waterfront', pattern: /\bwaterfront\b/i, tags: ['Sea View'] },
{ phrase: 'coastal', pattern: /\bcoastal\b/i, tags: ['Sea View'] },
// Beach — 'beach' is already unanchored (\bbeach\b matches any token containing
// it), so it already catches "private beach club" etc.; no change needed there.
// Relief — add alongside 'saint-tropez hills' / 'alpine view' / 'mountain resort'
{ phrase: 'hilltop', pattern: /\bhill(top|side)\b/i, tags: ['Mountains'] },
// Water — add alongside 'lake estate'
{ phrase: 'lakefront', pattern: /\blakefront\b/i, tags: ['Lakeside'] },
{ phrase: 'lakeside', pattern: /\blakeside\b/i, tags: ['Lakeside'] },
// Heritage — add alongside 'heritage club' / 'art deco' / 'historic park'
{ phrase: 'manor', pattern: /\bmanor\b/i, tags: ['Historic'] },
{ phrase: 'centuries-old', pattern: /\bcenturies[-\s]?old\b/i, tags: ['Historic'] },
```

**These additions are reasonable, conservative guesses at common real-estate/hotel
phrasing — not verified against actual production `info.txt` files, since only this
repo's own 13-court `content/` folder is available here.** Say so plainly in the
report; don't present them as confirmed fixes for whatever the live content
actually says.

### The authoritative next step — use the script's own dry-run report

This script already has the exact mechanism designed for closing this gap
correctly: it tracks, per court, which `type:` phrases matched NO tag
(`untaggedTypeTokens`) and prints them in its dry-run report (`p.tags.length > 0 ?
... : '(none)'`, around line 1302). If you have access to the REAL content
directory the live database was (or will be) imported from — not just this repo's
own 13-folder demo set — run:

```
pnpm --filter @tennis/api db:import-courts-content -- --dry-run
```

against it, and read the console report for courts still showing `tags: (none)` or
listed untagged tokens. Add table entries for whatever phrases actually show up
there — that's real evidence, more trustworthy than the guesses in step 2 above.
If that real content directory isn't available in this environment, skip this step
and say so in the report; steps 1–2 stand on their own regardless.

## Important: this alone does not retroactively fix already-imported live courts

`TAG_PHRASE_MAP` only affects courts parsed by a FUTURE run of the importer. Courts
already sitting in the live database with `tags: []` stay that way until the
importer is re-run against them with `--replace` (or whatever the real
deploy/import process is) — **that is a data/deploy operation, not something to run
against the live database as part of this task.** Do not run `--replace` against
anything but a local/dev database while verifying this fix. Call this out clearly
in the report so it's understood as a separate follow-up step, not something this
code change alone resolves.

## Do not touch

- `packages/mock-data`'s `COURTS` — local dev data is already fully tagged; this
  task is entirely about the CONTENT-IMPORTER path.
- `courts.mapper.ts`, `packages/contracts/src/court.ts` — already correct
  (unconditional `tags` passthrough); confirmed above, no change needed.
- `SURFACE_TOKEN_PATTERN`/`ACCESS_TOKEN_PATTERN`/indoor-outdoor mapping, and the
  explicit rule that surface/access/indoor phrases must never ALSO become a tag
  (the file's own comment on why "clay court", "private club", "indoor court" etc.
  are deliberately absent from `TAG_PHRASE_MAP`) — don't blur that line when adding
  new entries; double-check none of the new phrases above collide with an existing
  surface/access/indoor pattern.
- `COURT_TAG_VALUES` itself, `CourtTag` in `packages/contracts/src/enums.ts` — the
  10-value vocabulary is unchanged; this task only improves COVERAGE of it.
- Any UI component that renders tags (`courtDisplay`, `courtCategoryTags`,
  `SavedCourtsGrid`, `HomeFeaturedCourts`, etc.) — this is a data/import-layer fix
  only.

## Testing

- `pnpm --filter @tennis/api db:import-courts-content -- --dry-run` against this
  repo's local `content/` folder still reports the same 6-category tags for the
  13 existing courts (no regression) — the new patterns are additive and
  shouldn't change any of their existing results, since none of the 13 courts'
  `type:` lines contain jungle/island/rooftop/countryside language today.
- If you added a synthetic test `info.txt` sample (or have access to real content
  with jungle/island/rooftop/countryside/oceanfront/etc. phrasing), confirm it now
  produces the expected tag(s) and doesn't ALSO trip a surface/access/indoor
  mismatch warning.
- `pnpm --filter @tennis/api typecheck`/`lint`/`build` clean (this script is
  TypeScript but not part of the Nest app's own build — confirm however this repo
  normally verifies it, e.g. `pnpm --filter @tennis/api exec tsc --noEmit` or
  equivalent, matching whatever CLAUDE.md documents for scripts under
  `apps/api/scripts/`).

## Report

List exactly which phrase-map entries were added (the 4 previously-unmapped tags,
plus whichever synonym broadenings from step 2 you kept), confirm none of them
collide with the existing surface/access/indoor token patterns, confirm the 13
local `content/` courts' dry-run output is unchanged, and restate plainly that
applying this to the LIVE database requires a separate re-import
(`--replace`) run against production content — which this task does not perform.
No git commit or push unless asked.
