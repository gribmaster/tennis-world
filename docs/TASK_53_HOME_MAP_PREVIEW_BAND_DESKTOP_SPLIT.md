# TASK 53 — `#map-preview-band`: on desktop, image right / title+subtitle+button left

**Model: Sonnet 5, reasoning effort: low.**

## Context

`apps/web/src/features/home/HomeMapPreviewBand.tsx` (the "Explore the map" card
between the icon-shortcuts row and Featured Courts on Home) currently renders the
same stacked layout at every width: the map image on top (`aspect-[1754/896]`
box), then an info bar below it (title + subtitle on the left, a 36×36 circular
arrow button on the right), separated by a `border-t`.

Ask: on desktop, switch to a side-by-side layout — **image on the right, title +
subtitle + the arrow button on the left**. Mobile is unchanged (image still on
top, info bar still below it, same as today).

This app's convention for "mobile vs. desktop" throughout the codebase is the
`md:` breakpoint (768px) — confirmed via `AppHeader.tsx`'s own mobile/desktop nav
split (`md:hidden`) and used the same way in `CourtDetailLocationPreview.tsx`,
`CourtDetailTagStrip.tsx`, etc. Use `md:` here too, for consistency.

## The change

### `apps/web/src/features/home/HomeMapPreviewBand.tsx`

Whole component, updated:

```tsx
export function HomeMapPreviewBand() {
  return (
    <section className="pt-5 map-preview-band" id="map-preview-band">
      <div className="container-page">
        <PendingCardLink
          href="/map"
          ariaLabel="Explore the map"
          className="flex flex-col overflow-hidden rounded-[14px] shadow-[0_2px_16px_rgba(15,15,15,0.1)] md:flex-row md:min-h-[260px]"
        >
          {/* Image: top on mobile (unchanged), RIGHT column on desktop (md:order-2).
              Mobile keeps the fixed aspect ratio documented above (no crop at full
              width). Desktop drops that ratio (`md:aspect-auto`) — the div has no
              content of its own (the Image uses `fill`, which is position:absolute and
              doesn't contribute to layout height), so with no explicit height it
              stretches to match the text column's height via flex's default
              `align-items:stretch`. That means the row's height is driven by the text
              side's content + padding, not a hardcoded number. */}
          <div className="relative aspect-[1754/896] overflow-hidden md:aspect-auto md:order-2 md:w-[44%] md:shrink-0">
            <Image
              src="/home/map-preview.png"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 507px"
              className="object-cover"
            />
          </div>

          {/* Info: below the image on mobile (unchanged row layout), LEFT column on
              desktop (md:order-1), switched from a horizontal row to a vertical stack
              so title → subtitle → button read top-to-bottom instead of
              text-block-left/button-pinned-right. `md:border-r` replaces the mobile
              `border-t` divider — same hairline, now vertical between the two columns
              instead of horizontal between two stacked sections. */}
          <div className="flex items-center justify-between gap-4 border-t border-hairline bg-ivory px-4 py-3.5 md:order-1 md:w-[56%] md:flex-col md:items-start md:justify-center md:gap-6 md:border-t-0 md:border-r md:px-10 md:py-10">
            <div className="min-w-0 md:max-w-[300px]">
              <p className="serif text-[20px] font-normal leading-tight text-ink md:text-[26px]">
                Explore the map
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-stone md:mt-2 md:text-[14px]">
                Discover 120+ courts in the world&rsquo;s most beautiful locations.
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink/20 text-ink md:h-11 md:w-11">
              <ArrowGlyph />
            </span>
          </div>
        </PendingCardLink>
      </div>
    </section>
  );
}
```

Everything else in the file (imports, `ArrowGlyph`, the header comment block)
stays — just extend the header comment (see below).

### Notes on the specific values above — adjust if they look wrong in the browser, but explain why in the report

- **44% / 56% split**: a reasonable starting point for a "text left, hero image
  right" banner, not measured against any prototype (there is no desktop mock for
  this band — the source prototype is a 390px-wide mobile-only file, confirmed by
  this file's own header comment). If it reads too image-heavy or too
  text-heavy at your desktop widths, adjust the two `md:w-[…]` values (keep them
  complementary, e.g. 40/60 or 48/52) — just say what you changed and why.
