# TASK 56 — Redesign v3: one shared `CourtCard` (with a bookmark save button)

**Model: Sonnet 5, reasoning effort: medium.**

Read `docs/REDESIGN_V3_PLAN.md` first.

## Why

v3's most-repeated rule (see `tennis_world_design_decisions.md`, "Card reuse: one CourtCard,
everywhere") is that there is exactly **one** court card. It is reused with different props on
every screen that lists courts: Courts/Map list, Saved, inside an editorial collection, inside a
personal folder.

Today we have five near-duplicates:

- `components/court/CourtCard.tsx` (old 4:5 tile with a visual-only heart, used only by
  `MapCourtList`'s mobile strip);
- inline cards in `HomeFeaturedCourts`, `CollectionCourtsGrid`, `UserCollectionCourtsGrid`,
  `SavedCourtsGrid`;
- and one save-heart component per screen (`HomeCourtSaveHeart`, `CollectionCourtSaveHeart`,
  `UserCollectionCourtSaveHeart`, plus Saved's own unsave "X").

The "one heart component per screen" convention we followed in Tasks 47/48 is **superseded by
v3**. From now on, one card and one save button, shared.

## Reference

`CourtCard` in both prototypes:

- mobile: `tennis_world_v17_standalone.html` ~line 916;
- desktop: `tennis_world_desktop_standalone4.html` ~line 212.

The two are identical except for the sizes below. Supporting classes are at the top of each
file: `.img-overlay`, `.label-chip`, `.chip-surface-*`, `.premium-badge`, and `Ico.save` /
`Ico.pin` / `Ico.lock`.

## Spec

The whole card is a link to `/courts/{slug}`:

- `PendingCardLink`, as today;
- `relative`, `overflow-hidden`, `rounded-[14px]`;
- **height 170px below md, 340px at md+** (this is what v3 does; don't use an aspect ratio).

Layers inside the card:

1. **Photo**: `next/image` `fill`, `object-cover`.
2. **Gradient**: `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)`. The same
   `.img-overlay` gradient our current cards already inline. Make it one shared class/utility if
   it isn't already.
3. **Top-left (12px inset at md+, 10px below md)**:
   - if the court is **masked for this viewer** → `PremiumBadge`: lock glyph + "Premium";
   - otherwise → `SurfaceChip` for `court.surface` (small size).
4. **Bottom block** (padding `16px 14px 14px` below md, `18px 16px 16px` at md+):
   - **Name**: serif, 19px below md / 21px at md+, weight 400, white, line-height 1.2,
     margin-bottom 4px / 5px. Shows `Premium Court` when masked.
   - **Location row**: 11px pin glyph + 12px text, `rgba(255,255,255,0.85)`, gap 5px,
     margin-bottom 8px / 9px. Shows `Unlock to reveal location` when masked.
   - **Up to three label chips**, only when NOT masked:
     - `rgba(245,242,236,0.22)` background, `backdrop-blur` 8px,
       `1px solid rgba(255,255,255,0.35)`;
     - white 11px / 500, padding `3px 9px`, fully rounded, gap 6px, wrap.

Save button (sibling of the link, not nested inside it; see "Save button" below):

- absolute, top-right, same 12px / 10px inset;
- 34×34 at md+, 32×32 below md, round;
- background `rgba(15,15,15,0.45)` + `backdrop-blur` 8px, no border;
- **bookmark** glyph, not a heart. v3's `Ico.save`: `M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z`,
  stroke 1.6, 15px at md+ / 14px below. Icon color:

| State | Icon color |
|---|---|
| saved | `#E85D4A` |
| not saved | bone |
| guest (save disabled) | bone @ 50%, `cursor-not-allowed` |

`#E85D4A` is a new color: add it once to `tailwind.config.ts` (e.g. `saved: '#E85D4A'`). Don't
inline the hex.

### Masking: what "masked" means here

v3 shows the Premium badge only when the court is locked **for this viewer**
(`isLocked = court.locked && !unlocked`). An entitled member sees the surface chip and real
name/location instead.

`courtDisplay()` already computes the mask but only exposes `locked` (the content flag). Add a
`masked: boolean` field to `CourtDisplay` (= `court.isLocked && !viewerIsEntitled`). Keep
`locked` as is for any existing caller, and drive all three card decisions off `masked`:

- badge vs. surface chip;
- placeholder text;
- whether chips render.

Update the doc comments in `court-display.ts` accordingly.

### Labels: what goes in the three chips

v3's `court.labels` mixes experience tags with access and "Scenic" (e.g. `Sea View, Beach Club,
Resort`). Add a helper to `court-display.ts`:

```ts
/** Card chip labels (v3): experience tags, then access, then "Scenic" — card shows the first 3. */
export function courtCardLabels(court: CourtSummaryDTO): string[] {
  return [...court.tags, court.access, ...(court.isScenic ? ['Scenic'] : [])];
}
```

The card renders `courtCardLabels(court).slice(0, 3)`. `courtCategoryTags()` stays for now; Home
still uses it until TASK_58 removes those sections.

### Surface chip and premium badge: small shared components

Create in `components/court/`:

- **`SurfaceChip`** (`size: 'sm' | 'md'`):
  - sm = 10px, padding `3px 8px`; md = 12px, padding `5px 10px`;
  - weight 500, fully rounded, 1px border;
  - colors from v3 (background / text / border):

| Surface | Background | Text | Border |
|---|---|---|---|
| Clay | `#F0E6E0` | `#8B3A1F` | `#D4A090` |
| Hard | `#E0E8F0` | `#1A4A70` | `#90B0C8` |
| Grass | `#E4EDE0` | `#2A5020` | `#90B878` |

  `Surface` is `Clay | Hard | Grass` in our contracts; v3's Carpet doesn't exist here. Define
  these colors once (Tailwind tokens or a small class map in the component). Court Detail will
  reuse the `md` size in TASK_59. Don't migrate Court Detail now.

- **`PremiumBadge`**:
  - gradient `linear-gradient(135deg,#C8A860,#B89968)`, paper text;
  - 9px on cards, 600 weight, 0.08em tracking, uppercase;
  - padding `3px 10px`, fully rounded;
  - 9px lock glyph, gap 4px.

  The Home "Premium" ribbon is the same thing; it goes away with Home in TASK_58, so don't touch
  it.

## Save button: one shared client component

`components/court/CourtCardSaveButton.tsx` (`'use client'`). It merges what
`HomeCourtSaveHeart` / `CollectionCourtSaveHeart` / `UserCollectionCourtSaveHeart` already do,
with v3 visuals:

```ts
interface CourtCardSaveButtonProps {
  courtId: string;
  courtSlug: string;
  /** The DISPLAYED name (may be "Premium Court") — used in aria-label, never the real masked name. */
  courtLabel: string;
  initialSaved: boolean;
  /** false → v3's disabled/guest state (see below). */
  signedIn: boolean;
  /**
   * Optional: told about every committed/rolled-back state change. Saved uses it to
   * remove the card from its list the moment it is unsaved (and restore it on failure).
   */
  onSavedChange?: (saved: boolean) => void;
}
```

Behavior. Keep the existing pattern exactly, from the current hearts:

- `getMutationSavedRepository().saveCourt` / `.unsaveCourt`;
- optimistic flip, rollback in `.catch`, `pending` reset in `.finally`;
- `AuthRequiredError` → `/signin?redirectTo=…`;
- fixed box size while pending (spinner swaps the glyph, box doesn't change);
- `aria-pressed`, `aria-busy`;
- `aria-label` "Save {courtLabel}" / "Unsave {courtLabel}".

Call `onSavedChange?.(next)` on the optimistic flip and `onSavedChange?.(!next)` on rollback.

**Guest (`signedIn === false`)**: v3 renders the button dimmed. Clicking it toggles a small
tooltip under the button instead of saving:

- ink background, bone text, 11px / 500, padding `6px 10px`, radius 6px, small shadow;
- positioned `top: 115%; right: 0`.

Make the tooltip text a link: **"Sign in to save"** → `/signin?redirectTo=<current pathname>`
(use `usePathname()`). That way it does something useful, still looks exactly like v3, and keeps
today's "guest goes to sign-in" outcome. Close the tooltip on outside click / Escape.

## The card component

Replace `components/court/CourtCard.tsx` with the v3 card. Signature (adjust names if clearer):

```ts
interface CourtCardProps {
  court: CourtSummaryDTO;
  viewerIsEntitled: boolean;
  /** Omit to render no save button at all. */
  save?: { initialSaved: boolean; signedIn: boolean; onSavedChange?: (saved: boolean) => void };
  /** next/image `sizes`; default "(max-width: 768px) 100vw, 33vw". */
  imageSizes?: string;
  /** next/image priority for the first card in a list. */
  priority?: boolean;
}
```

- Render it as a `relative` wrapper containing the `PendingCardLink` (photo, gradient, top-left
  badge/chip, bottom block) plus the save button as a **sibling**. Never nest a button inside the
  link. This is the same structure the current Featured/Collection cards use.
- It stays presentational apart from the save button. No fetching, no `@tennis/mock-data`.

### The old `CourtCard`

It is only used by `MapCourtList`'s mobile strip (180px-wide horizontal strip). TASK_57 rebuilds
the Courts/Map list entirely. Until then:

- rename the old file to `components/court/LegacyCourtCard.tsx` (export `LegacyCourtCard`);
- point `MapCourtList` at it;
- add a one-line comment: "removed in TASK_57".

Don't try to make the new card fit that 180px strip.

## Migrate these screens to the new card

Keep each screen's current grid/columns. Each screen gets its own v3 layout task later. Only swap
the card.

1. **`features/collection-detail/CollectionCourtsGrid.tsx`**: replace the inline card +
   `CollectionCourtSaveHeart` with `<CourtCard … save={{ initialSaved, signedIn }} />`. The page
   already passes `savedCourtIds` and `signedIn` (Task 47). Delete
   `CollectionCourtSaveHeart.tsx` and its export.
2. **`features/user-collection-detail/UserCollectionCourtsGrid.tsx`**: same swap with
   `signedIn: true` (this page is always signed in, Task 48). Delete
   `UserCollectionCourtSaveHeart.tsx` and its export.
3. **`features/saved/SavedCourtsGrid.tsx`**: replace the inline card and its "X" unsave control
   with `<CourtCard … save={{ initialSaved: true, signedIn: true, onSavedChange }} />`, where
   `onSavedChange(false)` → `onUnsavedChange(court.id, true)` (optimistic remove) and
   `onSavedChange(true)` → `onUnsavedChange(court.id, false)` (rollback restore). That matches
   v3: un-bookmarking on Saved removes the card. The grid's own `pending` set and `handleUnsave`
   go away; the button owns pending now.
   - Keep `unsavedIds` / `onUnsavedChange` lifted in `SavedTabs`. The "N saved" count still
     depends on it.
   - Keep `SavedEmptyState` and `SavedDreamListCta` as they are.
   - Optional: at `lg` switch the grid from 4 to 3 columns. v3 Saved is 3 columns, and 4 columns
     of 340px-tall cards get very narrow. Otherwise leave layout to TASK_61.

**Not in this task:**

- Home's `HomeFeaturedCourts` / `HomeEditorsCut` / `HomeCourtSaveHeart`. TASK_58 deletes those
  sections, so don't spend effort migrating them.
- The Map list (TASK_57).
- Court Detail's nearby strip (TASK_59). It uses small thumbnail cards in v3, not `CourtCard`.

Update the header comments of every file you touch. Several still say "one heart component per
screen, not shared across feature folders". Replace that with a pointer to the v3 rule and the
shared `CourtCard`.

## Do not touch

- `CollectionSaveHeart` (the heart on a whole **collection**, Task 42). It is a different object.
- `CourtSaveButton` in `features/court-detail/`. Court Detail gets its own task.
- Saved repository / API calls. Same methods, same semantics.
- `courtCategoryTags()` and its Home callers.

## Testing

**Collection Detail and personal folders:**

- `/collections/<slug>`: cards are the v3 cards.
- Bookmark saves/unsaves (check `/saved` afterwards).
- Card body navigates to the court.

**Personal folder (`/saved/collections/<slug>`):** same as above.

**Saved (`/saved`, Courts tab):**

- Every bookmark is red (saved).
- Clicking one removes the card immediately and the "N saved" count drops.
- If the API call fails, the card comes back and the count is restored. Test by e.g. stopping
  the API.

**Guest:**

- On `/collections/<slug>`, the bookmark is dimmed.
- Clicking shows the "Sign in to save" tooltip.
- The link goes to `/signin?redirectTo=/collections/<slug>`.

**Masking:**

- As a free / signed-out viewer, a premium court shows the gold "Premium" badge, "Premium
  Court", "Unlock to reveal location", and no chips.
- As an entitled member, the same court shows its surface chip, real name, location and chips.

**Sizes:** cards are 170px tall on mobile and 340px at md+, 14px radius.

**Chips:**

- Up to three, in order: tags, then access, then "Scenic".
- Surface chip colors are correct for Clay / Hard / Grass.

**Leftovers:**

- No `CollectionCourtSaveHeart` / `UserCollectionCourtSaveHeart` left.
- `LegacyCourtCard` is used only by `MapCourtList`.

`pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

- Files created / changed / deleted.
- The final `CourtCard` props.
- Whether you changed the Saved grid to 3 columns.
- Anything in the v3 card you couldn't match exactly, and why.

No git commit or push unless asked.
