# TASK 67 — Home hero: prev/next arrows and auto-advance every 1500 ms

**Model: Sonnet 5, reasoning effort: medium.** Builds on TASK_66 (the sliding pill row, already in `apps/web/src/features/home/HomeHero.tsx`). Read the file's header comment and the current component first. Only this component changes.

## Goal

Add to the home hero ("ATLAS" banner on `/`):
1. **Left / right arrow buttons** that go to the previous / next slide.
2. **Auto-advance every 1500 ms**, with sensible pausing so it doesn't fight the user.

## Decisions already made (do not re-litigate)

### Arrows
1. Two circular glass buttons (same recipe as the pill: `border border-white/40 bg-white/20 backdrop-blur-[10px] text-white`, hover `bg-white/30`), chevron icon (inline SVG, `aria-hidden`, stroke 1.5, same visual weight as the crest). Labels: `aria-label="Previous slide"` / `"Next slide"`. Both **wrap around** (first ← last, last → first). They are rendered only when `slides.length > 1`.
2. They are **siblings of the `PendingCardLink`** (never inside the `<a>`), `z-10`, no `Pending*` primitive (purely local UI — CLAUDE.md §4 rule 10). Clicking one never navigates.
3. **Desktop (`md+`):** 48px circles, vertically centred on the card, `left-6` / `right-6`. The "ATLAS" title is centred on desktop so there is no collision.
4. **Mobile (`< md`):** the left-aligned 60px "ATLAS" title runs across the vertical centre, so side-centred arrows would sit on top of it. Put the arrows in the **bottom row, at the card's inner edges, flanking the pill/dots control**, 30px circles with ≥ 24px hit area, inset ~6px from the card edge. The control row is 168px + 84px wide and centred in a 328px card at 360px viewport, leaving only ~38px per side, so geometry is tight: **measure at 360px and 390px**. Required: arrow and control never overlap (gap ≥ 2px at 360). If you cannot make it fit by sizing/inset alone, do **not** overlap and do **not** change the control's geometry: stop and report the measurements so the owner can choose.
5. Visually they must not compete with the pill: same glass style, smaller, no shadow.

### Autoplay
6. Interval **1500 ms** between slides (constant `HERO_AUTOPLAY_MS = 1500` at the top of the file). The cross-fade (400 ms) and the pill glide (350 ms) already fit inside it. Wraps from the last slide to the first.
7. Implement as a `useEffect` that schedules **one `setTimeout` per slide** keyed on `[index, enabled]` and clears it in cleanup — so *any* change of `index` (arrow, dot, pill click, autoplay itself) automatically **restarts the full 1500 ms countdown**. Do not use `setInterval`. Manual interaction **restarts** autoplay, it does not stop it for good.
8. Autoplay is **enabled only when all of the following hold** (compute one `enabled` boolean from state; do all browser checks in effects, never during render, so the server render and first client render are identical — initial `enabled` is `false`):
   - `slides.length > 1`;
   - the user does not prefer reduced motion (`window.matchMedia('(prefers-reduced-motion: reduce)')`, listen for changes) — with reduced motion there is **no autoplay at all**; the arrows and dots still work;
   - the page is visible (`document.visibilityState === 'visible'`, listen to `visibilitychange`);
   - the hero is in the viewport (an `IntersectionObserver` on the card, threshold ~0.3) — no timer running while it is scrolled out of view;
   - **all slide images have finished loading.** Only slide 0 has `priority`; the other three are lazy, and a 1500 ms rotation would otherwise fade to a blank frame. Track loads with the `Image` `onLoad` callback (a count / set of loaded slugs); also count `onError` as "done" so a broken image doesn't block autoplay forever. Keep `priority` on slide 0 as it is; don't add `priority` to the others (no extra preloads on the critical path).
   - the user is not interacting (below).
