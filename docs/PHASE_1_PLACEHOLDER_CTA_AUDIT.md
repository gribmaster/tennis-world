# Phase 1 — Placeholder CTA Audit

**Status:** Living QA artifact. Originally produced during the Feature 23 Phase-1 visual/link QA
pass; **refreshed after Feature 24 (Paywall modal), Feature 25 (Consultation modal), Feature 26
(cleanup/audit pass), Feature 29 (static pages — About / Privacy / Terms), Feature 30 (auth
screens — Sign In / Sign Up, UI-only), Feature 33 (user-collection detail route — read path),
Feature 34 (user-collection mock repository mutation seam — repository-only, no UI wiring),
Feature 35 (Create-Collection modal — Saved "New Collection" wired to the mock seam),
Feature 36 (Court Detail "Add to Collection" menu — `toggleCourtInCollection` wired, plus
create-from-menu), Feature 37 (user-collection detail "Rename" — `renameUserCollection`
wired mock-only, the last seam method), and — in **Phase 5** — Feature 64 (court-detail
"Get Directions" wired to the real entitled `directionsUrl`; see §4) and Feature 67 (Paywall
modal checkout → real hosted Stripe Checkout; Profile/Footer portal + Restore → Stripe Customer
Portal; see §2)**
to reflect the current true state. (Phase-5 handoff: `PHASE_5_COMPLETION_SUMMARY.md`.)
**Scope:** Every Phase-1 web CTA / control that is intentionally inert (a placeholder) because the
behavior it represents belongs to a later phase. Implemented routes (`/`, `/map`, `/courts/[slug]`,
`/collections`, `/collections/[slug]`, `/journal`, `/journal/[slug]`, `/saved`,
**`/saved/collections/[slug]`**, `/profile`, `/about`, `/privacy`, `/terms`, `/signin`, `/signup`)
all resolve and are **not** listed here.

**What changed in Features 24–26:** the Paywall and Consultation flows are no longer inert. Every
membership/unlock CTA now opens the **shared Paywall modal** via `<PaywallTrigger>`, and every
consultation CTA now opens the **shared Consultation modal** via `<ConsultationTrigger>`. Both modals
are **presentational only** (no checkout, no backend/CRM/email) — real unlock is Phase 4, real
consultation submit is Phase 2/5. The rows below that *remain* `href="#"`/`disabled` are the genuine
leftovers (directions, account/auth, restore purchase, folder creation).

**What changed in Feature 29:** the footer **Company** column is no longer a placeholder. About,
Privacy, and Terms now point at **real static routes** (`/about`, `/privacy`, `/terms`), and Contact
is a real **`mailto:hello@tennisworld.app`**. These rows have been removed from the static-pages
placeholder list below. (The Privacy/Terms copy is intentionally *placeholder legal text* — that is a
content caveat carried in the page itself, not an inert control.)

