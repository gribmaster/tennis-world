# TASK 33 — Replace the single mixed "chip" with three real category tags (surface / experience / access)

**Model: Sonnet 5, reasoning effort: high.**

## Context

The user's complaint: the badge shown on court cards mixes "random info" into one tag.
Root cause, confirmed in code — `courtDisplay()` (`apps/web/src/components/court/court-display.ts`):

```ts
chip: mask ? 'Premium' : (court.tags[0] ?? court.setting),
```

`chip` falls back to `court.setting` — a **free-text field**, not part of the closed
`CourtTag` vocabulary — whenever a court has no experience tags. `setting` and `CourtTag`
overlap conceptually (both can contain e.g. "Jungle", "Island", "Rooftop", "Countryside")
but are separate, unsynchronized fields, so the single visible chip inconsistently shows
either a real curated tag or unrelated free text. That inconsistency is what reads as
"random."

**Decided with the user, don't re-litigate:**

1. Show **three distinct category tags**, always in this order: **Покрытие (surface) →
   Расположение (experience) → Доступность (access)**.
2. Each category contributes **at most one** tag (first-match only) — max 3 tags total per
   card, never more.
3. **No enum changes.** `Surface` stays `Hard | Clay | Grass` (no `Carpet` — user confirmed
   that was illustrative, not a real requirement). `AccessType` stays `Resort | Club |
   Academy | Private`, shown **as its real value** (not collapsed to a binary
   Private/Open — user picked "show as-is").
4. **Tags are never masked/hidden for non-entitled viewers.** This is new, explicit
   user instruction ("все должны видеть теги") — a deliberate change from today's
   behavior where a locked court's chip shows the literal string `'Premium'` instead of
   real content. Confirmed safe: `CourtSummarySchema`'s own doc comment already says
   `surface`/`access`/`tags` are "always public... deliberately NOT location data;" the
   `court-display.ts` file header says masking here is "PRESENTATION, NOT A GATE." So
   unmasking these three fields leaks nothing that wasn't already public — `name` and
   `location` stay masked exactly as today, only the tag content changes.

## 1. New pure function — `court-display.ts`

Add alongside `courtDisplay`/`courtLocation` (same file, same export style):

```ts
/**
 * The court's three category tags — surface, experience (first `CourtTag` only), access
 * — in that fixed order, at most one per category. Unlike `courtDisplay`, this is NEVER
 * masked: surface/access/tags are always-public descriptive metadata (see
 * `CourtSummarySchema`'s own doc comments), not part of the name/location teaser gate.
 * `surface` and `access` are non-optional on the DTO so the result always has 2 or 3
 * entries, never 0 or 1.
 */
export function courtCategoryTags(court: CourtSummaryDTO): string[] {
  return [court.surface, court.tags[0], court.access].filter(
    (value): value is string => Boolean(value),
  );
}
```

Remove the `chip` field from the `CourtDisplay` interface and from `courtDisplay()`'s
return value entirely — once §2–4 below land, nothing reads it anymore (verified: the only
readers are the four sites this task rewrites). Don't leave a dead, misleading field on
the interface. Update the interface's doc comment for `chip`'s removal (just delete that
block).

Export `courtCategoryTags` from `apps/web/src/components/court/index.ts` next to the
existing `courtDisplay`/`courtLocation` exports.

## 2. `HomeFeaturedCourts.tsx` and `HomeEditorsCut.tsx` — the two full-bleed image cards

Both currently render ONE bottom-overlay pill (`bg-bone/20 backdrop-blur-sm` pill,
`border-paper/35`) holding `{display.chip}`. Replace it with a `flex flex-wrap gap-1.5`
row of the same pill styling, one per entry in `courtCategoryTags(court)` — same visual
language (padding, text size, tracking, colors), just repeated per tag instead of once.
`flex-wrap` is a safety net for narrow cards (240px min-width) if three short words don't
fit one line — verify visually whether it ever actually wraps at the card's real min-width,
don't just assume the safety net is unneeded.

