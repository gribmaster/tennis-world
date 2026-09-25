# TASK 46 — Court Detail (locked): move the unlock banner right below the map

**Model: Sonnet 5, reasoning effort: low.**

## Context (confirmed by reading the actual current code)

On the locked reading of `/courts/[slug]` (`apps/web/src/app/courts/[slug]/page.tsx`,
`renderLocked()`), the sections render in this order today:

1. Masked title / tag strip / blurred description
2. **Location** (`<CourtDetailLocationPreview variant="v2" locked .../>` — the blurred map
   box + "Unlock location" inert button)
3. Gallery strip
4. **`<CourtDetailUnlockCard />`** — the dark "Premium Content / Unlock the full atlas"
   card with the real "Unlock Full Access" button
5. Nearby courts

So the real unlock CTA (`CourtDetailUnlockCard`) sits two full sections below the map,
separated from it by the Gallery strip. The ask: move it to sit **immediately after the
Location block**, right below the map — you (the user) marked the exact spot by adding
`<div id="here"></div>` inside `CourtDetailLocationPreview.tsx`'s locked map box, as a
marker for "put it here."

**Important technical note on that marker — read before implementing:** the `id="here"`
div you added is a sibling of the map placeholder, but both are children of the box with
`className="h-[100px] overflow-hidden rounded-[10px] ... md:h-[clamp(100px,14vw,480px)]"`
— a **fixed-height, `overflow-hidden`** container. `CourtDetailUnlockCard` is a full-width
dark card with a headline, body copy, and a button; it cannot render inside that 100px
(mobile) / clamped box without being clipped to invisible. So this task does **not**
literally nest the card inside that div — instead it moves the card to render immediately
**after** the whole `CourtDetailLocationPreview` section (map + button row) and **before**
the Gallery strip, which is the closest thing to "right below the map" that doesn't break
the layout. The stray `id="here"` marker div gets deleted as part of this change (it was
a scratch marker for this task, not meant to ship).

## The change

### `apps/web/src/app/courts/[slug]/page.tsx`, `renderLocked()`

Reorder the two sections — move the `CourtDetailUnlockCard` section to right after the
Location section, before the Gallery strip section. Today:

```tsx
<section className={gutter}>
  <div className={column}>
    <CourtDetailLocationPreview variant="v2" locked ... />
  </div>
</section>

<section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
  <div className={column}>
    <CourtDetailGalleryStrip />
  </div>
</section>

<section className={`${gutter} mt-5`}>
  <div className={column}>
    <CourtDetailUnlockCard />
  </div>
</section>
```

Becomes:

```tsx
<section className={gutter}>
  <div className={column}>
    <CourtDetailLocationPreview variant="v2" locked ... />
  </div>
</section>

{/* The dark unlock card now sits right below the map/location block — the user's
    intent (marked with a scratch `id="here"` div inside CourtDetailLocationPreview's
    locked map box, removed as part of this change — that div sat inside a fixed-height
    `overflow-hidden` box and could not literally hold this card without being clipped,
    so it renders here, directly after the Location section, instead). */}
<section className={`${gutter} mt-5`}>
  <div className={column}>
    <CourtDetailUnlockCard />
  </div>
</section>

<section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
  <div className={column}>
    <CourtDetailGalleryStrip />
  </div>
</section>
```

Net effect: Location → **Unlock card** → Gallery strip → Nearby courts (was Location →
Gallery strip → Unlock card → Nearby courts). Only the ORDER of these three sections
changes — no className, prop, or content changes to any of them.

Update the existing comment above the unlock-card section (currently: "The dark unlock
card (prototype lines 1169–1176). It stands where the unlocked branch's review card
would go — the prototype shows that card only when unlocked, and this one only when
locked.") — replace it with the note above explaining the new position and why (the
`id="here"` marker's technical constraint).

Also fix the now-doubly-stale comment in `renderUnlocked()` (around the `CourtDetailReviewCard`
section) that currently says "The locked branch keeps `CourtDetailUnlockCard` in this
exact slot instead" — that was never quite accurate (the unlock card was never in the
review card's slot, which is after Nearby courts) and is more wrong now that the unlock
card sits right after Location. Just drop that clause from the comment rather than
replacing it with another cross-branch position claim — the two branches' section orders
are independent enough that pointing to "the locked branch's exact slot" isn't a useful
thing to assert in either direction.

### `apps/web/src/features/court-detail/CourtDetailLocationPreview.tsx`

Delete the stray marker:

```tsx
<div id="here"></div>
```

(sitting right after the `id="single-court-map-container"` div, inside the `v2` variant's
locked map box). It was a scratch marker for locating this task's target, not real
markup — remove it, no replacement needed. Nothing else in this file changes.

## Do not touch

- `renderUnlocked()`'s own section order (Location → Gallery strip → Nearby courts →
  Review card) — this task is locked-reading-only; the unlocked reading is unaffected.
- `CourtDetailUnlockCard.tsx` itself — its internal content/styling is unchanged, only
  where it's rendered from moves.
- `CourtDetailLocationPreview.tsx`'s actual layout/props/behavior — only the leftover
  `id="here"` div is removed; the map box, the disabled "Unlock location" button, and
  every comment other than the marker itself stay as they are.
- The Gallery strip, Nearby courts, and every other section's own content — unaffected,
  only their relative order to the unlock card shifts.

## Testing

- On a locked Court Detail page (`/courts/[slug]` for a premium court, logged-out or
  non-entitled): the dark "Premium Content / Unlock the full atlas" card now appears
  directly below the Location block (map + "Unlock location" button), before the photo
  gallery strip. Order top to bottom: title → tags → description → Location → **Unlock
  card** → Gallery strip → Nearby courts.
- The unlock card's own button (`PaywallTrigger`, "Unlock Full Access") still opens the
  paywall exactly as before — only its position on the page changed.
- The sticky footer's own unlock CTA ("Unlock to get directions") is untouched.
- No visible `id="here"` marker or empty div remains anywhere on the page.
- Unlocked Court Detail pages are visually unchanged (this task doesn't touch
  `renderUnlocked()`'s layout).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the three sections were reordered (not duplicated — there should still be
exactly one `<CourtDetailUnlockCard />` render site in the whole file), confirm the
stray `id="here"` div was deleted from `CourtDetailLocationPreview.tsx`, and confirm
`renderUnlocked()` was left untouched apart from the one comment edit. No git commit or
push unless asked.
