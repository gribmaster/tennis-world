# TASK 52 — Don't show the header "Unlock Map" CTA or paywall banners to already-subscribed users

**Model: Sonnet 5, reasoning effort: medium.**

## Context

Reported symptom: a viewer who already bought a paid subscription still sees the
header's "Unlock Map" CTA (desktop button + mobile dropdown "Unlock Full Access"
button) and paywall promotion banners, as if they were still free.

Root cause, confirmed by reading the code: `AppShell`'s `unlocked` prop is what
drives the header CTA (`AppHeader.tsx` — desktop button + mobile dropdown item).
`AppShell` defaults it to `false` and passes it straight through with no other
logic. Its own doc comment is stale ("Phase 1 has no real entitlement system... a
real value flows in from the user repository in a later feature") — that later
feature never happened. A repo-wide check of every `<AppShell ... unlocked=`
call site shows **every page hardcodes `unlocked={false}` except
`profile/page.tsx` and `profile/settings/page.tsx`** — including Court Detail's
`renderUnlocked()` branch, which uses the `unlocked` shorthand (`unlocked={true}`).
None of them derive it from the viewer's real membership.

Separately, `HomePaywallBand.tsx` — a prominent "The world, unlocked... Choose
your plan" CTA card — is rendered **unconditionally** at the bottom of Home
(`<HomePaywallBand />` in `HomeExplorer.tsx`, no prop passed at all), so it shows
to paying subscribers too. That's the second "paywall banner" the report refers
to.

The real per-viewer signal already exists and is cheap: `UserProfileDTO.membership`
(read via `repositories.user.getCurrentUser()`) is `'free'` for a non-paying
viewer and something else for a subscriber — this is the SAME field
`saved/collections/[slug]/page.tsx` already used in Task 48
(`const viewerIsEntitled = user.membership !== 'free';`). This task reuses that
exact pattern everywhere else.

## Part 1 — wire `AppShell`'s `unlocked` prop to real entitlement

Across every page below, add (or reuse) a `viewerIsEntitled` boolean derived from
`user.membership !== 'free'`, and pass it as `unlocked={viewerIsEntitled}` to
`AppShell`. A logged-out visitor is never entitled — treat any degrade path
(a caught `AuthRequiredError`, or a mock/no-session state) as `viewerIsEntitled =
false`, the same way `signedIn` is already degraded on public pages today.

### Bucket A — already reads `getCurrentUser()` / has `user.membership` in scope: zero new reads

Check each of these; if the page already fetches the current user (some do, per
Task 48 and similar), just add `const viewerIsEntitled = user.membership !==
'free';` and pass `unlocked={viewerIsEntitled}` to its `AppShell`:

- `apps/web/src/app/saved/collections/[slug]/page.tsx` (Task 48 already added this
  exact `getCurrentUser()` read for its cards — reuse the same `user` value for
  the page's own `AppShell` too, don't fetch it twice)
- `apps/web/src/app/saved/page.tsx`
- `apps/web/src/app/page.tsx` (Home)
- `apps/web/src/app/map/page.tsx`
- `apps/web/src/app/collections/[slug]/page.tsx`

For each, confirm first whether `getCurrentUser()` (or equivalent) is already
being read on that page (some of these were touched by Tasks 47/48/earlier
work and may already have it in scope) — if so, this is a pure zero-cost wiring
change (derive the boolean, pass the prop). If a given page in this list turns
out NOT to already read the current user, treat it like Bucket C instead (one
new protected read, degraded to `false` on `AuthRequiredError`) and say so
explicitly in the report — don't assume the bucket list above is still accurate
by the time you implement this; verify each page's actual current code first.

### Bucket B — currently uses `isSignedIn()`, swap to a fuller read

- `apps/web/src/app/about/page.tsx`
- `apps/web/src/app/privacy/page.tsx`
- `apps/web/src/app/terms/page.tsx`
- `apps/web/src/app/journal/page.tsx`
- `apps/web/src/app/journal/[slug]/page.tsx`

These currently call `isSignedIn()` (`apps/web/src/lib/session.server.ts`), which
internally does `return (await getViewerAuthState()).signedIn;` — i.e. it already
makes the one call needed and just throws away half the result.
`getViewerAuthState()` returns `{signedIn, viewerIsEntitled}` — check its actual
current return shape and how it derives `viewerIsEntitled` (it may already be
membership-based; if it is, this bucket is trivial: swap `isSignedIn()` for
`getViewerAuthState()` and use both fields). If `getViewerAuthState()` does NOT
yet expose a real `viewerIsEntitled`, extend it there once, centrally (rather
than duplicating `user.membership !== 'free'` in five page files), then update
these five call sites to consume it. Either way, no NEW network call is added
for these five pages — `getViewerAuthState()` costs exactly what `isSignedIn()`
already costs today.

### Bucket C — needs one new read

- `apps/web/src/app/collections/page.tsx` (the editorial collections index) — if
  it doesn't already read the current user anywhere, add
  `repositories.user.getCurrentUser()` to its existing data-fetching (folded into
  an existing `Promise.all` if there is one; degrade to `viewerIsEntitled = false`
  on `AuthRequiredError` if this page is public).

### Court Detail — handle separately, see Part 3 below (don't fold it into Bucket A/B/C; it needs its own explanation).

## Part 2 — hide the Home paywall band for entitled viewers

### `apps/web/src/features/home/HomeExplorer.tsx`

`HomeExplorer` already computes (or, after Part 1, will compute) a
`viewerIsEntitled` boolean for its own `AppShell` wiring. Reuse that same value:
add a `viewerIsEntitled` prop to `HomePaywallBand` and render it conditionally:

```tsx
{!viewerIsEntitled ? <HomePaywallBand /> : null}
```

Update `HomePaywallBand.tsx`'s own header comment if it currently implies it's
always shown.

## Part 3 — Court Detail: a related but distinct finding — please read before implementing

This part goes slightly beyond the literal request and touches something more
than cosmetics, so it's called out on its own.

`courts/[slug]/page.tsx`'s `renderUnlocked()` branch currently has **two**
hardcoded values that both assume "this specific court unlocked for this
viewer" is the same thing as "this viewer holds a real subscription":

1. `<AppShell overHero unlocked signedIn={signedIn}>` — the header CTA bug from
   Part 1, same root cause.
2. `<CourtDetailNearbyStrip courts={related} viewerIsEntitled={true} ... />` —
   hardcoded `true`, with a comment along the lines of "this viewer's real
   exact-location unlock already proved they are entitled."

That comment's premise used to be true, but isn't anymore: `renderUnlocked()`
runs whenever `locked === false`, and `locked` is `exactLocation === null`. A
prior change (Task 41) made **free courts unlock for every viewer**, entitled or
not — so `renderUnlocked()` now also runs for a non-paying visitor looking at a
free court, not just for a real subscriber. On that page, `viewerIsEntitled={true}`
is passed to `CourtDetailNearbyStrip`, which (per its own contract) uses that
flag to decide whether to show OTHER, premium nearby courts' real names/locations
or a masked teaser. Concretely: a non-paying visitor viewing a free court could
now see a premium nearby court's real name and location in the Nearby Courts
strip, when they should see the masked/teaser version. That's a small
content-masking bug, not just a misplaced CTA — it's adjacent to this task
(same wrong assumption, same page) but is a separate defect from what was
explicitly asked for.

**The fix requires the same underlying addition either way**: a real per-viewer
entitlement read added to this page's shared data-fetching prologue (the
`try {...} catch (err) { if (err instanceof AuthRequiredError) ... }` block that
already computes `signedIn`, `savedCollections`, `memberCollectionIds`, and
`initialSaved` — fold `protectedRepos.user.getCurrentUser()` into that same
`Promise.all`, degrading identically to `viewerIsEntitled = false` on
`AuthRequiredError`, so this page — which is intentionally PUBLIC — never throws
for a logged-out visitor). Derive `viewerIsEntitled` once in the shared prologue
next to `locked`, pass it into `shared`, and use it at BOTH points above:

