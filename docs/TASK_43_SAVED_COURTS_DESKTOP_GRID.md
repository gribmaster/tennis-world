# TASK 43 — /saved, Courts tab: 4-column grid on desktop (mobile unchanged)

**Model: Sonnet 5, reasoning effort: low.**

## Context

`apps/web/src/features/saved/SavedCourtsGrid.tsx` renders the Courts tab as a
single-column stack of full-bleed cards at every width:

```tsx
<div className="flex flex-col gap-3">
  <ul className="flex flex-col gap-3">
    {visible.map((court, index) => (
      <li key={court.id} className="relative">
        <PendingCardLink ... className="block h-[170px] overflow-hidden rounded-[14px]">
          ...
        </PendingCardLink>
        {/* unsave heart overlay */}
      </li>
    ))}
  </ul>
  <SavedDreamListCta imageUrls={...} />
</div>
```

Full width is correct on mobile (that's the design). On desktop it should become a
4-per-row grid instead of one giant full-width card per row.

## The change

Follow the SAME responsive breakpoint convention this app already uses for the
other Saved-page grids (`SavedCollectionsGrid.tsx` and the newer
`SavedEditorialCollectionsGrid.tsx`, both `grid grid-cols-2 gap-3 md:grid-cols-3
lg:grid-cols-4`) — for consistency across the Saved page rather than inventing a
different breakpoint scheme just for Courts:

```tsx
<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
```

- Mobile (`base`): `grid-cols-1` — one card per row, full width, unchanged from
  today's actual appearance (a `flex flex-col` stack and a `grid grid-cols-1` render
  identically for a single column, so this is a safe swap).
- Tablet (`md`): `grid-cols-2` — two per row. (Skips a 3-column step, unlike the
  collection grids, because the user only asked about mobile-vs-desktop; two per
  row is the more conservative middle step for this specific card, which is wider
  and shorter than a collection card. If it looks cramped at typical tablet widths,
  adjust and say so in the report.)
- Desktop (`lg`): `grid-cols-4` — four per row, per the ask.

Everything else in the `<li>`/card stays exactly as it is — same `relative`
wrapper, same `h-[170px]` fixed card height, same image/overlay/text/unsave-heart
markup. Do not change the card's internal layout or height; only the LIST
CONTAINER changes from a vertical stack to a responsive grid.

**Check visually once implemented**: `h-[170px]` was sized for a full-width
landscape card. At `lg:grid-cols-4` each card is roughly a quarter of the content
width, so the same 170px height will look noticeably more square/portrait than
today's wide banner shape. This is likely fine (it's how the same card looks in a
narrower column, nothing breaks), but if the proportions genuinely look wrong at
4-up, you have latitude to adjust the height at the `lg` breakpoint only (e.g.
`h-[170px] lg:h-[200px]` or similar) — note in the report whether you changed it
and why.

`SavedDreamListCta` stays a sibling of the `<ul>` (already is, per the JSX above),
not inside the grid — it should keep spanning full width below the grid,
unaffected by this change.

## Do not touch

- The card's internal JSX (image, overlay, surface chip, name/location/tags text,
  unsave heart button) — only the `<ul>` wrapper's className changes.
- `SavedDreamListCta.tsx`, `SavedEmptyState` — unrelated.
- `SavedCollectionsGrid.tsx` / `SavedEditorialCollectionsGrid.tsx` — read-only
  reference for the breakpoint convention; not modified by this task.
- The Collections tab or Wishlist Map tab — this task is Courts-tab-only.
- `SavedTabs.tsx`'s sort control, count logic, or tab structure — unrelated.

## Testing

- Mobile: Courts tab looks exactly as it does today — one full-width card per row.
- Tablet width: two cards per row.
- Desktop width: four cards per row, matching the ask.
- Cards still navigate correctly, unsave heart still works (optimistic
  remove/rollback unchanged), empty state still shows when the last card is
  unsaved.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the grid breakpoints used (and whether you adjusted the tablet step or
card height from the defaults above, and why). No git commit or push unless
asked.
