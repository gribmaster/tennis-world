# Feature 11 — Court Detail Layout Note

**Status:** Planning only — **no implementation in this feature.** This note translates the
three reference sources mandated by `docs/PHASE_1_WEB_MOCK_FIRST.md` §3.4 and Architecture
Plan Decision #15 into a concrete, reviewable layout before any code is written.

**Reference sources** (per Decision #15 — there is no dedicated `court-detail.html`):

1. The `CourtDetail` component embedded inline in `files/map.html` (and the identical copy in
   `files/home.html` lines 440–584, reused by `files/saved.html`) — the closest existing visual
   baseline.
2. The luxury design language already established in `apps/web` (serif display type, `eyebrow`
   captions, `meta-chip` pills, `locked-badge`, `img-overlay`, sticky CTA, generous whitespace).
3. PRD §6.4 Court Detail requirements.

**The screen this note plans:** `apps/web/src/app/courts/[slug]/page.tsx` — a **required** Phase-1
screen (Decision #15). Every Home section already links to `/courts/[slug]`; those links are
currently dead. This screen makes them work end-to-end.

---

## 1. Route, data fetching, and `notFound`

- **Route:** `apps/web/src/app/courts/[slug]/page.tsx` — an App Router dynamic segment.
- **Server component**, `async`, like `app/page.tsx`. It is the **only** repository boundary on
  this screen; all section components stay presentational and receive data via props.
- **Primary fetch:** `repositories.courts.getBySlug(slug)` → `CourtDTO | null`.
- **Related fetch:** `repositories.courts.getRelated(court.id, 4)` → `CourtSummaryDTO[]` (only when
  a court was found; uses the court's `id`, not its slug — see `getRelated(courtId, limit)`).
- **`notFound` behavior:** if `getBySlug` returns `null`, call Next's `notFound()` (from
  `next/navigation`) so the framework renders the standard 404. Do **not** render a half-empty
  page. No custom `not-found.tsx` is required for this feature (the default 404 is fine).
- **Fetch the two in sequence**, not `Promise.all`: `getRelated` needs `court.id`, which only
  exists after `getBySlug` resolves. (A micro-optimization is possible later; not worth it for the
  12-court mock.)
- **`params` is async in Next 15** — `await params` before reading `slug` (matches the installed
  `next@^15`).
- **Static generation:** the page can stay statically prerendered. `generateStaticParams()` may be
  added later to prebuild every known slug, but it is **optional** for this feature — leaving it
  out simply defers each slug to first-request render, which is acceptable in Phase 1.

```ts
// Shape only — NOT to be implemented in this feature.
export default async function CourtDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const court = await repositories.courts.getBySlug(slug);
  if (!court) notFound();
  const related = await repositories.courts.getRelated(court.id, 4);
  // …compose presentational sections, passing `court` / `related` as props.
}
```

---

## 2. Locked / unlocked location state — the one piece of derived logic

The prototype computes `isLocked = court.locked && !unlocked`. In Phase 1 there is **no auth and no
real entitlement system** (Decision #11), and the data-driven discipline (Phase 1 §4) forbids a
component inventing its own `isLocked` boolean.

**Phase-1 recommendation (small + correct):**

- Treat the page's `unlocked` state as **`false`** (hardcoded, same as `AppShell unlocked={false}`
  on Home). There is no `userRepository` wired yet; introducing one is out of scope here.
- Compute `const showExactLocation = !court.isLocked && unlocked;` **once, at the page level**, and
  pass the resulting boolean down to the location-preview section as a prop (e.g.
  `locked={!showExactLocation}`). The presentational component never recomputes it.
- Because `unlocked` is `false`, every `isLocked` court shows the locked preview; courts with
  `isLocked === false` (the data already carries this field on `CourtSummaryDTO`) show the
  "available" treatment. This faithfully reproduces the prototype without auth.
- A short code comment should mark `unlocked = false` as the Phase-1 stand-in that Phase 4 replaces
  with `userRepository.getEntitlementStatus()`.

This keeps entitlement-derived UI state flowing from one page-level decision, exactly as §3.4 / §4
require — just with a mocked input.

---

## 3. Section order & layout

Derived from the prototype's `CourtDetail`, simplified to Phase-1 scope. **Mobile-first single
column; two-column (content + sticky info rail) on desktop (`md`/`lg`+).**

### 3.1 Back / breadcrumb bar (optional, low priority)
The prototype has a sticky back bar under the header. On a real routed page the browser back button
+ the app header already cover this; a simple breadcrumb (`Home · {country}`) or a lightweight
"← Back to map" link is **nice-to-have, not required**. If included, keep it a plain `<Link>`, not a
new component.

### 3.2 Hero image / gallery
- Driven by `court.images` (`CourtImageDTO[]`: `url`, `alt?`, `isHero`, `sortOrder`).
- A large lead image (the `isHero` image, falling back to `heroImageUrl` / `images[0]`) in a wide
  frame (prototype uses ~16:10), with a **thumbnail strip** beneath.
- **Gallery image switching is interactive** (clicking a thumbnail changes the lead image). That
  requires `useState`, so the gallery must be a small **client component** — see §5. The rest of the
  page stays server-rendered.
- `CourtImage` (existing) frames a single image with `object-cover` + optional gradient and is
  reusable here for the lead frame and/or thumbnails. It currently defaults `withOverlay` on; the
  detail hero likely wants `withOverlay={false}` (no overlaid text on the lead image).
- **Phase-1 acceptable simplification:** if the interactive gallery feels too large for one feature,
  ship a **static lead image + non-interactive thumbnail row** first (pure server component, no
  state) and add switching later. Either is fine; prefer the simpler one if time-boxed.

### 3.3 Court title & location
- **Eyebrow:** `{court.country} · {court.region}` (uppercase, `eyebrow` class) — same pattern as
  `CourtCard`.
- **Title:** `court.name` in `display-l` (serif). This is the page `<h1>`.
- On desktop these sit at the top of the **right sticky info rail**; on mobile they sit directly
  under the gallery.

### 3.4 Meta chips
- Reuse the existing **`CourtMeta`** component: `surface` / `setting` / `access` / `indoorOutdoor`.
  All four fields exist on `CourtSummaryDTO` (and therefore `CourtDTO`). No new component.

### 3.5 Overview / blurb (editorial copy)
- `court.blurb` exists on `CourtDTO` (not on the summary — fine, the page fetches the full DTO).
- Follow the prototype's split: **first sentence as an italic serif pull-quote**, the remainder as
  body copy. The split is presentational formatting of a single `blurb` string (`blurb.split('.')`),
  done inside the section component from the `blurb` prop — not new data.
- Prefix with an `eyebrow` caption ("About this court" / "Overview"). That caption is section chrome,
  not court content.

### 3.6 Map / location preview (placeholder)
- A framed box (prototype uses ~16:9, the stylized `gmap` gradient background).
- **Locked state** (`locked` prop true): blurred/dimmed box with a lock glyph, "Unlock to reveal
  exact location", and an **Unlock** CTA (placeholder — see §3.8).
- **Unlocked state:** a single pulse pin centered in the box + a "Get Directions" placeholder button.
- **Phase-1 reality:** there is **no real map** and exact `lat`/`lng` must never drive a Phase-1
  visual anyway (the stylized canvas uses `mapCoords`; real geo is reserved for the Phase-2
  server-side masking boundary — Risk #17). So this is a **static styled placeholder**, not a real
  map embed. Keep it visual-only. Do not plot `lat`/`lng`.

### 3.7 Related courts
- `repositories.courts.getRelated(court.id, 4)` → `CourtSummaryDTO[]`, fetched at page level.
- Render with the existing **`CourtCard`** (with `href={`/courts/${c.slug}`}`) in a small responsive
  grid (e.g. 2-up mobile → 4-up desktop). The prototype rolls its own mini-cards; we **reuse
  `CourtCard`** instead (§3.4 of the phase doc explicitly says related uses the same `CourtCard`).
- Eyebrow caption: "If you love this, you'll love" or "Related courts".
- If `getRelated` returns an empty array, render nothing (no empty-state needed).

### 3.8 CTA area — unlock / request consultation (placeholders)
- On **desktop**, these live in the **right sticky info rail** (`position: sticky`), under the meta
  chips + a status line ("Location locked — membership required" vs "Full location available").
- On **mobile**, they sit in a normal stacked block near the bottom of the content (a sticky bottom
  bar is a nice-to-have, not required for Phase 1).
- **Primary CTA:** "Unlock Full Access" when locked (gold `btn-premium` — the sanctioned paywall
  button) / "Get Directions" when unlocked. **Placeholder** `href="#"` — no paywall modal, no
  checkout, no real unlock (matches `HomePaywallBand`'s approach). Comment it as Phase-4.
- **Secondary CTA:** "Request a Consultation" — placeholder `href="#"` (no `/consultation` route or
  modal exists). Comment as consultation placeholder.
- The locked `$29 LIFETIME` membership block from the prototype is **optional** here; the
  `HomePaywallBand` already carries that message. If included, keep copy local/presentational (no
  `@tennis/mock-data` import in UI), same as `HomePaywallBand`.

---

## 4. Responsive behavior

- **Mobile-first, single column**, top→bottom: (back link?) → gallery → title/location → meta chips →
  overview → location preview → CTAs → related courts.
- **`md`/`lg`+: two columns.** Left = gallery + overview + location preview + related; right = a
  **sticky info rail** (`position: sticky; top: ~96–144px`) holding title/location, meta chips,
  status line, and CTAs — mirroring the prototype's `gridTemplateColumns: 'minmax(0,1fr) 400px'`.
- Use the existing `container-page` gutter and `section`/`py-section-*` spacing tokens.
- The app header is **not** `overHero` on this page (the detail hero is a framed image, not a
  full-bleed one) — so `AppShell` is used **without** `overHero` (standard `pt-[72px]` content
  offset), unlike the Home page.

---

## 5. Presentational components vs. page-level data fetching

**Page-level (server, `courts/[slug]/page.tsx`):**
- `await params`, `getBySlug(slug)`, `notFound()` on null, `getRelated(court.id, 4)`.
- Compute the single `unlocked`/`showExactLocation` boolean.
- Compose sections, passing `court` (CourtDTO) and `related` (CourtSummaryDTO[]) + the `locked`
  boolean as props.

**Reused existing presentational components (no new ones needed for these):**
- `CourtMeta` — meta chips (§3.4).
- `CourtCard` — related-courts grid (§3.7).
- `CourtImage` — image framing for the gallery lead/thumbnails (§3.2).

**Likely new presentational pieces** — these can be **feature-local** to the page (e.g. a
`features/court-detail/` folder), created in the *implementation* feature, **not now**:
- A **gallery** piece (client component, holds the selected-image `useState`). This is the only part
  that must be `'use client'`.
- A **location-preview placeholder** piece (locked/unlocked branching, pure presentational from the
  `locked` prop).
- Optionally a small **CTA rail / sticky info** wrapper — or just compose inline in the page with the
  existing primitives. Prefer inline composition unless it gets unwieldy; avoid premature components.

**Boundary rules carry over unchanged:** only the page imports `repositories`; no UI component
imports `@tennis/mock-data`; new section components take data via props. No global components unless
clear reuse emerges (Decision #6) — related/meta/image reuse is already covered by existing court
components.

---

## 6. Data availability vs. missing fields

### Available now (sufficient to build the page)
`CourtDTO` (from `getBySlug`) provides everything the core layout needs:
`id, slug, name, country, region, surface, setting, access, indoorOutdoor, isScenic, isFeatured,
isLocked, heroImageUrl, images[] (url/alt/isHero/sortOrder), blurb, status, mapCoords, approxLat,
approxLng, lat?, lng?`. `CourtSummaryDTO` (from `getRelated`) provides everything `CourtCard` needs.

### Missing-but-non-blocking fields (do **not** add in this feature — Decision: do not modify contracts)
These would enrich the page but the layout works without them; note for a future contracts pass:

| Field | Where it would help | Phase-1 workaround |
|---|---|---|
| `images[].alt` reliably populated | gallery a11y | `alt` is optional and often empty in mock data; fall back to `court.name` (or `""` for decorative thumbnails). |
| A short **summary/tagline** distinct from `blurb` | a one-line subhead under the title | Reuse the first sentence of `blurb` (the pull-quote already does this). |
| Structured **highlights/amenities** (e.g. "2 clay courts", "Open Apr–Oct", "Floodlit") | a small facts list | Omit in Phase 1; the meta chips + blurb suffice. |
| Per-image `caption` | gallery captions | Omit; not in the prototype. |
| `directionsUrl` / canonical map link | "Get Directions" target | Placeholder `href="#"` (Phase 4 + masking boundary decide the real source). |
| `relatedReason` / ranking hints | labeling related courts | Not needed; `getRelated`'s heuristic is internal. |

All of the above are explicitly **out of scope** here (hard rule: do not modify contracts). They are
recorded only so the implementation feature doesn't rediscover them as surprises.

---

## 7. Phase-1 scope guardrails (for the implementation feature)

- Static styled **location placeholder only** — no real map, no plotting `lat`/`lng`.
- CTAs are **placeholders** (`href="#"`) — no paywall modal, no checkout, no consultation form, no
  auth, no real unlock.
- `unlocked` is a **hardcoded `false`** stand-in; Phase 4 swaps in `userRepository`.
- Save-heart toggle from the prototype is **optional/out of scope** here (no `userRepository` yet);
  if shown at all, it is visual-only state like `CourtCard`'s existing `saved` prop.
- Keep new components **feature-local**; reuse `CourtCard`/`CourtMeta`/`CourtImage`.
- No `app/api`, no backend, no contract/repository changes.
```