```tsx
<AppShell overHero unlocked={viewerIsEntitled} signedIn={signedIn}>
...
<CourtDetailNearbyStrip courts={related} viewerIsEntitled={viewerIsEntitled} ... />
```

`renderLocked()`'s own `<AppShell overHero unlocked={false} signedIn={signedIn}>`
is already correct as-is and needs no change — a locked page by definition has
`exactLocation === null`, which today can still coincide with a real subscriber
looking at a court they don't have region access to, so leaving it hardcoded
`false` there is arguably its own separate pre-existing question — **do not touch
`renderLocked()`'s `unlocked` value in this task**; only `renderUnlocked()`'s two
hardcoded values are in scope here, per the finding above.

**Implement this Part 3 fix along with Parts 1–2.** It shares the exact same root
cause and the exact same one-line-per-callsite shape as the rest of this task, so
splitting it into a separate task would just mean re-deriving the same
`viewerIsEntitled` value on the same page twice. Flag clearly in the report,
though, that the `CourtDetailNearbyStrip` change is a masking-correctness fix
found during this investigation, not literally what was asked for — so it's easy
to spot and double check.

## Do not touch

- `profile/page.tsx` / `profile/settings/page.tsx` — already correct (already use
  a real value, not hardcoded `false`); leave as-is, but sanity check their
  existing derivation is consistent with the `user.membership !== 'free'` rule
  used everywhere else in this task, and flag in the report if it differs.