**`HomeEditorsCut.tsx` is missing the top-left "Premium" ribbon that `HomeFeaturedCourts`
already has.** Today `HomeEditorsCut`'s ONLY signal that a court is locked/premium is the
bottom chip rendering the literal masked string `'Premium'` — which this task removes by
unmasking that chip. Without a replacement, unmasking would silently delete Editor's Cut's
only lock indicator, a real regression. Fix: **copy `HomeFeaturedCourts.tsx`'s existing
top-left ribbon block verbatim** (the `display.locked ? <span className="... gap-1 ...
gold gradient ...">​<LockGlyph />Premium</span> : null`, `absolute left-3 top-3`) into
`HomeEditorsCut.tsx` at the equivalent position, so both cards keep an independent lock
signal after their bottom chips stop being able to carry it. `HomeEditorsCut.tsx` doesn't
currently import a `LockGlyph` — copy the same small inline SVG `HomeFeaturedCourts.tsx`
uses (check that file for its own `LockGlyph`/`Premium` ribbon markup and glyph — reuse
verbatim, don't redraw).

`display.locked` (= `court.isLocked`, unaffected by `viewerIsEntitled` — see the
interface's own doc comment) is the right flag for this ribbon in both files, exactly as
`HomeFeaturedCourts` already uses it today. No change needed to how that ribbon's own flag
is computed — only `HomeEditorsCut` needs to gain the ribbon it's missing.

## 3. `MapCourtPreview.tsx` — compact and expanded stages

This file currently has the messiest version of the problem: the compact stage renders
`Badge tone={display.locked ? 'locked' : 'neutral'}>{display.chip}</Badge>` (one masked-or-
real chip) **and separately, below it, ALL of `court.tags`** as a second pill row — so an
unlocked court with tags already shows its first tag twice today (a known, previously
-accepted duplication — see the `otherTags` comment at line ~171). The expanded stage
dedupes via `otherTags = tags.slice(1)`.

Replace all of that with one consistent treatment, used in BOTH stages:

- A small **standalone lock indicator**, shown only when `court.isLocked` (`display.locked`
  — same flag `CourtCard.tsx` uses for its own top-left "Locked" badge, unaffected by
  `viewerIsEntitled`, same reasoning as §2 above): `<Badge tone="locked" className="mb-1.5">`
  containing the same `LockGlyph` + `Locked` text pattern `CourtCard.tsx` already uses
  (check `CourtCard.tsx`'s own Locked badge for the exact glyph/markup — reuse it, this
  component already imports/defines its own `CloseGlyph`, add a matching small
  `LockGlyph` the same way). This is what now carries the "this is a premium court"
  signal, independent from the tags below it.
- Below it, one `flex flex-wrap gap-1.5` row over `courtCategoryTags(court)`, reusing the
  EXISTING small pill styling already in this file (`bg-ink/[0.06] ... text-graphite`,
  the same classes the current `court.tags.map(...)` rows already use) — just fed the new
  3-value array instead of the full `court.tags` array.
- **Delete** the compact stage's separate `court.tags.length > 0 ? <ul>...</ul> : null`
  block entirely (§ "Compact stage" today, lines ~254–263) — the new tag row replaces it,
  no second list.
- **Delete** the `otherTags` computation (line ~171) and its use in the expanded stage
  (lines ~283–293) — no longer needed, the new tag row is capped at fixed categories, not
  "all tags minus the first."
- This applies **regardless of `isMaskedForViewer`** — a locked, non-entitled court now
  shows its real surface/experience/access tags too, same as an unlocked one. Only
  `display.name`/`display.location` (and the blurb fetch, per Task 28's existing gate)
  stay masked.

## 4. `HomeSearchBar.tsx` — reduced scope, don't over-build

This is a compact 44px search-suggestion row (thumbnail + name/location + one
`.meta-chip`), not a full card — there isn't room for three chips without redesigning the
row, which is out of scope here. Minimal fix only: replace `{display.chip}` with
`{court.surface}` directly (no mask, no `setting` fallback — `surface` is always present
per the DTO). This removes the same "random info" bug from this surface without a layout
change. If the user later wants the full 3-tag treatment here too, that's a follow-up, not
this task.

## Do not touch

- `CourtDetailTagStrip.tsx` (Court Detail page) — already shows ONLY the clean `tags`
  array, never mixed with `setting`/`surface`/`access`. Not part of this bug, not in scope.
- `CourtCard.tsx` — never rendered `display.chip` in the first place (confirmed: it has no
  chip/tag row at all today, only its own Locked/Featured/Scenic badges). No change.
- `MapCourtRow.tsx` — shows `surface · setting` as a plain text subtitle, not a chip, not
  reading `display.chip`. Not part of this bug. Leave it as-is unless the user asks for it
  separately.
- Name/location masking (Task 25/26) — completely unchanged. Only the tag/chip content
  changes in this task.
- `court.tags` ordering (`orderCourtTags`) — untouched; `courtCategoryTags` just reads
  `tags[0]`, already canonically ordered by the API.
- No `AccessType`/`Surface` enum changes (user explicitly declined — see §"Decided" above).
- `CourtDetailNearbyStrip.tsx`, `SavedCourtsGrid.tsx`, `map-markers.ts` — call
  `courtDisplay()` but never read `.chip`; removing the field doesn't affect them, but
  don't add tag rows there either, not asked for.

## Testing

- `HomeFeaturedCourts` and `HomeEditorsCut`: an unlocked court with tags shows up to 3
  chips (surface, first experience tag, access) in that order; a court with an empty
  `tags` array shows exactly 2 (surface, access) — never a blank/empty third chip.
- Same two sections: a locked court, viewed WITHOUT entitlement, now shows its real
  surface/experience/access tags (not masked) AND still shows its own independent
  "Premium" ribbon (top-left, gold) — confirm `HomeEditorsCut` actually gained this ribbon,
  don't assume the copy-paste was wired correctly without looking at it rendered.
- `MapCourtPreview` compact stage: one small "Locked" badge (only on locked courts) + one
  tag row of up to 3 chips, no duplicate tag list anymore. Expanded stage: same tag row,
  no separate `otherTags` row.
- `MapCourtPreview` on a locked court, no entitlement: tags are real and unmasked; name/
  location are still masked ("Premium Court" / "Unlock to reveal location"); the blurb
  fetch still does NOT fire (Task 28's existing gate on `isMaskedForViewer` untouched).
- `MapCourtPreview` on a locked court WITH entitlement (Task 26 case): tags shown (same as
  always now), name/location unmasked, "Premium" lock badge still shows (it's content
  classification, not gated by entitlement — matches `CourtCard`'s own convention).
- `HomeSearchBar`: chip shows the court's real surface value, never `'Premium'` or a
  `setting` fallback, on every result row including locked courts.
- Visual check at each card's real minimum width that 3 chips don't visibly overflow their
  container or get clipped — adjust wrapping/gap only if they do, don't pre-emptively
  redesign.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean — in particular confirm nothing else in
  the codebase still references `CourtDisplay.chip` after it's removed (the typecheck will
  catch this if anything was missed).

## Report

List every file touched and, for each, whether it went from the old single-chip mess to
the new 3-tag row, or (HomeSearchBar) got the minimal single-value fix only. Confirm
`HomeEditorsCut` visually shows its new Premium ribbon on a locked court — screenshot or
explicit visual confirmation, not just "added the code." Confirm `chip` was fully removed
from `CourtDisplay` and nothing else referenced it. No git commit or push unless asked.