9. **Pause while the user is interacting** (state `paused`, not a change of `index`):
   - pointer **hover** over the hero card, **mouse pointers only** (`onPointerEnter`/`onPointerLeave` with `event.pointerType === 'mouse'`) — on desktop this also prevents the card link from changing under the cursor at click time;
   - **touch / pen press** on the card or its controls: pause on `onPointerDown`, resume on `onPointerUp` / `onPointerCancel` / `onPointerLeave`;
   - **keyboard focus inside the hero controls**: pause on `onFocus` only when the focused element matches `:focus-visible` (so a mouse click on an arrow, which leaves the button focused, does not leave autoplay paused forever), resume on `onBlur` when focus leaves the hero.
   Put these handlers on the outer wrapper div of the hero (the `relative` card), not on each control.
10. Autoplay never changes anything but `index`: no new state in `app/page.tsx`, no change to what the pill label / alt / href show (they follow `index` exactly as now).
11. **No visible pause button** in this task. Say in the report that WCAG 2.2.2 (Pause, Stop, Hide) normally asks for one on content that moves for more than 5 seconds; hover/focus/press pausing and reduced-motion cover most of it, but a visible control is the owner's call.

### Unchanged
12. Everything from TASK_66 stays: single sliding-row pill/dots, `--pill-w`/`--slot`, persistent dots, DOM order (pill first, then dots), `role="group"`, hit targets. DOM/Tab order follows the visual left-to-right order: previous arrow, then the existing pill + dots group, then the next arrow.
13. No new dependency. No CSS added to `globals.css` unless a keyframe truly needs it (it doesn't).

## Do not touch

The server side (`app/page.tsx`, `selectHeroSlides`), the other Home sections, `PendingCardLink`, the nav, CLAUDE.md. If `verify:ux-pending-states` (or another harness) reads `HomeHero.tsx` and an assertion breaks because markup changed, update the harness's expectation and say exactly what changed.

## Testing (real browser, `pnpm dev` on 18000, guest, widths 360 / 390 / 820 / 1280)

1. **Timing:** sample the active slide (pill label or card `aria-label`) every 100 ms for ~8 s with the mouse outside the page: it changes every 1500 ms (±150 ms), wraps 4→1, and the order is 1→2→3→4→1.
2. **Restart:** click "Next" 1 s after a change → the slide moves immediately and the *next* automatic change comes 1500 ms **after the click**, not at the old schedule. Same for a dot and for the pill.
3. **Pauses:** (a) hover the card with a mouse → no change for 6 s; move the mouse out → resumes within 1500 ms; (b) keyboard: Tab to an arrow → autoplay stops while focus-visible; Tab away → resumes; click an arrow with the mouse and move away → autoplay *continues* (button keeps focus but not `:focus-visible`); (c) emulate touch: press and hold on the card for 4 s → no change.
4. **Gates:** emulate `prefers-reduced-motion: reduce` → no autoplay, arrows/dots still work; switch to another tab for 5 s and return → no burst of catch-up changes; scroll the hero out of view → timer stops (verify no index changes while off-screen); throttle the network (Slow 3G) and reload → autoplay doesn't start before all four images have loaded and never shows an empty frame.
5. **Arrows:** both directions, wrap-around, no navigation on click, one `<h1>`, no `<button>` inside `<a>`, no console errors/hydration warnings, no horizontal scroll at any width.
6. **Geometry table:** at 360 and 390 (mobile) and 820 and 1280: bounding boxes of the previous arrow, control row, next arrow — no overlaps, gap ≥ 2px (mobile), and on desktop the arrows don't touch the crest or title.
7. Screenshots at 390 and 1280 (slide 0 and slide 3), described in the report.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop dev first; delete `apps/web/.next` afterwards), `verify:ux-pending-states`, `verify:map-autofocus` (only the 4 known failures).

## Report

1. Files changed; how `enabled`/`paused` are computed (a short list of the conditions as implemented).
2. Mobile arrow size/inset and the measured gaps; or the measurements if it did not fit (decision 4).
3. Timing results (Testing 1–2) and the pause/gate results (3–4), with what you emulated and how.
4. The geometry table, screenshot descriptions.
5. Anything surprising (for example a click landing on a different court because the slide changed under the pointer, and on which pointer type).
6. Exact commands run. No git commit or push.
