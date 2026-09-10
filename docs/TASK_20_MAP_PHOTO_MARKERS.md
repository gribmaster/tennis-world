# TASK 20 — Photo pins on the Google Map, instead of the plain colored dot

**Model: Sonnet 5, reasoning effort: high.**

## Context

Read `CLAUDE.md` first; it binds as always. This is a client-side rendering change to how a
marker LOOKS on the map — `markerContent()` in
`apps/web/src/features/map/CourtMapInner.tsx` (Feature 88, variant B: Map ID +
`AdvancedMarkerElement`). It touches three files plus the one place a marker is currently
built by hand outside `courtToMarker`.

**The data is already there — no new fetch, no DTO change.** `CourtSummaryDTO` (and
`CourtDTO`, which extends it) already carries `heroImageUrl: z.string()` as an always-present,
always-public field (`packages/contracts/src/court.ts`) — it's what `CourtCard`/`CourtImage`
already render everywhere else in the app. The map layer just never picked it up:

- `MapMarker` (`features/map/map-markers.ts`) has `id`/`slug`/`name`/`lat`/`lng`/`state` —
  no image field.
- `courtToMarker()`, the one conversion every public map surface (`/map`, Saved Wishlist,
  locked Court Detail) goes through, doesn't copy `court.heroImageUrl` across.
- `CourtDetailLocationPreview.tsx` builds its own single `MapMarker` by hand (it doesn't call
  `courtToMarker` — it has an `ExactLocationDTO` for the entitled case and raw
  `approxLat`/`approxLng` otherwise) and also doesn't thread an image in, even though
  `page.tsx` already has `court.heroImageUrl` in scope right next to where it calls this
  component (see `heroImageUrl={court.heroImageUrl}` a few lines above, passed to
  `CourtDetailShell`).

So this is genuinely just: carry a field that already exists on the payload through one more
hop, and change what `markerContent()` draws with it. No masking concern either — the docstring
already sitting in this codebase (`CourtDetailGalleryStrip`'s comment) settles this exact
question for images: *"an alt describes the photograph, it is not a masked surface."*
`heroImageUrl` is already rendered on public cards for every court, locked included — showing
it on that same locked court's map pin exposes nothing new.

---

## 1. Thread `heroImageUrl` through to `MapMarker`

- Add an optional `heroImageUrl?: string` to the `MapMarker` interface.
- `courtToMarker()`: copy `court.heroImageUrl` across.
- `CourtDetailLocationPreview.tsx`: add a `heroImageUrl: string` prop to
  `CourtDetailLocationPreviewProps`, set it on both hand-built `MapMarker` literals (the
  entitled/`exact` one and the approximate/`featured` one — the locked branch stays
  marker-less, untouched). Note while you're in there: the approximate-but-not-entitled
  marker is deliberately given `state: 'featured'` today just to get the halo treatment, not
  because the court is actually featured — that's pre-existing, not something to "fix", and
  it'll carry the same halo through to the photo-pin ring below.
- `page.tsx`: pass `heroImageUrl={court.heroImageUrl}` at both `<CourtDetailLocationPreview>`
  call sites (locked and unlocked branches — harmless on the locked one since it builds no
  marker there either way).

## 2. Replace the dot with a photo pin in `markerContent()`

Keep the function's existing job (build one detached `HTMLElement` per marker, anchored via
the same `translateY(50%)` compensation) — swap what fills it:

- A circular (or rounded-square) photo thumbnail instead of the small solid dot, sized large
  enough to read as a photo — something in the neighborhood of 40–44px normally, a bit larger
  (~52–56px) for the `featured`/`exact` halo states, is a reasonable starting point; adjust if
  it looks cramped or overwhelming on screen.
- **Keep the state signal.** The dot's whole point was color-coding `open`/`locked`/
  `featured`/`exact` at a glance (the `COLOR` map at the top of the file) — a photo pin can't
  just BE that color, so give it a colored ring/border in the same `COLOR[state]` value
  instead (e.g. a few px solid border), and keep the existing halo pulse
  (`.tw-map-marker__halo`, `featured`/`exact` only) behind it, scaled to the new size.
