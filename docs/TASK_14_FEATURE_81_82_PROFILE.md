# TASK 14 / FEATURES 81+82 — Profile redesign + Settings screen

**Model: Sonnet 5, reasoning effort: high.**

Task:
Rebuild `/profile` to the v2 prototype and add the `/profile/settings` screen the
prototype's gear icon leads to. Combined into one feature because the prototype moves the
profile's menu rows INTO settings — building them separately would leave a gear pointing at
a 404.

Context:
- `CLAUDE.md` §4 (pending/loading), §5 (navigation), §7 (billing), §9 (scope).
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.7, §2.8, §8.
- Prototype: `ProfileScreen` and `SettingsScreen`. Strip the base64 first — recipe in
  `docs/TASK_07_FEATURE_74_HOME.md`.
- `/profile` is PRIVATE (`getRepositoriesForRequest()` + `loadOrSignIn`). Preserve that.
- Existing: `features/profile/` — `ProfileHeader`, `ProfileMembershipCard`,
  `ProfileMenuList`, `ProfileMenuRow`, `ProfileStats`, `ProfileStatLink`.

## THREE THINGS WITH NO BACKING — handle, don't invent

1. **Avatar change.** The prototype cycles a photo. `PATCH /v1/me` accepts **`name` only**
   (`apps/api/src/me/me.controller.ts`) — there is no avatar upload, no image field, no
   storage. **Omit the photo-change control.** Do not add a field, do not fake an upload.

2. **Email editing.** Read-only in the edit modal (intake §8 Q4, decided). Changing an email
   would break magic-link sign-in for that address until a re-verification flow exists.
   Show it, do not let it be edited, and make the read-only state legible rather than a
   disabled input with no explanation. Name IS editable via `PATCH /v1/me`.

3. **"Account settings" row.** Points at the same edit-profile capability as the profile's
   own Edit button (intake §8 Q5, decided). Do not build a second, empty settings surface.

## Requirements

Numbers from the stripped prototype. Existing tokens and `globals.css` primitives only.

### Profile (`/profile`)

1. Header row: the wordmark is `AppHeader`'s job — do not build a second one. The gear
   navigates to `/profile/settings` ⇒ `PendingLink`.
2. Profile block: circular avatar at the prototype's size, serif name, and the "Edit
   profile" pill that opens the edit modal.
3. Stats strip: three cells at the prototype's geometry. Keep the EXISTING logic — the live
   count for saved courts, and the "Coming soon" treatment for the two unbuilt stats. Do not
   invent numbers for them. `ProfileStats` / `ProfileStatLink` already do this; restyle.
4. Membership card: the prototype's dark card for a free user, and its gradient "active"
   variant for a member. `ProfileMembershipCard` exists and already carries recurring-plan
   copy — restyle it, do not rewrite its copy or its CTA path.
   **`lifetime` is a real membership state** (`MembershipStatus`, `EntitlementKind.
   lifetime_unlock`), reachable via manual grant or promo. Do not delete its handling.
5. "My collections" strip: the user's own collections (`UserCollectionDTO`), horizontally
   scrolling. Whole card navigates ⇒ `PendingCardLink`. Zero collections ⇒ a deliberate
   empty state, and remember `coverImageUrls` can be empty for a new folder.
6. Edit-profile modal: name field (editable), email field (read-only), Save. Same
   accessibility bar as `FilterSheet` — labelled dialog, focus trapped and restored, Escape
   closes, scroll locked. Save is an async mutation ⇒ the §4 triad, with a real error state
   and `pending` cleared in an unconditional `.finally()`.

### Settings (`/profile/settings`)

7. New route. It is a nested page, so it **MUST** use the shared `BackButton` with
   `fallbackHref="/profile"` (§5) — do not hand-roll a back link.
8. The prototype's three-row card. Wire each row to something real:
   - Subscription & access → the existing billing portal path (`ManageBillingButton` in
     `features/billing`). Reuse it; **add no checkout call, plan key, price id or Stripe
     artifact** (§7).
   - Account settings → the edit-profile modal (decision 3 above).
   - Contact us → the existing consultation trigger, or the real contact route if one
     exists. Check before choosing.
   Any row you cannot wire to something real gets omitted, not rendered inert.
9. Privacy Policy and Terms links to the existing `/privacy` and `/terms` ⇒ `PendingLink`.
10. Whatever `ProfileMenuList` / `ProfileMenuRow` currently offer must not silently
    disappear — inventory their rows first and say where each one ended up. Sign-out in
    particular must survive somewhere.

## Pending primitives

Navigation ⇒ `PendingLink` / `PendingCardLink`. Save-profile ⇒ §4 triad. Modal open/close
and tab-like controls ⇒ purely local, no spinner (§4 rule 10). `/profile` is top-level ⇒ no
Back button; `/profile/settings` is nested ⇒ `BackButton` with the fallback above.

## Do not change

`apps/api/**`, `packages/contracts/**`, schema, migrations, seed. Billing behavior, the
webhook, `/billing/return`. Auth, the session cookie, `loadOrSignIn`. The entitlement gate.
`components/filters/**`, `features/map/**`, `features/court-detail/**`. `AppShell`,
`AppHeader`, `BottomNavigation`, `nav-items.ts` (the tab bar is Feature 84). No package
installs. No git commit or push.

## Testing

- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `verify:ux-pending-states` — 90 checks. It asserts the `BackButton` fallback pairings;
  adding a nested route is exactly the kind of change it polices.
- `verify:web-billing` — you are rendering a portal trigger.
- `verify:api-parity` — still 42/42.
- Manual at 390px: gear reaches settings; back from settings returns to profile both from
  in-app navigation and from a cold deep link; the edit modal saves a name and the header
  reflects it; email cannot be edited; keyboard-only operation of the modal.

## Report back

1. Where each existing `ProfileMenuList` row ended up, sign-out included.
2. What each settings row is wired to, and any row you omitted and why.
3. Confirmation the avatar control is absent and no image field was added.
4. How the read-only email is presented.
5. Pending primitives used, and the controls judged purely local.
6. Files changed and pass/fail counts.
