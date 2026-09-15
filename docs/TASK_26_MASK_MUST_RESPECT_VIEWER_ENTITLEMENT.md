# TASK 26 — Task 25's masking ignores the viewer's own membership (regression)

**Model: Sonnet 5, reasoning effort: high.**

## Context

A paying subscriber reported that `/map` still shows approximate pins (expected, see below —
not a bug) but ALSO that marker tooltips and the "Courts in view" list show "Premium Court"
instead of the real name for locked courts, even though they are an active paying member.

I traced this to Task 25 itself. `court.isLocked` (`CourtSummaryDTO.isLocked`) is a **content**
classification flag, not a per-viewer entitlement signal — this is stated explicitly and
repeatedly in the existing code:

- `components/court/court-display.ts`'s own header: "the mask is derived from `isLocked`, a
  field the summary DTO already carries; no client-side entitlement check is invented here."
- `app/courts/[slug]/page.tsx`'s entitlement comment: "the locked/unlocked state derives
  ENTIRELY from the REAL protected exact-location unlock... **NOT `court.isLocked`**... that
  flag describes imported content, not viewer entitlement."
- `GET /v1/courts` (`repositories.courts.list()`, used by `/map`, Home, Saved, Collections)
  returns the identical `isLocked` value to every caller regardless of who's asking — there is
  no session/auth context involved in that read at all.

Task 25 made `courtDisplay()` mask a court's name/location purely off `isLocked`. That was
already true of the ORIGINAL Feature 74 version on Home, but its blast radius was small (Home
was a teaser strip; a member could always click through to the court's own page, where REAL
per-viewer entitlement is checked and the true name shown). Task 25 extended the same
entitlement-blind masking to `/map`'s markers and list — the paying member's primary browsing
surface — which is what makes this visible and painful now: a paying member can no longer see
real names/locations on the map or in "Courts in view" at all.

**The fix is not to revert Task 25.** The right behavior is: mask for a viewer who is NOT
entitled, and show the real name/location to a viewer who IS — on every surface, not just
Court Detail. This requires a per-viewer entitlement signal to actually reach these components,
which today it does not.

### The "approximate pins" part of the report is NOT a bug — do not change it

Confirm this for yourself before doing anything else, then leave it alone. `map-markers.ts`'s
own header comment: "the entitled exact marker is built separately from the protected
exact-location endpoint's response by the caller (Court Detail), and even then only the single
point is plotted." Every list/map surface (`/map`, Saved's wishlist map) has ALWAYS plotted
`approxLat`/`approxLng` for every court, for every viewer, member or not — exact coordinates
are only ever resolved ONE court at a time, on that court's own detail page, via the protected
`GET /v1/me/courts/:slug/exact-location`. Revealing exact points in bulk on the map would
defeat the entire point of the jitter (a member could scrape the whole precise dataset by
panning the map instead of visiting each court page). This is deliberate and out of scope.

### The membership signal already exists — it's just not threaded anywhere useful

`UserProfileDTO.membership` (`packages/contracts/src/user.ts`) is `'free' | 'subscription' |
'lifetime'`. `app/profile/page.tsx` already establishes the exact rule to use: "`unlocked` is
derived from the real membership... Any non-free membership (subscription OR lifetime) counts
as unlocked." Membership is a single account-wide flag — not per-court — so it is safe and
correct to compute it ONCE per page load and apply it uniformly to every court rendered on
that page.

Even better: `lib/session.server.ts`'s existing `isSignedIn()` **already fetches the full
`UserProfileDTO`** via `repositories.user.getCurrentUser()` — it just throws away every field
except a boolean. Both of `isSignedIn()`'s current callers (`app/map/page.tsx`,
`app/collections/[slug]/page.tsx`) are ALREADY paying for this exact read; they just aren't
reading `.membership` off the response. So the map-page fix in particular costs **zero
additional network round-trips**.

## 1. Add `getViewerAuthState()` to `lib/session.server.ts`

Replace the single-purpose `isSignedIn()` with a small helper that returns both signals from
the one read, and have `isSignedIn()` delegate to it (keep `isSignedIn()`'s existing signature
and every current caller untouched):

```ts
export interface ViewerAuthState {
  signedIn: boolean;
  /** Active (non-free) membership — subscription or lifetime. False when signed out. */
  viewerIsEntitled: boolean;
}

export async function getViewerAuthState(): Promise<ViewerAuthState> {
  const repositories = await getRepositoriesForRequest();
  try {
    const user = await repositories.user.getCurrentUser();
    return { signedIn: true, viewerIsEntitled: user.membership !== 'free' };
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return { signedIn: false, viewerIsEntitled: false };
    }
    throw err; // a real fault must surface, not masquerade as "logged out"
  }
}

export async function isSignedIn(): Promise<boolean> {
  return (await getViewerAuthState()).signedIn;
}
```

Keep the existing file-header commentary's spirit (mock mode always resolves; demo mode
authenticates via the merged secret; a 401 is the only "logged out" signal) — extend it to
mention membership rather than rewriting it.

