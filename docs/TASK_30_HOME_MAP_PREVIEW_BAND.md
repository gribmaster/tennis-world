# TASK 30 — Build the Home map-preview band (Feature 74's deliberate deferral, now unblocked)

**Model: Sonnet 5, reasoning effort: medium.**

## Context

Home's map-preview band ("Explore the map / Discover 120+ courts in the world's most
beautiful locations.") was explicitly built and then deliberately left out when Home was
redesigned. Read the exact deferral before touching anything:

- `docs/TASK_07_FEATURE_74_HOME.md`, section "SKIPPED THIS FEATURE — the map preview band".
- The comment block it left in the actual code: `apps/web/src/features/home/HomeExplorer.tsx`,
  the `{/* ── MAP PREVIEW BAND — DELIBERATELY OMITTED (Feature 74) ── */}` block, currently
  sitting between `<FilterSheet />` and `<HomeFeaturedCourts />`. **This task replaces that
  entire comment block with the real component** — that's the exact insertion point, already
  marked.
- `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §8/§11: names this as one of exactly two things
  blocked on the Leaflet→Google Maps migration, the other being the Map screen itself
  (Features 85/86, already shipped in Tasks 16–24/27–29).

**Why it's unblocked now:** the deferral had TWO stated reasons. (1) The map's own engine
migration — DONE. (2) A real image asset — the prototype's band used one of its two inline
base64 PNGs, and `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §4 explicitly **forbade** recovering
that stripped base64 data ("needs a real asset decision, not the stripped one"). The user has
now supplied a real asset for exactly this purpose: `new design/map-home.png` (1754×896,
already staged in the repo). Both blockers are cleared.

