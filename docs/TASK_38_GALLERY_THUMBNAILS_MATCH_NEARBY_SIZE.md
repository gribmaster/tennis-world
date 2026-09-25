# TASK 38 — Court Detail: gallery thumbnails the same size as "Nearby courts" cards

**Model: Sonnet 5, reasoning effort: low.**

## Context

Task 37 resized the "Nearby courts" cards (`CourtDetailNearbyStrip.tsx`) to `w-[210px]` with
a `h-[158px]` (4:3) image, at every breakpoint — no separate mobile/desktop size. The user
now wants the Court Detail **gallery thumbnail strip** (`CourtDetailGalleryStrip`, the
`id="court-gallery-strip"` row below the hero band — NOT the hero band itself, and NOT
`CourtDetailFramedGallery.tsx`, the frozen locked-page gallery) to use that **same size**.

**Before writing the actual numbers into this file, read
`CourtDetailNearbyStrip.tsx`'s current card classes yourself.** Task 37 may not have shipped
exactly as specified (the implementer had explicit latitude to nudge the size if it looked
wrong) — use whatever width/height the Nearby cards actually carry right now, not necessarily
`210px`/`158px` blindly. If Task 37 hasn't been implemented at all yet, use its specified
values (`w-[210px]`, `h-[158px]`, 4:3) as the target and say so in the report.

## The change — `CourtDetailGalleryStrip` (in `CourtDetailGallery.tsx`)

Current thumbnail button:

```tsx
className={[
  'relative block h-[72px] md:h-[150px] w-[90px] md:w-[150px] overflow-hidden rounded-md border-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50',
  isActive ? 'border-ink opacity-100' : 'border-transparent opacity-75 hover:opacity-100',
].join(' ')}
```

Replace the responsive `h-[72px] md:h-[150px] w-[90px] md:w-[150px]` pair with a single,
non-responsive size matching the Nearby cards' current actual width/height (from the
NearbyStrip file you just read) — e.g. if Nearby is `w-[210px]`/`h-[158px]`:

```tsx
'relative block h-[158px] w-[210px] overflow-hidden rounded-md border-2 ...'
```

Also update the `<Image sizes="90px" .../>` prop on this thumbnail to match the new width
(e.g. `sizes="210px"`) — it's currently sized for the old 90px box and would otherwise
under-request resolution for the new, larger box.

Everything else about this strip — the `border-2`/active-state color logic, the `h2`
heading, the `no-scrollbar overflow-x-auto` row, opening the lightbox on click, the
`aria-current`/`aria-label` wiring — is unchanged.

## Do not touch

- `CourtDetailGalleryHero` (`#court-gallery`, the hero band) and its new desktop prev/next
  arrows from Task 37 — unrelated, this task only resizes the separate thumbnail strip
  below it.
- `CourtDetailFramedGallery.tsx` — still frozen, not part of this task.
- `CourtDetailNearbyStrip.tsx` — read-only reference for this task's target size; don't
  modify it here (that's Task 37's job, already scoped).
- The gallery strip's row gap (`gap-2`) — the ask was about thumbnail size, not spacing;
  only touch it if the new, bigger thumbnails visibly look cramped at the current gap, and
  say so in the report if you do.
- The lightbox (`CourtDetailGalleryLightbox.tsx`) — opens independently of thumbnail size,
  unaffected.

## Testing

- Gallery thumbnails and Nearby-court cards visually match in size at the same viewport —
  compare them side by side on the actual rendered page, not just by reading class names.
- Thumbnail row still scrolls horizontally, active-thumbnail border/opacity still tracks
  the hero band's current image, clicking a thumbnail still opens the lightbox at the right
  photo.
- Check mobile specifically — this is a real size increase from the old 90px mobile
  thumbnail, same caution as Task 37's Nearby-card mobile check: confirm the strip still
  reads sensibly on a narrow phone width, not just that it "still renders."
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

State the exact width/height you used and confirm it was read from `CourtDetailNearbyStrip`'s
actual current code (not assumed from this brief). Confirm the `sizes` prop was updated to
match. No git commit or push unless asked.
