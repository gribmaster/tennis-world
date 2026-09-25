# TASK 40 — Correction to Task 39: Curated card must match `SavedCollectionRow.tsx` exactly

**Model: Sonnet 5, reasoning effort: medium.**

## Context

Task 39 swapped "Curated for You" (`CuratedCollectionsList.tsx`) from a row-list to a grid,
using the existing `CollectionCard.tsx` inside it. The user has corrected this: they
specifically want the card visual from **`SavedCollectionRow.tsx`** (Saved page's
Collections tab), not `CollectionCard`. This task replaces that choice.

**If Task 39 was already implemented, undo the `CollectionCard` swap it made and replace it
per §1–2 below — check `CuratedCollectionsList.tsx`'s actual current state before editing;
don't assume it's still in its pre-Task-39 form.** The GRID layout Task 39 introduced
(`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4`, matching Saved's own grid) stays —
that part was already correct and is untouched by this correction. Only WHICH card renders
inside each grid cell changes.

**Still not a literal import of `SavedCollectionRow`, and here's the real reason (not a
style objection — a type one):** `SavedCollectionRow` takes a `UserCollectionDTO`
(`coverImageUrls?: string[]`, an "empty folder, no courts yet" state its own file spends real
code drawing on purpose). `CuratedCollectionsList` has `CollectionDTO[]` (`coverImageUrl:
string` — singular, REQUIRED, never empty — editorial collections always ship with a real
cover photo, so there is no "empty folder" case to handle for this data). Passing a
`CollectionDTO` into a component typed for `UserCollectionDTO` doesn't compile. What this
task does instead: build a new, small sibling component in the same `collections/` folder
that reproduces `SavedCollectionRow`'s markup/classes **exactly** — same fixed height, same
count-pill position/styling, same serif name treatment, same image overlay — just reading
from `CollectionDTO`'s fields and skipping the empty-state branch that data type never
needs. Visually indistinguishable from `SavedCollectionRow`; not the same TypeScript
component, because it can't type-check as one.

## 1. New component — `CuratedCollectionCard.tsx`

New file: `apps/web/src/features/collections/CuratedCollectionCard.tsx`. Copy
`SavedCollectionRow.tsx`'s structure and Tailwind classes line-for-line, with these specific
adaptations:

- Prop: `collection: CollectionDTO` (not `UserCollectionDTO`).
- Image source: `collection.coverImageUrl` directly (singular, always present) — **drop the
  `isEmpty`/`EmptyFolderArt` branch entirely**, it doesn't apply to editorial collections.
  Always render the `<Image>` + the `.img-overlay` gradient, matching `SavedCollectionRow`'s
  non-empty branch exactly (same gradient, same count-pill/name colors — the ones it uses
  when `isEmpty` is false).
- Count pill text: `{collection.count} {collection.count === 1 ? 'court' : 'courts'}` —
  same pluralization `SavedCollectionRow` already does.
- Link target: `/collections/{collection.slug}` (NOT `/saved/collections/{slug}` —
  `SavedCollectionRow` links into the user's own folder detail page; this card must link to
  the editorial collection's own page, `CollectionCard`'s existing target, which is what
  `CuratedCollectionsList` already linked to before Task 39).
- Keep: the exact `h-[150px]` fixed card height, `rounded-lg`, the `.img-overlay` gradient
  (`linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)`), the count pill's
  `absolute left-2 top-2 ... bg-ink/50 text-paper` styling, and the name block's `absolute
  inset-x-0 bottom-0 ... serif text-[17px] font-normal leading-[1.2] text-paper` — pull
  these verbatim from `SavedCollectionRow`'s non-empty-state JSX, don't approximate them.
- **No `description` rendering.** `SavedCollectionRow` doesn't show a description line at
  all (personal folders don't have one) — to match it exactly, this card doesn't show
  `CollectionDTO.description` either, even though it's available and `CollectionCard` (the
  component Task 39 used) did render it. This is a real, intentional content drop versus
  Task 39's version — call it out in the report so it's not mistaken for an oversight.
- Whole card is a `PendingCardLink`, same as `SavedCollectionRow` — no other interactive
  descendants (still no save/heart control — that capability is still explicitly deferred,
  per the earlier discussion; don't add one here either).

## 2. `CuratedCollectionsList.tsx` — swap the card, keep the grid

Keep the grid Task 39 introduced:

```tsx
<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
  {collections.map((collection) => (
    <li key={collection.id}>
      <CuratedCollectionCard collection={collection} />
    </li>
  ))}
</ul>
```

Note the `<li>` here has **no `aspect-[3/4]`** — `CuratedCollectionCard` carries its own
fixed `h-[150px]` (copied from `SavedCollectionRow`), so the `<li>` needs no aspect/height of
its own, same as `SavedCollectionsGrid.tsx`'s own `<li key={collection.id}>` (no sizing
class — the card sizes itself). If Task 39's version added `aspect-[3/4]` to the `<li>`,
remove it here.

Import `CuratedCollectionCard` from `./CuratedCollectionCard`. Drop the `CollectionCard`
import this file gained under Task 39, if present.

## Do not touch

- `SavedCollectionRow.tsx` — reference only, copy its treatment, don't import or modify it.
  Its own documented scope (`UserCollectionDTO` only) stays exactly as-is.
- `CollectionCard.tsx`, `FeaturedCollectionsStrip.tsx`, `HomeCollectionsTeaser.tsx` (Task
  34) — all still use `CollectionCard` as before; this correction only affects
  `CuratedCollectionsList`, nowhere else.
- No heart/save control — still deferred, per the earlier decision.
- `app/collections/page.tsx`'s `<CuratedCollectionsList collections={collections} />` call
  — prop interface unchanged.

## Testing

- "Curated for You" cards are visually identical in treatment to Saved → Collections tab
  cards (same height, count pill, serif name, overlay) — compare them side by side on the
  actual rendered pages, not just by reading class names.
- Each card shows the collection's real cover photo (never the empty-folder art — that
  branch doesn't exist here) and links to `/collections/{slug}`, not `/saved/collections/...`.
- No description text renders on these cards (confirmed intentional, see §1).
- Grid still responsive (2/3/4 columns), still renders nothing for an empty `collections`
  array.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm `CuratedCollectionCard` was built by copying `SavedCollectionRow`'s actual classes
(not approximated from memory) and that the description-drop and link-target differences
from `SavedCollectionRow`/Task 39 are both deliberate and called out here. No git commit or
push unless asked.
