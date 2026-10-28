# Tennis World — Design Decisions

A condensed log of the choices behind the prototype and why they were made, for anyone joining the project without the full chat history.

## Aesthetic direction

Quiet luxury, travel-editorial, not a sports app. Full-bleed photography carries the emotional weight on every screen; UI chrome (nav, search, buttons) stays neutral and gets out of the way. Cormorant Garamond is reserved for anything that should feel like a name or a considered headline (court names, section titles); Inter handles everything scanned quickly (labels, metadata, buttons). The palette is almost entirely neutral — ink/graphite/stone/mist/bone/ivory/paper — with gold as the one accent actually in use (premium badge, star ratings); clay and moss were reserved early on but never used in a shipped screen.

**Original reference:** the mobile build was based on placestheapp.com ("Places"). That site has since redesigned, so it's no longer a reliable source to pull fresh cues from — treat the two prototypes themselves, plus a mockup image provided mid-project (described below), as the current reference instead.

## Navigation: floating pill, not a docked bar

Both platforms use the same nav idiom: a translucent, blurred, pill-shaped floating control, never a full-width docked bar. Mobile: bottom-sticky, icon + 9.5px label, 4 items (Home/Map/Saved/Profile). Desktop: top-sticky, centered, text-only, 4 items (Atlas/Courts/Collections/Profile).

The desktop nav went through a correction: the first pass used a conventional full-width bar with a wordmark-as-logo and a "Sign In" button — a reasonable generic default, but wrong for this product. The correction, explicit and specific: no sign-in button, no logo (the brand mark lives in the pill menu, not as a separate home-button/logo), and the nav should match mobile's floating-pill language. A reference mockup image pinned the exact target: pill nav with only the four nav labels, centered, no logo, no sign-in.

**Why:** the device frame (phone bezel / browser chrome) already supplies an edge; a full-width bar duplicates that edge and competes with the photography underneath it. A floating pill reads as chrome resting *on* the content rather than a boundary *around* it.

## Home hero: floating inset card, not edge-to-edge

Following the same correction round, desktop's Home hero changed from an edge-to-edge full-bleed section (with a CTA button and left/right arrow controls) to a large, floating, rounded-corner card inset within the page — margin on all sides, `max-width: 1240px`, `border-radius: 32px`, its own drop shadow. Pagination simplified to a centered place-pill + dot row (no flanking arrows, no CTA button on the hero itself — the membership upsell CTA lives in the section below it instead).

**Why:** consistent with the "float, don't dock" principle above — the hero is itself a floating object on the page background, same as the nav.

## Card reuse: one CourtCard, everywhere

From early in the mobile build onward, the instruction was consistent and repeated: there is exactly one court-card component, reused with different props (`locked`, `saved`, `onToggleSave`, `saveDisabled`) on every screen that lists courts — Map/Courts list, Saved, inside a Collection — on both platforms. When the desktop grid needed a taller card for its wider columns, the fix was changing that one component's height (230px → 340px on desktop), which automatically propagated to every screen using it, rather than hand-building a desktop-specific card variant.

**Why:** a repeatedly stated priority — avoiding drift between near-identical cards built independently per screen, which is a common source of inconsistency as a product grows.

## Access-state model: three tiers, failure-first unlock

The whole product runs on one `accessState` value (`guest` / `free` / `full`) rather than separate boolean flags, so every screen can derive its gating from a single source. Guests see content but not the map/saved/full-detail; free (signed-in) users get account features but still see locked content behind a frosted overlay; full access removes every lock.

Every "unlock" action — on either platform, on any screen — routes through a scripted purchase-failure screen first, and only that screen's "Try again" action grants full access. This was a deliberate choice carried over consistently from mobile to desktop (an early desktop draft wired Home's and Profile's unlock buttons to succeed immediately, which was caught and corrected to match the rest of the product).

**Why:** modeling the real failure path of a payment flow in the prototype, rather than only the happy path, so downstream engineering and design review isn't surprised by it later.

## Locking as texture, not a wall

Locked courts/sections are always shown — blurred behind a frosted overlay with a lock glyph and a one-line unlock prompt — never hidden outright. The product is meant to always be showing the member what they're missing, which is also the reasoning behind the failure-first unlock flow: a locked card's CTA goes to a real (if currently demo) purchase attempt, not just an info message.

## Content model

Seven sample courts, six collections, six countries, hand-authored with full copy (descriptions, feature lists, addresses) to make the UI read like a real product rather than lorem ipsum — this was treated as part of the design work, not filler, since tone of voice (restrained, editorial) is part of the brand. All imagery is Unsplash placeholder, not licensed photography.

## Filters modal

Replaced an earlier simple dropdown with a full categorized modal (Experience / Surface / Access / Setting sections, Clear all, Show Results) to match a provided reference screenshot. Several new filter options were added to match that reference (Lakeside, Garden, Jungle, Island, Rooftop, Countryside, Club, Academy, Indoor, Outdoor) that don't yet exist in any court's data — a known gap, not a defect, flagged for whoever backfills the dataset.

## Iteration log (condensed)

1. Mobile prototype built and refined across several correction rounds (Home sections, Map screen heading/CTA logic, shared CourtCard adoption, lock-state bug fixes).
2. Desktop prototype started from the same data/logic, built page-by-page (Home + Courts first to settle layout direction, then all remaining screens).
3. Desktop nav/hero corrected from a generic pattern to the floating-pill/floating-hero language, pinned by a reference mockup.
4. Filters modal, centered hero pagination, and taller desktop CourtCard added per two reference screenshots, reusing the shared CourtCard rather than introducing a new variant.
5. Handoff package (this document, the frontend spec, and the design-system artifact) produced once both prototypes reached a stable, reviewed state.
