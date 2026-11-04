# TASK 71 — One shared "add to collection" icon (replaces the bookmark everywhere)

**Model: Sonnet 5, reasoning effort: low–medium.** Pure icon refactor, no behaviour change.

## Goal

The single court page already uses a "stacked cards with a plus" icon on its **Add to Collection** button (`features/court-detail/SaveToCollectionMenu.tsx`, a local function that is confusingly named `BookmarkGlyph` and has `stroke="#000000"` hard-coded). Everywhere else a collection-related "add" button still draws a plain bookmark. The owner wants **that single-court-page icon on every "add to collection" button, and no bookmark glyph anywhere**.

## Decisions already made (do not re-litigate)

1. **The icon** is exactly the SVG that `SaveToCollectionMenu` draws today: `viewBox="0 0 24 24"`, `fill="none"`, one `<path>` with this `d` (copy it from that file byte for byte; do not retype it):
   `M3 9V19.4C3 19.9601 3 20.2399 3.10899 20.4538C3.20487 20.642 3.35774 20.7952 3.5459 20.8911C3.7596 21 4.0395 21 4.59846 21H15.0001M14 13V10M14 10V7M14 10H11M14 10H17M7 13.8002V6.2002C7 5.08009 7 4.51962 7.21799 4.0918C7.40973 3.71547 7.71547 3.40973 8.0918 3.21799C8.51962 3 9.08009 3 10.2002 3H17.8002C18.9203 3 19.4801 3 19.9079 3.21799C20.2842 3.40973 20.5905 3.71547 20.7822 4.0918C21.0002 4.51962 21.0002 5.07969 21.0002 6.19978L21.0002 13.7998C21.0002 14.9199 21.0002 15.48 20.7822 15.9078C20.5905 16.2841 20.2842 16.5905 19.9079 16.7822C19.4805 17 18.9215 17 17.8036 17H10.1969C9.07899 17 8.5192 17 8.0918 16.7822C7.71547 16.5905 7.40973 16.2842 7.21799 15.9079C7 15.4801 7 14.9203 7 13.8002Z`
   with `strokeWidth="2"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
2. **One shared component:** create `apps/web/src/components/ui/AddToCollectionIcon.tsx` — `export function AddToCollectionIcon({ size = 20, className? })` — and export it from `components/ui/index.ts`. Differences from today's inline copy, and only these: `stroke="currentColor"` instead of `#000000` (so it takes the button's text colour and works on dark glass overlays), the SVG is `aria-hidden`, the width/height come from `size`, and the stray `<g>`/`id="Vector"` wrapper is dropped (an `id` repeated on every instance is invalid HTML). It is the only place that path exists after this task.
3. **Switch to it:**
   - `features/court-detail/SaveToCollectionMenu.tsx` — delete the local `BookmarkGlyph`, render `<AddToCollectionIcon />` (20px). **Visually this must not change** on the court page: confirm the button's text colour there (the `DESKTOP_CIRCLE` / `MOBILE_CIRCLE` classes in `CourtDetailShell.tsx`) renders the same near-black as the old hard-coded `#000000` (ink vs pure black is acceptable) — if the circle class sets no dark text colour, set it on the icon's button, don't hard-code black again. Rename nothing else in that file.
   - `features/collections/CollectionSaveHeart.tsx` — its `glyph="bookmark"` variant (the Curated collection rows and anywhere else that passes it) renders `<AddToCollectionIcon size={…} />` instead of `BookmarkGlyph`. Rename the variant's value from `'bookmark'` to `'collection'` everywhere (prop type, default handling, the doc comment, and every call site — grep for `glyph=`), since it is no longer a bookmark. Pick the size by looking: the old bookmark was 14/15px; this icon is more detailed, so 16–18px is likely right inside the same circle (do not resize the circle). **Saved state** has no fillable shape in this icon, so it is shown by colour only, as the bookmark's was (`text-saved` vs the idle colour) plus the existing `aria-pressed`; check that the saved colour is clearly distinguishable from the idle one on every background it appears on (dark glass circle on an image, light row on the Saved page) and say what you saw.
   - `grep -rniE "bookmark" apps/web/src` and handle every hit: either it is now unused (delete it), or it is a comment that should stop saying bookmark, or it is something this task must list instead of touching.
4. **Order dependency with TASK_69:** `components/court/CourtCardSaveButton.tsx` exports `BookmarkGlyph`, and TASK_69 replaces its use on the *court card* with the heart. If TASK_69 has already been applied, delete `BookmarkGlyph` and its export from `components/court/index.ts` once nothing imports it (typecheck proves that). If `CourtCardSaveButton` still draws the bookmark when you start, do **not** touch it (TASK_69 owns it), keep the export, and say so in the report.
5. **Out of scope:** the heart icon (TASK_69), `PlusGlyph`/`CheckGlyph` inside the menu, "Create collection" buttons, nav icons, any wording or behaviour. No new dependency.

## Do not touch

Saved-state logic, repositories, menu behaviour, the circles' sizes/positions, `app/` pages, CLAUDE.md. If a harness reads one of these files for a glyph name and breaks only because of the rename, update the harness expectation and say what changed.

## Testing (browser, `pnpm dev` on 18000, guest and signed-in free; widths 360 / 390 / 820 / 1280; sized same-origin iframe if the window can't be resized — say so)

1. **Identity in the DOM:** on the court detail page (Add to Collection button), `/collections` (Curated rows), `/collections/<slug>`, the Saved collections tab and anywhere else `CollectionSaveHeart` renders its collection variant: read the `d` of the icon's `<path>` on each page and assert it equals the reference string above; `stroke` is `currentColor`; no duplicate `id="Vector"` anywhere on a page.
2. **Court page unchanged:** open the Add to Collection menu from the desktop circle and from the mobile bar; the trigger looks the same as before (describe it), the menu still opens/closes, and toggling a collection still works.
3. **Collection controls:** idle and saved states on a card/row for each place found in step 1, at 390 and 1280; click toggles (signed-in) and the guest behaviour is unchanged; describe whether the saved state is clearly visible and the chosen icon size.
4. No horizontal scroll, no console/hydration errors, no `<button>` inside `<a>` introduced, one `<h1>` per page.
5. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards), `verify:ux-pending-states`, `verify:saved-court-toggle`, `verify:map-autofocus` (only the 4 known failures).

## Report

1. Files changed (one line each); the final `grep -i bookmark` result with what was done to each hit.
2. Whether TASK_69 had already been applied, and what that meant for `BookmarkGlyph`.
3. The identity check (Testing 1) with the pages covered; the court-page comparison (Testing 2).
4. The size chosen for the collection control and what the saved state looks like (Testing 3).
5. Exact commands run. No git commit or push.
