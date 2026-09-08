# TASK 12 / FEATURE 79 — Court Detail, locked branch

**Model: Opus 5, reasoning effort: xhigh.** This is the paywall. A mistake here either
gives away the paid product or breaks the only conversion surface.

Task:
Replace `renderLocked()` in `app/courts/[slug]/page.tsx` with the v2 prototype's locked
reading, and add per-court page metadata. Change no entitlement, billing or Stripe behavior.

Context:
- Read `CLAUDE.md` first: §4, §5, §7 (billing — binds in full), §9. Then
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.4 and §8, and `docs/PHASE_5_COMPLETION_SUMMARY.md`
  §3–§5 for how the gate and the effective entitlement actually work.
- Prototype: `CourtDetailScreen`, the `isLocked` branch. Strip the base64 first — recipe in
  `docs/TASK_07_FEATURE_74_HOME.md`.
- Feature 78 already split this page into `renderUnlocked()` (the v2 layout) and
  `renderLocked()` (the pre-redesign layout, kept verbatim). **Your job is `renderLocked()`.**
  Both branches already receive `locked` and `directionsUrl` as props from the single
  entitlement computation — keep it that way.

## THE GATE — do not touch it

`locked` is derived in ONE place: the page attempts
`GET /v1/me/courts/:slug/exact-location` for every court with the incoming session cookie
and treats 401/403/404 as locked. `court.isLocked` describes imported content, NOT viewer
entitlement, and must never be used as the gate.

- Do not change the derivation, the endpoint call, or the `AuthRequiredError` handling.
- No component may receive, log or render exact `lat`/`lng`. Only the opaque
  `directionsUrl` crosses into the UI, and only for an entitled viewer.
- Do not touch `apps/api/**`, `EntitlementsService`, the webhook, or any Stripe code.
- **Do not mark anyone premium from the UI.** `/billing/return`'s bounded poll
  (6 × 2s) is the only post-checkout path and is out of scope.

## DECIDED — mask the court name

The locked page hides the court NAME as well as its location (decided; the prototype's
"Unlock to reveal court name"). Consequences you must handle:

1. **This is presentation, not a new gate.** `GET /v1/courts/:slug` returns the name to
   everyone and will continue to. You are masking what is DISPLAYED. Do not attempt to strip
   the name server-side, do not add a field, do not touch the API. Note this in a comment so
   nobody later mistakes the mask for a security boundary.

2. **Add `generateMetadata` to this page — it currently has none.** The masked H1 would
   otherwise remove the court's name from the page entirely, leaving every court page
   titled identically. The metadata (title, description) uses the REAL court name for every
   viewer, locked or not. That is not cloaking: one page, served identically to everyone;
   the tab title names the thing, the body gates the paid detail. Derive the description
   from public fields only — never from `directionsUrl` or anything entitlement-derived.

3. The accessible name of any control that references the court must use the DISPLAYED
   name, not the real one, so the mask does not leak through the accessibility tree.
   Feature 74's `HomeCourtSaveHeart` already does this — follow it.

## Requirements

Take every number from the stripped prototype. Existing tokens and `globals.css` primitives
only.

1. **Hero and chrome** match the unlocked layout Feature 78 built — same gallery, same
   `BackButton` with `fallbackHref="/map"` label `Courts` (§5; the harness asserts this
   exact pairing), same save and share controls. Reuse those components; do not fork them.

2. **Masked title block.** The prototype's "Unlock to reveal court name" in place of the
   serif name, and "Location hidden — Premium only" in place of country · region. The
   surface chip and the tag chips stay visible — surface and tags are public metadata and
   revealing them is the teaser.

3. **Blurred description.** The prototype blurs the blurb rather than removing it.
   The text is still in the DOM, so treat this as decoration, not protection — say so in a
   comment. Make sure the blurred text is not announced as readable content to a screen
   reader, and that no "Read more" control invites interaction with unreadable text.

4. **Location block, locked.** The lock overlay over the map placeholder, "Address hidden"
   in place of the address, and the directions control in its locked state. The control must
   not be a live link to anywhere — there is no `directionsUrl` for a locked viewer. Decide
   whether it opens the paywall or is a disabled control, and if disabled use
   `aria-disabled` semantics that still explain why.

5. **The unlock CTA card.** The prototype's dark card: eyebrow, serif headline, the value
   line, and the primary button.
   **The prototype's button says "Unlock access — $29". That is stale — the product sells
   recurring monthly / quarterly / yearly plans.** The real copy already exists:
   `features/paywall/paywall-copy.ts` carries the three plan options and their prices, and
   `CourtDetailCtaPanel` already opens the shared paywall modal. Reuse that path. Quote no
   price on the card itself unless it comes from that copy module.
   **Do not introduce a checkout call, a plan key, a price id, a publishable key, or
   Stripe.js here** (§7). The existing modal owns checkout.

6. **Sticky footer**, locked variant: the prototype's "Unlock to get directions" primary
   action, opening the same paywall path. The save control beside it keeps working — saving
   a court is not gated.

7. **`lifetime` is a REAL membership state, not stale copy.** `MembershipStatus` includes it
   and `EntitlementKind` has `lifetime_unlock`; a manual grant or promo can produce it.
   Do not delete `lifetime` handling anywhere while updating plan copy. What is stale is the
   "$29 one-time" OFFER, not the state.

8. **Pending primitives.** The paywall trigger opens a modal — local UI, no spinner
   (§4 rule 10). The save control keeps its §4 triad. Navigational cards keep
   `PendingCardLink`. `BackButton` unchanged.

Do not change:
- `renderUnlocked()` or anything Feature 78 built, except to share a component between the
  two branches — and if you do, say exactly what you extracted and why.
- The entitlement derivation, the exact-location call, `AuthRequiredError` handling, or the
  `signedIn` degradation for the collection menu.
- `apps/api/**`, `packages/contracts/**`, the schema, migrations, seed.
- Any billing endpoint, plan registry, webhook, `/billing/return` behavior, or
  `features/billing/**`.
- `features/paywall/**`'s behavior — reuse the modal, restyle only if the prototype demands
  it, and say so.
- No package installs. No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `pnpm --filter @tennis/web verify:web-exact-location` — **the harness that matters here.**
  It proves the gate still behaves for entitled, non-entitled and logged-out viewers.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks, including this page's
  `BackButton` pairing.
- `pnpm --filter @tennis/web verify:web-billing` — the paywall/checkout wiring you are
  rendering a trigger for.
- `pnpm --filter @tennis/web verify:saved-court-toggle`.
- `pnpm verify:api-parity` — still 42/42.
- Manual, all three viewer states: logged out, signed in without entitlement, and entitled.
  Confirm the entitled view is UNCHANGED from Feature 78, the locked view masks name,
  location and address, the paywall opens from both the card and the footer, and the tab
  title shows the real court name in every state.

Report back:
1. Confirmation, with the line numbers you checked, that the `locked` derivation and the
   exact-location call are byte-unchanged.
2. What `generateMetadata` emits, and confirmation it uses only public fields.
3. How you handled the blurred description for screen readers.
4. What the locked directions control does, and its accessible semantics.
5. The exact copy on the unlock card, and where each string came from.
6. Confirmation that no Stripe artifact, price, plan key or checkout call was added.
7. Anything you extracted to share between the locked and unlocked branches.
8. Files changed, and pass/fail counts for all six checks.
