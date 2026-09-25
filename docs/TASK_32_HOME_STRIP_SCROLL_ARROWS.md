# TASK 32 — Scroll arrows on Home's Featured Courts and Collections strips

**Model: Sonnet 5, reasoning effort: medium.**

## Context

The user flagged that Home's horizontal court/collection strips give no visual hint that
they scroll — no scrollbar (`.no-scrollbar` is deliberate elsewhere in the codebase), no
arrows, nothing. On desktop (mouse/trackpad, no swipe gesture) that reads as a dead-end
list rather than a scrollable one.

**Confirmed in scope (the user's own words): Home's "Featured courts" strip and the
"Collections" strip right below it** —
`apps/web/src/features/home/HomeFeaturedCourts.tsx` and
`apps/web/src/features/home/HomeCollectionsTeaser.tsx`. These two are structurally
near-identical already (both: `.container-page` > `<ul className="no-scrollbar
-mr-[clamp(20px,4vw,64px)] flex gap-X overflow-x-auto pb-1">`), which is why this task
builds ONE shared piece rather than two separate implementations.

**Explicitly OUT of scope for this task** — other horizontal strips exist elsewhere
(`CountriesStrip.tsx`, `FeaturedCollectionsStrip.tsx` on `/collections`;
`CourtDetailNearbyStrip.tsx`/`CourtDetailGallery.tsx`/`CourtDetailFramedGallery.tsx`/
`CourtDetailTagStrip.tsx` on Court Detail; `MapCourtList.tsx` and `MapCourtPreview.tsx`'s
"More courts nearby" strip on `/map`; `ProfileCollectionsStrip.tsx` on `/profile`). Don't
touch any of them — but see §4, the shared component this task builds is meant to make
extending arrows to any of these a small follow-up, not a rewrite.

**Hard rule already stated in both target files' own comments: "Plain overflow-x row — no
carousel/slider library."** This stays true — arrows here are plain `scrollBy()` on a ref,
no dependency added.

## 1. New shared component: `apps/web/src/components/ui/HScrollArrows.tsx`

Add it to `components/ui/index.ts` alongside `Button`/`Badge`/`InlineSpinner`/etc. — this is
exactly the kind of small shared primitive that folder already holds.

`'use client'` (it needs a ref + scroll-position state; the two Home sections that use it
stay server components otherwise — see §3, no need to convert either of them).

Responsibilities:
- Wraps its `children` (the existing `<ul>...</ul>` from each strip, UNCHANGED) in a
  `position: relative` container and holds a `ref` on the scrollable element itself (the
  `<ul>` the caller passes in — simplest is a render-prop or `forwardRef`-style API where
  this component supplies the ref the caller attaches to its own `<ul>`, rather than this
  component injecting an extra wrapping `<div>` around the list that could disturb the
  `-mr-[...]` edge-bleed trick both strips already rely on. Pick whichever API keeps that
  trick intact — verify visually that the right-edge bleed still works after wiring this
  in, don't assume).
- Tracks `canScrollLeft`/`canScrollRight` from the scroll container's `scrollLeft`,
  `scrollWidth`, `clientWidth` (small epsilon tolerance for sub-pixel rounding), updated on
  a `scroll` listener and once on mount/resize.
- Renders two round arrow buttons reusing the "arrow circle" visual language already
  established on Home (`HomePaywallBand.tsx`/`HomeMapPreviewBand.tsx`'s 36×36,
  `rounded-full`, `border-[1.5px] border-ink/20` circle + inline arrow-glyph SVG — same
  spec, don't invent a new visual style for this). Left arrow flips the same glyph
  horizontally (`scale-x-[-1]` or a mirrored path) rather than adding a second SVG.
- Each arrow only renders (or is visibly disabled) when scrolling that direction is
  actually possible — no dead click, no arrow floating uselessly at an end where there's
  nothing further to reveal.
- Clicking scrolls the container by roughly one viewport's worth
  (`scrollBy({ left: ±container.clientWidth * 0.9, behavior: 'smooth' })` is a reasonable
  default — tune if it visibly over/under-shoots in testing).
- **Desktop/mouse affordance only — hidden on mobile.** Touch swipe already IS the
  scroll affordance there; arrows would just clutter a narrow viewport for no gain. Use
  this codebase's existing `md:` breakpoint convention (768px, same one `/map` and
  `BottomNavigation` already key off) — `hidden md:flex` on the arrow buttons themselves,
  not on the whole wrapper (the scroll container and its content still render at every
  width; only the arrow controls are desktop-only).
- Accessible: real `<button>`s, `aria-label="Scroll left"`/`"Scroll right"`, not divs with
  onClick.

## 2. `HomeFeaturedCourts.tsx`

Wrap the existing `<ul className="no-scrollbar -mr-[...] flex gap-3.5 overflow-x-auto
pb-1">...</ul>` (and nothing else in this file) with `HScrollArrows`. Leave every card,
the save-heart sibling positioning, the empty state, and the section header completely
untouched.

## 3. `HomeCollectionsTeaser.tsx`

Same treatment on its own `<ul>`. This file currently has NO `'use client'` directive —
it does not need one added. A server component can render a client component
(`HScrollArrows`) as a child without itself becoming a client component; keep it that way.

## Do not touch

- Every strip listed as explicitly out of scope above.
- The cards/items inside either target strip (image, badge, text, save heart, gutter
  math) — this task only adds the arrow layer around the existing markup.
- No new npm dependency — plain DOM `scrollBy`/scroll-event handling only.

## Testing

- At ≥768px viewport: hovering/looking at either strip shows left/right arrow buttons;
  clicking them scrolls smoothly; the arrow for a direction with nothing more to reveal
  is absent/disabled (check both ends of each strip, including the empty-state case for
  Featured Courts where there's no strip to scroll at all — the arrows must not render
  then either).
- Below 768px: no arrow buttons render at all; touch/swipe scrolling behaves exactly as
  it did before this task (byte-for-byte — verify by comparing against the current
  behavior, not just "seems fine").
- The right-edge card-bleed effect (`-mr-[clamp(20px,4vw,64px)]`) still works after
  wrapping — the last card still peeks/bleeds off the container edge as before, arrows
  didn't clip or reposition it.
- Keyboard: arrow buttons are reachable by Tab and activate on Enter/Space (native
  `<button>` behavior — just confirm nothing suppressed it).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm which API shape you chose for `HScrollArrows` (ref-forwarding vs. wrapping div)
and why, and confirm the edge-bleed effect was visually re-verified, not assumed to still
work. No git commit or push unless asked.
