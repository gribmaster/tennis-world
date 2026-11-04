# TASK 68 — Home hero: pill stays fixed in the centre, only the dots move

**Model: Sonnet 5, reasoning effort: medium.** Replaces the pagination mechanics from TASK_66 inside `apps/web/src/features/home/HomeHero.tsx`. Read the current file first: it contains TASK_66 (sliding pill row), TASK_67 (arrows + autoplay) and the owner's later hand edits (`HERO_AUTOPLAY_MS = 3500`, the `text-center` on the `<h1>`), all of which **stay as they are**.

## Goal

Today the place pill travels left and right along the row to the active slide's position (TASK_66). The owner wants the opposite: **the pill never moves — it is always exactly in the horizontal centre of the card; only the dots on its left and right move** when the slide changes.

## Decisions already made (do not re-litigate)

1. **Pill: fixed, centred, never translated.** Its `transform` is never set (remove the `translateX(calc(index * var(--slot)))` and its transition). Its bounding-box centre equals the card's centre at every index, at every width.
2. **Dots form a strip that slides under the fixed pill.** For slide `j` with active index `i`, its *offset* is `d = j − i`.
   - `d < 0`: the dot sits to the **left** of the pill, `|d|` slots out from its left edge.
   - `d > 0`: the dot sits to the **right** of the pill, `d` slots out from its right edge.
   - `d = 0` (the active slide): its dot is hidden **under** the pill (`opacity: 0`, `pointer-events: none`, `aria-hidden`, `tabIndex={-1}`), parked at the pill's centre.
   When the slide advances, every dot moves one slot toward the left: the previous active dot emerges from under the pill's left edge into slot −1, the next dot slides into the pill (fading out as it goes under), and the dots that were further right each move one slot closer. Going backwards is the mirror image. No dot is ever mounted or unmounted; only `transform` and `opacity` change, with the existing `350ms cubic-bezier(0.4, 0, 0.2, 1)` / `200ms` transitions and `motion-reduce:[transition:none]`.
3. **Constant row width, reserving the maximum on both sides.** With `N` slides the row reserves `N − 1` slots on each side of the pill (3 + pill + 3 for the current 4 slides), so the row width is `pillW + 2·(N − 1)·slot` and does not change with the slide. Slots that hold no dot at the moment (for example the whole left side at index 0) are simply empty; **no placeholder/ghost dots**. That is what keeps the pill centred while the number of visible dots on each side varies from 0 to 3.
4. **Distance fade** so the strip reads as a carousel: a dot's resting opacity is `1` at `|d| = 1`, `0.75` at `|d| = 2`, `0.5` at `|d| ≥ 3` (the colour classes stay `bg-white/60` → hover `bg-white/95`; the fade is on the button's `opacity`). The active dot's opacity is `0`. Give the *appearing* dot (the one that leaves `d = 0`) a ~150ms `transition-delay` on opacity so it emerges from beside the pill instead of showing blurred behind it; the disappearing dot (entering `d = 0`) has no delay. Tune by eye, but the dots must pass **behind** the pill (pill above the dots in z-order; the pill keeps its `backdrop-blur`), never in front of it.
5. **Geometry, per breakpoint, via the row's CSS custom properties** (same mechanism as today — `--pill-w`, `--slot`, no runtime measurement, no hydration risk):
   - Mobile: `--slot: 24px` (the WCAG 2.2 minimum target size), `--pill-w: 152px` with the pill's horizontal padding reduced to `px-4` so the text area stays ≥ 120px (the longest real label, "Douro Valley", needs ~120px at 13px / `tracking-[0.16em]`; verify it still fits without an ellipsis and widen `--pill-w` only if it doesn't). Row width for 4 slides = 152 + 6·24 = **296px**, which fits a 328px card (360px viewport) with 16px to spare on each side.
   - Desktop (`md+`): keep `--slot: 28px` and `--pill-w: 172px` (row = 340px).
   Compute the row width and every dot's `x` from `N` and `--slot`/`--pill-w` with `calc()`; do not hard-code 4 slides. Positions from the row's left edge: pill `left = (N−1)·slot`; a dot with `d < 0`: `x = (N−1+d)·slot`; a dot with `d > 0`: `x = (N−1)·slot + pillW + (d−1)·slot`; a dot with `d = 0`: `x = (N−1)·slot + (pillW − slot)/2`.
