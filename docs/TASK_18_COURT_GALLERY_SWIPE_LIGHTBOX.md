# TASK 18 — Court Detail gallery: swipe on the hero, lightbox for the thumbnail strip

**Model: Sonnet 5, reasoning effort: high.**

## Context

Read `CLAUDE.md` in full first; it binds as always. This task touches exactly two existing
client components under `apps/web/src/features/court-detail/`:

- **`CourtDetailGallery.tsx`** — exports `CourtDetailGalleryProvider` (holds one shared
  `activeIndex` in a context), `CourtDetailGalleryHero` (the full-bleed top band: image,
  overlaid back/save/share row, "N / M" counter, "All photos" anchor, and a **dot pager** —
  this is the "радиокнопка" the ask refers to), and `CourtDetailGalleryStrip` (the separate
  "Gallery" heading further down the page, a row of 90×72 thumbnails).
- **`CourtDetailShell.tsx`** — wraps the whole Court Detail body in
  `CourtDetailGalleryProvider` and renders `CourtDetailGalleryHero` at the top. `children`
  (server-rendered) sits below, and `CourtDetailGalleryStrip` is rendered by the PAGE inside
  those children — it appears on **both** readings of the page
  (`apps/web/src/app/courts/[slug]/page.tsx`, `renderUnlocked` around line 334 and
  `renderLocked` around line 535), because both branches share one `CourtDetailShell`.