- **Reuse the anchor lesson from Task 17, don't re-learn it.** The existing wrapper is
  `display: inline-block` with explicit `width`/`height` specifically because a plain
  `<span>` silently ignores those and breaks the `translateY(50%)` math (see the comment
  block already in `markerContent()` — that was a real, verified-on-screen bug). Follow the
  same pattern for whatever new element(s) you add; don't assume a `<div>`/`<img>` is safe by
  default without checking its computed box the same way.
- **Fallback when a court has no photo.** `heroImageUrl` is schema-required so this should be
  rare, but if it's ever an empty string, fall back the same way the rest of the app already
  does — reuse the shared placeholder file (`/placeholders/ben-hershey-K9HgyI3qmqA-unsplash.jpg`,
  already used as `FALLBACK_IMAGE` in `CourtImage.tsx`/the gallery components) rather than
  inventing a second "no photo" visual language, unless you find a concrete reason the plain
  dot reads better for that edge case — say so if you go that way instead.
- **Image request size.** This DOM node is built with `document.createElement`, outside
  React, so `next/image` itself isn't usable here — but its optimizer endpoint is still just a
  URL. Rather than pointing a raw `<img>` at `heroImageUrl` untouched (which, for a full-size
  source photo, downloads far more than a 44px pin needs, multiplied by however many markers
  are on screen), build the request through Next's image optimizer manually — the same
  `/_next/image?url=<encoded>&w=<n>&q=<n>` endpoint the `<Image>` component calls under the
  hood — requesting a small width (account for retina: request roughly 2× the rendered pixel
  size). If that feels like too much for this task's scope, using the raw URL with
  `loading="lazy"` is an acceptable fallback — but say explicitly which you chose and why,
  since it's a real bandwidth/cost tradeoff, not a cosmetic one.
- `wrapper.title` / `aria-label` (the court name) stay as they are.

## 3. If Task 19 (clustering) already shipped

Check whether `CourtMapInner.tsx` already has a `MarkerClusterer`/cluster renderer in it. If
so, this task does **not** touch the cluster badge — that's a separate renderer keyed on a
group count, not any one court's data, and stays as-is. Only the individual/ungrouped marker's
`markerContent()` changes. If clustering hasn't shipped yet, this task doesn't depend on it and
should work standalone either way.

---

## Do not touch

- `courtToMarker`'s `lat`/`lng` sourcing (still `approxLat`/`approxLng` only) or anything about
  the coordinate-safety invariant — this task adds a display field, not a geo field.
- The DTO/schema layer — `heroImageUrl` already exists on the wire; no API or contracts change.
- The center/fitBounds/focus-animation/suppression-window logic in `CourtMapInner.tsx` — out of
  scope, unrelated to marker appearance.
- The cluster renderer, if Task 19 already shipped (see §3).

## Testing

1. `/map`: markers render as photo pins, not dots; the state ring color (open/locked/featured)
   is still visually distinguishable at a glance.
2. Verify the anchor ON SCREEN, not just by reading the code — zoom into a known court and
   confirm the pin's visual "point" still lands on the actual coordinate, the same check
   Task 17 needed for the dot (this is exactly the kind of change that can silently regress
   that fix).
3. A court with no image (if you can find or fake one) falls back cleanly, no broken image
   icon.
4. Click still navigates to `/courts/{slug}` where `navigateOnClick` is set.
5. Repeat on the Saved Wishlist map and the unlocked Court Detail single-marker preview (both
   `variant="rail"` and `variant="v2"`, both the entitled/exact and approximate/featured
   cases) — confirm `heroImageUrl` actually reached the marker in each.
6. Network tab: confirm the image request size is what you intended from §2 (a small
   optimizer-resized thumbnail, or the raw file if you chose that path deliberately).
7. If clustering is already in place, confirm cluster badges are unaffected and still show a
   count, not a photo.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
9. `pnpm --filter @tennis/web verify:map-autofocus` — report old → new count; check whether any
   existing check asserts something about `markerContent()`'s internals that your change
   affects, and extend coverage if this new behavior (image fallback, state ring) warrants it.

## Report

The pin size/shape you landed on and why; how you kept the state signal (ring color, halo);
the image-sizing decision from §2 (optimizer endpoint vs. raw URL) and why; the on-screen
anchor verification result; confirmation of the fallback-image case; whether Task 19's
clustering was present and, if so, that the cluster badge is unaffected; and the
typecheck/lint/build/harness results. No git commit or push.
