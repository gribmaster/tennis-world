# TASK 37 — Court Detail: desktop gallery arrows on `#court-gallery`, bigger "Nearby courts" cards

**Model: Sonnet 5, reasoning effort: medium.**

Two independent small fixes on the Court Detail page (`app/courts/[slug]/page.tsx`). Treat
them as separate changes to separate files — nothing in §1 depends on §2 or vice versa.

## 1. Desktop prev/next arrows on `#court-gallery`

**Which component:** the id `court-gallery` is only on the HERO BAND container in
`CourtDetailGalleryHero` (`apps/web/src/features/court-detail/CourtDetailGallery.tsx`) —
this is the current, live gallery on the unlocked Court Detail page (full-bleed photo,
dot pager, swipe, keyboard arrows). It is NOT the separate thumbnail strip below it
(`id="court-gallery-strip"`, a different component, out of scope here), and it is NOT
`CourtDetailFramedGallery.tsx` (the old pre-v2 gallery, used only on the LOCKED page —
explicitly frozen, "do not restyle," per its own file header; leave it alone).

**Today:** desktop has no visible way to move between photos except the small dot pager
(bottom-center) or keyboard arrows (only reachable once the band has focus) — there's no
click target that obviously says "next/previous image." Mobile already has swipe.

**The fix:** add prev/next arrow buttons, **desktop only** (`hidden md:flex`, matching the
"touch swipe already covers mobile" reasoning this same pattern uses elsewhere in the app —
e.g. `HScrollArrows`, Task 32). `goPrev`/`goNext` already exist in
`CourtDetailGalleryHero` (they drive the dot pager and keyboard nav today) — wire the same
two functions to two new buttons instead of writing new navigation logic.

**Visual treatment — reuse this app's own existing precedent, don't invent a new style.**
`CourtDetailFramedGallery.tsx` (the old locked-page gallery, in the same feature folder)
already has exactly this control — prev/next circular arrow buttons over a photo — and its
styling is a good, already-established match for "a nav control floating over a photo":

```tsx
<button
  type="button"
  onClick={goPrev}
  aria-label="Previous image"
  className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50"
>
  <span aria-hidden>‹</span>
</button>
```

Add the same pair (mirrored for `goNext`/`›`) into `CourtDetailGalleryHero`'s JSX, adding
`hidden md:grid` (or `md:flex`, matching whatever display mode you use) so they only render
at `md:` and above. Position them left/right-center of the hero band, same as the old
gallery's own placement (`left-3`/`right-3`, vertically centered) — adjust only if they
visibly collide with the existing overlaid control row (back button / save+share, top) or
the counter chip / "All photos" / dot pager (bottom) at this band's actual height
(`h-[320px] md:h-[clamp(320px,42vw,480px)]`); they shouldn't, since those all anchor to the
band's top/bottom edges and the new arrows sit at vertical center, but check visually
rather than assuming.

Gate them the same way the dot pager already is — only when `hasMultiple` (a single-photo
court has nothing to page through).

## 2. "Nearby courts" cards — ~1.5–2× bigger

`CourtDetailNearbyStrip.tsx` — today's cards are `w-[120px]` with a `h-[90px]` image
(exactly 4:3), a 12px name and an 11px location line. Scale up within the requested 1.5–2×
range while KEEPING the 4:3 image ratio:

- Card width: `w-[120px]` → `w-[210px]` (1.75×).
- Image height: `h-[90px]` → `h-[158px]` (1.75×, keeps 4:3).
- Row gap: `gap-3` (12px) → `gap-4` (16px) — a slightly wider gutter so the now-bigger
  cards don't read as cramped; adjust if it looks wrong at the new size, this isn't a hard
  requirement.
- Name text: `text-[12px]` → `text-[14px]`.
- Location text: `text-[11px]` → `text-[13px]`.
- **Don't linearly scale the text to 1.75× (21px/19px)** — this is a caption-style label,
  not a title (it deliberately doesn't use the serif face other court cards use for names —
  see this file's own header comment on why it's a lighter "list card" treatment). A modest
  bump reads proportionate without turning a caption into a headline; the numbers above are
  a reasonable default — nudge them only if they visibly look wrong against the enlarged
  image, and say so in the report if you do.
- The "Premium" lock badge (gold pill, top-left overlay on a locked court's image) can stay
  its current absolute size (9px glyph/text) — badges elsewhere in the app don't scale with
  card size either. Only bump it if it visibly looks lost/too-small on the larger image;
  note it either way.

## Do not touch

- `CourtDetailFramedGallery.tsx` (the locked-page gallery) — reference its arrow-button
  STYLE only, per §1; don't modify this file, don't add scroll arrows to it, don't change
  its own behavior. It's explicitly frozen pending a future feature.
- `CourtDetailGalleryStrip` (`#court-gallery-strip`, the thumbnail row below the hero) —
  not part of either ask. No scroll-arrow addition there (also explicitly out of scope
  in Task 32, still true here).
- The "No distance rendered" decision, `courtDisplay` masking, `getRelated()` scoring, or
  anything else about WHAT the Nearby strip shows — this task only changes SIZE.
- The strip's `no-scrollbar`/`overflow-x-auto`/`px-5 md:px-0` scroll mechanics — untouched,
  only the `<li>`/image/text sizing inside it changes.
- Mobile layout for both changes — the gallery arrows are desktop-only by design (§1); the
  Nearby cards resize at every width (the user didn't ask for a breakpoint split there), but
  re-check mobile doesn't visibly break (cards still fit/scroll fine) since `w-[120px]` →
  `w-[210px]` is a meaningful jump on a narrow phone screen too.

## Testing

- Desktop: hovering/looking at the Court Detail hero photo shows left/right arrow buttons;
  clicking them advances/retreats through the gallery exactly like the dot pager and
  keyboard arrows do (same `goPrev`/`goNext`, so behavior — including wraparound — is
  identical). A single-photo court shows no arrows (matches the existing dot-pager gating).
  Arrows don't visually collide with the back/save/share row, counter chip, "All photos"
  link, or dot pager at a few viewport heights.
- Mobile: no arrow buttons render; swipe/dots/keyboard still work exactly as before —
  confirm this file's mobile behavior is byte-for-byte unchanged, not just "seems fine."
- Nearby courts strip: cards visibly larger (~1.75× the old footprint), image still crops
  cleanly at 4:3 (no stretching/distortion), text readable and proportionate, "Premium"
  badge still legible on a locked card at the new size. Strip still scrolls horizontally at
  both mobile and desktop widths.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the new gallery arrows reuse `goPrev`/`goNext` (no duplicated navigation logic) and
are visually verified not to collide with the hero band's other overlaid controls. Confirm
which exact width/height/text values you shipped for the Nearby cards if you deviated from
the defaults above, and why. No git commit or push unless asked.
