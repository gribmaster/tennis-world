# TASK 70 — Home hero: always three dots on each side of the pill (endless dot ring)

**Model: Sonnet 5, reasoning effort: medium.** A follow-up to TASK_68 in `apps/web/src/features/home/HomeHero.tsx`. Read the current file first (TASK_66 → 67 → 68 plus the owner's hand edits). Everything not named below stays as it is.

## Goal

With the pill fixed in the centre (TASK_68), the dots currently behave like a finite strip: on the first slide the left side is empty and the right side has three dots; on the last slide it is mirrored. The owner wants the pagination to **look the same on every slide: always exactly three dots to the left of the pill and three to the right**, with the dots flowing smoothly to the left as the slide advances.

## Decisions already made (do not re-litigate)

1. **Treat the slides as a ring and draw an endless strip of dots.** Dots are *virtual*: the dot at offset `d` from the pill (for `d = −3 … −1` and `+1 … +3`) represents slide `(index + d) mod N`. With the 4 slides we have, each of the three other slides therefore appears once on the left and once on the right (for example on slide 1 both sides show slides 2, 3, 4 in order). That repetition is intended — it is what makes "three and three" true on every slide.
2. **Number of dots per side = `SIDE = min(3, N − 1)`.** `N = 4` → 3 per side; `N = 3` → 2; `N = 2` → 1; `N = 1` → no dots, the pill alone (unchanged). With `SIDE ≤ N − 1` a dot never represents the active slide, so no dot ever duplicates the pill. The row width is `pillW + 2·SIDE·slot` (constant; with 4 slides this is exactly the TASK_68 width: 296px mobile / 340px desktop), centred, the pill fixed in its middle.
3. **Replace the bounded `index` with an unbounded position counter.** Keep `pos` (integer, may be negative or exceed `N`) as the state, and derive `index = ((pos % N) + N) % N` for everything that already uses `index` (cross-fading photos, pill label, card link `href`/`aria-label`). Every way of changing the slide moves `pos` by a delta:
   - next arrow / pill click / autoplay: `pos + 1`;
   - previous arrow: `pos − 1`;
   - clicking a dot that currently sits at offset `d`: `pos + d` (so a dot on the left takes you back by `|d|` slots, a dot on the right forward by `d`, and the strip animates that many slots without any wrap-around "hop").
   The autoplay effect's dependency becomes `pos` (not `index`), so every change still restarts the countdown, including a wrap that lands on the same `index` pattern. The `3500` interval, pausing rules and gates from TASK_67 are untouched.
4. **Render virtual dots keyed by absolute position, never by slide.** For `v` in `pos − (SIDE+1) … pos + (SIDE+1)`, `v ≠ pos`, render one dot element with `key={v}` representing slide `((v % N) + N) % N`, at offset `d = v − pos`. The two outermost positions (`|d| = SIDE + 1`) are rendered with `opacity: 0`, `pointer-events: none`, outside the visible row (the row is `overflow: visible`): they are the dots that are about to enter / have just left, so the entering dot fades in at the edge and the leaving one fades out instead of popping. When `pos` changes, React keeps the same elements for the same `v`, so each persisting dot just moves one slot left (or right when going back) via the existing `transform` transition, and the one that exits the range is unmounted only after it has already faded out at the outer slot (it is rendered at `|d| = SIDE+1` with opacity 0 for one step before leaving the range — verify this actually shows no pop on a step, sampling the DOM, and adjust the margin of extra rendered positions if it does). The element for `v = pos` (under the pill) is not needed any more: the active dot is simply not rendered. No `key` may be derived from `slide.slug` alone (it would collide: the same slide is shown twice).
5. **Geometry** (same custom-property mechanism as TASK_68, no runtime measurement): pill `left = SIDE·slot`; a dot at offset `d < 0`: `x = (SIDE + d)·slot`; at `d > 0`: `x = SIDE·slot + pillW + (d − 1)·slot`. Dots at `|d| = SIDE + 1` are placed by the same formula (they just lie one slot outside the row). `--slot` / `--pill-w` values per breakpoint are the TASK_68 ones — do not change them.
6. **Opacity by distance** (replaces the old rule, same idea): resting opacity `1` at `|d| = 1`, `0.75` at `|d| = 2`, `0.5` at `|d| = 3`, `0` at `|d| = SIDE + 1`. Keep the `bg-white/60` → hover `bg-white/95` colours and the `350ms cubic-bezier(0.4, 0, 0.2, 1)` transform / `200ms` opacity transitions and `motion-reduce:[transition:none]`.
7. **Accessibility — the duplicates must not double the Tab stops.** Dots on the **left** (`d < 0`) are decorative duplicates for pointer/touch: `aria-hidden="true"`, `tabIndex={-1}`. Dots on the **right** (`d > 0`) keep `aria-label="Go to slide K"` (K = represented slide number, 1-based) and are normal tab stops, so with `N = 4` each other slide is reachable once. (Keyboard users also have the previous/next arrows and the pill.) DOM/Tab order stays: previous arrow, pill, dots in visual left-to-right order, next arrow.
8. **Unchanged:** the pill (fixed, centred, `transform: none`), arrows and their placement (TASK_68), autoplay and its gates, `role="group"` + `aria-label="Hero slides"`, single-slide behaviour, `app/page.tsx`, image cross-fade, everything outside `HomeHero.tsx`. No new dependency. Update the header/inline comments in `HomeHero.tsx` that describe the finite strip so they describe the ring.

## Do not touch

Server-side slide selection (`app/page.tsx` — a separate question about how many slides production gets is still open), other Home sections, CLAUDE.md, the 3500 interval. If `verify:ux-pending-states` (or another harness) reads `HomeHero.tsx` and breaks on the changed markup, update its expectation and say exactly what changed.

## Testing (real browser, `pnpm dev` on 18000, guest, widths 360 / 390 / 820 / 1280; sized same-origin iframe if the window can't be resized — say so)

1. **Always 3 + 3:** for every active index (0–3) read the visible dots (opacity > 0.4) and their bounding boxes: exactly 3 to the left and 3 to the right of the pill, evenly spaced by `--slot`, none overlapping the pill; the pill's centre equals the card's centre (±0.5px) at every index.
2. **Content of the strip:** at each index, the left dots (left → right) represent slides `index−3, index−2, index−1 (mod 4)` and the right dots `index+1, +2, +3 (mod 4)` — check via the hidden slide number you expose (for example `data-slide` on each dot) or the `aria-label`s of the right-hand ones.
3. **Continuity — the important one.** Take one step (click Next) and diff the dots by `key`/node identity: every dot that was visible before is still the same DOM node afterwards and moved exactly one slot to the left (±0.5px, once the transition ends); one node faded in at the right outer edge, one faded out at the left outer edge; nothing teleported. Repeat for Prev (everything moves one slot right), for a wrap (4 → 1 via Next and 1 → 4 via Prev: motion is still one slot with no hop), and for autoplay across a wrap. Also click a right dot at `d = +2` and a left dot at `d = −3`: the strip moves 2 and 3 slots respectively in the matching direction and ends on the right slide.
4. Sample a moving dot's computed `transform` at ~100ms and ~350ms after a change to prove the glide is progressive; `prefers-reduced-motion: reduce` → no transition (and no autoplay, unchanged).
5. **Keyboard:** Tab order = previous arrow, pill, the three right-hand dots, next arrow; left-hand dots are skipped and `aria-hidden`; Enter/Space work; no duplicate-label warnings from an a11y snapshot.
6. Screenshots at 390 and 1280 for slide 1 and slide 4, described in the report (identical-looking 3 + 3 around a centred pill in both).
7. No horizontal scroll (`scrollWidth <= innerWidth`) at any width — the extra rendered outer dots must not widen the page; one `<h1>`; no `<button>` inside `<a>`; no console or hydration errors.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards), `verify:ux-pending-states`, `verify:map-autofocus` (only the 4 known failures).

## Report

1. Files changed; how `pos`/`index`/`SIDE` are derived; how many extra positions you render and why.
2. The Testing 1–3 results as short tables (index × width: left/right dot counts, pill-centre offset; the one-step diff for Next, Prev and a wrap).
3. Motion and keyboard results (Testing 4–5) and what the screenshots show.
4. Anything that surprised you (for example a visible pop at the outer slots) and how it was handled.
5. Exact commands run. No git commit or push.
