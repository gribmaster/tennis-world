# Phase 1 — Web App, Mock-First and Data-Driven

**Status:** Planning only — no implementation. Companion to `../ARCHITECTURE_PLAN.md` §5, §8.
**Goal:** Build the complete `apps/web` UI — all screens from the HTML prototypes **plus Court Detail**, which has no dedicated prototype but is a required screen (Decision #15) — against local, in-app mock repositories — fully data-driven, zero hardcoded content in JSX — so that swapping to the live API in Phase 2 is a configuration change, not a rewrite.
**Explicit non-goals:** No auth, no payments, no live API calls, no `packages/repositories`, no `packages/ui` (Decisions #6, #7, #11). No business logic or data-access routes under `apps/web/app/api` — that's exclusively `apps/api`'s job, in every phase, not just this one (Decision #16). Saved/unlocked/membership state is mocked client-side only.
**Stack note:** `apps/web` runs on the latest stable Next.js major (App Router) — don't pin to a specific historical version.

---

## 1. `apps/web/src/domain` — local repository layer

Per Architecture Plan Decision #7, this lives inside `apps/web`, not a shared package. Promote later only per the trigger documented in `docs/IMPLEMENTATION_BACKLOG.md`.

### 1.1 Interfaces (`src/domain/interfaces/`)

- [ ] `court.repository.ts` — `interface CourtRepository { list(filter?: CourtFilter): Promise<CourtSummaryDTO[]>; getBySlug(slug: string): Promise<CourtDTO | null>; search(query: string): Promise<CourtSummaryDTO[]>; getMapPins(bbox?: BBox, zoom?: number): Promise<MapPinDTO[]>; getRelated(courtId: string, limit?: number): Promise<CourtSummaryDTO[]>; }`
- [ ] `collection.repository.ts` — `interface CollectionRepository { list(): Promise<CollectionDTO[]>; getBySlug(slug: string): Promise<CollectionWithCourtsDTO | null>; }`
- [ ] `article.repository.ts` — `interface ArticleRepository { list(): Promise<ArticleSummaryDTO[]>; getBySlug(slug: string): Promise<ArticleDTO | null>; }`
- [ ] `user.repository.ts` — `interface UserRepository { getCurrentUser(): Promise<UserProfileDTO | null>; getSavedCourtIds(): Promise<string[]>; toggleSavedCourt(courtId: string): Promise<void>; getUserCollections(): Promise<UserCollectionDTO[]>; createUserCollection(name: string): Promise<UserCollectionDTO>; addCourtToCollection(collectionId: string, courtId: string): Promise<void>; getEntitlementStatus(): Promise<{ unlocked: boolean }>; }` — shaped now so the Phase 4 swap to a real auth-backed implementation doesn't require interface changes, only a new adapter.
- [ ] `consultation.repository.ts` — `interface ConsultationRepository { submit(payload: ConsultationSubmitDTO): Promise<{ id: string }>; }`
- [ ] All method signatures typed against `packages/contracts` DTOs — if a DTO doesn't exist yet in `packages/contracts`, add it there first, never define a one-off type inline in `apps/web`.

### 1.2 Mock implementations (`src/domain/mock/`)

- [ ] `mock-court.repository.ts` — reads `packages/mock-data`'s court array, implements `list()` filtering (country/region/collection/surface/access/indoor/scenic/search query) and `getMapPins()` entirely in-memory. **`getMapPins()` groups by country/region and uses `zoom` only to pick the hierarchy tier (World→Region→City→Court) — it does NOT do bbox geospatial querying** (no-PostGIS decision, Architecture Plan §9 Risk #1). The `bbox` param is accepted for interface stability with the eventual API but is not used to filter in the mock. Pin positions for the stylized map come from each court's `mapCoords`, never from `lat/lng`.
- [ ] `mock-collection.repository.ts` — reads collections array, joins court summaries for `getBySlug`.
- [ ] `mock-article.repository.ts` — reads articles array.
- [ ] `mock-user.repository.ts` — backed by `localStorage` (browser) or in-memory state for SSR fallback: saved court IDs, user collections, and a mock `unlocked` boolean toggled by the mock paywall flow (see §3 below). This is intentionally the most "fake" repository — it simulates persistence without a server.
- [ ] `mock-consultation.repository.ts` — "submits" by logging to console and resolving with a fake id; no real persistence needed for Phase 1 demos.
- [ ] None of these import React or Next.js — they are plain TS classes/objects, independently testable.

### 1.3 Factory (`src/domain/index.ts`)

- [ ] Single factory function reading `process.env.DATA_SOURCE` (`'mock' | 'api'`), returning the assembled set of repositories. In Phase 1, the `'api'` branch **throws `Not implemented`**. **Do not create `src/domain/http/` in Phase 1 at all** — not even empty stubs. That directory and its HTTP repository implementations are Phase 2 work; scaffolding them early (to be "thorough") is exactly the over-build this phase must avoid. The factory references no `http/` files in Phase 1.
- [ ] `apps/web/src/lib/repositories.ts` imports only from this factory and exposes typed hooks/server actions — this is the **only** sanctioned import boundary for the rest of the app.
- [ ] Lint rule (ESLint `no-restricted-imports` or similar) blocking any import of `src/domain/mock/*` or `src/domain/http/*` from outside `src/domain/index.ts` and `lib/repositories.ts` — set this up now, in Phase 1, while the discipline is easiest to establish (Architecture Plan §9 Risk #4).

---

## 2. Design tokens & shared styling

- [ ] Port the full design token set from `Claude_Design_Prompt_Tennis_Mobile.md` into `apps/web`'s Tailwind theme config: color palette (ink/graphite/stone/mist/bone/ivory/clay/moss/gold/paper), type scale, spacing scale, radii, the `.btn`/`.pill`/`.meta-chip` style primitives already prototyped in the HTML files.
- [ ] Fonts: Cormorant Garamond (serif/display) + Inter (sans/body), loaded the same way the prototypes do.
- [ ] No `packages/ui` — these tokens and the small set of shared primitives (`Button`, `SectionHeader`, `Pill`) live directly in `apps/web/src/components/shared` and `apps/web/src/styles` (Decision #6). Revisit only per the trigger in `docs/IMPLEMENTATION_BACKLOG.md`.

---

## 3. Pages and components — data-driven build order

Build in this order; each step should be a working, demoable increment. "Data-driven" means: the component receives data via props/hooks sourced from a repository call — no court name, price, or copy string is ever written directly into JSX.

### 3.1 Shared shell
- [ ] `components/shared/Nav` — top nav bar (logo, page links, saved/profile icons, "Unlock Map" CTA) matching `home.html`/`map.html`'s `Nav` component behavior (transparent-over-hero, scroll-aware background).
- [ ] `components/shared/Footer`.
- [ ] `components/shared/SectionHeader` (eyebrow + title pattern used throughout).
- [ ] Button variants (Primary/Secondary/Ghost/Over-image/Premium) per the design prompt's button table.

### 3.2 Home (`app/(marketing)/page.tsx`)
- [ ] Hero section — driven by the `site-stats` config export from `packages/mock-data` (stat line, headline, CTA copy — see Phase 0 §3) rather than hardcoded text, since it isn't really an "entity." The prototype's hero stat string (e.g. `"11 islands · 50 countries · 1000 tennis courts"`) is data, not JSX.
- [ ] Featured destinations carousel — `courtRepository.list({ featured: true, limit: 6 })`.
- [ ] Editor's Cut stacked rows — `courtRepository.list({ featured: true })`, alternating image/text layout.
- [ ] Collections grid — `collectionRepository.list()`.
- [ ] Journal teaser — `articleRepository.list({ limit: 3 })`.
- [ ] Footer paywall CTA band — opens the mock paywall modal (§3.6).

### 3.3 Map (`app/map/page.tsx`)
- [ ] Search bar + filter chips (All/Resorts/Clubs/Private/Indoor/Scenic) — filtering happens through `courtRepository.list(filter)`, not client-side array filtering inside the component (the mock repository owns the filter logic, matching where the real API will own it in Phase 2).
- [ ] Map canvas — port the stylized non-interactive map background from `map.html` as a starting visual; pins positioned from each court's **`mapCoords`** (the `[x%, y%]` screen-position field, NOT `lat/lng` — see Phase 0 §3 / Architecture Plan §9 Risk #17). `lat/lng` are real-geo fields reserved for the server-side masking boundary and are never used to place a pin on this stylized canvas.
- [ ] Bottom sheet / list panel — mobile horizontal card strip + desktop vertical row list, both driven by the same filtered court list.
- [ ] Pin states (open/locked/featured) driven by `court.locked`/`court.featured` fields from the data, never inferred or hardcoded per-pin.

### 3.4 Court Detail (`app/courts/[slug]/page.tsx`) — required screen, no dedicated HTML prototype (Decision #15)

Unlike Home/Map/Saved/Profile/Collections/Journal, there is no standalone `court-detail.html` in `/files`. This screen is still **required** in Phase 1 — it's the PRD's primary conversion surface (PRD §6.4) and is referenced by Map's bottom-sheet cards, Home's destination cards, and Saved's grid. Derive its layout from three sources rather than improvising ad hoc:

1. The court-detail-shaped content already embedded inline in `map.html`'s in-page `CourtDetail` component (hero image/gallery, court name + location, description, location-mask-with-unlock-CTA, related courts, sticky bottom CTA bar) — this is the closest thing to an existing visual reference and should be treated as the baseline.
2. The luxury design tokens and component patterns already established across every other prototype: serif display headlines, eyebrow captions, `meta-chip` pills for surface/setting/access/indoor-outdoor, the `locked-badge` treatment, the sticky-CTA-on-scroll pattern, generous whitespace, full-bleed imagery.
3. The PRD §6.4 feature list for this screen: fullscreen hero media, masked location with "Unlock to reveal" overlay, ~600–800 char editorial description, image gallery, embedded map preview (blurred/approximate for free users, exact pin for unlocked), related courts carousel, sticky CTA section (Unlock/Get Directions + Request Consultation).

Recommended build steps:
- [ ] Before writing component code, write a short layout note (a paragraph or annotated wireframe sketch is enough) translating the three sources above into a concrete section order for this page. Get this reviewed/confirmed before implementation, the same way a prototype would have been reviewed if one existed.
- [ ] `courtRepository.getBySlug(slug)` — page-level data fetch.
- [ ] Hero image gallery with thumbnail strip, driven by `court.images` (swipeable on mobile, thumbnail-strip on desktop, matching the gallery pattern already used in `map.html`'s inline detail view).
- [ ] Eyebrow (country · region) + serif display court name + metadata pills (surface, setting, access, indoor/outdoor) — same `meta-chip` component used in Map's list rows.
- [ ] Description block (pull-quote + body) — derived from `court.blurb`, split the same way the prototype does (first sentence as pull-quote).
- [ ] Location preview — locked/unlocked branching driven by `userRepository.getEntitlementStatus()` combined with `court.locked`, **not** a local-only `isLocked` flag invented in the component. Unlocked state shows an exact pin; locked state shows the blurred/approximate preview with an "Unlock to reveal" overlay per PRD §6.4.
- [ ] Related courts — `courtRepository.getRelated(court.id, 4)`, rendered with the same `CourtCard` component used on Home/Map/Saved.
- [ ] Save heart — `userRepository.toggleSavedCourt(court.id)`, optimistic UI update.
- [ ] Sticky CTA section — Unlock/Get Directions + Request Consultation, wired to the mock paywall and consultation modals, matching the sticky-on-scroll-up behavior described in the design prompt.

### 3.5 Collections (`app/collections/page.tsx`, `app/collections/[slug]/page.tsx`)
- [ ] Grid of all collections — `collectionRepository.list()`; each collection's count is derived from the `CollectionCourt` membership mapping in `packages/mock-data`, never the prototype's decorative `count` numbers.
- [ ] Collection detail — `collectionRepository.getBySlug(slug)`, resolving its court list through the `CollectionCourt` membership mapping and rendering via the same `CourtCard` component used elsewhere (no collection-specific card variant).

### 3.6 Paywall modal (cross-screen)
- [ ] Benefits list, price block ($29 lifetime) — content sourced from the `paywall-copy` config export in `packages/mock-data` (see Phase 0 §3), not inline JSX strings, so Phase 4's real pricing/entitlement-kind logic can swap the source without touching the component.
- [ ] "Unlock" CTA in Phase 1 calls `mock-user.repository.ts`'s toggle (sets the mock `unlocked` flag in localStorage) — this is explicitly a fake unlock, no payment occurs. Label this clearly in code comments so it isn't mistaken for real functionality during later review.

### 3.7 Consultation form modal (cross-screen)
- [ ] All fields (email, destination, travel period, skill level pills, group size pills, additional request) per `Claude_Design_Prompt_Tennis_Mobile.md` §9.
- [ ] Submit calls `consultationRepository.submit()` (mock — logs and fakes success).
- [ ] Confirmation state screen.

### 3.8 Journal (`app/journal/page.tsx`, `app/journal/[slug]/page.tsx`)
- [ ] List + detail, `articleRepository.list()` / `getBySlug()`.

### 3.9 Saved (`app/saved/page.tsx`)
- [ ] Three tabs: Courts / Collections / Wishlist Map — all driven by `userRepository` mock methods.
- [ ] Courts tab: grid of `courtRepository.getBySlug` lookups for each saved id (or a batch method if added to the interface).
- [ ] Collections tab: `userRepository.getUserCollections()`, "+ New Collection" flow calling `createUserCollection`.
- [ ] Wishlist Map tab: same map component as `app/map/page.tsx`, filtered to saved court IDs only — reuse the component, don't fork it.
- [ ] Empty states for each tab, per the design prompt's "beautiful, not a dead-end" requirement.

### 3.10 Profile (`app/profile/page.tsx`)
- [ ] Avatar/name/membership badge — `userRepository.getCurrentUser()` (mock returns a fixed profile from `packages/mock-data/src/users.ts`).
- [ ] Stats row (saved courts / collections / countries) — computed from the same mock user-state repositories, not separately hardcoded numbers.
- [ ] Menu rows (Subscription, Contact Concierge, Notifications, Language, Help, Privacy, Terms, Sign Out) — Sign Out and real subscription management are no-ops/stubs in Phase 1 (no auth yet); label clearly as such.

---

## 4. Data-driven discipline checklist (apply to every component above)

- [ ] No court/collection/article name, price, or descriptive copy is typed directly into a `.tsx` file outside of `packages/mock-data` or a clearly-named config object.
- [ ] No component imports `src/domain/mock/*` or `src/domain/http/*` directly — only `lib/repositories.ts`.
- [ ] No component invents its own `isLocked`/`isUnlocked` boolean logic — entitlement-derived UI state always flows from `userRepository.getEntitlementStatus()`.
- [ ] Every list/grid component accepts data as props; sample/demo data, if needed for Storybook-style isolated development, is imported from `packages/mock-data`, never inlined ad hoc.
- [ ] **No files created under `apps/web/app/api/*` in this phase, full stop** (Decision #16). There is no auth, no payment, and no webhook to handle yet, so there is no legitimate reason for this directory to exist in Phase 1. If a reviewer sees a new `app/api` route during this phase, that's a sign something business-logic-shaped has leaked into the web app — it belongs in `apps/api` instead.

---

## 5. Testing & verification

- [ ] Component/page tests run against the mock repositories (fast, no network).
- [ ] Visual check against the original HTML prototypes (`/files/*.html`) for each screen that has one — this phase's job is parity with those prototypes, now properly modularized and data-driven, not a redesign.
- [ ] For Court Detail specifically (no prototype to check against): review against the layout note written in §3.4 before implementation, and against the luxury design tokens/component reuse criteria — not against pixel parity with an HTML file that doesn't exist.
- [ ] Confirm (manually, by reading the diff) that no Phase 2 work was anticipated by accident — e.g. no premature `http/` repository stubs beyond empty placeholders, no auth UI beyond the clearly-labeled mock toggle.
- [ ] Confirm no files exist under `apps/web/app/api/*` at all (Decision #16) — this should be a trivial, mechanical check (the directory shouldn't exist), not a judgment call.

---

## Exit criteria for Phase 1

- All screens from the HTML prototypes (home, map, collections, journal, saved, profile, paywall modal, consultation modal) **plus** Court Detail (`app/courts/[slug]`, built without a dedicated prototype per Decision #15) are implemented in `apps/web`, fully data-driven from mock repositories.
- The lint rule preventing direct `domain/mock`/`domain/http` imports is active and passing in CI.
- A reviewer can change every piece of demo content (court names, prices, collection counts) by editing only `packages/mock-data`, with zero `.tsx` changes required.
- No auth, no payments, no live API calls exist anywhere in `apps/web` at the end of this phase.
- No directory exists at `apps/web/app/api` — all server-side/business logic lives in `apps/api` (Decision #16).
