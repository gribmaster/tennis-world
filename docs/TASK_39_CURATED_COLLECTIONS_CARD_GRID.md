# TASK 39 — /collections: "Curated for You" as a card grid, not a row list

**Model: Sonnet 5, reasoning effort: medium.**

## Context (and why this ISN'T a literal swap to `SavedCollectionRow`)

The user asked for the "Curated for You" section's cards (`CuratedCollectionsList.tsx`) to
be replaced with "the card used in Saved collections" — i.e. the photo-tile card style
(full-bleed image, count pill top-left, serif name over the bottom) used in the Saved
page's Collections tab, instead of today's horizontal thumb+text row.

**Not a literal component swap, and here's why — read this before "fixing" it toward
`SavedCollectionRow`:** that component (`apps/web/src/features/saved/SavedCollectionRow.tsx`)
renders `UserCollectionDTO` — the visitor's OWN wishlist folders — and its own file header
says explicitly, twice over (also in `SavedCollectionsGrid.tsx`): **"THIS IS THE USER'S OWN
FOLDER, NOT AN EDITORIAL COLLECTION... is not being built [for editorial collections]."**
`CuratedCollectionsList` renders `CollectionDTO[]` — editorial collections — a different
shape (`coverImageUrl` singular vs `SavedCollectionRow`'s `coverImageUrls[]`, no
`description` field on `UserCollectionDTO`, etc.). Passing one into the other's component
doesn't type-check and would misuse a component that document its own scope boundary.

**What actually gets the user's visual result correctly:** this app already has a
photo-tile card built for exactly `CollectionDTO` — `CollectionCard.tsx`
(`apps/web/src/features/collections/CollectionCard.tsx`) — the same component
`FeaturedCollectionsStrip.tsx` (this same `/collections` page, just above this section) and
Home's `HomeCollectionsTeaser.tsx` (Task 34) already use. It has the same prototype-derived
visual language the user is pointing at (full-bleed photo, count pill, serif name, plus its
own decorative arrow circle) — same "card, not list-row" feel, correct data type, and
consolidates to the SAME collection card used everywhere else in the app rather than adding
a third bespoke treatment. This task swaps `CuratedCollectionsList` to a GRID of
`CollectionCard`s, matching the layout shape of the Saved page's Collections-tab grid (the
part of "looks like Saved collections" that's actually about layout, not about reusing that
specific component).

## The change — `CuratedCollectionsList.tsx`

Current: a `flex flex-col md:flex-row flex-wrap gap-2.5` row-list where each `<li
className="md:w-[32%]">` holds a horizontal `PendingCardLink` (96×80 thumb + name +
description + count text beside it).

Replace with a responsive grid of `CollectionCard`s, matching
`SavedCollectionsGrid.tsx`'s own grid breakpoints (`grid grid-cols-2 gap-3 md:grid-cols-3
lg:grid-cols-4`) — this is the concrete "looks like Saved collections" layout match:

```tsx
<ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
  {collections.map((collection, index) => (
    <li key={collection.id} className="aspect-[3/4]">
      <CollectionCard collection={collection} priority={index === 0} className="collection-card" />
    </li>
  ))}
</ul>
```

- `aspect-[3/4]` on the `<li>` gives `CollectionCard` (which is `h-full w-full`, no aspect
  of its own — same as it is everywhere else it's used, see Task 34) a real box at every
  grid-column width, so the grid stays responsive instead of needing a fixed pixel height
  per breakpoint. Confirmed this matches how Home's own grid-less strip already sizes the
  same component (`aspect-[3/4]` on the wrapping `<li>`, Task 34) — same technique, just in
  a grid instead of a horizontal scroll row.
- `priority={index === 0}` matches the convention `FeaturedCollectionsStrip.tsx` and (post-
  Task 34) `HomeCollectionsTeaser.tsx` already use for their own first card.
- `className="collection-card"` — same semantic marker class every other `CollectionCard`
  usage in the app already passes (see `FeaturedCollectionsStrip.tsx`).
- Import `CollectionCard` from `./CollectionCard` (same-folder import, both live in
  `apps/web/src/features/collections/`).

**Drop from this file, no longer needed:** the local `<PendingCardLink>` markup, the manual
96×80 `Image` thumb, and the inline name/description/count text block — all of that logic
now lives inside `CollectionCard` itself. `PendingCardLink` may become an unused import;
remove it if nothing else in the file needs it.

**`description`** — `CollectionCard` already renders `collection.description` (line-clamped
to 2 lines) when present, same as it does on Featured Collections and Home. No extra work
needed to keep that content; it just moves from the old row's inline text into
`CollectionCard`'s own treatment of it.

## Do not touch

- `SavedCollectionRow.tsx` / `SavedCollectionsGrid.tsx` — read-only reference for the grid
  breakpoints; not modified by this task, and still correctly scoped to `UserCollectionDTO`
  only, per their own documented boundary.
- `CollectionCard.tsx` itself — reused as-is, no changes (this task is another consumer of
  it, like Task 34 was for Home).
- `FeaturedCollectionsStrip.tsx`, `CountriesStrip.tsx`, `CollectionsHero.tsx` — the other
  sections on `/collections`, unrelated to this change.
- No save/heart control on these cards — the user separately decided to hold off on
  editorial-collection saving/bookmarking for now (a real capability gap, not something
  this task should route around). `CollectionCard` doesn't have one today and this task
  doesn't add one.
- `app/collections/page.tsx`'s `<CuratedCollectionsList collections={collections} />` call
  — prop interface unchanged, no page-level edit needed.

## Testing

- "Curated for You" now renders as a responsive photo-card grid (2 cols mobile → 3 →
  4 cols desktop), matching Saved's Collections-tab grid shape, instead of the old
  thumb+text row list.
- Each card shows the collection's cover photo, count pill, serif name, and description
  (when present) — same content as before, new visual treatment.
- Cards still navigate to `/collections/{slug}` (via `CollectionCard`'s own
  `PendingCardLink`), same destination as before.
- First card in the grid loads with `priority`.
- An empty `collections` array still renders nothing (the existing `if (collections.length
  === 0) return null;` guard — confirm it's still there and still works).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean — in particular no unused-import lint
  error from removing the old inline markup.

## Report

Confirm the old row-list markup was fully removed (not left dead) and that `CollectionCard`
renders `description` correctly for a collection that has one, same as it does on Featured
Collections. Confirm no heart/save control was added (that's explicitly deferred). No git
commit or push unless asked.
