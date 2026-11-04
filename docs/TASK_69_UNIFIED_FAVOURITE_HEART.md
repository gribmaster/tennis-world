# TASK 69 — One shared "favourite" heart for every save-a-court control

**Model: Sonnet 5, reasoning effort: medium.** Visual/refactor task. No behaviour change anywhere.

## Goal

Court cards (`CourtCard` → `CourtCardSaveButton`) currently show a **bookmark** glyph for "save this court" (v3 prototype's `Ico.save`). The court detail page (`CourtSaveButton`) shows a **heart**. The owner wants the card to use the same heart as the court detail page, and wants **every control that adds a court to favourites** (as opposed to adding it to a collection) to use **one shared heart icon**, not a separate copy per file.

**This deliberately overrides the v3 prototype on this one point** (the prototype used a bookmark on cards). The reference is the heart that is on the court detail page today.

## Decisions already made (do not re-litigate)

1. **The reference glyph** is the one in `apps/web/src/features/court-detail/CourtSaveButton.tsx` (`HeartGlyph`): `viewBox="0 0 24 24"`, path `M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z`, `stroke="currentColor"`, `strokeWidth="2.6"`, round caps/joins, `fill` = `currentColor` when filled and `none` when not. Do not redesign it, soften the stroke or change the path.
2. **One shared component:** create `apps/web/src/components/ui/HeartIcon.tsx` — `export function HeartIcon({ filled, size = 16, className? })` (SVG `aria-hidden`, nothing else) — and export it from `components/ui/index.ts`. It is the **only** place the heart path exists after this task.
3. **Switch these to it (delete their local copies):**
   - `components/court/CourtCardSaveButton.tsx` — replace the bookmark with `<HeartIcon filled={isSaved} />`.
   - `features/court-detail/CourtSaveButton.tsx` — its local `HeartGlyph` becomes `HeartIcon` (same 16px, same `filled` logic; the 1:1 spinner swap size rule, CLAUDE.md §4 rule 5, still holds).
   - `features/map/MapCourtPreview.tsx` — its local visual-only `HeartGlyph` (compact stage) becomes `HeartIcon`. It stays **non-interactive** exactly as today; this task does not make it a working save button (mention in the report that it is inert).
   - `features/collections/CollectionSaveHeart.tsx` — its `glyph="heart"` variant's local `HeartGlyph` becomes `HeartIcon` **only if** the rendered result is identical (same path/stroke/size handling); if its stroke or size differs from the reference, keep it and say so in the report. That control saves an editorial *collection*, not a court, so it is outside the owner's request; this is just de-duplication.
   - Before finishing, `grep -rn "saveCourt(\|20.84 4.61" apps/web/src` and make sure no other court-favourite control or heart copy was missed; list anything else you find instead of silently changing it.
4. **Leave alone (they are not "save a court to favourites"):** `BookmarkGlyph` and the `glyph="bookmark"` variant of `CollectionSaveHeart` (Curated collection rows save a *collection*); `SaveToCollectionMenu`'s own bookmark (adds to a user collection); `HomeMembership`'s decorative benefits-list heart icon; the "Save to collection" flow. Keep the `BookmarkGlyph` export in `CourtCardSaveButton.tsx` (still imported by `CollectionSaveHeart`), but fix its now-wrong doc comment ("v3's `Ico.save` — a bookmark…") so it says it is only used for the collection bookmark variant.
5. **Card control keeps everything else as it is:** the 32px / 34px (`md`) dark glass circle (`bg-ink/45 backdrop-blur-[8px]`), position, spinner swap while pending, optimistic save + rollback, `onSavedChange`, `aria-pressed`/`aria-label` ("Save …" / "Unsave …" using the displayed name), the guest state and the "Sign in to save" tooltip. Colours: **unsaved = outline heart in `text-bone`**, **saved = filled heart in `text-saved`** (the existing `saved` token), **guest = outline at `text-bone/50`, cursor not-allowed** (unchanged). Glyph size on the card: use one size for both breakpoints (16px) and remove the now-unnecessary `md:hidden` / `hidden md:inline-flex` double-render of the icon; if 16px looks heavy inside the 32px circle at 360px, use 15px for both — choose by looking at it and say which.
6. **Court detail colours stay as they are** (`heartColor` in `CourtDetailShell`: `text-saved` when saved, `text-ink` otherwise, on its white circles). The card (dark glass, light heart) and the detail page (white circle, dark heart) differ in context only; the **shape** is the same.
7. No new dependency. No change to repositories, saved-state logic, routing or `app/` pages. No change to the `Save Court` text-label presentation of `CourtSaveButton`.

## Do not touch

Billing/auth/API, the saved-state hooks (`useCourtSaveState`), `CourtCard` layout, the collection cards' save controls (other than item 3's optional de-dup), CLAUDE.md rules. If `verify:ux-pending-states` (it reads `CourtSaveButton.tsx` and `CourtCardSaveButton.tsx` source) or another harness breaks only because a glyph was renamed/moved, update the harness expectation and say exactly what changed — do **not** alter the pending/rollback code to satisfy it.

## Testing (browser, `pnpm dev` on 18000; widths 360 / 390 / 820 / 1280; guest, signed-in free; sized same-origin iframe if the window can't be resized — say so)

1. **Identity check in the DOM:** on one page that shows several of these controls (e.g. `/saved` courts grid with a saved court + `/collections/<slug>` + the map list + a court detail), read the `d` attribute of every heart `<path>` and assert they are all byte-identical to the reference path, with `stroke-width` 2.6 and `viewBox` `0 0 24 24`. Report the list of pages checked.
2. **States on a card** (a `/courts`/map-list or collection-detail card, a Saved card): unsaved (outline), click → optimistic filled `text-saved` heart + spinner while pending, then settled filled; click again → back to outline; on Saved the card disappears on unsave exactly as before. Guest: dimmed outline, click shows the "Sign in to save" tooltip, no navigation.
3. **Look at it:** screenshots (390 and 1280) of a card in unsaved and saved states, the court-detail heart for comparison, and the map preview's compact heart; describe whether the card heart and detail heart read as the same icon, and the size you chose (decision 5).
4. No horizontal scroll, no console/hydration errors, no `<button>` inside `<a>` introduced (the card's save button is outside the card link — keep it that way), one `<h1>` per page.
5. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards), `verify:ux-pending-states` (91/91 or current total), `verify:saved-court-toggle`, `verify:map-autofocus` (only the 4 known failures).

## Report

1. Files changed (one line each) and the files that still contain a bookmark or heart on purpose, with the reason.
2. The grep result from decision 3 and anything extra it found.
3. The DOM identity check (Testing 1) and the card-state results (Testing 2).
4. Chosen card glyph size and what the screenshots show.
5. Harness changes, if any, with the exact reason.
6. Exact commands run. No git commit or push.