Do not confuse this with `CourtDetailFramedGallery.tsx` — that is a dead, pre-redesign
component (see the comment block at the top of `court-detail/index.ts`: "NO LONGER
RENDERED"). Leave it untouched; it is not part of this task.

**The bug, precisely:** `CourtDetailGalleryHero` and `CourtDetailGalleryStrip` read/write the
**same** `activeIndex` from `CourtDetailGalleryProvider`'s context. Today, clicking a
thumbnail in the strip calls the shared `setActiveIndex(i)` — which is also what the hero's
dots do — so it silently re-points the hero band to that photo instead of opening anything.
That's the unwanted behavior described. Separately, the hero band has **no swipe/drag
handling at all**: `CourtDetailGalleryHero` only exposes the dot buttons (click) and
ArrowLeft/ArrowRight (keyboard, only while the band has focus) — there are no prev/next
button elements on it either (unlike the unrelated, unused `CourtDetailFramedGallery`).

---

## 1. Hero band: add swipe, keep everything else

Add horizontal swipe/drag support to `CourtDetailGalleryHero` so a touch (or mouse) drag left
advances to the next slide and a drag right goes to the previous one, with the same
wraparound `goPrev`/`goNext` already implement. Requirements:

- Hand-roll it with Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`)
  on the hero's image area. The project has no swipe/carousel dependency today and
  consistently hand-rolls this class of interaction elsewhere (e.g. the map feature's
  `requestAnimationFrame`-driven camera pan). Don't add an npm package for this unless you
  hit a real, stated reason a hand-rolled version can't handle.
- Use a sane distance threshold (roughly 40–50px of horizontal movement) before committing to
  a slide change, and ignore the gesture if vertical movement dominates — the page must still
  scroll normally on mobile. `touch-action: pan-y` on the swipeable element is the usual way
  to let the browser keep vertical scroll while you own horizontal drag.
- Guard with the same `hasMultiple` the component already computes — no listeners at all when
  there's only one slide.
- **Do not break the overlaid controls.** The back button, save/share buttons, the counter
  chip, the "All photos" anchor, and the dot pager all sit on top of the same band (it's one
  wrapping `<div>` with children absolutely positioned over the image). Only call
  `preventDefault()` once a drag has actually crossed your threshold, and never on
  `pointerdown` itself — otherwise a plain tap on any of those controls stops registering as a
  click. Manually verify after wiring this up: dots, back, save, share, and "All photos" must
  all still work with a single tap/click, exactly as before.
- Dots stay exactly as they are (click still works) — swipe is additive, not a replacement.

---

## 2. Thumbnail strip: open a lightbox instead of touching the hero

Change `CourtDetailGalleryStrip` so clicking a thumbnail opens a new lightbox/modal at that
photo, and **stops** calling the shared `setActiveIndex` — the hero band's current image must
be completely unaffected by opening, navigating, or closing the lightbox.

Build a new component, e.g. `CourtDetailGalleryLightbox.tsx`, exported alongside the others.
Suggested shape (adjust if you find a cleaner one, but keep the isolation-from-the-hero
property):

- Own its own local `open` + `index` state (seeded from the clicked thumbnail's position) —
  **not** the shared context's `activeIndex`. It reads the same `slides` list from
  `useGallery()` (or receives it as a prop) but never calls the context's `setActiveIndex`.
- Prev/Next as real buttons plus ArrowLeft/ArrowRight while open, with the same wraparound
  logic already used elsewhere in this file. Swiping inside the lightbox too is a reasonable
  bonus if it falls out naturally from reusing the hero's gesture code, but the ask is
  specifically for arrow navigation, so that's the part that must work regardless.
- Follow this codebase's existing modal convention — `ReviewModal.tsx` is the reference:
  `createPortal`, `role="dialog"` + `aria-modal="true"`, focus moves in on open and is
  **restored to the triggering thumbnail** on close, focus is trapped (Tab/Shift+Tab cycle),
  Escape closes, background scroll is locked while open, close also via a visible ✕ and the
  backdrop.
- Purely local UI (`CLAUDE.md` §4 rule 10) — this never calls a repository or mutates
  anything, it only changes which image is shown, so no pending/disabled/spinner affordance
  on any control here, same as the dots and the existing thumbnails today.
- Render the photo close to full-viewport (this is a lightbox, not another thumbnail); reusing
  `next/image` the way the hero already does (`fill` + `sizes="100vw"`) is fine. A "N / M"
  counter inside it would mirror the hero's own and is a nice-to-have, not a requirement.

**Accessible naming — do not regress the masking invariant.** `CourtDetailGalleryStrip`
currently uses `courtLabel` (the *displayed* name — masked on the locked page), never the real
`courtName`, for its thumbnail buttons' accessible names, specifically so a locked page's
masked title can't leak through the accessibility tree (see the comment above
`CourtDetailGalleryStrip`). The lightbox is rendered on **both** the locked and unlocked
readings (same component, both branches of `page.tsx`), so its own dialog label and its
prev/next/close buttons must use `courtLabel` too, never `courtName`. Image `alt` text may
keep using the real `courtName` — that's already established elsewhere in this file as fine,
since alt text describes the photo rather than displaying the title.

---

## Do not touch

- `CourtDetailFramedGallery.tsx` — dead code, out of scope, per `index.ts`'s own comment.
- The shared `activeIndex` contract itself, the hero's dot pager, its keyboard nav, and the
  "All photos" anchor — unchanged except for the added swipe.
- `CourtDetailShell.tsx`'s composition, the save/share controls, the sticky footer, and
  anything about `directionsUrl` — none of this is in scope.
- No broader visual redesign. No new npm dependency without a stated reason.

## Testing

Manually verify, on **both** the locked and the unlocked reading of a court page (they share
this component, and the locked one is where the masked-name check matters):

1. Hero: dots still switch the image by click; ArrowLeft/ArrowRight still work while the band
   is focused; a left/right drag or touch-swipe on the image now also switches it, with
   wraparound at both ends.
2. Hero overlay controls (back, save heart, share, "All photos", dots) still respond to a
   plain tap/click after the drag handlers are wired in.
3. Clicking a "Gallery" strip thumbnail opens the lightbox at that photo — and the hero band
   underneath is showing whatever it was showing *before* the click, unchanged. Close the
   lightbox and confirm the hero still hasn't moved.
4. Inside the lightbox: Prev/Next buttons and ArrowLeft/ArrowRight both navigate with
   wraparound; Escape, the ✕, and the backdrop all close it; focus returns to the thumbnail
   that opened it.
5. On the **locked** reading specifically, confirm the lightbox's own accessible strings read
   the masked display name, not the real court name.
6. `pnpm typecheck`, `pnpm lint`, `pnpm build` all clean.
7. Check whether `verify:ux-pending-states` (or any other `verify:*` harness) makes
   source-level assertions over `court-detail/CourtDetailGallery*.tsx`. If it does and your
   new lightbox needs equivalent "purely local UI, no pending state" coverage, add it and
   report the new count; if none applies to this feature, say so rather than silently skipping
   it.

## Report

What gesture threshold/approach you used for the swipe; confirmation that the hero's overlaid
controls (back/save/share/"All photos"/dots) still work after adding drag handlers;
confirmation the lightbox never touches the shared `activeIndex` (i.e. the hero is unaffected
by opening/navigating/closing it); the masked-name check on the locked reading; and the
typecheck/lint/build/harness results. No git commit or push.