**What changed in Feature 30 (auth screens, UI-only):** the `/signin` and `/signup` screens now
exist as **UI-only** routes — there is **no real auth**: no fetch, no API, no session, no cookies,
no JWT, no OAuth, no localStorage, no persistence (Decision #11 — auth is Phase 4). Three things
follow for this audit:
  1. The **nav user-icon** (`AppHeader`) and the **profile "Sign In"** affordance now point at the
     real `/signin` route while the mock `isLoggedIn` is `false` — they resolve and are **not**
     placeholders. (`isLoggedIn` is a hardcoded local constant, not a session.)
  2. The **profile menu's Privacy / Terms** rows now point at the real `/privacy` and `/terms`
     routes (the profile-menu rewire that Feature 29 deferred to here) — **removed** from the
     placeholder list below.
  3. New inert auth controls are recorded below (§5): the **Apple / Google** buttons are inert
     Phase-4 OAuth placeholders, and the **magic-link / Create-Account submit** is a **UI-only local
     success toggle** ("Check your inbox" / "Confirm your email"), **not** real auth.
  4. **Sign Out** stays a placeholder — there is still no session to end in Phase 1.

**What changed in Feature 33 (user-collection detail — read path):** the
**`/saved/collections/[slug]`** route now exists — the per-folder detail view for a user's OWN
wishlist collection (ported from `files/collection.html`, the *singular* prototype; distinct from the
editorial `/collections/[slug]` per the FEATURE_32 guardrail). It is **READ-ONLY**: it resolves a
folder + its member courts through `repositories.saved.getUserCollectionBySlug(slug)` and renders the
shared `CourtCard` grid (or an empty state). Three things follow for this audit:
  1. The **Saved → Collections rows** (`SavedCollectionRow`) are no longer static — each row is now a
     `<Link>` to `/saved/collections/{slug}` and resolves. They are **not** placeholders.
  2. The prototype's inline **"Rename"** affordance is rendered as a **disabled placeholder** on the
     detail hero (visual parity only) — folder rename is a Phase-4 mutation, **not** implemented here.
     Recorded below (§5c).
  3. The prototype's per-card **"Remove from collection"** button is **not rendered at all** — court
     removal is a Phase-4 mutation, deliberately omitted from this read-only feature (no inert control
     to track; noted in §6).
No create/rename/remove/toggle mutation was added — `SavedRepository` gained only the read method
`getUserCollectionBySlug`. The Saved **"New Collection"** button stays a disabled stub.

**What changed in Feature 34 (user-collection mock mutation seam — repository-only):** the
**`SavedRepository` mutation seam now exists**. The mock repository
(`apps/web/src/domain/saved/mock-saved.repository.ts`) gained three **mock-only, in-memory**
methods — `createUserCollection(name)`, `toggleCourtInCollection(collectionId, courtId)`, and
`renameUserCollection(collectionId, name)` — that mutate the singleton mock's in-memory folder
state (seeded by cloning `DEFAULT_USER_COLLECTIONS`). This is a deliberate, documented relaxation
of the early-Phase-1 "read-only" stance (FEATURE_28 §4, §7): **still NO backend, NO API, NO
auth/session, NO localStorage, NO persistence** — the state is demo-only and may reset across server
reloads. The HTTP implementation is Phase 4.

**Crucially, NO UI was wired to the seam in Feature 34 — the controls below stay exactly as they
were after Feature 33.** Specifically:
  1. The Saved **"New Collection"** button is **still a disabled stub** — the Create-Collection
     modal that calls `createUserCollection` is **Feature 35** (not yet built).
  2. The user-collection detail **"Rename"** affordance is **still a disabled placeholder** — wiring
     it to `renameUserCollection` is deferred (not done here).
  3. The per-card **"Remove from collection"** button is **still not rendered** — wiring it to
     `toggleCourtInCollection` is deferred (not done here).
  4. The Court Detail **"Add to Collection"** menu (`SaveToCollectionMenu`, which would call
     `toggleCourtInCollection`) is **not implemented** — that is **Feature 36** (not yet built).
So the seam is callable in principle, but **no user-facing create / rename / remove / toggle is
live**; all four controls remain inert/absent exactly as recorded below.

**What changed in Feature 35 (Create-Collection modal — Saved "New Collection" wired):** the
Saved → Collections **"New Collection"** button is **no longer a disabled stub**. It is now a
**`<CreateCollectionTrigger>`** (a client island in `features/user-collections/`) that opens the
**`CreateCollectionModal`** — a portalled, accessible dialog mirroring the Paywall / Consultation
modal conventions (role="dialog", aria-modal, Escape + backdrop close, focus-into-modal /
focus-restore, body-scroll lock). On submit it calls the **mock-only** seam
`repositories.saved.createUserCollection(name)` (Feature 34, in-memory) and the created folder is
mirrored into the Saved → Collections list for the session (held in `SavedTabs`'s local state, so a
new row appears immediately). This is still **mock-only**: **NO backend, NO app/api, NO auth/session,
NO localStorage, NO persistence** — a created folder is demo-only and **may reset on reload / server
restart**. Three scope boundaries hold:
  1. **Rename** stays a **disabled placeholder** on the user-collection detail hero (the
     `renameUserCollection` seam exists but is **not** wired — see §5c). Not implemented here.
  2. **Remove from collection** (per-card) stays **not rendered** (the `toggleCourtInCollection`
     seam exists but is **not** wired — see §5c / §6). Not implemented here.
  3. The Court Detail **"Add to Collection" menu** (`SaveToCollectionMenu`) is still **not
     implemented** — that remains **Feature 36**. `toggleCourtInCollection` is not called from Court
     Detail. No auth/session was added.

**What changed in Feature 36 (Court Detail "Add to Collection" menu — `toggleCourtInCollection`
wired):** the Court Detail CTA panel (`features/court-detail/CourtDetailCtaPanel.tsx`) now renders a
**`<SaveToCollectionMenu>`** — a client island ported from the `SaveToCollectionMenu` prototype in
`files/home.html` / `files/map.html`. It is a dropdown anchored to an "Add to Collection" button that
lists the user's wishlist folders, each with a checkmark showing whether **this court** is in that
folder, and a **"New collection"** action. Behavior:
  1. **Toggle membership** — clicking a folder row calls the **mock-only** seam
     `repositories.saved.toggleCourtInCollection(collectionId, courtId)` (Feature 34, in-memory) and
     updates **local client state** immediately. The menu stays open so several folders can be toggled
     in one pass. There is **NO fetch, NO `router.refresh`, NO server re-read** after a toggle.
  2. **Create from the menu** — "New collection" opens the **Feature 35** `CreateCollectionModal`
     (reused directly). On submit it creates a folder via `createUserCollection` (mock-only), appends
     it to the menu's local list, and **adds the current court to the new folder** (calls
     `toggleCourtInCollection` for it, shown checked) — matching the prototype's `createCollection`,
     which seeds the new folder with the open court.
  3. **Data fetch** — the menu data is fetched **on the server** in `app/courts/[slug]/page.tsx`
     (`repositories.saved.getSavedCollections()` for the folder list and a new narrow read
     `getCollectionIdsForCourt(court.id)` for the initial checkmark state) and passed down as props.
     `page.tsx` stays the only repository boundary on the screen; the client never fetches.