## 2. `courtDisplay()` gets a second, optional parameter

In `components/court/court-display.ts`:

```ts
export function courtDisplay(court: CourtSummaryDTO, viewerIsEntitled = false): CourtDisplay {
  const mask = court.isLocked && !viewerIsEntitled;
  return {
    name: mask ? 'Premium Court' : court.name,
    location: mask ? 'Unlock to reveal location' : courtLocation(court),
    chip: mask ? 'Premium' : (court.tags[0] ?? court.setting),
    // `locked` stays the CONTENT flag, unaffected by viewer entitlement — see below.
    locked: court.isLocked,
  };
}
```

**Deliberate choice, flag it in your report rather than silently deciding it differently:**
`CourtDisplay.locked` keeps meaning "this is premium content" (`court.isLocked`), not "this is
masked for this viewer." Every caller that reads `display.locked` today uses it to show a
"Premium" ribbon/badge over the photo (`HomeFeaturedCourts`, `HomeEditorsCut`,
`CourtDetailNearbyStrip`) — that badge is informational ("this is one of our premium courts"),
and there's a reasonable case a paying member still wants to see it (it's a nice acknowledgment
of what their membership unlocks, and other apps do this — e.g. a 4K badge stays visible to a
4K-tier subscriber). Only the identifying strings (`name`/`location`/`chip`) are gated by
entitlement. If you think the badge should also disappear for an entitled viewer, say so in
your report rather than changing it unasked — this is a product call, not an engineering one.

`courtToMarker()` in `features/map/map-markers.ts` gets the same treatment — a third, optional
parameter:

```ts
export function courtToMarker(
  court: CourtSummaryDTO,
  stateBySlug?: Map<string, MapMarkerState>,
  viewerIsEntitled = false,
): MapMarker {
  return {
    id: court.id,
    slug: court.slug,
    name: courtDisplay(court, viewerIsEntitled).name,
    lat: court.approxLat,
    lng: court.approxLng,
    state: stateBySlug?.get(court.slug) ?? courtState(court),
    heroImageUrl: court.heroImageUrl,
  };
}
```

## 3. Thread `viewerIsEntitled` through every surface Task 25 touched

Same shape everywhere: an optional `viewerIsEntitled?: boolean` prop (default `false` — the
safe/masked default when a caller forgets to pass it), threaded from whichever server page
already resolves it down to the `courtDisplay()`/`courtToMarker()` call site. This mirrors the
existing `signedIn` prop-threading pattern used throughout the app (Home, Court Detail,
`AppShell`) — do not introduce a context/global for this, stay consistent with how the rest of
the codebase passes viewer state.

**Components (add the prop, pass it through):**
- `components/court/CourtCard.tsx` → `courtDisplay(court, viewerIsEntitled)`
- `features/map/MapCourtRow.tsx` → `courtDisplay(court, viewerIsEntitled)`
- `features/map/MapCourtList.tsx` → pass `viewerIsEntitled` to both the `CourtCard` (mobile
  strip) and `MapCourtRow` (desktop rows) it renders
- `features/map/MapExplorer.tsx` → accept `viewerIsEntitled?: boolean` prop; pass it as the
  third arg to `courtToMarker()` inside the `visibleMarkers` `useMemo` (add it to that hook's
  dependency array), and pass it to `MapCourtList`
- `features/home/HomeExplorer.tsx` → accept the prop, thread to `HomeFeaturedCourts`,
  `HomeSearchBar`, `HomeEditorsCut`
- `features/home/HomeFeaturedCourts.tsx`, `HomeSearchBar.tsx`, `HomeEditorsCut.tsx` →
  `courtDisplay(court, viewerIsEntitled)`
- `features/saved/SavedTabs.tsx` → accept the prop, thread to `SavedCourtsGrid` and
  `SavedWishlistMap`
- `features/saved/SavedCourtsGrid.tsx` → `courtDisplay(court, viewerIsEntitled)`
- `features/saved/SavedWishlistMap.tsx` → pass as the third arg to each `courtToMarker()` call
- `features/collection-detail/CollectionCourtsGrid.tsx` → pass to `CourtCard`
- `features/user-collection-detail/UserCollectionCourtsGrid.tsx` → pass to `CourtCard`
- `features/court-detail/CourtDetailNearbyStrip.tsx` → `courtDisplay(court, viewerIsEntitled)`

**Pages (resolve `viewerIsEntitled` server-side, pass it down):**
- `app/map/page.tsx` — replace the `isSignedIn()` call in the existing `Promise.all` with
  `getViewerAuthState()`; destructure `{ signedIn, viewerIsEntitled }`; pass
  `viewerIsEntitled` to `MapExplorer`. Zero added round-trips (see above).
- `app/collections/[slug]/page.tsx` — same swap: `isSignedIn()` → `getViewerAuthState()`;
  pass `viewerIsEntitled` to `CollectionCourtsGrid`.
