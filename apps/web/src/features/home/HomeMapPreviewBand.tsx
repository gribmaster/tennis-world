import Image from 'next/image';
import { PendingCardLink } from '@/components/navigation';

// HomeMapPreviewBand — the clickable map-preview card between the icon-shortcuts row and
// Featured courts (Feature 74's `HomeScreen`, design_v2_stripped.html:484–516/
// `new design/tennis_world_v2_standalone.html` — same band, later prototype file).
//
// UNBLOCKED, NOT NEW (Task 30): Feature 74 (`docs/TASK_07_FEATURE_74_HOME.md`, "SKIPPED
// THIS FEATURE") deliberately left this band out, for two stated reasons: (1) the map
// engine hadn't yet moved off Leaflet/OSM, and (2) the prototype's background was one of
// its two stripped inline base64 PNGs — `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.1 data
// table explicitly forbade recovering that data ("needs a real asset decision, not the
// stripped one"). (1) shipped in Tasks 16–24 (Google Maps migration). (2) is resolved by
// a real asset the user supplied for exactly this purpose (`/home/map-preview.png`,
// 1754×896 — moved here from `new design/map-home.png`, not duplicated).
//
// Prototype geometry, taken from the file rather than from memory:
//   • card: `margin:'20px 20px 0'`, `borderRadius:14`, `overflow:'hidden'`,
//     `boxShadow:'0 2px 16px rgba(15,15,15,0.1)'`, whole thing `onClick={()=>onNav('map')}`.
//     `margin:20` is this app's `.container-page` gutter (`clamp(20px,4vw,64px)`, matches
//     at mobile) — used here instead of a bare `mx-5` so the card lines up with every
//     other Home section's edge at every width, the same reasoning `HomePaywallBand` and
//     `HomeFeaturedCourts` already give for using it.
//   • image area: `position:'relative', height:190, overflow:'hidden'`. DEVIATION: fixed
//     190px is a mobile-only number (the prototype is a 390px-wide mock) — at this app's
//     real desktop width, `.container-page` caps content at 1152px (1280 minus its own
//     128px gutter) for every viewport ≥ ~1408px, i.e. effectively every standard desktop
//     monitor, not just an unusually wide one. A raw 190px there makes an ~6:1-aspect
//     sliver, and measuring the actual pixels (gold pin pixels span y≈38.6%–86.6% of the
//     1754×896 source) confirms a center-cropped 190px-tall slice at that width shows only
//     the middle ~31% of the image, cropping the Australia pin out entirely. So the image
//     area uses `aspect-[1754/896]` — the image's own native ratio, the same "fixed aspect
//     instead of a fixed px height" pattern `HomeFeaturedCourts` already uses
//     (`aspect-[2/3]`) for the identical "this card must look right at every width"
//     problem — rather than a guessed responsive clamp. `object-cover` then has nothing to
//     crop at any width (container and image share one aspect ratio), so every pin stays
//     in frame everywhere, and it still renders at ≈179–199px on a typical ~350–390px-wide
//     mobile card, matching the prototype's 190px there almost exactly.
//   • info bar: `background:'var(--ivory)'` (bg-ivory), `padding:'14px 16px'`, flex
//     row space-between, `borderTop:'1px solid rgba(184,184,182,0.25)'` (border-hairline —
//     same token every other card-with-a-divider in this app already uses instead of the
//     prototype's raw rgba).
//   • left: serif 20px "Explore the map"; 12px stone sub-line, `marginTop:2`.
//   • right: 36×36 circle, `border:1.5px solid rgba(15,15,15,0.2)` (~ink/20), centered
//     arrow glyph — "same as collections cards" per the prototype's own comment; there is
//     no existing circular-button component to reuse, so it is built to this exact spec.
//
// NO DECORATIVE PIN OVERLAY (decided, not re-litigated): the prototype draws 4 hardcoded
// gold concentric-circle pins with static counts (7/24/8/5 — no backing aggregate query,
// `FEATURE_71_DESIGN_V2_INTAKE.md` §7: "do not build a continent-count endpoint for
// this"). The supplied image already has 5 gold pins baked into the artwork itself
// (confirmed by viewing it). Stacking the prototype's separate overlay on top would
// duplicate markers already in the image, so this component renders the image as-is with
// no overlay layer and no count badges.
//
// PRESENTATIONAL: no props, no state, no fetch — static copy ("120+", precedented
// verbatim by `HomePaywallBand`'s `valueProp`) plus a static local image. The whole card
// is the ONE tap target (`/map`) — `PendingCardLink`, matching the "whole-card links" row
// in CLAUDE.md §4's table and the intake's own interaction call ("Map-preview band click
// → /map | Real navigation → PendingCardLink").
//
// DESKTOP (`md:`) SPLIT — ORIGINAL LAYOUT, NOT A PROTOTYPE MATCH (Task 53): the source
// prototype is a 390px-wide mobile-only mock, so there is no desktop reference for this
// band at all — everything below `md:` is this component's own design, not a fidelity
// port. At `md:` the stacked mobile layout (image over info bar) becomes a side-by-side
// row: image on the right (`md:order-2`), title + subtitle + the arrow button stacked
// vertically on the left (`md:order-1`, `md:flex-col`), vertically centered. The image
// column drops the mobile `aspect-[1754/896]` ratio (`md:aspect-auto`) and instead
// stretches to match the text column's height via flex's default `align-items:stretch` —
// the image `div` has no intrinsic height of its own (`<Image fill>` is
// `position:absolute`), so its height is driven entirely by the text column's content +
// `md:py-10` padding, not a hardcoded number. `md:min-h-[260px]` is only a floor for an
// unusually short text column, not the normal height source. The mobile `border-t`
// divider becomes `md:border-r`, moving from above/below to between the two columns.
//
// CROP DIRECTION FLIPS ON DESKTOP: at mobile width the container and image share one
// aspect ratio, so `object-cover` crops nothing (see the pin-visibility note above). On
// desktop the image column (`md:w-[44%]`) is narrower and proportionally taller relative
// to its own width than the image's native ~1.96:1 ratio, so `object-cover` now crops the
// LEFT/RIGHT edges to fill the box instead of top/bottom. Verified in the browser at a
// wide desktop width that all 5 gold pins baked into the source image stay visible with
// the default center crop — no `object-position` nudge was needed. If a future asset swap
// moves a pin near the left/right edge, prefer `object-cover object-[<x>%_50%]` on the
// `<Image>` over changing the column width/aspect.

function ArrowGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function HomeMapPreviewBand() {
  return (
    <section className="pt-5 map-preview-band" id="map-preview-band">
      <div className="container-page">
        <PendingCardLink
          href="/map"
          ariaLabel="Explore the map"
          className="flex flex-col overflow-hidden rounded-[14px] shadow-[0_2px_16px_rgba(15,15,15,0.1)] md:flex-row md:min-h-[300px]"
        >
          {/* Image: top on mobile (unchanged), RIGHT column on desktop (md:order-2).
              Mobile keeps the fixed aspect ratio documented above (no crop at full
              width). Desktop drops that ratio (`md:aspect-auto`) — the div has no
              content of its own (the Image uses `fill`, which is position:absolute and
              doesn't contribute to layout height), so with no explicit height it
              stretches to match the text column's height via flex's default
              `align-items:stretch`. That means the row's height is driven by the text
              side's content + padding, not a hardcoded number. */}
          <div className="relative aspect-[1754/896] overflow-hidden md:aspect-auto md:order-2 md:w-[52%] md:shrink-0">
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
          <div className="flex items-center justify-between gap-4 border-t border-hairline bg-ivory px-4 py-3.5 md:order-1 md:w-[48%] md:flex-col md:items-start md:justify-center md:gap-6 md:border-t-0 md:border-r md:px-10 md:py-10">
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
