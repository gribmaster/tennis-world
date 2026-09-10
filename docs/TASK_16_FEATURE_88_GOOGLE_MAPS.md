# TASK 16 / FEATURE 88 — Leaflet → Google Maps

**Model: Sonnet 5, reasoning effort: high.**

Task:
Replace Leaflet with the Google Maps JavaScript API as the map engine, behind the
existing component seam. Port the behaviour that is already there — do not redesign the
map screen, and do not change a single coordinate rule.

Context:
- `CLAUDE.md` binds in full; §3 (env/secrets), §4 (pending), §9 (scope, packages) and
  §2 (harnesses) are the ones this task will actually collide with.
- `docs/MAP_PROVIDER_DECISION.md` — the Feature 74 decision this task **reverses**. Read
  it first, all of it. §6 (exact vs approximate coordinates) survives unchanged and is the
  one thing in this task that MUST NOT bend.
- Current implementation: `apps/web/src/features/map/` — `LeafletMap.tsx` (SSR wrapper),
  `LeafletMapInner.tsx` (270 lines, the whole engine), `map-config.ts`, `map-markers.ts`.
- Consumers, all four: `features/map/MapExplorer.tsx` (`/map`),
  `features/saved/SavedWishlistMap.tsx`, `features/court-detail/CourtDetailLocationPreview.tsx`
  (**four** `<LeafletMap>` call sites — v2 locked, v2 unlocked, rail locked, rail unlocked).

## 0. THIS REVERSES A WRITTEN DECISION — say so in the repo

Two places currently instruct the reader not to do this:

- `docs/MAP_PROVIDER_DECISION.md` §2, "Explicitly NOT chosen": *"No Google Maps —
  heavyweight, key-gated, and its look/licensing is wrong for an editorial product."*
- `apps/web/.env.example` line 69: *"(Do NOT use Google Maps or Mapbox for now — see the doc.)"*

Both **MUST** be rewritten in this same change. `CLAUDE.md`'s own preamble requires it:
when a rule and the code disagree, update the rule in the same change. Leaving a doc that
forbids what the code now does is worse than having no doc. Rewrite §2 and §5 of
`MAP_PROVIDER_DECISION.md` as a dated superseding decision — keep the history (why Leaflet
was chosen, why it is being left), do not delete it and do not pretend it never happened.

## 1. DECIDED — variant B: Map ID + `AdvancedMarkerElement`

**This decision is made (project owner, 2026-09-10). Do not re-open it.** The table below
is context for why, not an invitation to choose again.

Google forces a fork here, and it is not a preference, it is mutually exclusive:

| | **A — JSON styles + legacy `Marker`** | **B — Map ID + `AdvancedMarkerElement`** |
|---|---|---|
| Styling | `styles: [...]` JSON in the repo (Snazzy-style), version-controlled | Cloud-console style, referenced by `mapId` |
| Markers | `google.maps.Marker` + SVG data-URI icon | `AdvancedMarkerElement` with `content: HTMLElement` |
| Marker status | deprecated since Feb 2024 (still functional) | current |
| Restyle without redeploy | no | yes |
| Style in git | yes | **no** — this is B's real cost |

**Setting `mapId` makes the `styles` option inert.** You cannot have both. Pick one.

**Why B.** The existing markers are already DOM — `markerIcon()` in `LeafletMapInner.tsx`
builds an HTML string for `L.divIcon` (`.tw-map-marker`, halo span, dot span, `--mk` custom
property). `AdvancedMarkerElement.content` takes an `HTMLElement`, so that is a near-1:1
port and the existing `.tw-map-marker*` CSS survives. Variant A would mean re-expressing
those markers as SVG data URIs and losing the CSS hover rule.

**B's cost, accepted knowingly:** the map's visual style lives in the Google Cloud Console,
not in this repository. It is therefore not version-controlled, not reviewable in a diff,
and not restored by a `git checkout`. Record the Map ID and a description of the style in
`docs/MAP_PROVIDER_DECISION.md` (§0) so the styling is at least *documented* in the repo
even though it cannot be *stored* there.

**Hard prerequisites — the map renders nothing without these.** Confirm both exist before
writing code, and stop and say so if either is missing:

1. A Maps JavaScript API key, restricted by HTTP referrer and by API.
2. A **Map ID** created in the Google Cloud Console with a style attached. `AdvancedMarkerElement`
   does not work without one — this is not optional under variant B.

Both are env-driven per environment (§4). Never hardcode either, and never commit a real key.

## 2. THE COORDINATE INVARIANT — unchanged, and it is the point of this codebase

`MAP_PROVIDER_DECISION.md` §6 survives this task verbatim. Restated so there is no doubt:

1. Public map surfaces (`/map`, Wishlist, locked Court Detail) plot **`approxLat`/`approxLng`
   only**, via `courtToMarker` in `map-markers.ts`. That function is the single chokepoint.
   **Do not touch it.** Its `lat`/`lng` fields are the map layer's own vocabulary, populated
   exclusively from the approximate values.