- `app/page.tsx` (Home) — extend the existing protected-read `Promise.all` (currently just
  `protectedRepos.saved.getSavedCourts()`) to also call `protectedRepos.user.getCurrentUser()`;
  both already degrade together on `AuthRequiredError` in the same `try`/`catch` — add
  `viewerIsEntitled = false` alongside the existing `signedIn = false` in the `catch`, and
  `viewerIsEntitled = user.membership !== 'free'` in the success path. Pass to `HomeExplorer`.
- `app/saved/page.tsx` — add `repositories.user.getCurrentUser()` to the existing
  `loadOrSignIn(() => Promise.all([...]), '/saved')` call; the page is already
  guaranteed-signed-in past `loadOrSignIn`, so just derive `viewerIsEntitled` from the
  resolved user and pass to `SavedTabs`.
- `app/saved/collections/[slug]/page.tsx` — same pattern: wrap
  `repositories.saved.getUserCollectionBySlug(slug)` and
  `repositories.user.getCurrentUser()` together in the `loadOrSignIn` call's `Promise.all`,
  derive `viewerIsEntitled`, pass to `UserCollectionCourtsGrid`.
- `app/courts/[slug]/page.tsx` — **no new fetch needed.** This page already computes real,
  per-viewer entitlement for the court being viewed as `locked` (from the protected
  exact-location call, which — per its own comment — "IS the membership gate"). Reuse it
  directly for the nearby strip: pass `viewerIsEntitled={true}` in `renderUnlocked()` (that
  branch only runs when `locked === false`, i.e. this viewer is entitled) and
  `viewerIsEntitled={false}` in `renderLocked()` (only runs when `locked === true`). Be
  explicit/literal in both branches rather than relying on the prop's default — match this
  file's existing very-explicit style (e.g. `const maskedName = '...'` in `renderLocked`).

## Do not touch

- The exact-location gate and `directionsUrl` — untouched. This task only changes whether the
  already-public `name`/`country`/`region` strings are masked; the real geo boundary is
  unrelated and unchanged.
- The map's use of `approxLat`/`approxLng` for every marker — deliberate, unrelated to this
  bug, see above. Do not add any exact-coordinate fetch to `/map`, Saved's wishlist map, or
  any list surface.
- `apps/api` — no server changes. `GET /v1/courts` keeps returning the same `isLocked` to
  everyone; that's correct and unrelated. `GET /v1/me` already returns `membership`.
- `components/court/CourtMeta.tsx` and surface/tag-chip rendering — unaffected, unrelated to
  this task, same as Task 25.
- The "Locked" badge on `CourtCard.tsx` (line ~121, `{court.isLocked ? <Badge tone="locked">
  Locked</Badge> : ...}`) — it already reads `court.isLocked` directly, not `display.locked`,
  so it needs no change and already behaves correctly (stays visible regardless of viewer
  entitlement, same content-flag semantics as `CourtDisplay.locked` above).

## Testing

For at least one LOCKED court, verify in BOTH viewer states:

- **Entitled viewer** (mock/seed a `subscription` or `lifetime` membership, or use whatever
  the mock data source's existing entitled test user is): real name and real
  country/region/location show — not "Premium Court" / "Unlock to reveal location" — on:
  `/map` marker hover tooltip + accessible name, `/map` desktop "Courts in view" row, `/map`
  mobile "Courts in view" strip, Home's featured strip / inline search / Editor's Cut, Saved's
  Courts tab AND Wishlist Map markers, the editorial Collection Detail grid, a user's own
  wishlist-folder grid, Court Detail's own "Nearby courts" strip (from an unlocked Court Detail
  page).
- **Free / signed-out viewer**: every one of the same surfaces still shows "Premium Court" /
  "Unlock to reveal location" for a locked court — confirm Task 25's original fix did not
  regress.
- Confirm the "Premium" badge/ribbon (where one renders, e.g. `HomeFeaturedCourts`,
  `CourtDetailNearbyStrip`) still appears on a locked court's card for BOTH viewer states
  (per the deliberate `locked` = content-flag choice above) — flag in your report if you
  decided to change this instead.
- Confirm an UNLOCKED (non-premium) court renders identically regardless of viewer entitlement
  in both states — this task must not touch how open courts display.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean. Also specifically grep for every remaining
  call site of `courtDisplay(` and `courtToMarker(` across `apps/web/src` to confirm none was
  missed (both are now used with two/three args in some places and defaulted in others — a
  missed call site fails silently, not with a type error, since the new param is optional).

## Report

Confirm the "approximate pins" half of the report is expected/unchanged behavior (do not
silently skip explaining this back). List every file touched for the entitlement threading,
the exact wording of your `getViewerAuthState()` (or equivalent) helper, and explicit
confirmation of each testing bullet above — entitled AND free/signed-out states both actually
exercised, not assumed. Flag your `CourtDisplay.locked` badge-visibility decision explicitly
even though this brief specifies it, so it's visible in the report for review. No git commit or
push unless asked.
