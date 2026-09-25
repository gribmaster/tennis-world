# TASK 49 — Saved (Courts tab): remove the tag chips under the location line

**Model: Sonnet 5, reasoning effort: low.**

## Context

`apps/web/src/features/saved/SavedCourtsGrid.tsx` (the Courts tab of `/saved`) renders
each card as: surface chip (top-left) → serif name → pin glyph + location → up to three
tag chips (`court.tags.slice(0, 3)`), all inside the same bottom text block over the
image.

The ask: drop the tag-chip row entirely. Name and location stay; nothing below them.

## The change

In the card's text block:

```tsx
<span className="absolute inset-x-0 bottom-0 block px-3.5 pb-3.5 pt-4">
  <span className="serif mb-1 block text-[19px] font-normal leading-[1.2] text-paper">
    {display.name}
  </span>
  <span className="mb-2 flex items-center gap-[5px] text-paper/85">
    <PinGlyph />
    <span className="text-[12px]">{display.location}</span>
  </span>
  {tags.length > 0 ? (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="...">
          {tag}
        </span>
      ))}
    </span>
  ) : null}
</span>
```

- Delete the whole `{tags.length > 0 ? (...) : null}` block.
- Drop the `mb-2` on the location line — it existed to space it from the tag row below;
  with nothing below it, the location line can sit flush against the block's bottom
  padding (`pb-3.5` already gives it breathing room from the card's edge). Check
  visually once implemented; if it reads better with a small margin, a `mb-0` → nothing
  or a slight adjustment is fine, just don't leave a gap that was clearly sized for a
  now-deleted element.
- Remove the now-unused `tags` local (`const tags = court.tags.slice(0, MAX_TAG_CHIPS);`)
  and the `MAX_TAG_CHIPS` constant — confirm neither is referenced anywhere else in this
  file before deleting.

## Do not touch

- The surface chip (top-left) — stays exactly as it is; the ask is about the tag row
  under the location line only, not the surface label.
- The unsave control, the image/gradient, `courtDisplay` masking, the grid breakpoints
  (Task 43), `SavedDreamListCta` — all unrelated, unchanged.
- `court.tags` itself, `courtCategoryTags` — unrelated data/helpers; this only removes
  where Saved's own card renders them. Other cards that show tags (Home's Featured
  strip, Editor's Cut, the Collection Detail cards) are untouched — this is Saved's
  Courts tab only.

## Update the header comment

The file's prototype-geometry note (lines ~1233–1242 reference) currently documents the
"up to THREE tag chips" as prototype-faithful behavior. Add a line noting they were
removed per this task and are no longer part of this card — so a future reader doesn't
try to "restore" them as a fidelity fix.

## Testing

- `/saved`, Courts tab: each card shows the surface chip, the name, and the location —
  no chip row below the location, on any saved court (with or without tags on the
  underlying data).
- No leftover empty gap where the tag row used to be.
- Unsave, navigation, and the desktop 4-column grid (Task 43) all still work exactly as
  before.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean (watch for the unused `tags`/
  `MAX_TAG_CHIPS` removal).

## Report

Confirm the tag-chip block, the `tags` local, and the `MAX_TAG_CHIPS` constant were all
removed (not just hidden/commented out), and say whether you adjusted the location
line's bottom margin and why. No git commit or push unless asked.
