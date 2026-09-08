# TASK 11 / FEATURE 78 — Court Detail redesign (unlocked state)

**Model: Opus 5, reasoning effort: high.**

Task:
Rebuild `/courts/[slug]` to the v2 prototype for the UNLOCKED reading of the page. The
locked branch and the paywall copy are Feature 79 — leave the locked path working exactly as
it does today and do not restyle it here.

Context:
- Read `CLAUDE.md` first: §4 (pending/loading), §5 (navigation), §7 (billing), §9 (scope).
  Then `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.3, `docs/FEATURE_11_COURT_DETAIL_LAYOUT.md`,
  and `docs/PHASE_5_COMPLETION_SUMMARY.md` §3 for how the unlock actually works.
- Prototype: `CourtDetailScreen`, unlocked branch. Strip the base64 first — recipe in
  `docs/TASK_07_FEATURE_74_HOME.md`.
- Existing: `app/courts/[slug]/page.tsx` (server component, the only repository boundary) +
  `features/court-detail/` — `CourtDetailGallery`, `CourtDetailLocationPreview`,
  `CourtDetailCtaPanel`, `CourtSaveButton`, `SaveToCollectionMenu`.

## THE ENTITLEMENT GATE — read before touching anything

This page carries the product's only real paywall. `page.tsx` already does the correct
thing and its comments describe it: it attempts `GET /v1/me/courts/:slug/exact-location`
for EVERY court regardless of `court.isLocked` (that flag describes imported content, not
viewer entitlement), with the incoming session cookie, and degrades 401/403/404 to "locked".
Only an entitled viewer gets back a `directionsUrl`, and **only that opaque URL** — never
raw `lat`/`lng` — reaches the UI.

Therefore:
- **Do not change how `locked` is derived.** Do not add a client-side entitlement check, do
  not read `court.isLocked` as if it were the gate, do not call the exact-location endpoint
  from a component.
- Every new component takes `locked` and `directionsUrl` as PROPS from the existing
  page-level computation.
- Nothing you build may receive, log, or render exact coordinates. The location preview must
  keep never plotting them.
- Do not touch `apps/api/**`. The gate is server-side and stays as it is.

If a layout you are porting seems to need coordinates, it does not — the prototype fakes its
map with a CSS gradient.

## THE "NEARBY COURTS" DISTANCE — decide this, do not copy the prototype

The prototype's nearby cards show "3 km", "28 km", "52 km". Those are hardcoded literals.

In the real data, court-to-court distance could only be computed from `approxLat`/
`approxLng`, which are **deliberately jittered by roughly 10 km** — that jitter is the whole
mechanism protecting the paid product. Rendering "3 km" from a ±10 km value is both wrong
and, sitting inches from the paywall, actively misleading about what the subscription buys.

So: **do not render a distance.** Use the existing `GET /v1/courts/:slug/related` (already
called by this page; scored by shared country and surface), and put the court's country and
region where the prototype put the kilometres. If you believe there is a defensible way to
show proximity, say so in your report and do not build it unilaterally.

## Requirements

Take every number from the stripped prototype. Existing tokens and `globals.css` primitives
only — no new palette, type scale or button system.

1. **Hero gallery.** Full-bleed image at the prototype's height, the top-and-bottom overlay
   gradient, the back control, the save and share controls, the "N / M" counter, the "All
   photos" affordance, and the dot pager whose active dot widens.
   `CourtDetailGallery` already exists and was made interactive in an earlier feature —
   restyle and extend it; do not write a second gallery. Read it first and report what you
   kept.
   The back control is the shared `BackButton` (§5) and its fallback stays
   `fallbackHref="/map"` with the label `Courts` — there is no `/courts` list route, and
   `verify:ux-pending-states` asserts this exact pairing.
   Discard the prototype's fake iOS `StatusBar`. The wordmark in its header row is
   `AppHeader`'s job, not a second header inside the hero.

2. **The white content card** overlapping the hero by the prototype's offset, with its top
   corner radius.

3. **Title block.** Serif display name, the pin glyph with country · region, and the surface
   chip.

4. **Tag chips.** A horizontally scrolling row of the court's `tags` (Feature 72's closed
   vocabulary). It must scroll rather than wrap so a court with many tags does not push the
   layout around. A court with no tags renders no row, not an empty one.

5. **Description with clamp.** First N characters, then a "Read more / Read less" toggle.
   Purely local UI ⇒ no pending primitive (§4 rule 10).
   The page currently splits the blurb into a serif pull-quote plus body (`splitBlurb`).
   Decide whether that survives the new layout; if you drop it, remove the helper rather than
   leaving it orphaned, and say why.

6. **Location block.** The prototype's two-column arrangement: a map placeholder on the left,
   the address text and the directions button on the right.
   - `CourtDetailLocationPreview` exists — restyle it, do not replace it.
   - **There is no `address` field in the data model.** The prototype's street address is
     invented. Use what exists — country and region — and do not add a schema field. Do not
     print a fake address.
   - The directions button's href is the server-supplied `directionsUrl` for an entitled
     viewer. Never construct a maps URL from coordinates yourself.

7. **Gallery strip.** The thumbnail row beneath, with the active thumbnail marked, driving
   the hero image. Purely local UI.

8. **Nearby courts.** The horizontal card row, from `getRelated()`. Whole card navigates ⇒
   `PendingCardLink`. No distance (see above).

9. **Sticky footer.** The bottom bar with the save control and the primary action.
   `CourtDetailCtaPanel`, `CourtSaveButton` and `SaveToCollectionMenu` already exist and
   carry real behavior — restyle them; **do not rewrite their logic**. `CourtSaveButton` in
   particular is the reference implementation of the §4 triad that two other screens now
   follow.

10. **Do not build the "Played here? Leave a review" card.** That is Feature 80, which adds
    the model and endpoint. A review card with nothing behind it is an inert CTA.

11. **Pending primitives.** Navigational cards ⇒ `PendingCardLink`; the back control ⇒
    `BackButton`; async mutations (save, add-to-collection) ⇒ the §4 triad they already use.
    Gallery dots, thumbnails, and the read-more toggle are purely local ⇒ nothing (§4 rule
    10). Element size must not change while pending (§4 rule 5).

Do not change:
- The locked branch's behavior or appearance — Feature 79.
- `page.tsx`'s data fetching, its entitlement derivation, its `AuthRequiredError` handling,
  or the `signedIn` degradation for the collection menu.
- Anything under `apps/api/**`, `packages/contracts/**`, the schema, migrations or seed.
- Billing: no checkout call, no plan copy, no Stripe. §7 in full.
- `apps/web/src/components/filters/**`, `features/map/**`, `features/home/**`,
  `features/collections/**`, `features/saved/**`.
- `AppShell`, `AppHeader`, `BottomNavigation`, `nav-items.ts`.
- No package installs. No lightbox, carousel or gesture library. No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks. It asserts this page's
  `BackButton` fallback pairing specifically, so a careless hero rewrite will trip it.
- `pnpm --filter @tennis/web verify:web-exact-location` — the unlock path. This is the
  harness that proves you did not disturb the gate.
- `pnpm --filter @tennis/web verify:saved-court-toggle` — the save control.
- `pnpm verify:api-parity` — still 42/42.
- Manual at 390px and desktop, as BOTH an entitled and a non-entitled viewer: the gallery
  pager and thumbnails, read-more, the directions button using the server URL for an
  entitled viewer, nearby cards navigating, back returning correctly from a deep link (no
  in-app history) and from in-app navigation, and the locked page still rendering exactly as
  it did before this feature.

Report back:
1. Confirmation that `locked` derivation and the exact-location call are untouched, and that
   no component receives coordinates.
2. What you kept from `CourtDetailGallery` and what you rewrote.
3. What you did with `splitBlurb` and the pull-quote.
4. What the location block shows in place of the prototype's invented street address.
5. Confirmation that no distance is rendered on nearby cards, and what replaced it.
6. Every pending primitive used, and the controls you judged purely local.
7. Files changed, and pass/fail counts for all five checks.
