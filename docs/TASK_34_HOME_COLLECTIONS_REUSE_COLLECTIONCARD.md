# TASK 34 — Home's Collections strip: reuse the shared `CollectionCard`, drop the bespoke inline card

**Model: Sonnet 5, reasoning effort: medium.**

## Context

`HomeCollectionsTeaser.tsx` (Home's "Collections" strip) currently reimplements its own
inline card markup — image, gradient overlay, a bottom count eyebrow + serif name — instead
of using the app's actual shared collection-card component,
`apps/web/src/features/collections/CollectionCard.tsx` (class `collection-card`), which the
Collections page's `FeaturedCollectionsStrip.tsx` already uses:

```tsx
<CollectionCard collection={collection} priority={index === 0} className="collection-card" />
```

Confirmed why they diverged: each was built from a **different** prototype screen, and each
file's own header comment says so — `HomeCollectionsTeaser.tsx` cites
`design_v2_stripped.html:577–600` (Home's own collections teaser spec), while
`CollectionCard.tsx` cites `tennis_world_v2_standalone.html:1309–1327` (the Collections
page's Featured strip spec). Not a bug, just two components that happened to render the
same kind of data differently. The user now wants Home to use the real `CollectionCard`
component instead of its own duplicate — this task makes that swap.

**Cross-feature import is fine** — `HomePaywallBand.tsx` already imports from
`@/features/paywall` and `@/features/consultation`; importing `CollectionCard` from
`@/features/collections` into a Home file follows the same established pattern.

## Visual consequence — real, not cosmetic-only, confirm while reviewing

Swapping in the real `CollectionCard` changes what Home's cards show, not just how the code
is organized:

- Adds collection **`description`** (optional field on `CollectionDTO`) as a line-clamped
  (2-line) 11px subtitle, when a collection has one — Home's current card shows no
  description at all.
- Adds the 32×32 decorative arrow-circle affordance in the bottom-right corner (an
  `aria-hidden` visual only, not a separate control — see `CollectionCard.tsx`'s own header
  note on why it isn't a nested button).
- Moves the "N courts" count pill from the bottom (Home's current placement) to a top-left
  pill over the photo, and enlarges the name from 16px to 22px serif — `CollectionCard`'s
  own fixed type scale, not something this task should override.

This is the expected result of reusing the shared component as asked — call it out
explicitly in the report so it's easy to eyeball against the old version, not something to
silently prevent by re-adding Home-specific overrides.

## The change — `HomeCollectionsTeaser.tsx`

1. Import `CollectionCard` from `@/features/collections`.
2. Keep the existing `<li>` sizing exactly as it is today —
   `w-[45vw] min-w-[150px] max-w-[190px] aspect-[3/4] shrink-0` — this is Home's own
   established responsive strip sizing (matches `HomeFeaturedCourts`'s analogous court
   cards) and should NOT change to the Collections page's fixed `200×240`. `CollectionCard`
   itself is size-agnostic (`h-full w-full`, no aspect ratio of its own — see its props:
   `collection`, `priority`, `className`), so it fills whatever box the `<li>` gives it;
   `aspect-[3/4]` on the `<li>` is what currently establishes that box's height, and it
   still will.
3. Replace the entire inline `<PendingCardLink>...</PendingCardLink>` block (the manual
   `Image` + gradient `<span>` + count/name text block) with:
   ```tsx
   <CollectionCard
     collection={collection}
     priority={index === 0}
     className="collection-card"
   />
   ```
   `priority={index === 0}` is a new small improvement matching the convention
   `HomeFeaturedCourts.tsx` already uses for its first court card — Home's current
   collections card doesn't set `priority` at all today (always lazy), so the first visible
   card now loads eagerly like every other above-the-fold strip on this page.
4. `PendingCardLink` becomes an unused import in this file once step 3 lands (it's still
   used for the section's own "View all" link via `PendingLink` — don't remove that one,
   only drop the now-unused `PendingCardLink` import if nothing else in the file needs it).

## Do not touch

- `CollectionCard.tsx` itself, or `FeaturedCollectionsStrip.tsx` on `/collections` — this
  task only changes which component Home's strip renders, not the shared component's own
  markup/geometry.
- The section header, "View all" link, `HScrollArrows` wiring, or the row's own gutter/
  edge-bleed treatment (`-mr-[clamp(20px,4vw,64px)]`, trailing spacer `<li>`) — untouched,
  still wraps the same `<ul>`.
- `CollectionDTO`/contracts — no schema change; `description` is already optional and
  already flows through `app/page.tsx`'s existing collections prop.

## Testing

- Home's Collections strip renders real `CollectionCard`s: top-left count pill, 22px name,
  optional description, bottom-right arrow circle — visually confirm against a collection
  that has a `description` and one that doesn't (the line only appears when present, no
  empty gap).
- Card box size/proportions at Home are unchanged from before this task (still the
  responsive `45vw`/150–190px, `3/4` aspect strip) — only the CONTENT inside each card
  changed, not the strip's own layout/spacing/scroll-arrow behavior (Task 32).
- First card in the strip loads with `priority` (check the rendered `<img>`'s
  `fetchpriority`/`loading` attributes, or the network panel, don't just assume the prop
  wired through).
- Whole card still navigates to `/collections/{slug}` (via `CollectionCard`'s own
  `PendingCardLink`), same as before.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean — in particular confirm no unused-import
  lint error from removing the inline markup.

## Report

Confirm the old bespoke markup was fully removed (not left dead/commented out) and that the
description/arrow-circle/count-pill changes were visually checked against real data, not
assumed correct from reading the diff. No git commit or push unless asked.