This is still **mock-only**: **NO backend, NO app/api, NO auth/session, NO localStorage, NO
persistence** — membership changes are demo-only and **may reset on reload / server restart** (the
mock has separate server/browser in-memory instances; after mount the menu's local state is the source
of truth for the checkmarks, so the divergence is invisible to the user). Three scope boundaries hold:
  1. The Court Detail / CourtCard **Save heart** is **unchanged** — still visual-only (no
     global save/unsave toggle was added; this feature is collection membership only).
  2. **Rename** stays a **disabled placeholder** on the user-collection detail hero (see §5c). Not
     touched here.
  3. **Remove from collection** (per-card on the user-collection detail page) stays **not rendered**
     (see §5c / §6). Not touched here. (Membership *can* now be removed from the Court Detail menu by
     un-checking a folder — but the per-card remove on the folder-detail page is still omitted.)

**What changed in Feature 37 (user-collection detail "Rename" — `renameUserCollection` wired):** the
user wishlist-folder detail hero (`features/user-collection-detail/UserCollectionHero.tsx`) now mounts
a small **`<UserCollectionRename>`** client island in its title slot, replacing the Feature 33/34
**disabled placeholder**. It ports the inline rename from `files/collection.html`'s
`CollectionDetailPage`: a **"Rename"** ghost button swaps the title for an inline edit field
(prefilled with the current name) plus **Save** / **Cancel**. Behavior:
  1. **Save** — disabled while the trimmed name is **empty or unchanged**; on Save it calls the
     **mock-only** seam `repositories.saved.renameUserCollection(collection.id, name)` (Feature 34,
     in-memory). The visible title updates immediately **from the returned DTO's `name`** (not from a
     server re-read). Enter (while valid) submits; Escape cancels.
  2. **Slug / route** — `renameUserCollection` re-derives the folder `slug` from the new name, so the
     slug can change. After a successful Save the island calls **`router.replace('/saved/collections/'
     + updated.slug)`** so the URL matches the new slug. It uses **`router.replace`** (not `push`, so
     Back doesn't return to the stale old-slug URL) and **NOT `router.refresh`**, **no fetch**, **no
     server re-read**. (The client/server mock instances diverge — the browser mock has the rename,
     the server mock does not — but the title is already correct from local state, so the replace is a
     pure history swap; the divergence is invisible to the user, exactly as in Feature 36.)
  3. **Page stays server-rendered** — `app/saved/collections/[slug]/page.tsx` is unchanged in shape:
     it still server-reads via `getUserCollectionBySlug(slug)` and passes the DTO down. No server
     action, no `app/api`, no fetch was added; the only mutation is the client-side rename above.
This is still **mock-only**: **NO backend, NO app/api, NO auth/session, NO localStorage, NO
persistence** — a rename is demo-only and **may reset on reload / server restart**. Two scope
boundaries hold:
  1. **Remove from collection** (per-card on this folder-detail page) stays **not rendered** (see §5c
     / §6). Not touched here.
  2. The Court Detail **"Add to Collection" menu** (Feature 36) is **unchanged**. Article-detail
     **Share** stays a disabled placeholder. (The Paywall **checkout** CTA is now wired — Feature 67.)

**Hard rule reminder:** the remaining placeholders must stay placeholders. Do **not** replace any
`href="#"`/`disabled` below with a fake route, fake unlock, or fake behavior. Each row records the
real future implementation so Phase 2–4 work has a single reference.

---

## 1. How controls are currently rendered

| Form | Where used | Notes |
|---|---|---|
| `<PaywallTrigger>` (renders a `<button>`) | Home band, Court Detail ×2, Profile membership card, Footer ×2 | Opens the shared Paywall modal. Its primary CTA now starts a **real hosted Stripe Checkout** (**Feature 67**); the modal chrome is still presentational (**Feature 24**). |
| `<ManageBillingButton>` (renders a `<button>`) | Profile "Subscription & Purchases" row, Footer "Restore" | Opens the hosted Stripe **Customer Portal** via `billing.createPortalSession()`. A logged-out click → `/signin`. **Feature 67.** |
| `<ConsultationTrigger>` (renders a `<button>`) | Home band, Court Detail, Saved Wishlist map, Profile "Contact Concierge" | Opens the shared Consultation modal (presentational only — mock submit). **Feature 25.** |
| `<a href="#">` | Court Detail directions ×2, remaining inert Profile menu rows (Notifications/Language/Help) | Inert placeholder; clicking jumps to top of page. (Footer "Restore" and Profile "Subscription & Purchases" are **now the portal button** above — Feature 67. Footer Company links are real routes — Feature 29.) |
| `<button disabled>` | Article detail **Share**; the **Save** button of the user-collection Rename field *while the name is empty/unchanged*; Create-Collection modal primary CTA *while the name is empty* | Clearest "not active yet" affordance; visibly disabled. (Article Share — Feature 31; the Rename **Save** and the Create-Collection submit are only disabled until a valid name is typed, then they work — Features 37/35. The Paywall modal's checkout CTA is **no longer disabled** — Feature 67.) |
| `<CreateCollectionTrigger>` (renders a `<button>`) | Saved → Collections "New Collection" | Opens the Create-Collection modal; on submit creates a folder via the **mock-only** `repositories.saved.createUserCollection` seam (in-memory — no backend/auth/persistence). **Feature 35.** |
| `<SaveToCollectionMenu>` (renders a `<button>` + dropdown) | Court Detail CTA panel "Add to Collection" | Opens a dropdown of the user's folders (checkmark = court is in folder); toggling a row calls the **mock-only** `repositories.saved.toggleCourtInCollection` seam (in-memory) with optimistic local state — no fetch, no `router.refresh`. "New collection" reuses the Create-Collection modal and adds the current court to the new folder. **Feature 36.** |
| `<UserCollectionRename>` (renders a `<button>` → inline edit field) | User-collection detail hero "Rename" | "Rename" swaps the title for an inline input (prefilled); **Save** calls the **mock-only** `repositories.saved.renameUserCollection` seam (in-memory), updates the title from the returned DTO, and `router.replace`s to the (possibly new) slug — no fetch, no `router.refresh`. **Feature 37.** |
| `<button>` (inert, no handler) | `/signin` + `/signup` **"Continue with Apple" / "Continue with Google"** | Inert OAuth placeholders — render for parity; clicking does nothing (no OAuth in Phase 1). **Feature 30.** |
| `<form onSubmit>` (UI-only) | `/signin` magic-link form; `/signup` name+email form | `preventDefault` + required-field guard, then flips to a **local success state** ("Check your inbox" / "Confirm your email"). NO fetch, NO API, NO session. **Feature 30.** |

The Paywall / Consultation / Create-Collection triggers are the client islands; their host pages
(and, for Create-Collection, the already-client `SavedTabs`) stay otherwise presentational and just
render the trigger where the inert CTA used to be.

---

## 2. Paywall / membership CTAs

The Paywall modal **is now built** (Feature 24). Every membership/unlock CTA opens it, and — as of
**Feature 67** — the modal's own primary CTA now starts a **real hosted Stripe Checkout** (the three
paywall-adjacent controls in the "Still inert" table below are **no longer inert**; see the note after
it). Still **no Stripe.js / publishable key / price id in the browser** — the client sends only a plan
KEY and navigates to an opaque hosted `url`. The gold `btn-premium` variant is reserved for these.

| Label | File / component | Current behavior | Future phase |
|---|---|---|---|
| Unlock Full Access | `features/home/HomePaywallBand.tsx` | **`<PaywallTrigger source="home">`** (gold `btn-premium`) | Phase 4: modal's checkout → Stripe → `Entitlement` (`kind=lifetime_unlock`). |
| Unlock Full Access | `features/court-detail/CourtDetailCtaPanel.tsx` (locked branch) | **`<PaywallTrigger source="court-detail">`** (`btn-premium`) | Phase 4; gated by `userRepository.getEntitlementStatus()`. |
| Unlock Full Access | `features/court-detail/CourtDetailLocationPreview.tsx` (locked overlay) | **`<PaywallTrigger source="court-detail-location">`** (`btn-premium`) | Phase 4; on unlock, reveal exact location (server-side masking boundary, Risk #2/#17). |
| See Membership | `features/profile/ProfileMembershipCard.tsx` | **`<PaywallTrigger source="profile">`** (`btn-premium`) | Phase 4 membership management. |
| Unlock — $29 | `components/layout/Footer.tsx` (Membership column) | **`<PaywallTrigger source="footer">`** | Phase 4 (modal's checkout). |
| What's included | `components/layout/Footer.tsx` (Membership column) | **`<PaywallTrigger source="footer">`** | Membership info — the modal already lists the benefits, so this opens the same modal. |

**NOW WIRED (Feature 67 — these three were previously inert):**

| Label | File / component | Current behavior |
|---|---|---|
| Checkout (modal primary CTA) | `features/paywall/PaywallModal.tsx` → `features/billing/PaywallCheckoutButton.tsx` | Starts a `'lifetime'` hosted Stripe Checkout via `billing.createCheckout('lifetime')` and navigates to the returned `url` (loading/error/auth-redirect states). Was `<button disabled>`. |
| Subscription & Purchases | `features/profile/ProfileMenuList.tsx` → `ProfileMenuRow` (`action:'portal'`) → `features/billing/ManageBillingButton.tsx` | Opens the hosted Stripe Customer Portal via `billing.createPortalSession()`. A logged-out click → `/signin`; a failure shows a calm inline error. Was `<a href="#">`. |
| Restore | `components/layout/Footer.tsx` (Membership column) → `ManageBillingButton` (`hideError`) | Opens the same Customer Portal (where a returning user restores/manages a purchase). Footer stays quiet on error. Was `<a href="#">`. |

The post-checkout landing is `/billing/return` (`features/billing/BillingReturn.tsx`) — re-reads `/v1/me`,
tolerates the webhook-vs-redirect race with a bounded "processing" poll, and handles `?status=cancelled`.
No inert paywall/portal placeholder remains.

---

## 3. Consultation CTAs

The Consultation modal **is now built** (Feature 25, presentational only). Every consultation CTA
opens it via `<ConsultationTrigger>`. The mock submit path (`consultationRepository.submit()`) and the
CRM webhook are later (Phase 2 endpoint / Phase 5 webhook).

| Label | File / component | Current behavior | Future phase |
|---|---|---|---|
| Request Consultation | `features/home/HomePaywallBand.tsx` | **`<ConsultationTrigger source="home">`** (outline-over-dark) | Phase 2: `consultationRepository.submit()` → `POST /v1/consultations`. |
| Request a Consultation | `features/court-detail/CourtDetailCtaPanel.tsx` | **`<ConsultationTrigger source="court-detail">`** (`btn-secondary`) | Same modal / submit path. |
| Plan a Trip | `features/saved/SavedWishlistMap.tsx` | **`<ConsultationTrigger source="saved">`** (`btn-primary`) | Same modal; no exact coordinate is passed (coordinate safety, Risk #17). |
| Contact Concierge | `features/profile/ProfileMenuList.tsx` → `ProfileMenuRow` (`action="consult"`) | **`<ConsultationTrigger source="profile">`** | Same modal (the prototype's `onConsult`). |

---

## 4. Location / directions CTAs → **NOW WIRED for entitled viewers (Feature 64)**

Exact location and directions depend on the server-side coordinate-masking boundary (Risk #2, #17):
Phase 2 landed the data, and **Phase 5 (Features 63/64)** landed the entitlement gating. In `api`
mode, for a signed-in **entitled** viewer the court-detail page fetches
`GET /v1/me/courts/:slug/exact-location` (the ONLY coord-bearing endpoint) and sets the "Get
Directions" href to the **server-built `directionsUrl`** (a Google Maps deep link — the raw
`lat`/`lng` never reach a component). For a **non-entitled / logged-out** viewer the court stays
`locked` (paywall path), and in **mock mode** (or an unlocked court with no exact-location fetch) the
CTA falls back to the prior inert `href="#"` placeholder — so nothing regresses. `locked` is derived
from the real endpoint at the page level (replacing the old `unlocked = false` constant). See
`PHASE_5_COMPLETION_SUMMARY.md` §6.

| Label | File / component | Current behavior |
|---|---|---|
| Get Directions | `features/court-detail/CourtDetailCtaPanel.tsx` (unlocked branch) | Entitled viewer: real `<a href={directionsUrl} target="_blank" rel="noopener noreferrer">` (`btn-primary`). Mock / no exact-location: inert `href="#"` fallback. **Feature 64.** |
| Get Directions | `features/court-detail/CourtDetailLocationPreview.tsx` (unlocked) | Same: real `directionsUrl` link for an entitled viewer (`btn-secondary`), inert `href="#"` fallback otherwise. **Feature 64.** |

---

## 5. Account / settings / auth CTAs → **Phase 4 (auth) / later (settings)**

No **real** auth, no session, no settings backend in Phase 1 (Decision #11). The settings rows below
render for visual parity with the prototype's profile menu and **remain** `href="#"` placeholders.
The auth *screens* (`/signin`, `/signup`) now exist (Feature 30) but are **UI-only** — their inert
controls are tracked below.

**Footer Company links are NOT here (Feature 29):** About → `/about`, Privacy → `/privacy`, Terms →
`/terms` are real static routes, Contact a real `mailto:`. **Profile-menu Privacy / Terms are no
longer here either (Feature 30):** they now point at the real `/privacy` / `/terms` routes and
resolve. **The profile "Sign In" affordance** also resolves now — it links to the real `/signin`
route (shown while the mock `isLoggedIn` is `false`), so it is **not** a placeholder.

| Label | File / component | Current behavior | Future phase |
|---|---|---|---|
| Continue with Apple | `features/auth/SignInForm.tsx` + `SignUpForm.tsx` | `<button>` inert (no handler) | Phase 4: real Apple OAuth. Inert in Phase 1 (no OAuth). |
| Continue with Google | `features/auth/SignInForm.tsx` + `SignUpForm.tsx` | `<button>` inert (no handler) | Phase 4: real Google OAuth. Inert in Phase 1 (no OAuth). |
| Send Magic Link (submit) | `features/auth/SignInForm.tsx` | `<form onSubmit>` → **UI-only local success** ("Check your inbox") | Phase 4: real magic-link email. NO fetch/API/session in Phase 1. |
| Create Account (submit) | `features/auth/SignUpForm.tsx` | `<form onSubmit>` → **UI-only local success** ("Confirm your email") | Phase 4: real account creation. NO fetch/API/session in Phase 1. |
| Sign Out | `features/profile/ProfileMenuList.tsx` → `ProfileMenuRow` (clay) | `<a href="#">` (shown only when the mock `isLoggedIn` is true) | Phase 4 (auth) — no session to end in Phase 1. |
| Notifications | `ProfileMenuList.tsx` → `ProfileMenuRow` | `<a href="#">` | Phase 4+ (settings). |
| Language (English) | `ProfileMenuList.tsx` → `ProfileMenuRow` (value row) | `<a href="#">` | Phase 4+ (settings / i18n). |
| Help & Support | `ProfileMenuList.tsx` → `ProfileMenuRow` | `<a href="#">` | Later (static/help). |

---

## 5b. Article-detail Share → **deferred (sharing not in Phase 1)**

The Journal article-detail byline (`/journal/[slug]`, Feature 31) renders a **Share** button to
match `files/article.html`. It is an **inert placeholder** in Phase 1: rendered as a
**`<button disabled>`** with **no Web Share API, no clipboard, no analytics, no navigation**. A
future implementation could use the **Web Share API** (with a copy-link fallback) — explicitly **not**
implemented now.

| Label | File / component | Current behavior | Future phase |
|---|---|---|---|
| Share | `features/journal-detail/ArticleByline.tsx` | `<button disabled>` inert — no Web Share API, no clipboard, no analytics | Later: Web Share API with a copy-link fallback. |

---

## 5c. User-collection detail controls → **deferred (folder mutations not in Phase 1)**

The user wishlist-folder detail page (`/saved/collections/[slug]`, Feature 33) ships one mutation —
**Rename** (Feature 37, mock-only) — and otherwise renders the folder + member courts read-only.
**Rename is no longer a placeholder**: it is wired to the `SavedRepository.renameUserCollection` seam
(Feature 34, in-memory) via the `<UserCollectionRename>` client island in the hero. The per-card
Remove is still **not rendered**. The prototype's mutating affordances are now handled as follows:

| Label | File / component | Current behavior | Future phase |
|---|---|---|---|
| Rename | `features/user-collection-detail/UserCollectionRename.tsx` (mounted in `UserCollectionHero.tsx`) | **WIRED (Feature 37)** — "Rename" opens an inline edit field (prefilled); **Save** (disabled while the trimmed name is empty/unchanged) calls the **mock-only** `repositories.saved.renameUserCollection` seam, updates the title from the returned DTO, and `router.replace`s to the new slug. No fetch, no `router.refresh`, no server re-read. **Not a placeholder.** | Phase 4 swaps the mock for the auth-backed `PATCH /v1/me/collections/:id` behind the same interface — the UI does not change. |
| Remove from collection (per-card) | *(not rendered)* | The prototype's per-card remove button is **omitted entirely** — no inert control exists | `toggleCourtInCollection` is now wired **from the Court Detail menu** (Feature 36, un-check a folder), but the **per-card remove on this folder-detail page** stays **not rendered** — that specific control is deferred; Phase 4 adds auth. |

---

## 6. Out-of-scope confirmations (verified during this pass)

These are **not** placeholders to "fix" — they are correct Phase-1 behavior, recorded so a future
reviewer doesn't mistake them for gaps:

- **`SavedCollectionsGrid` "New Collection"** — **now wired (Feature 35)**: a
  `<CreateCollectionTrigger>` that opens `CreateCollectionModal` and creates a folder via the
  mock-only `repositories.saved.createUserCollection` seam (Feature 34). It is **no longer a disabled
  stub** — but it is still **mock-only** (no backend, no auth, no persistence; a created folder is
  demo-only and may reset on reload / server restart). The created folder is mirrored into the
  visible Collections list for the session via `SavedTabs` local state (no global state, no
  localStorage). Correct.
- **`SavedCollectionRow`** — now a `<Link>` to the real `/saved/collections/{slug}` route (Feature
  33). A real navigation CTA, **not** a placeholder. Read-only: no rename/remove on the row. Correct.
- **`UserCollectionDetail` per-card "Remove"** — **not rendered** (Feature 33 read-path only). The
  prototype's per-card remove is a folder mutation deliberately omitted; there is no inert control to
  mistake for working. The `toggleCourtInCollection` seam is now wired **from the Court Detail
  "Add to Collection" menu** (Feature 36), but the **per-card remove on this page** is still not
  rendered. Correct.
- **`CourtCard` save heart** — the `CourtCard` primitive itself stays visual-only (`showSaved`/
  `saved`, no `onClick`) so its use in non-savable contexts (Home/Map/related strips) is clean.
  **Standalone save/unsave is now WIRED** in the two savable surfaces (Saved-court flow audit —
  see `docs/SAVED_COURTS_SMOKE_TEST.md`): the **Court Detail** CTA panel renders a `CourtSaveButton`
  client island (POST/DELETE `/v1/me/saved-courts` via `SavedRepository.saveCourt`/`unsaveCourt`),
  and the **`/saved` Courts tab** (`SavedCourtsGrid`, now a client island) adds a per-card **Unsave**
  control. Both use the same auth pattern as `SaveToCollectionMenu` (optimistic; logged-out →
  `/signin`). This is distinct from collection *membership* (`toggleCourtInCollection`, Feature 36),
  which is unchanged. The API endpoints existed since Feature 54; this audit added the missing web
  repository methods + UI wiring.
- **"Unlock Map" header CTA** (`AppHeader`) — links to the real `/map` route (not a placeholder); a
  real navigation CTA driven by the `unlocked` prop. Correct.
- **Map / Wishlist map canvases** — stylized `.gmap` placeholders by design; no real map provider,
  no geolocation, pins from `mapCoords` only. Correct (Risk #17).
- **Consultation modal "date" input** (`ConsultationModal.tsx`) — `disabled` only when the
  "dates flexible" checkbox is checked; that is real form logic, not a placeholder. Correct.
- **Auth screens `/signin` + `/signup`** (`features/auth/*`) — UI-only. The forms `preventDefault`,
  guard on required fields, and flip to a **local** success state; the Apple/Google buttons are inert.
  No fetch, no API, no session, no cookies, no JWT, no OAuth, no localStorage. Correct (Decision #11).
- **`AppHeader` / `ProfileMenuList` `isLoggedIn`** — a hardcoded local `const false`, NOT a session,
  context, or provider. It only chooses the user-icon / Sign-In-vs-Sign-Out target. Correct.
- **No `apps/web/app/api` directory** — confirmed absent (Decision #16). Correct.

---

## 7. Summary (current true state)

| Category | Count | Status |
|---|---|---|
| Paywall / membership → Paywall modal | 6 CTAs (Home, Court Detail ×2, Profile card, Footer ×2) | **Wired to modal (Feature 24).** Presentational only. |
| Consultation → Consultation modal | 4 CTAs (Home, Court Detail, Saved, Profile Concierge) | **Wired to modal (Feature 25).** Presentational only. |
| Static pages → real routes | 4 footer Company links + 2 profile-menu rows (About, Privacy, Terms → routes; Contact → mailto) | **Wired to real routes (Features 29/30).** Privacy/Terms carry placeholder *legal copy*. |
| Auth screens → UI-only | 4 inert controls (Apple/Google ×2, magic-link/create submit ×2) | **UI-only (Feature 30).** Submit flips to a local success state; Apple/Google inert. No real auth. |
| Auth entry points → real route | 2 (nav user-icon, profile "Sign In") | **Wired to `/signin` (Feature 30)** while mock `isLoggedIn` is false. Resolve; not placeholders. |
| Location / directions | 2 controls | **Wired for entitled viewers (Feature 64)** — real `directionsUrl` link; inert `href="#"` fallback only in mock / non-entitled. |
| Account / settings (profile menu) | 3 controls (Notifications, Language, Help) | Still `href="#"` → Phase 4 (auth) / later (settings/help). |
| Sign Out | 1 (Profile, shown only when mock `isLoggedIn` true) | Still `href="#"` → Phase 4 (auth) — no session to end. |
| Restore purchase | 1 (Footer) | **Wired (Feature 67)** — opens the hosted Stripe Customer Portal via `ManageBillingButton` (footer suppresses its error). A logged-out click → `/signin`. |
| Subscription & Purchases | 1 (Profile) | **Wired (Feature 67)** — opens the hosted Stripe Customer Portal via `ManageBillingButton`. A logged-out click → `/signin`; failure shows a calm inline error. |
| Disabled stubs | 1 (Article-detail Share) | Intentionally `disabled` → later (Share via Web Share API). (The Paywall modal **checkout** CTA is **no longer here** — wired to real hosted Stripe Checkout in **Feature 67**. User-collection "Rename" was wired in Feature 37. The Rename **Save** button and the Create-Collection submit are disabled only until a valid name is typed, then they work.) |
| Create-Collection → mock seam | 2 (Saved "New Collection"; Court Detail menu "New collection") | **Wired (Features 35/36).** Both open `CreateCollectionModal`; submit calls the mock-only `createUserCollection` seam (in-memory). No backend/auth/persistence; the new folder is mirrored into local UI state (Saved Collections list / the Court Detail menu, which also adds the current court to it). |
| Add-to-Collection menu → mock seam | 1 (Court Detail "Add to Collection") | **Wired (Feature 36).** Dropdown of the user's folders with per-court checkmarks; toggling calls the mock-only `toggleCourtInCollection` seam (in-memory) with optimistic local state — no fetch, no `router.refresh`. Server-fetched in `page.tsx` (folders + `getCollectionIdsForCourt`). No backend/auth/persistence; may reset on reload. |
| User-collection detail → real route | 1 (`/saved/collections/[slug]`, reached from Saved → Collections rows) | **Real route (Feature 33).** Resolves; not a placeholder. **Rename now wired (Feature 37)** via a client island; per-card Remove still omitted. |
| Rename → mock seam | 1 (User-collection detail "Rename") | **Wired (Feature 37).** Inline edit field → **Save** calls the mock-only `renameUserCollection` seam (in-memory); title updates from the returned DTO and the URL `router.replace`s to the new slug. No fetch, no `router.refresh`, no server re-read. No backend/auth/persistence; may reset on reload. |
| User-collection mutation seam | 3 methods (`createUserCollection`, `toggleCourtInCollection`, `renameUserCollection`) | **Mock-only in-memory seam (Feature 34).** **All three are now wired:** `createUserCollection` (Features 35/36), `toggleCourtInCollection` (Feature 36, Court Detail menu), and `renameUserCollection` (Feature 37, user-collection detail). No backend/API/auth/localStorage/persistence. |

The Paywall and Consultation CTAs open real (presentational) modals; the footer Company links and the
profile-menu Privacy/Terms rows resolve to real static routes (Features 29/30); and the auth screens
(`/signin`, `/signup`) are UI-only with inert Apple/Google buttons and a local-only submit success.
All remaining `href="#"` and `disabled` controls are legitimately deferred to later phases — none
point at a fake route, none implement real auth, and none should be wired to real behavior in Phase 1.