2. Exact `lat`/`lng` reach the client **only** from `GET /v1/me/courts/:slug/exact-location`,
   only for an entitled viewer, and only to plot one marker.
3. `directionsUrl` is **built server-side** (`apps/api/src/courts/courts.mapper.ts`, which
   prefers the court's own stored Google Maps link). The web app **MUST NOT** assemble a
   directions URL from coordinates — not even now that we are on Google. Keep rendering the
   server's opaque string.
4. `verify:api-parity` asserts at every nesting depth that public responses carry no
   `lat`/`lng` key while requiring `approxLat`/`approxLng`. It must still pass 42/42.

**New with Google, and you must reason about it explicitly:** the Maps JS API is Google's
network. Viewport centres, zoom levels and any Places/Directions call go to Google. That
does not weaken rules 1–3 — the map layer still only ever receives what the caller hands
it — but it does mean: **never pass an exact coordinate into any Google API call other than
the single entitled marker's position**, and add no Places, Geocoding or Directions call in
this task at all. Confirm in your report that you added none.

## 3. THE HARNESS WILL BREAK — rewriting it is part of this task, not a follow-up

`apps/web/scripts/verify-map-autofocus.ts` (26.7 KB) reads
`features/map/LeafletMapInner.tsx` and `features/map/LeafletMap.tsx` **by exact path** and
asserts on **Leaflet-specific source text**. These regexes all die on this change:

```
/map\.flyTo\(\[focus\.lat, focus\.lng\], targetZoom, \{ duration: 0\.9 \}\)/
/map\.on\('dragstart', reportUserInteraction\)/
/map\.on\('zoomstart', reportIfNotProgrammatic\)/
/map\.on\('moveend', clearSuppression\)/
/dragging: interactive/     /scrollWheelZoom: interactive/     /zoomControl: interactive/
/loading: \(\) => <MapLoading \/>/          PROGRAMMATIC_MOVE_GRACE_MS
```

**Baseline, captured on a clean tree 2026-09-09: 78 checks, 78 pass, 0 fail.** That is the
number your rewrite is measured against.

Rules for the rewrite:

- The **behavioural half stays byte-unchanged**. The checks that import `geo-distance.ts`
  and actually execute nearest-court selection, tie-breaks, invalid coordinates, the empty
  case and the great-circle proof are provider-independent. Do not touch them, do not
  renumber them, do not weaken them.
- The **source-level half is re-pointed**, not deleted. Every requirement it covers still
  has to be covered — the one-shot focus token, the programmatic-move suppression window,
  the user-gesture report, interactivity flags, no full-page loader. Re-express each against
  the Google API you actually wrote. A check you delete is a requirement you dropped.
- `readSrc(...)` paths must follow whatever you rename the files to (§5).
- Report the new check count next to the old one, and name any check whose meaning changed.

Deleting or skipping this harness is a task failure.

## 4. THE PORT — the API mapping you will need

| Leaflet (current) | Google Maps |
|---|---|
| `L.map(el, opts)` | `new google.maps.Map(el, opts)` |
| `dragging` / `scrollWheelZoom` / `doubleClickZoom` / `touchZoom` / `keyboard` / `boxZoom` | `gestureHandling: 'auto'\|'none'`, `draggable`, `scrollwheel`, `disableDoubleClickZoom`, `keyboardShortcuts` |
| `zoomControl: interactive` | `zoomControl` |
| `attributionControl` | Google draws its own; **not removable** |
| `L.tileLayer(tile.tileUrl)` | none — Google supplies the basemap |
| `map.setView(c, z)` | `setCenter` + `setZoom` |
| `map.fitBounds(b, { padding, maxZoom })` | `fitBounds(b, padding)`; `maxZoom` needs a one-shot `idle` clamp |
| `map.flyTo(c, z, { duration: 0.9 })` | **no equivalent** — see below |
| `movestart` / `zoomstart` | `center_changed` / `zoom_changed` (also fire for programmatic moves — keep the suppression window) |
| `moveend` | `idle` |
| `dragstart` | `dragstart` |
| `L.marker` + `L.divIcon(html)` | `AdvancedMarkerElement { content }` (B) or `Marker` + SVG data URI (A) |
| `map.remove()` | no destroy method — remove listeners, null the refs, drop the container |
| `map.invalidateSize()` | not needed; Google observes container resize |

**`flyTo` is the one real behavioural gap.** The nearest-court focus currently animates pan
*and* zoom over 0.9 s. Google's `panTo` animates pan only; there is no built-in combined
animated camera move. Choose: an instant `setCenter`+`setZoom`, or a composed animation.
Do not silently downgrade it — state what you chose and how it now feels. The one-shot
`focus.token` contract with `MapExplorer` (`MapFocusRequest`, `appliedFocusTokenRef`) is
unchanged and must keep working: a re-render carrying an already-applied token is a no-op.

Loading: `@googlemaps/js-api-loader` (adding it is justified — say so against §9; it
dedupes the script and gives a promise, which a hand-rolled `<script>` tag does not). Keep
the `next/dynamic({ ssr: false })` boundary and the `MapLoading` placeholder exactly as they
are — Google needs the browser just as Leaflet did, and §4 rule 4 still forbids a full-page
loader.

**Env** (`NEXT_PUBLIC_` — a Maps browser key is public by construction, it is not a §3
secret violation, but it **is** billable):

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=      # variant B only
```

`map-config.ts` currently resolves `NEXT_PUBLIC_MAP_*` (provider/tileUrl/attribution). Those
three become meaningless — Google has no tile URL and its own attribution. Rewrite the module
rather than leaving dead env names in `.env.example`. Document in `.env.example` that the key
**MUST** be restricted in Google Cloud Console by HTTP referrer *and* by API, and that an
unrestricted key on a public site is a billing incident waiting to happen. Never commit a real key.

## 5. Naming — decide once and do it properly

`index.ts` exports `LeafletMap` / `LeafletMapProps` / `MapFocusRequest`; four files import
it; the harness reads two files by name; `globals.css` styles `.leaflet-container`,
`.leaflet-control-zoom`, `.leaflet-control-attribution` (~lines 320–386).

Keeping the name `LeafletMap` for a Google map is a lie in the source. Rename to something
provider-neutral — `CourtMap` / `CourtMapInner` — so the next provider change does not repeat
this. That means: `index.ts` exports, all four consumer imports, the harness `readSrc` paths,
and the CSS. Port the `.leaflet-*` rules to Google's DOM (`.gm-style`, `.gm-bundled-control`)
or drop them deliberately — do not leave dangling selectors that match nothing.

`packages`: remove `leaflet` and `@types/leaflet` from `apps/web/package.json` and the
`import 'leaflet/dist/leaflet.css'`. Add `@googlemaps/js-api-loader` + `@types/google.maps`.

## 6. TWO THINGS TO CHECK BEFORE YOU BUILD — flag them, do not just plough on

**6.1 The locked Court Detail preview renders a full live map behind a blur.**
`CourtDetailLocationPreview.tsx` renders `<LeafletMap markers={[]} interactive={false} />`
inside a `blur-[6px]` wrapper, in both the v2 and rail variants. Two problems once this is Google:

- **Cost.** Court Detail is the most-visited page, and every mount is a billable map load —
  for a map that is deliberately blurred out and has no markers on it. Count every mount site
  (`/map`, `/saved` Wishlist, and *both* Court Detail states) and report the list.
- **Terms.** Blurring the whole surface also blurs Google's logo and attribution, which
  Google's Maps Platform terms restrict. **Verify this against the current terms yourself
  before shipping it** — do not take this brief's word for it.

If either points the same way, the locked preview is the obvious candidate for a static
image (Maps Static API is a separate, cheaper SKU) or a non-Google treatment. That changes
visuals, so **propose it and wait** — do not change the locked state's look unilaterally.

**6.2 Pricing.** Roughly 10,000 free dynamic-map loads per month, then roughly $7/1,000, on
the tier structure introduced in 2025. Treat those numbers as stale until you check current
pricing yourself. The point is the shape: this is now a per-page-view cost, where Leaflet+OSM
was free. Report the mount-site count so the cost is a known quantity rather than a surprise.

## Do not change

`apps/api/**`, `packages/contracts/**`, schema, migrations, seed. The exact-location endpoint
and its `directionsUrl`. `courtToMarker` and the approx-only rule. `geo-distance.ts` (a pure
module — the harness asserts it imports no React and no map library; keep it that way).
`useGeolocation.ts`, `MapLocateControl.tsx`, `MapFilterBar`, `MapCourtList`, `MapCourtRow`,
the filter model in `components/filters`. Auth, billing, routing. **No map-screen redesign** —
the design-v2 map treatment is a separate follow-up feature and mixing it in makes this
unreviewable. No git commit or push.

## Testing

- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `verify:map-autofocus` — rewritten per §3. Report old count → new count (the old count is
  78), and name every check whose meaning changed.
- `verify:ux-pending-states` — 92 checks, unchanged. Confirmed passing 92/92 before this task.
- `verify:api-parity` — still 42/42.
- Manual, with a real key, and report each one:
  1. `/map` — markers at approximate positions, filter changes re-plot without re-creating
     the map, marker click navigates to `/courts/{slug}`.
  2. `/map` — nearest-court focus: granted → moves to the nearest court; denied → viewport
     untouched; **pan the map while the permission prompt is open → the automatic recentre
     stands down** (this is the whole point of the token/suppression machinery).
  3. `/saved` Wishlist tab — saved courts plotted, navigable.
  4. Court Detail **locked** — blurred approximate map, no exact coordinate anywhere in the
     payload or the DOM, "Unlock to reveal" intact.
  5. Court Detail **unlocked, not entitled** — approximate marker, zoom 6.
  6. Court Detail **entitled** — exact marker at zoom 17, "Open in Maps" uses the server's
     `directionsUrl` verbatim.
  7. Confirm in the network tab that no exact coordinate appears in any request to Google.
- Report: files changed, the variant chosen (§1), the `flyTo` decision (§4), the mount-site
  count and both §6 findings, and every harness count. Name anything you skipped and why.
