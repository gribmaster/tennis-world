# TASK 28 — Compact → expanded two-stage preview on /map's pin-tap card (mobile)

**Model: Sonnet 5, reasoning effort: high.**

## Context

Task 27 shipped the compact pin-tap preview (`MapCourtPreview.tsx`) but deliberately shipped
only ONE stage of it: tapping the card navigates straight to `/courts/{slug}`. The prototype
(`new design/tennis_world_v2_standalone.html`, `MapScreen`, lines ~837–990) is a TWO-stage
sheet: tapping a pin shows the compact card (unchanged from Task 27); tapping the compact card
(or its drag handle) EXPANDS it in place into a fuller sheet — bigger photo, more tag chips, a
description snippet, a feature-icon row, CTAs, and a "More courts nearby" strip. Only the
buttons inside the expanded sheet navigate away. This task closes that gap.

**Read the prototype yourself before building** — exact lines to focus on:
- 838–840: the sheet container + the drag-handle bar (`onClick={()=>setExpanded(e=>!e)}`).
- 843–874: compact stage, now `onClick={()=>setExpanded(true)}` on the whole row instead of
  navigating.
- 878–980: expanded stage — bigger photo (130×110 vs compact's 88×72), tag chips, description,
  feature icons, CTAs, nearby-courts strip.
- 919–929 ("Feature icons"): this is NOT a separate data field — it re-renders the same
  `labels`/tags array as icon+caption pairs, all sharing one generic icon in the prototype.
  Confirmed in the real contracts (`packages/contracts/src/court.ts`): there is no
  amenities/features field on `CourtDTO`. Render `court.tags` here too — no new data.
- 911–915: description — unlocked shows `selected.desc.split('.')[0]+'.'` (first sentence of
  the blurb); LOCKED shows a static reassurance string, no blurb needed at all for a locked
  court. This matters for scope (see §3 below).
- 932–946: CTAs — locked: single "Unlock access" button. Unlocked: "View details" + "Directions".
  **This task ships "View details" only** — see the explicit decision on Directions below.
- 949–979: "More courts nearby" — a horizontal strip of nearby courts with a distance label;
  tapping one replaces the selected court and collapses back to compact (`setSelected(c);
  setExpanded(false)`).
- 983–989: a static "120+ courts in this area / Show list" footer row — **do not build this**,
  see §5.

## Explicit decisions already made (don't re-litigate these)

1. **No "Directions" button in this sheet.** The prototype's unlocked CTAs are "View
   details" + "Directions". Today `directionsUrl` is ALWAYS resolved server-side — only
   `app/courts/[slug]/page.tsx` ever calls `protectedRepos.courts.getExactLocation(slug)`,
   via `getRepositoriesForRequest()` in a server component. Wiring a real Directions button
   inside this client-side map preview would mean the FIRST client-side (browser) call to
   that protected endpoint anywhere in the codebase. That's a real architecture decision, not
   a styling one, and the user explicitly chose to skip it for now. **Expanded, unlocked
   courts get a single "View details" button** (full width is fine — don't invent a fake/dead
   "Directions" button just to match the prototype's layout). The real Directions action stays
   on Court Detail, unchanged. If a later task wants it here, it needs its own explicit go-ahead.
2. **Description snippet DOES need a new fetch — this is fine, and here's why it's safe.**
   `CourtSummaryDTO` (what `/map` already has in memory) has no `blurb`. The full `blurb` only
   exists on `CourtDTO`, from the PUBLIC `GET /v1/courts/:slug` (`repositories.courts.getBySlug`,
   `apps/web/src/domain/http/http-court.repository.ts`). This is a public, unauthenticated,
   one-court-at-a-time read — the exact same call `app/courts/[slug]/page.tsx` already makes,
   just from the browser instead of a server component. **There is precedent for calling a
   repository straight from a `'use client'` component**: `ConsultationModal.tsx` imports
   `repositories` from `@/lib/repositories` and calls `repositories.consultation.submit(...)`
   directly in the browser (see its own file header — `NEXT_PUBLIC_API_BASE_URL` is
   deliberately readable client-side for exactly this reason). Follow that same pattern: import
   the plain `repositories` singleton (not `getClientRepositories()` — no auth needed here) and
   call `repositories.courts.getBySlug(court.slug)` lazily, once, the first time a given court is
   expanded. **For a LOCKED court, skip the fetch entirely** — render the static reassurance
   copy only (see prototype line 913), matching how the prototype needs no `desc` for that
   branch either.
3. **"More courts nearby" needs NO new fetch.** `/map` already has every visible court's
   `approxLat`/`approxLng` in memory (`MapExplorer`'s `visibleCourts`), and
   `features/map/geo-distance.ts` already exports `haversineDistanceKm` (built for the
   nearest-court auto-focus feature). Compute the nearest OTHER courts to the selected court's
   `approxLat`/`approxLng` from that same in-memory array — no request. Label the distance
   approximately (e.g. "~S km") since both ends of the calculation carry the ±jitter offset —
   don't present it as precise.

## 1. `MapCourtPreview.tsx`: add expand/collapse state

Add local `const [expanded, setExpanded] = useState(false)`. **Reset it to `false` whenever
`court.slug` changes** (a different pin was tapped, or the nearby strip picked a new court) —
either key the component by slug from the parent, or reset via a `useEffect` keyed on
`court.slug`; pick whichever is more consistent with how this codebase already resets
per-item local UI state elsewhere (check a similar existing pattern before inventing one).

Compact stage (today's whole-card `PendingCardLink`) becomes: a plain clickable
`div`/`button` (not a navigation link — remove `PendingCardLink` from the compact stage
entirely) that calls `setExpanded(true)`. Add the small drag-handle bar from the prototype
above the compact content, also toggling `expanded`. The close (✕) control stays exactly as
it is today, in both stages, and always fully closes the preview (`onClose`), not just
collapses it.

## 2. Expanded stage content

Render only when `expanded`. Reuse `courtDisplay(court, viewerIsEntitled)` for
name/location/chip exactly as the compact stage does (same masking rule, Task 26).

- Bigger photo (roughly the prototype's 130×110 proportions, adapted to this app's existing
  radius/shadow tokens — don't invent new ones).
- Tag chips: `display.chip` plus the rest of `court.tags` (dedupe against the chip so the
  first tag isn't shown twice — the compact stage already has this minor duplication; no need
  to carry it into the expanded stage too).
- Description:
  - Locked (`display.locked && !viewerIsEntitled`... actually just check `court.isLocked &&
    !viewerIsEntitled`, i.e. the same mask condition `courtDisplay` itself applies): static
    copy, no fetch, e.g. "Unlock to see this court's full description, location and details."
    (wording is yours — match the app's existing tone elsewhere, e.g. `CourtDetailNearbyStrip`'s
    locked copy).
  - Unlocked: on first expand, fetch `repositories.courts.getBySlug(court.slug)` (see §2 in
    "explicit decisions" above) and render the first sentence of `blurb` once it resolves,
    with a simple inline loading state in between (skeleton line or a small `InlineSpinner` —
    reuse what's already in `components/ui`) and a quiet fallback (render nothing extra, don't
    show an error banner) if the fetch fails — this is decorative content, not critical path.
    Cache the result per slug in a ref/state so collapsing and re-expanding the SAME court
    doesn't refetch.
- Feature-icon row: `court.tags` again (see prototype note above — same data, not a new
  field), rendered as icon+caption instead of chips. Unlocked only (matches prototype).
- CTA: "View details" only (§1 above) when unlocked; "Unlock access" when locked. Both go to
  `/courts/{court.slug}` via `PendingCardLink` (the ONLY navigation in this component now —
  everything else is local expand/collapse state).
- "More courts nearby": needs the full `visibleCourts` array and the currently selected
  court's approx coords, both of which `MapExplorer` already has — thread `visibleCourts`
  into `MapCourtPreview` as a new prop (or compute the nearby list in `MapExplorer` and pass
  it down as an already-sorted, already-sliced array — whichever keeps `MapCourtPreview`
  simpler; your call). Sort by `haversineDistanceKm` from the selected court's
  `approxLat`/`approxLng`, exclude the selected court itself, take the top 4. Each entry: small
  thumbnail, `courtDisplay(...).name` (masked/unmasked, same `viewerIsEntitled`), and an
  approximate distance label. Tapping one calls back up to `MapExplorer` to replace
  `selectedCourt` with that court (reuse the existing `setSelectedCourt` — no new state
  needed in `MapExplorer`) and this component's own `expanded` resets to `false` via the
  slug-change reset from §1.

## Do not touch

- Everything from Task 27's "Do not touch" list still applies (desktop list panel, the
  existing mobile `CourtCard` strip, the clusterer, `courtDisplay`/`courtToMarker`/entitlement
  threading — consume only, `SavedWishlistMap.tsx`/`CourtDetailLocationPreview.tsx`).
- No client-side call to `getExactLocation`/`getClientRepositories()` anywhere in this task —
  see §1. `repositories.courts.getBySlug` is the ONLY new call this task adds, and it is the
  public, unauthenticated read.
- Don't build the prototype's "120+ courts in this area / Show list" footer row — it implies a
  list/map toggle this app doesn't have (mobile already always shows the `CourtCard` strip
  below the canvas; Task 27's "additive, not replacement" decision still stands).
- Don't change what "View details" navigates to, or add a loading/pending state beyond what
  `PendingCardLink` already gives you.

## Testing

- Tap a pin → compact card. Tap the compact card body (not just the drag handle) → expands in
  place, same card, no navigation.
- Tap the drag handle while expanded → collapses back to compact.
- Close (✕) works identically in both compact and expanded stages, and fully clears the
  preview (not just collapses it).
- Unlocked court, first expand → shows a brief loading state, then the blurb's first sentence;
  collapse and re-expand the SAME court → no second network request (cached).
- Locked court expand → static reassurance copy, NO network request for blurb, "Unlock access"
  CTA only, no Directions/View-details split.
- Entitled viewer on a locked-content court (Task 26) → expands unmasked, real blurb fetch
  happens (entitlement doesn't skip the fetch, only the masking).
- "More courts nearby" shows up to 4 other visible courts closest to the selected one by
  approx distance, correctly masked/unmasked; tapping one swaps the preview to that court,
  collapsed.
- Changing a filter that drops the selected court still closes the whole preview (Task 27's
  existing behavior) — confirm the new expand/collapse state doesn't interfere with that.
- Desktop unaffected — this component never mounts there.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm you re-read the prototype's exact lines cited above before building. Confirm the
blurb fetch only ever fires for an unlocked-for-this-viewer court, never for a masked one.
Confirm "More courts nearby" required no new endpoint. No git commit or push unless asked.