- `Footer.tsx`'s smaller "Unlock" / "What's included" `PaywallTrigger` text
  links in the membership column — NOT in scope for this task (they read more
  like standard footer navigation than a promotional banner); leave them
  unconditional. If you think they should also be gated, say so in the report
  as a suggestion, don't just change them.
- Any entitlement/masking logic on card components, `courtDisplay()`,
  `courtCategoryTags()` — unrelated to this task.
- The exact-location endpoint, `locked` derivation, or anything about
  `directionsUrl`/coordinates — untouched; this task only adds a NEW, separate
  `viewerIsEntitled` read alongside the existing `locked` one, it doesn't change
  how `locked` itself is computed.
- `CourtDetailNearbyStrip`'s own internal masking logic — untouched; only the
  prop VALUE it's given changes.

## Testing

- Sign in as a real paying subscriber: header shows no "Unlock Map" CTA
  (desktop or mobile) on every page in Buckets A/B/C, Home shows no paywall
  band, and on Court Detail (both a free and a premium court) the header CTA
  is gone too.
- Sign in as a free/non-paying user, and as a logged-out visitor: header CTA and
  Home's paywall band both still show exactly as before (no regression there).
- On Court Detail specifically: as a non-paying visitor viewing a FREE court
  (unlocked per Task 41), the Nearby Courts strip now correctly masks other
  premium nearby courts again (name/location teased, not shown in full) — this
  is the regression check for the Part 3 finding.
- As a real subscriber viewing any court, Nearby Courts still shows full,
  unmasked info for nearby courts (no new masking introduced for entitled
  viewers).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

For each page in Buckets A/B/C, say which bucket it actually fell into (call out
any that didn't match the assumed bucket) and confirm `unlocked` now derives
from real `viewerIsEntitled` rather than a hardcoded literal. Confirm
`HomePaywallBand` is now conditionally rendered. For Part 3, confirm both
`renderUnlocked()` hardcoded values were replaced with the new derived
`viewerIsEntitled`, confirm `renderLocked()` was left untouched, and confirm the
new read was folded into the page's existing protected `Promise.all` rather than
adding a second auth-degrade path. No git commit or push unless asked.