6. **Mobile arrows move out of the bottom row** (this supersedes TASK_67 decision 4). That placement existed only because the left-aligned "ATLAS" title crossed the vertical centre on mobile; the owner has since centred the title (`text-center` on the `<h1>`), which frees the sides, and the wider row above no longer leaves room beside it. So on mobile too: the arrows are vertically centred on the card (`top-1/2 -translate-y-1/2`), 36px circles, `left-2` / `right-2`; desktop stays as is (48px, `left-6` / `right-6`). Same glass style, same `aria-label`s, same z-index, still siblings of the card link. **Measure** that at 360px and 390px the arrows do not overlap the "ATLAS" text (use a `Range` over the title's text node, not the full-width `<h1>` box) — if they do, stop and report the numbers instead of shrinking the title.
7. **Everything else from TASK_66/67 stays:** the pill is still a `<button>` that advances to the next slide (wrapping); dots still jump to their slide; `aria-label="Go to slide N"`; `role="group"` + `aria-label="Hero slides"`; DOM/Tab order = previous arrow, pill, dots **in slide order**, next arrow (the hidden active dot is skipped); single slide → the pill alone, centred, no dots, no arrows; autoplay conditions, pausing, the `3500` interval and the reset-on-change behaviour are untouched.
8. Mobile and desktop remain **one** DOM tree. No new dependency, no change to `app/page.tsx`.

## Do not touch

The server side, other Home sections, the card/crest/title, `PendingCardLink`, autoplay logic, CLAUDE.md. If `verify:ux-pending-states` (or another harness) reads `HomeHero.tsx` and breaks on the changed markup, update the harness's expectation and say exactly what changed. Update the stale comments in `HomeHero.tsx` that still describe the old sliding pill / the 1500ms interval / the bottom-row mobile arrows so the header comment matches the new behaviour (comments only for the interval — do **not** change the 3500).

## Testing (real browser, `pnpm dev` on 18000, guest, widths 360 / 390 / 820 / 1280; resize via a sized same-origin iframe if the window can't be resized, and say so)

1. **The key check:** for every active index (0, 1, 2, 3) read the pill's `getBoundingClientRect()`: its horizontal centre equals the card's centre (±0.5px) and its `x` is **identical** across indexes. The computed `transform` of the pill is `none`.
2. For every index list the dots' state: which slides' dots are visible left / right of the pill and their `x`; expected visible counts (left/right) 0/3, 1/2, 2/1, 3/0. No dot overlaps the pill or another dot; the whole row stays inside the card (row left ≥ card left + 16px at 360, i.e. nothing is clipped or touching the arrows).
3. Click the pill, each visible dot, both arrows, and let autoplay run through a wrap (last → first): the pill stays put each time; the strip moves smoothly (sample a dot's computed transform ~100ms and ~350ms after a change); nothing flashes or pops.
4. Keyboard: Tab order and Enter/Space as in decision 7; the hidden dot is skipped. `prefers-reduced-motion: reduce` → no transition, no autoplay (unchanged).
5. Arrows at 360 / 390 / 820 / 1280: vertically centred, no overlap with the title text (decision 6) or the crest; no horizontal scroll (`scrollWidth <= innerWidth`); one `<h1>`; no `<button>` inside `<a>`; no console or hydration errors.
6. Screenshots at 390 and 1280 for index 0 and index 3 (extremes) and one middle index; describe them (pill dead-centre in all; at index 0 three dots to the right only and the left empty; at index 3 mirrored).
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards), `verify:ux-pending-states`, `verify:map-autofocus` (only the 4 known failures).

## Report

1. Final `--pill-w` / `--slot` per breakpoint, the label that set the pill width, and the resulting row width at 360px.
2. Files changed (expected: `HomeHero.tsx`, plus a harness only if it had to change).
3. The measurements table for Testing 1–2 (index × width: pill centre vs card centre, pill x, dots left/right counts).
4. Motion, keyboard and arrow-overlap results (Testing 3–5) and what the screenshots show.
5. Anything you had to deviate on, with the numbers behind it.
6. Exact commands run. No git commit or push.
