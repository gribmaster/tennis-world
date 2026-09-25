# TASK 29 — Dock the mobile pin-tap preview to the screen's bottom, not the map canvas's

**Model: Sonnet 5, reasoning effort: medium.**

## Context

`MapCourtPreview` (Tasks 27/28) is currently `position: absolute; inset-x-3 bottom-3` inside
`.map-canvas-wrap`. On mobile that wrap is a plain 500px-tall block near the TOP of a
scrollable page (`.map-layout` is `display:block` under 768px — see `globals.css` lines
473–480) — the CourtCard strip and the footer sit below it in normal flow. So today the
preview floats near the bottom of that 500px box, wherever that lands on screen, not at the
actual bottom edge of the viewport. The user flagged this directly: it needs to be glued to
the screen's own bottom (like a real bottom sheet), matching both the prototype
(`new design/tennis_world_v2_standalone.html`'s `MapScreen` sheet, which is `flexShrink:0` at
the bottom of the whole mobile screen, above its own bottom nav) and this app's own mobile
chrome, which already has a real fixed tab bar there.

**This app's real mobile bottom chrome** (`components/layout/BottomNavigation.tsx`): `<nav
class="fixed inset-x-0 bottom-0 z-40 ... md:hidden">`, 56px tall content
(`h-14` items) plus `pb-[env(safe-area-inset-bottom)]`. `AppShell.tsx`'s `<main>` already
clears it with `pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0` — that exact
`56px + env(safe-area-inset-bottom)` value is the established, already-used-elsewhere
constant for "the height of the mobile tab bar including the safe area." Reuse it verbatim
(same Tailwind arbitrary-value technique, copy the class) rather than inventing a new number.

Confirmed safe to use `position: fixed` here: no ancestor between `MapCourtPreview` and the
viewport sets `transform`/`filter`/`will-change`/`contain` (checked `globals.css` and
`AppShell.tsx` — the shell is a plain flex column, `.map-canvas-wrap`'s `overflow:hidden`
does not clip a `position:fixed` descendant, only `absolute`/`relative` ones). So a `fixed`
element inside `.map-canvas-wrap` in the JSX still positions against the real viewport — no
need to move where it's rendered in the tree, only its CSS.

## 1. Reposition the card

In `MapCourtPreview.tsx`, change the outer wrapper from:

```tsx
<div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 md:hidden">
  <div className="pointer-events-auto relative rounded-xl bg-paper shadow-card">
```

to a `fixed`, full-width sheet docked directly above the bottom tab bar, flush to both
screen edges (matching the prototype's edge-to-edge sheet — no side gutter), rounded top
corners only:

```tsx
<div
  className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 rounded-t-xl bg-paper shadow-card md:hidden"
>
```

Since it's now flush/full-width, the two-tier `pointer-events-none` wrapper +
`pointer-events-auto` inner card split (which existed to let clicks pass through the MARGIN
around a floating card) is no longer needed — collapse it to the single div above. Keep
everything currently inside that inner div (close button, drag handle, compact/expanded
content, heart) exactly as it is, just re-parented one level up since the wrapper is gone.

`z-40` matches `BottomNavigation`'s own layer so it isn't accidentally buried under page
content as the user scrolls the list below the canvas — verify this visually (screenshot or
live check) rather than assuming the number is right; adjust if something still renders on
top of it.

## 2. Sanity-check `max-h-[70vh] overflow-y-auto`

This is already on the inner scrollable region (added in Task 28) and should keep working
unchanged now that the card sits at the true screen bottom — but re-verify on a short mobile
viewport (e.g. 667px tall / an SE-sized screen) that the EXPANDED stage never gets tall
enough to cover the close button or push content off-screen above the visible area.

## Do not touch

- `MapExplorer.tsx` — no prop/state changes needed for this; `selectedCourt`/`onClose`/
  `onSelectCourt`/`visibleCourts` all stay exactly as Task 28 left them.
- Desktop — this component is `md:hidden` and never mounts there in the first place
  (`MapExplorer`'s `handleMarkerClick` never sets `selectedCourt` above the `md` breakpoint).
  No change in behavior there.
- `MapLocateControl` — it's positioned independently inside `.map-canvas-wrap` (still
  `absolute` there); Task 27 already checked it doesn't collide with the preview when the
  preview was canvas-relative. Re-check it doesn't collide now that the preview is
  viewport-fixed and taller/lower on some screens — they're independent elements now, not
  competing for the same canvas-relative space, so this is a quick visual check, not a code
  change.
- Everything from Tasks 27/28's own "do not touch" lists still applies.

## Testing

- Mobile viewport: open `/map`, tap a pin — the preview appears flush against the bottom of
  the SCREEN, directly above the bottom tab bar (Home/Map/Collections/Saved/Profile), not
  floating partway up inside the map canvas.
- Scroll the page (past the canvas, into the CourtCard strip / footer) while a preview is
  open — the preview stays pinned to the screen bottom throughout (that's the point of
  `fixed`), doesn't drift or disappear.
- Expand the card (Task 28's two-stage interaction) — still expands upward in place, still
  scrollable internally past `70vh`, still doesn't cover its own close button.
- Close (✕) still fully clears the preview from both stages.
- iOS-style safe-area device (or simulate via devtools) — the card's bottom edge and the
  tab bar's bottom edge both respect `env(safe-area-inset-bottom)` with no gap or overlap
  between them.
- Desktop viewport — completely unaffected, preview never mounts.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the `pointer-events-none`/`pointer-events-auto` split was removed (no longer needed
once the card is flush/full-width) and that you visually verified (not just assumed) the
z-index ordering against `BottomNavigation` and the safe-area alignment. No git commit or
push unless asked.
