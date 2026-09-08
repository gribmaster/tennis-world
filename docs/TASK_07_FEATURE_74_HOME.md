# TASK 07 / FEATURE 74 — Home screen redesign

**Model: Opus 5, reasoning effort: high.** The largest screen in the redesign.

Task:
Rebuild the Home screen to the v2 prototype, reusing the `FilterSheet` and filter state
shipped in Feature 73 without modifying them.

Context:
- Read `CLAUDE.md` first — §4 (pending/loading) and §5 (navigation) bind hard here, and
  unlike Feature 73 this screen is full of real navigational controls, so the pending
  primitives ARE required. Then `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.1 and §8.
- Prototype: `new design/tennis_world_v2_standalone.html`, `HomeScreen`. **Strip the base64
  before reading** — 3.1 MB, ~3.05 MB of it inline PNG:
  ```python
  import re
  src = open('new design/tennis_world_v2_standalone.html', encoding='utf-8', errors='replace').read()
  open('/tmp/d.html','w',encoding='utf-8').write(
      re.sub(r'data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=\s]{200,}', 'data:STRIPPED', src))
  ```
- Feature 73 shipped `apps/web/src/components/filters/` — `FilterSheet`,
  `CourtFilterState`, `COURT_FILTER_GROUPS`, `narrowCourts`, `toggleFilterValue`,
  `countActiveFilters`, `toCourtQuery`. **Consume them as they are.** If Home genuinely
  cannot use one without a change, stop and report rather than editing the shared module —
  it was built to be reused unmodified and Map depends on it.

## SKIPPED THIS FEATURE — the map preview band

The prototype's Home has a map-preview band between the shortcuts row and Featured courts.
**Do not build it.** Its background is one of the two base64 PNGs, and the real
implementation is blocked on a separate decision: the map is moving from Leaflet/OSM to
Google Maps with Snazzy Maps styling, which is its own future feature.

Leave the band out entirely. Do NOT substitute a placeholder image, a second Leaflet
instance, a coloured box, or a "coming soon" panel. The sections above and below it simply
sit next to each other. Note the omission in a comment where the band would go, naming the
pending map-provider migration, so the gap is intentional and findable.

## Data — Home's fetching needs to change, decide how

`app/page.tsx` is the single data boundary (a server component; sections never fetch). It
currently fetches `courts.list({ featured: true, limit: 6 })`, four featured collections,
three featured articles, and the session flag.

The prototype's Home needs more than six featured courts: its search box returns inline
results, and its shortcut row filters a court strip in place. Both operate over the
catalogue, not over six rows.

Decide between fetching the full published summary list and deriving the featured strip
from it, or keeping the featured call and adding a second one — and justify the choice.
Constraints either way:
- `app/page.tsx` stays the ONLY place that touches a repository.
- Narrowing happens in memory, client-side, exactly as `MapExplorer` does — reuse
  `narrowCourts` rather than writing a second predicate.
- Document the scaling limit in a comment: this is fine at ~12 courts and becomes a
  server-side query when the catalogue grows. Same hedge Feature 73 made.

## Requirements

Take every number — heights, aspect ratios, radii, gaps, font sizes, overlay gradients —
from the stripped prototype, not from memory. Use the existing tokens and `globals.css`
primitives; introduce no new palette, type scale or button system.

1. **Hero.** Full-bleed image, the top-fading-to-bottom overlay, the display headline,
   the sub-line, and the pill CTA to `/map`.
   **Do not build a wordmark or avatar inside the hero.** The prototype draws them there,
   but in the real app that is `AppHeader` rendered transparently over the hero via
   `AppShell`'s existing `overHero` prop. Building a second header inside `HomeHero` would
   duplicate the real one. Keep `overHero`.
   Discard the prototype's fake iOS `StatusBar` entirely (intake §4).

2. **Search with inline results.** The rounded search field with the leading glyph, a clear
   control when non-empty, a divider, and a control that opens the shared `FilterSheet`.
   Typing shows an inline result panel beneath: image, name, location, and one chip; empty
   query hides it; no matches shows a "No courts found for …" line.
   Locked courts must read as the prototype has them — "Premium Court" instead of the name,
   "Unlock to reveal location" instead of the location. See the LOCKED COURTS section below.
   Each result navigates to the court, so it is a `PendingCardLink` (§4 rule 1).

3. **Icon shortcuts row.** The horizontally scrolling circular-icon row. Each shortcut is a
   one-tap filter that maps onto real `CourtFilterState` values — tags for the experience
   ones, `surface` for Clay, `access` for Resort/Private. Tapping toggles it; the courts
   strip below narrows and its section heading becomes the shortcut's label; tapping again
   clears. Shortcuts and the `FilterSheet` edit the SAME state, so a selection made in one
   is visible in the other.
   These are local UI toggles — per §4 rule 10 they get no pending primitive and no spinner.

4. **Featured courts strip.** Horizontally scrolling portrait cards at the prototype's
   aspect ratio, with the bottom gradient, the experience chip, the name, the location, the
   premium badge on locked courts, and the save control.
   - The whole card navigates ⇒ `PendingCardLink` (§4 rule 1).
   - The save control is a database-backed action nested inside that card. It must not
     trigger the card's navigation, and it needs the §4 triad — local pending state,
     `disabled`, `aria-busy`, `InlineSpinner` — exactly as
     `features/court-detail/CourtSaveButton.tsx` already does. **Reuse that component if it
     fits; do not write a second save button.** Check first.
   - Empty state when a shortcut filters everything out, with a way to clear.

5. **Collections strip.** Portrait cards at the prototype's ratio: overlay, court count
   eyebrow, serif name. Whole card navigates ⇒ `PendingCardLink`.

6. **Journal.** The prototype's card template — image with a tag badge, serif title, blurb.
   All articles use one template. Whole card navigates ⇒ `PendingCardLink`.

7. **Keep `HomeEditorsCut` and `HomePaywallBand`** (intake §8 Q1, decided). Neither exists in
   the prototype; both stay and get restyled into the v2 language. Place them where they
   read naturally in the new order and say in your report where you put them and why. The
   paywall band is the app's only checkout entry point outside Court Detail and Profile —
   it does not get dropped.
   Its copy must reflect the real plan model: recurring monthly / quarterly / yearly. Strip
   any "$29", "one-time", or "lifetime" wording (intake §8 Q2, decided). **Change no billing
   behavior** — CLAUDE.md §7 stands in full.

8. **`/journal` stays reachable.** The bottom tab bar becomes Home · Map · Collections ·
   Saved · Profile in Feature 84, dropping Journal. Make sure the redesigned Home's journal
   section links to `/journal` (not only to individual articles) so the section remains a
   real route into that surface.

## LOCKED COURTS — read before writing the card

Locked courts render as "Premium Court" / "Unlock to reveal location". This is a
PRESENTATION rule applied to data the API already returns publicly — `/v1/courts` serves
name and location to everyone, and that is deliberate (public pages are indexable).

So: derive the masking from the `isLocked` field already on `CourtSummaryDTO`. Do NOT
invent a client-side entitlement check, do not call the exact-location endpoint from Home,
and do not touch anything under `apps/api`. The real gate — exact `lat`/`lng` — is
server-side and untouched by this feature.

Do not change:
- `apps/web/src/components/filters/**` — Feature 73's shared module. Consume, don't edit.
- Anything under `apps/api/**`, `packages/contracts/**`, the schema, migrations or seed.
- The Map screen, `features/map/**`, or the Leaflet integration.
- `AppShell`, `AppHeader`, `BottomNavigation` or `nav-items.ts` — the tab bar is Feature 84.
- Billing behavior, entitlement logic, the exact-location gate, auth.
- No package installs. No carousel, slider or animation library — the prototype's strips are
  plain overflow-scroll rows. No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck`, `build`, and `pnpm lint`.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks. This screen adds more
  navigational controls than any other in the redesign; this harness is the one that will
  catch a missed primitive. Run it before you consider the feature done, not after.
- `pnpm --filter @tennis/web verify:saved-court-toggle` — proves the save control on the
  cards still behaves.
- Manual pass at 390px and desktop: hero, search typing and clearing, inline results
  including a locked court and a no-match query, each shortcut filtering and clearing, the
  heading changing with the shortcut, the filter sheet agreeing with the shortcut row, the
  empty state, saving from a card without navigating, and every card reaching its target.

Report back:
1. The data-fetching choice for `app/page.tsx` and its justification.
2. Where you placed `HomeEditorsCut` and `HomePaywallBand`, and the paywall copy you used.
3. The shortcut → `CourtFilterState` mapping, value by value.
4. Whether you reused `CourtSaveButton` or wrote something new, and why.
5. Every control you wrapped in a pending primitive, and which one — plus the controls you
   judged purely local under §4 rule 10.
6. Confirmation that the map preview band is absent and that a comment marks the gap.
7. Files changed, and pass/fail counts for every check above.
