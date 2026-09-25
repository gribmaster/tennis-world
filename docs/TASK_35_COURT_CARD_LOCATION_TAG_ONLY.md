# TASK 35 — Correction to Task 33: show only the location/experience tag, not all three

**Model: Sonnet 5, reasoning effort: low.**

## Context

Task 33 replaced the single mixed "chip" with up to 3 category tags (surface → experience →
access) on court cards. The user has now corrected the scope: **show only the
"расположение" (location/experience) tag** — drop surface and access from the card
entirely. Everything else Task 33 decided stays: the tag is still never masked/hidden for
non-entitled viewers on a locked court (that part of the correction wasn't touched), and the
independent "Locked"/"Premium" indicators added in Task 33 (the standalone lock badge in
`MapCourtPreview.tsx`, the gold ribbon in `HomeFeaturedCourts.tsx`/`HomeEditorsCut.tsx`) are
unrelated to this and stay exactly as they are.

## 1. `court-display.ts` — shrink `courtCategoryTags` to one tag

Current (Task 33):

```ts
export function courtCategoryTags(court: CourtSummaryDTO): string[] {
  const values: Array<string | undefined> = [court.surface, court.tags[0], court.access];
  return values.filter((value): value is string => Boolean(value));
}
```

Change it to return only the court's first experience tag (0 or 1 entries — never surface,
never access):

```ts
/**
 * The court's location/experience tag — its first `CourtTag`, if it has one — as a
 * single-element array (or empty). Kept as an array, not a plain string | undefined, so
 * every render site's existing `.map()` over this value keeps working unchanged; only the
 * SOURCE fields changed (Task 35 correction: card shows location only, not surface/access).
 * NEVER masked — see the file header and `CourtSummarySchema`'s own doc comment: tags are
 * always-public descriptive metadata, not part of the name/location teaser gate.
 */
export function courtCategoryTags(court: CourtSummaryDTO): string[] {
  return court.tags[0] ? [court.tags[0]] : [];
}
```

Keep the function name and its array return shape as-is — every call site already does
`courtCategoryTags(court).map(tag => ...)`, so this is a one-function edit with **zero
changes needed at the render sites**. Don't rename it or change its call sites' markup;
that would just be churn for no visual difference beyond what the function itself now
returns.

Update the function's doc comment (shown above) so it no longer claims to return
surface/access — that claim is now false and would mislead the next person reading it.

## 2. Render sites — no code changes, just re-verify the result

These four call sites (`HomeFeaturedCourts.tsx`, `HomeEditorsCut.tsx`,
`MapCourtPreview.tsx`'s compact stage, `MapCourtPreview.tsx`'s expanded stage) all already
do `{courtCategoryTags(court).map((tag) => <chip>{tag}</chip>)}` — with the function change
in §1, each of them now renders **at most one** chip (the location/experience tag) instead
of up to three, with no further edit needed. Confirm this by reading the rendered output,
not just by inspecting the diff — a `.map()` over a shorter array is easy to assume works
without actually looking.

A court with an empty `tags` array now renders **zero** chips on its card (previously it
still showed surface + access even with no experience tag). That's expected: the location
tag is the only thing shown now, and there's nothing to show when the court has none.

## Do not touch

- The standalone "Locked" badge in `MapCourtPreview.tsx` (both stages) — unrelated to tag
  content, stays exactly as Task 33 left it.
- The gold "Premium" ribbon in `HomeFeaturedCourts.tsx` and `HomeEditorsCut.tsx` — same,
  unrelated, unchanged.
- `HomeSearchBar.tsx`'s `{court.surface}` chip — Task 33 already scoped that one down to a
  single surface value for a different reason (no room for 3 chips in a 44px row); the
  user's correction here is about the CARD tag content, not this row. Leave it as-is unless
  told otherwise.
- Masking behavior, `viewerIsEntitled`, the blurb fetch gate — none of this changes.
- `Surface`/`AccessType` enums, `CourtSummarySchema` — no schema changes, same as Task 33.

## Testing

- `HomeFeaturedCourts`, `HomeEditorsCut`: each card shows at most ONE chip now (its first
  experience tag) — no surface, no access value anywhere on the card. A court with no tags
  shows zero chips, not an empty pill.
- `MapCourtPreview` compact and expanded stages: same — one location chip max, no
  surface/access chip alongside it. The standalone "Locked" badge (when `court.isLocked`)
  still shows independently, unaffected.
- Locked court, no entitlement: the one location tag is still shown unmasked (Task 33's
  "never hide tags" decision is untouched by this correction).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the array-shape trick (`courtCategoryTags` still returns `string[]`, so the four
`.map()` call sites needed zero edits) actually held — i.e. confirm you did NOT end up
touching `HomeFeaturedCourts.tsx`/`HomeEditorsCut.tsx`/`MapCourtPreview.tsx` at all, only
`court-display.ts`. If any render site needed a change beyond that, say what and why. No
git commit or push unless asked.