- **`md:min-h-[260px]` is a floor, not a fixed height** — the actual row height on
  desktop is normally set by the text column's content + `md:py-10` padding
  (via flex stretch, see the code comment). The min-height just stops the row
  from looking cramped if the text column ever renders unusually short. If in
  practice the stretch-driven height already comfortably exceeds 260px, this
  floor is inert — that's fine, leave it as a safety net.
- **Cropping direction changes on desktop — verify all 5 gold pins stay visible.**
  This file's own header comment explains that the ORIGINAL mobile-width choice
  of `aspect-[1754/896]` at full container width was specifically so
  `object-cover` crops NOTHING (container and image share one aspect ratio at
  that width) — chosen because a fixed 190px height would have cropped the
  Australia pin out vertically. On desktop, the image column's box is narrower
  and proportionally taller-relative-to-width than the image's native ~1.96:1
  ratio, so `object-cover` will now crop the SIDES (left/right) to fill the
  box, not the top/bottom — the previously-flagged vertical risk (losing the
  Australia pin) does not reapply the same way, but a pin sitting near the
  image's left or right edge could now get clipped instead. Check the rendered
  desktop card and confirm all 5 gold pins baked into `/home/map-preview.png`
  are still visible; if one is clipped, adjust `className="object-cover"` to
  `object-cover object-[<x>%_50%]` (nudge the horizontal focal point) rather
  than changing the column width/aspect, and note in the report which pin (if
  any) needed this and what value you used.
- **Title/subtitle sizes bumped slightly on desktop** (`md:text-[26px]` /
  `md:text-[14px]`) since the left column now has real room — small, easy to
  tune; not a hard requirement, adjust if it looks off next to Home's other
  card headings.

## Update the header comment

The file's existing prototype-geometry comment block (documents `margin`,
`borderRadius`, the `aspect-[1754/896]` decision, the info-bar layout, etc.) is
all still accurate for MOBILE. Add a new paragraph describing the desktop
(`md:`) split — image right / text+button left, no prototype source for this
(there's no desktop mock for this band), the aspect-ratio-drop + flex-stretch
technique for matching heights, and the pin-cropping consideration above — so a
future reader understands this is an original desktop layout, not a fidelity
match to any design file.

## Do not touch

- `HomePaywallBand.tsx`, `HomeFeaturedCourts.tsx`, `HomeEditorsCut.tsx` — unrelated
  Home sections; this task is scoped to `HomeMapPreviewBand.tsx` only.
- `PendingCardLink` itself — only its `className` prop changes at this call
  site; the component's own implementation is untouched.
- The mobile layout/behavior — every mobile class (`aspect-[1754/896]`,
  `border-t`, the row `items-center justify-between`, font sizes, the 36×36
  button) stays exactly as it renders today below `md:`; only new `md:…`
  utilities are added alongside the existing unprefixed ones.
- `/home/map-preview.png` itself — no new asset, no re-crop of the source file;
  only how it's framed in CSS changes.
- `ArrowGlyph` — unchanged; same icon, just possibly a slightly larger circle on
  desktop (`md:h-11 md:w-11`).

## Testing

- Mobile (< 768px): pixel-identical to today — image on top, info bar below,
  title/subtitle left + arrow button right within that bar, top divider.
- Desktop (≥ 768px): image on the right, title + subtitle + arrow button stacked
  vertically on the left, vertically centered, divider now between the two
  columns (not above/below).
- Whole card is still the one tap target (`/map`) at every width — clicking
  anywhere in the image or the text/button area navigates, exactly as before
  (no new nested links/buttons were introduced).
- All 5 gold pins in the map image are visible on desktop (see the cropping note
  above) at a few common desktop widths (e.g. ~1024px, ~1280px, ~1440px+).
- No layout shift/overlap at the `md:` boundary itself (~768px) — check just
  above and just below it.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm the mobile layout is unchanged, describe the final desktop split ratio
and row-height behavior if you adjusted the starting values, and say whether any
gold pin needed an `object-position` nudge to stay visible on desktop (and what
value). No git commit or push unless asked.