**Prototype reference** (`new design/tennis_world_v2_standalone.html`, lines 483–516, also
transcribed in `FEATURE_71_DESIGN_V2_INTAKE.md` §2.1's interaction table): a single clickable
card, `margin:'20px 20px 0'`, `borderRadius:14`, `boxShadow:'0 2px 16px rgba(15,15,15,0.1)'`.
Top: a 190px-tall image area. Bottom: an ivory info bar (`padding:'14px 16px'`, hairline
border-top) with, on the left, a serif ~20px "Explore the map" heading over a ~12px stone
subline "Discover 120+ courts in the world's most beautiful locations.", and on the right a
36×36 circular outlined button (`border:1.5px solid rgba(15,15,15,0.2)`) with a right-arrow
glyph. **The whole card is one tap target → `/map`** (confirmed in the intake's interaction
table: "Map-preview band click → `/map` | Real navigation → `PendingCardLink`").

## Already resolved for you — don't re-decide these

1. **No decorative pin overlay.** The prototype draws 4 hardcoded gold concentric-circle
   pins with count badges (7/24/8/5, Americas/Europe/Asia/Pacific) OVER its flat background
   image. The intake is explicit that these counts are "decorative/static... no backing
   aggregate query — treat as static copy or drop, do not build a continent-count endpoint
   for this." **The user's supplied image (`new design/map-home.png`) already has 5 gold
   pin markers baked into the artwork itself** (confirmed by viewing it: North America,
   Caribbean, Europe, Southeast Asia, Australia). Stacking the prototype's separate
   overlay pins on top would duplicate/clutter markers that are already IN the image. Do
   not build the overlay layer at all — render the image as-is.
2. **The "120+" copy.** `DESIGN_V2_COMPLETION_SUMMARY.md` §11 item 5 flagged this as an open
   editorial call (real number vs. drop it vs. keep aspirational copy). It's moot here: the
   user asked for this band with this exact copy, and "120+" is already precedented
   elsewhere in the shipped app verbatim — `HomePaywallBand.tsx`'s `valueProp`: "120+
   curated courts. Exact locations…". Use the prototype's copy exactly as given:
   - Heading: "Explore the map"
   - Subline: "Discover 120+ courts in the world's most beautiful locations."
   Not a new number, not a live count, no fetch.

## 1. Place the asset

Move (not copy-and-leave-a-duplicate) `new design/map-home.png` into
`apps/web/public/home/map-preview.png` — a new `public/home/` folder, since this is a
one-off marketing/UI asset, not a court photo (`public/courts/`) or a stock placeholder
(`public/placeholders/`). Reference it as `/home/map-preview.png`.

## 2. New component: `apps/web/src/features/home/HomeMapPreviewBand.tsx`

Match the documentation convention every sibling Home component already uses (see
`HomeFeaturedCourts.tsx`'s and `HomePaywallBand.tsx`'s file-header comments: prototype line
citation, geometry transcribed from the file, why any deviation exists). Presentational, no
props, no state, no fetch — this band's content is entirely static copy + a static local
image, exactly like `HomePaywallBand`'s background image usage (`<Image fill sizes=...
className="object-cover" />` inside a sized `relative` container — same pattern, reuse it).

Structure:
- Whole card wrapped in a single `PendingCardLink` to `/map` (§ decided above — this is the
  ONLY interactive element; no separate button-level link).
- Image area: fixed ~190px height (match the prototype's number; adjust only if it visibly
  clashes with this app's existing spacing scale elsewhere — note if you do), `next/image`
  `fill` + `object-cover`, rounded top corners matching the card's own radius. The
  image's real aspect ratio (1754×896 ≈ 1.96:1) is close enough to the prototype's
  190px-tall display area at typical mobile widths that `object-cover` should crop
  minimally — sanity-check this visually rather than assuming.
- Info bar below: ivory background, hairline top border, heading + subline on the left,
  the 36×36 outlined circular arrow button on the right (reuse or closely follow the
  existing `ArrowGlyph` pattern from `HomeHero.tsx`/`HomePaywallBand.tsx` — same inline-SVG,
  no-icon-dependency convention already established; the CIRCLE wrapper itself has no
  existing precedent in this codebase, so build it to the prototype's exact spec: 36×36,
  `rounded-full`, `border` ~1.5px at ~12% ink opacity).
- Card radius/shadow/margins: match the prototype's numbers, but align them to whatever
  gutter/radius tokens the OTHER Home sections already use at this same position (check
  `HomeShortcutsRow`'s and `HomeFeaturedCourts`'s actual rendered gutter — 20px in the
  prototype almost certainly maps to an existing Tailwind gutter class already used
  elsewhere on this page) rather than hardcoding a new arbitrary value if an equivalent
  token already exists.

## 3. Wire it into `HomeExplorer.tsx`

Delete the `{/* ── MAP PREVIEW BAND — DELIBERATELY OMITTED (Feature 74) ── */}` comment
block entirely and put `<HomeMapPreviewBand />` in its place, between `<FilterSheet />` and
`<HomeFeaturedCourts ... />`. No prop threading needed — `HomeExplorer` doesn't need to pass
it anything.

## Do not touch

- `app/page.tsx` — no new fetch, no new prop threading into `HomeExplorer`. This band needs
  no data beyond its own static copy and static image.
- Any continent/region count aggregation, endpoint, or query — never build this (intake §7,
  reaffirmed above).
- `FilterSheet`, `narrowCourts`, `CourtFilterState`, the shortcuts row, `HomeFeaturedCourts`,
  or any other Home section — this task only adds one new component and one wiring change.
- The Map screen itself (`/map`, `MapExplorer`, `MapCourtPreview`, Tasks 27–29) — this band
  only links to it, nothing there changes.

## Testing

- Home renders the band between the icon-shortcuts row and "Featured courts", matching the
  prototype's position.
- The image displays cleanly (no obvious upscaling artifacts, no awkward crop hiding a pin)
  at common mobile widths and at desktop — Home doesn't have a separate desktop layout the
  way `/map` does, so check this band reads fine at both, following whatever pattern
  `HomePaywallBand`/`HomeFeaturedCourts` already use for that.
- No overlay pins/count badges are rendered on top of the image (the image's own baked-in
  markers are the only ones visible).
- Tapping ANYWHERE on the card (image, copy, or the arrow button) navigates to `/map` with
  the app's pending-navigation affordance, exactly like every other whole-card link in this
  app (`CourtCard`, `HomeFeaturedCourts`'s cards).
- No new network request fires for this band (view the network panel — should be the same
  requests as Home already makes, plus the one static image).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm you read `TASK_07_FEATURE_74_HOME.md`'s deferral note and the intake's §4/§7
citations before building. Confirm no decorative pin/count overlay was added (the supplied
image already has them). Confirm the whole band is a single `PendingCardLink`, not a
button-only or image-only tap target. No git commit or push unless asked.
