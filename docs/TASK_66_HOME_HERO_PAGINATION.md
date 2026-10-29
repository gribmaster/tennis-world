# TASK 66 — Home hero: sliding place-pill between the pagination dots

**Model: Sonnet 5, reasoning effort: medium.** One component, visual-only. Follow the existing structure and rules in `apps/web/src/features/home/HomeHero.tsx` (read its header comment first) and CLAUDE.md §4.

## Goal

The pagination control under the hero card ("ATLAS" banner on `/`) looks bad. Today the place pill and the dots are laid out with flexbox in two separate trees:
- **Mobile:** dots before the active slide sit left of the pill, dots after sit right of it, each side `flex-1`. When the slide changes the pill jumps sideways because the number of dots on each side changes, and the layout re-centres abruptly.
- **Desktop:** the pill sits on the left and *all* dots to its right, so the pill never sits between the dots at all.

Wanted: **the place pill sits *between* the dots, and when the slide changes the pill glides smoothly onto the next dot's position**, while the whole control keeps a constant width and stays centred, so nothing jumps.

## Decisions already made (do not re-litigate)

1. **One row of N positions (N = number of slides, 4 today), the pill occupies the active slide's position.** Dots for slides before the active one are to the left of the pill, dots for later slides to the right. The count of dots on each side therefore changes with the slide (0–3), but the **total row width is constant** and the row is **centred**, so the pill glides along the row and the neighbouring dots slide aside to make room. (The owner first said "always three dots each side"; with 4 slides that is impossible, and this sliding-row design was the option they chose.)
2. **The pill has a fixed width** (so the row width cannot change when the label changes). Text inside is centred and truncated with an ellipsis if too long (`truncate`). Pick the width from the real labels: read `selectHeroSlides` in `app/page.tsx` and the seeded `region`/`country` values, find the longest label at `13px uppercase, tracking-[0.16em]`, and choose the smallest width that fits it without truncation (round up to a multiple of 4px). Mobile and desktop may use different widths (via CSS custom properties, below), as long as it fits a 360px screen: row width = pillWidth + (N−1)·slot must be ≤ card width − 36px.
3. **Geometry via CSS custom properties, motion via `transform`.** Set on the row: `--slot` (dot hit-target width, 28px) and `--pill-w`. Every item is `position: absolute; left: 0` inside a relatively positioned row with `width: calc(var(--pill-w) + (N − 1) * var(--slot))` and a fixed height (the pill height, ~40px). Positions (x offset):
   - pill: `index · slot`
   - dot *i* with *i < index*: `i · slot`
   - dot *i* with *i > index*: `i · slot + (pill-w − slot)`
   - the dot whose index equals the active index stays rendered but `opacity: 0`, `pointer-events: none`, `tabIndex={-1}`, `aria-hidden`, at the pill's `x` (so when the pill leaves it fades back in; nothing ever mounts/unmounts).
   Animate with `transition: transform 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease`. Because every element persists and only `transform`/`opacity` change, the glide is smooth and compositor-only. `motion-reduce:transition-none`.
4. **Single DOM tree for both breakpoints.** Delete the separate `md:hidden` mobile block and the `hidden md:flex` desktop block; the new row is one element, centred (`left-1/2 -translate-x-1/2` or an `inset-x-0 flex justify-center` wrapper), at `bottom-[18px]` on mobile and `md:bottom-9` on desktop as today. This removes the duplicate buttons from the DOM.
5. **Keep every behaviour and rule the component already has:** the pill and dots remain **siblings** of the `PendingCardLink` (never inside the `<a>`), `z-10`, no `Pending*` primitive on them (CLAUDE.md §4 rule 10); the pill button still advances to the next slide (wrapping); dots still jump to their slide; `aria-label="Go to slide N"` on dots; each dot keeps a ≥ 24px hit target with the 6px visible circle; if there is only one slide, render the pill alone (no dots), centred; `slides.length === 0` still returns `null`. Wrap the row in `role="group"` with `aria-label="Hero slides"`. DOM order: the pill first, then the dots in slide order.
6. **Dot colour:** one rule for all breakpoints — `rgba(255,255,255,0.6)`, brightening to `0.95` on hover (`hover:` on the button, applied to the inner circle through `group`). The old mobile 0.85 / desktop 0.45–0.95 split goes away.
7. **Pill look unchanged:** `serif`, `rounded-pill`, `border border-white/40 bg-white/20 backdrop-blur-[10px]`, 13px uppercase, `tracking-[0.16em]`, white text. Only its width/positioning change. The pill text still comes from `slide.place` (do not change what the label shows).
8. **No server/data changes:** `app/page.tsx` and `selectHeroSlides` are untouched. No new dependency. No hydration risk: nothing is measured at runtime, the initial state is `index = 0`, all geometry is CSS.

## Do not touch

The hero card itself (image cross-fade, overlay, crest, "ATLAS" `<h1>`), `PendingCardLink`, `app/page.tsx`, the other Home sections, the nav, CLAUDE.md rules. If `verify:ux-pending-states` (or any harness) reads `HomeHero.tsx` and breaks because the markup changed, update the harness's expectation to the new structure and say what you changed; don't contort the component to satisfy an old assertion.

## Testing

No test runner: verify in a real browser against `pnpm dev` (web 18000), guest state, widths **360 / 390 / 820 / 1280** (if the window-resize tool doesn't resize, use a sized same-origin iframe and say so):
1. For slide indexes 0, 1, 2, 3: the control's bounding box has the **same width and the same horizontal centre** (±1px) at every index; no horizontal scroll (`documentElement.scrollWidth <= innerWidth`).
2. The pill is horizontally centred on the active slide's slot, with the correct number of dots on each side (0/3, 1/2, 2/1, 3/0), no overlap between the pill and any dot (check bounding boxes), and the pill label does not overflow its pill.
3. Clicking the pill advances; after the last slide it wraps to the first; clicking any dot jumps to that slide; the card link still navigates only when the *card* (not the pill/dots) is clicked.
4. Motion: read `getComputedStyle` of the pill and a dot and confirm the `transform` transition is set (350ms) and that after a click the pill's computed transform changes progressively (sample it at ~100ms and ~350ms), not instantly. With `prefers-reduced-motion: reduce` emulated, there is no transition.
5. Keyboard: Tab reaches the pill, then the visible dots in order, and *skips* the hidden dot under the pill; Enter/Space work. No console errors or hydration warnings; one `<h1>`; no `<button>` inside `<a>`.
6. Take screenshots at 390 and 1280 for slide 0 and slide 3 (the two extremes) and describe what you see (pill at the far left with three dots right; pill at the far right with three dots left; row centred in both).
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards so the next `pnpm dev` doesn't serve stale output), `verify:ux-pending-states` (91/91 or its current total), `verify:map-autofocus` (only the 4 known failures).

## Report

1. The pill width chosen per breakpoint and the longest real label it was derived from.
2. Files changed (expected: `HomeHero.tsx` only, plus a harness if one had to change).
3. The measurements from Testing 1–2 as a small table (index × width: row width, centre, pill x, dots left/right).
4. The motion check result (Testing 4) and the keyboard check (Testing 5).
5. What the screenshots show.
6. Exact commands run. No git commit or push.
