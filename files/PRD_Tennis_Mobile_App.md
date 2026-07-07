# Product Requirements Document (PRD)
## Luxury Tennis Discovery — Mobile App (MVP)

**Working name:** Tennis World Map (mobile)
**Document version:** 1.0
**Platform:** iOS & Android (Flutter recommended, single codebase)
**Stage:** MVP (corresponds to "Этап 5 — Мобильное приложение" but scoped as standalone MVP that ships in parallel with the web platform)

---

## 1. Executive Summary

A premium, cinematic mobile companion to a curated luxury tennis travel platform. The app lets affluent travelers and tennis enthusiasts **discover iconic and hidden tennis courts around the world** through a map-first experience, save aspirational destinations, unlock exact locations via a one-time paywall, and request a concierge consultation for higher-ticket travel needs.

The product is positioned closer to **Aman, Airbnb Luxe, and Apple TV travel documentaries** than to booking apps, Google Maps, or sports databases. Discovery comes first, emotion second, utility third.

---

## 2. Goals & Non-Goals

### 2.1 Product Goals
1. Deliver a **cinematic, premium discovery experience** in users' pockets.
2. Establish the brand as the **expert curator of unique tennis destinations** worldwide.
3. Drive two revenue streams: **one-time map unlock ($29)** and **concierge consultation requests** (lead gen for higher-ticket services).
4. Validate mobile-specific demand and engagement signals (DAU/MAU, save rate, unlock conversion).
5. Build a foundation that can extend into Stage 3 (concierge) and Stage 4 (community) without architectural rewrites.

### 2.2 Business Goals
- **Primary KPI:** Paywall unlock conversion ≥ 4% of map openers within 30 days of install.
- **Secondary KPIs:** Consultation request rate ≥ 1.5% of MAU; Day-7 retention ≥ 25%; average sessions/week ≥ 2 among unlocked users.
- **Brand KPI:** Net Promoter Score ≥ 50 among unlocked users at 60 days.

### 2.3 Non-Goals (explicitly out of scope for MVP)
- Court reservation / booking
- Real-time availability or calendar integration
- In-app payments for hotels, flights, or tournament tickets
- User-generated content (reviews, photos, messaging) — Stage 4
- Player matchmaking / partner finder — Stage 4
- AR or live court conditions
- Live chat with concierge (form-based only at MVP)

---

## 3. Target Users & Personas

### 3.1 Primary Persona — "The Tennis Aesthete"
- **Age:** 35–60
- **Income:** $200K+ household
- **Travels:** 4–8 international trips/year, often combining sport + leisure
- **Behavior:** Follows luxury travel media (Conde Nast Traveler, Robb Report), plays tennis 2–4×/week recreationally, screenshots beautiful courts on Instagram
- **Motivation:** Aspiration, exclusivity, story-worthy experiences
- **Pain:** Cannot easily find a curated, trustworthy source of beautiful tennis destinations without sifting through Google or generic travel blogs

### 3.2 Secondary Persona — "The Tournament Traveler"
- **Age:** 40–65
- **Behavior:** Travels to follow ATP/WTA tournaments (Wimbledon, Monte-Carlo, US Open), wants to play at iconic clubs around the events
- **Motivation:** Combining spectating + playing in legendary places

### 3.3 Tertiary Persona — "The Trip Planner"
- A travel advisor or affluent enthusiast planning a multi-stop trip for a partner, family, or small group; needs inspiration + concierge to make it real.

---

## 4. Core Product Philosophy

> **Discovery first. Emotion second. Utility third.**
>
> Users come for aspiration. Stay for exploration. Pay for access.

The app must feel **slow, cinematic, atmospheric, and premium** — never utility-first, never a sports database, never a booking funnel.

---

## 5. MVP Feature Scope

The MVP delivers seven core surfaces and one cross-cutting flow:

| # | Surface | Purpose |
|---|---|---|
| 1 | Onboarding | Establish luxury feeling and aspiration in first 30 seconds |
| 2 | Home | Inspiration + entry point to discovery |
| 3 | Map (core product) | Hierarchical world → court exploration |
| 4 | Court Detail | Emotional product page; conversion surface |
| 5 | Paywall / Subscription | One-time unlock for exact locations + full map |
| 6 | Saved | Personal aspirational collection (retention driver) |
| 7 | Profile | Membership state, settings, concierge entry |
| — | Consultation flow | Concierge lead form, reachable from court page, paywall, and profile |

### 5.1 What's IN
Home, Map, Court page, Paywall, Saved, Profile, Consultation form.

### 5.2 What's OUT (deferred)
Community, messaging, reviews, partner-finder, push notifications beyond transactional, in-app booking.

---

## 6. Detailed Feature Requirements

### 6.1 Onboarding

**Goal:** Establish luxury, exclusivity, and aspiration before the user sees a single feature.

**Screens:**
- **Splash:** Logo over cinematic video background, minimal loading animation, 2–3 seconds max.
- **Intro Slide 1:** "Discover iconic tennis destinations" — full-bleed cinematic tennis footage (clay court at dusk, infinity-edge resort court, etc.).
- **Intro Slide 2:** "Curated courts around the world" — globe / map visual hint.
- **Intro Slide 3:** "Unlock hidden tennis experiences" — locked-pin teaser.
- **CTA:** `Start Exploring` → lands user on Home (Map is one tap away).

**Behaviors:**
- Skippable from slide 1 via discreet `Skip` in upper-right.
- No sign-up required to enter the app. Account creation is **deferred until save or unlock** (reduces friction).
- Onboarding shown once per install; never again.

**Acceptance criteria:**
- First interactive frame within 3 seconds on a mid-tier device.
- Video assets streamed and cached; no white flash between slides.

---

### 6.2 Home

**Goal:** Inspire, set tone, funnel into the Map.

**Structure (vertical scroll):**
1. **Hero video section** — full-bleed looping cinematic, title overlay (`"11 islands · 50 countries · 1000 tennis courts"` or current brand statistic), primary CTA `Explore the Map`.
2. **Featured Destinations slider** (horizontal) — 5–8 hero locations, large cards with image + name + country.
3. **Featured Courts** (vertical list or 2-up grid) — editorial selection of the month.
4. **Collections** (horizontal pill row → grid):
   - Coastal Courts
   - Desert Courts
   - Hidden Resorts
   - Historic Clubs
   - Mountain Courts
   - Rooftop & Urban
5. **Editorial Inspiration** (optional, 2–3 cards) — guides/articles teaser.
6. **Footer CTA** — `Open World Map`.

**UX rules:**
- No more than one CTA visible per fold.
- Generous whitespace; large typography; minimal chrome.
- All imagery 16:9 or 4:5; no square thumbnails.
- Scroll feels weighty (slight inertia tuning on Flutter `BouncingScrollPhysics` / iOS-native feel on both platforms).

**Acceptance criteria:**
- Initial render ≤ 1.5s on mid-tier device with cached imagery.
- Video autoplays muted, pauses when offscreen, never blocks scroll.

---

### 6.3 Map Screen (Core Product)

**This is the centerpiece of the MVP.**

**Layout:**
- **Top bar:** Search field (court / city / country), filter icon, profile icon.
- **Filter chips (horizontal scroll):** All · Resorts · Clubs · Academies · Private · Indoor · Scenic
- **Map canvas:** Full-bleed interactive map with custom minimal style (monochrome / desaturated, brand-aligned — see Design Prompt).
- **Bottom sheet (expandable):** Card list of pins currently visible.

**Map navigation logic — hierarchical zoom:**

| Level | Zoom | Shows |
|---|---|---|
| 1 — World | Min zoom | Continent clusters with court counts (e.g., `Europe (40)`, `Asia (25)`) |
| 2 — Region | Country-level | Countries inside continent with counts (`Spain (12)`, `France (8)`) |
| 3 — City | Metro-level | Cities / areas (`Lake Como`, `Capri`, `Dubai`) |
| 4 — Court | Max zoom | Individual pins: **open**, **locked**, **featured** |

**Pin states:**
- **Open** (free preview): tappable, opens court page with full content but with **map location obscured to ~10km radius** until unlocked.
- **Locked** (premium): tappable, opens court page with blurred location; tap triggers paywall.
- **Featured:** larger or differently-styled pin, surfaces in carousels.

**Court card preview (bottom sheet):**
- Hero image
- Court name
- Region
- Short teaser (one sentence)
- `View Court` button

**Interactions:**
- Pinch to zoom triggers smooth transitions between levels (animated, not stepped).
- Tap on cluster zooms one level in, centered on cluster.
- Tap on pin opens bottom sheet card; tap card opens Court Detail.
- Search supports court name, city, country, region.

**Acceptance criteria:**
- Map renders 200+ pins without dropping below 50 FPS on mid-tier device.
- Cluster-to-pin transition animation ≤ 400ms.
- Filter changes update visible pins within 200ms.

---

### 6.4 Court Detail Page

**Goal:** Emotional product page; primary conversion surface.

**Structure (vertical scroll):**
1. **Fullscreen hero media** — looping video OR image carousel (swipeable, 5–10 images), no chrome over media except a discreet back button and save icon.
2. **Court name** — large display type.
3. **Location** — region + country; **exact location masked with "Unlock to reveal" overlay** for non-paying users.
4. **Short description** — ~600–800 characters, editorial tone.
5. **Image gallery** — full-width gallery, tappable to expand.
6. **Map preview** — small embedded map; **shows ~10km approximate area** for free users (a soft circle, no pin); shows exact pin for unlocked users.
7. **Related Courts** — horizontal carousel of 3–5 nearby or thematically-linked courts.
8. **CTA section (sticky on scroll up):**
   - Primary: `Unlock Full Access` (if not unlocked)
   - Secondary: `Request Consultation`
   - If already unlocked: primary becomes `Get Directions` (opens native maps with exact coords).

**Acceptance criteria:**
- Hero media loads progressively (blur-up); never blank.
- Gallery supports pinch-to-zoom.
- Save icon updates state optimistically with offline queue.

---

### 6.5 Paywall / Subscription

**Goal:** Convert engaged users with a clear, premium one-time offer.

**Pricing model (MVP):** One-time payment of **$29 for lifetime access** to exact locations + full curated map. (Subscription model is a Stage-2/3 decision — keep architecture ready, but ship one-time at MVP.)

**Structure:**
1. **Luxury hero visual** — full-bleed, cinematic.
2. **Headline:** `Unlock The Tennis World Map`
3. **Benefits list (icons + short copy):**
   - Exact locations for 120+ curated courts
   - Full global map with all hidden destinations
   - Premium collections (Coastal, Desert, Hidden, Historic)
   - Editorial guides
   - Future concierge access (priority placement)
   - Lifetime access
4. **Price block:** `$29 · One-time · Lifetime`
5. **Primary CTA:** `Unlock Full Access`
6. **Secondary CTA:** `Request Consultation` (for users who want more than just unlock)
7. **Trust row:** Secure payment icons, restore-purchase link, terms link.

**Behaviors:**
- Native IAP on iOS (StoreKit 2) and Google Play Billing on Android.
- Restore Purchases visible on profile and on paywall footer.
- Server-side receipt validation.
- Entitlement tied to user account (account creation prompted at purchase time if not signed in).

**Edge cases:**
- Failed payment: clear, non-alarming message; retry CTA.
- Already unlocked: paywall is unreachable from app (CTA replaced with `Explore the Map`).

**Acceptance criteria:**
- IAP flow completes in ≤ 3 taps from CTA.
- Entitlement reflected across devices within 5 seconds of successful purchase (with login).

---

### 6.6 Saved Screen

**Goal:** Retention through aspirational collection-building.

**Structure:**
1. **Saved Courts** — grid of saved court cards (image + name + location).
2. **Saved Collections** — user-created or system collections of courts (e.g., "Honeymoon 2026", "Italian Lakes").
3. **Recently Viewed** — horizontal carousel of last 10 viewed courts.
4. **Travel Wishlist** — aggregated map showing all saved courts as a personal globe.

**Interactions:**
- Save / unsave from court card, court detail, map bottom sheet.
- Create collection from saved courts (long-press → add to collection).
- Tap Travel Wishlist to open a personalized version of the map filtered to saved items.

**Acceptance criteria:**
- Saves persist locally and sync to server within 5s when online.
- Empty state is beautiful and inspiring, not a dead-end (`Start exploring →` CTA).

---

### 6.7 Profile Screen

**Goal:** Account management, concierge access, settings.

**Structure:**
1. **Profile image + name** (optional; email if no name set).
2. **Membership status:** `Free` or `Lifetime Member` badge.
3. **Saved Locations** count.
4. **Subscription / Membership** row → manage IAP, restore purchases.
5. **Contact Concierge** → opens Consultation form.
6. **Settings:** notifications, privacy, language (EN at launch; design tokens ready for i18n), terms, privacy policy, support email.
7. **Sign out / Delete account** (App Store requirement).

---

### 6.8 Consultation Flow

**Goal:** Lead capture for higher-ticket concierge revenue.

**Entry points:** Court page CTA, Paywall secondary CTA, Profile row.

**Form fields:**
- Name (optional if logged in)
- Email (required, pre-filled if logged in)
- Destination interest (free text + autocomplete on countries/cities in database)
- Travel period (date range picker, optional)
- Skill level (Beginner / Intermediate / Advanced / Pro — pill select)
- Group size (Solo / Couple / Family / Group — pill select)
- Additional request (multi-line free text)
- `Submit`

**On submit:**
- Confirmation screen: cinematic visual + "We'll be in touch within 24 hours."
- Email notification to concierge ops mailbox.
- Stored in CRM (Stage 1 backend choice — see §9.2).

**Acceptance criteria:**
- Form validates before submit; inline errors.
- Submission works offline (queued, sent when reconnected).
- Confirmation never feels like a generic web form.

---

## 7. Information Architecture & Navigation

**Bottom tab bar (MVP):**
```
[ Home ]   [ Map ]   [ Saved ]   [ Profile ]
```

**Cross-cutting modals:**
- Paywall (full-screen modal, dismissible with subtle X)
- Consultation form (full-screen modal)
- Court Detail (full-screen push, not tab-bar-hiding)

**Deep linking:** Court pages, collections, and the paywall must be deep-linkable (universal links iOS, App Links Android) for marketing and email campaigns.

---

## 8. User Flows

### 8.1 Primary Discovery Flow
```
Splash → Onboarding (first install) → Home
       → Tap Featured Destination → Court Detail
       → Save (prompts account if not signed in)
       → Back to Home
```

### 8.2 Conversion Flow (Paywall)
```
Home → Map
     → Zoom into region (e.g., Lake Como)
     → Tap locked pin → Court Detail (location masked)
     → Tap "Unlock Full Access" → Paywall
     → Complete IAP → Success state → Court Detail with exact location revealed
```

### 8.3 Consultation Flow
```
Court Detail → "Request Consultation"
            → Consultation form (pre-filled with destination)
            → Submit → Confirmation
            → Back to Court Detail
```

### 8.4 Saved → Plan Flow
```
Saved tab → Travel Wishlist
         → Opens personalized Map view of saved courts
         → Tap "Request Consultation" from saved set
         → Form pre-filled with destination shortlist
```

---

## 9. Technical Requirements

### 9.1 Platform & Stack (recommended)
- **Framework:** Flutter (single codebase, native performance for map and video)
- **State management:** Riverpod or MobX (consistent with team patterns)
- **Map:** Mapbox SDK (custom style support critical for premium look) or Mapwiz; fallback to Google Maps with heavy custom styling
- **Video:** `video_player` + `cached_video_player` for hero loops
- **Imagery:** CDN-backed (Cloudflare Images or imgix) with on-the-fly resizing
- **Payments:** RevenueCat (abstracts StoreKit + Play Billing, server-side receipts)
- **Analytics:** Mixpanel or Amplitude + Firebase Crashlytics
- **Auth:** Magic link email + Apple Sign-In + Google Sign-In
- **Deep links:** Branch.io or Firebase Dynamic Links

### 9.2 Backend (MVP)
- **CMS for courts/collections/guides:** Sanity, Strapi, or Directus — editorial workflow critical
- **API:** REST or GraphQL gateway in front of CMS
- **CRM for leads:** HubSpot (free tier) or Pipedrive — receives consultation submissions via webhook
- **Receipt validation & entitlements:** RevenueCat
- **Image/video storage:** S3 + CloudFront, or Mux for video

### 9.3 Performance Targets
- Cold start to first interactive: ≤ 2.5s on iPhone 12 / Pixel 6
- Map FPS: ≥ 55 sustained while panning/zooming with 200 pins
- Image load: progressive with blur-up; full image ≤ 1.5s on 4G
- App size: ≤ 60 MB on first install

### 9.4 Offline Behavior
- Last-viewed courts cached and viewable offline (text + cached images).
- Saved list available offline.
- Map: cached tiles for last-viewed regions; pins for cached areas usable offline.
- Consultation submissions queued offline.

### 9.5 Privacy & Compliance
- Apple App Tracking Transparency (ATT) prompt
- GDPR-compliant consent flow for analytics (EU users)
- Privacy policy, terms of service, account deletion (in-app, App Store requirement)
- No location tracking without explicit permission; location only used for "Courts near me" feature (post-MVP) and never sold

### 9.6 Internationalization
- EN at launch; structure ready for RU, FR, IT, ES (no hardcoded strings; use `intl` / `easy_localization`).
- All currency displays support locale formatting.

---

## 10. Content Requirements

### 10.1 Launch Content Bar
- **Minimum 80 curated courts** across 30+ countries.
- **5+ collections** (Coastal, Desert, Hidden, Historic, plus one seasonal).
- **3–5 editorial guides** for SEO/inspiration.
- **Hero video** (15s loop, multiple alternates for variety).
- **Per-court assets:** 1 hero image (16:9 minimum 2560×1440), 5+ gallery images, 1 short description (600–800 char), location metadata, court type, surface type, indoor/outdoor.

### 10.2 Tone of Voice
- Editorial, slow, evocative.
- Avoid superlatives stacked on superlatives ("incredible amazing breathtaking" — no).
- Reference travel writing tradition (Wallpaper*, Cereal magazine, Aman editorial).
- Avoid sports-jargon ("smash", "ace", "rally") unless contextually meaningful.

---

## 11. Analytics & Instrumentation

### 11.1 Key Events to Track
| Event | Properties |
|---|---|
| `app_open` | source, is_first_session |
| `onboarding_complete` | seconds_to_complete |
| `home_cta_explore_map` | — |
| `map_pin_tap` | court_id, pin_state (open/locked/featured) |
| `court_view` | court_id, source (home/map/search/related) |
| `court_save` | court_id |
| `paywall_view` | source (court/map/profile) |
| `paywall_cta_tap` | — |
| `purchase_complete` | price, currency |
| `purchase_failed` | error_code |
| `consultation_submit` | source, destination |
| `search_query` | query, results_count |

### 11.2 Funnels to Monitor
- Install → Onboarding complete → Map open → Court view → Save
- Court view → Paywall view → Purchase complete (conversion rate)
- Court view → Consultation submit (lead rate)

---

## 12. Success Metrics (90 days post-launch)

| Metric | Target |
|---|---|
| Installs | 5,000 |
| Day-1 retention | ≥ 45% |
| Day-7 retention | ≥ 25% |
| Day-30 retention | ≥ 15% |
| Avg sessions/week (engaged users) | ≥ 2 |
| Paywall view → purchase | ≥ 8% |
| Court view → save | ≥ 12% |
| Consultation form submissions | ≥ 75 |
| App Store rating | ≥ 4.5 |

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Map performance with custom style + many pins | Pre-test with 500-pin dataset on mid-tier devices; use clustering aggressively |
| Apple/Google rejection over locked map content (perceived value) | Ensure free tier has genuinely useful preview content (~20% of courts fully visible) |
| Low unlock conversion at $29 one-time | A/B test price points $19/$29/$39 in test market post-launch |
| Content production bottleneck (80+ courts at launch) | Lock content scope at week 1; freelance editorial team contracted ahead of build |
| Concierge inquiries with no ops team to handle | Auto-responder with 24-hour SLA; partnered with a single luxury travel agency at launch |

---

## 14. Release Plan

### 14.1 Phase A — Build & Internal Alpha (Weeks 1–8)
- Setup, design system, onboarding, Home, Map (basic), Court Detail.
- Internal alpha on TestFlight + Play Internal Testing by week 8.

### 14.2 Phase B — Feature Complete (Weeks 9–11)
- Paywall + IAP, Saved, Profile, Consultation flow.
- Closed beta with 50 invited users (existing web waitlist).

### 14.3 Phase C — Polish & Submission (Weeks 12–13)
- Performance pass, content finalization, App Store assets, submission.

### 14.4 Phase D — Launch (Week 14)
- Public launch on iOS + Android simultaneously.
- Press outreach to luxury travel and tennis lifestyle media.

---

## 15. Open Questions

1. **Pricing:** One-time $29 vs. annual subscription $19/year — which tests better with target persona? **Recommendation:** ship one-time, plan A/B test for month 2.
2. **Account creation timing:** Force at install vs. defer until save/unlock? **Recommendation:** defer.
3. **Apple Sign-In as primary:** Required if any third-party login offered — keep email magic-link + Apple + Google.
4. **Mapbox vs. Google Maps:** Mapbox preferred for style flexibility; cost at scale needs monitoring.
5. **Video assets:** licensed footage vs. commissioned shoots — affects launch timing.

---

## 16. Appendix — Sitemap Diagram

```
App
│
├── Onboarding (one-time)
│   ├── Splash
│   └── Intro Slides (1, 2, 3) → "Start Exploring"
│
├── [Tab 1] Home
│   ├── Hero Video Section
│   ├── Featured Destinations Slider
│   ├── Featured Courts
│   ├── Collections (Coastal, Desert, Hidden, Historic, …)
│   └── Open World Map CTA
│
├── [Tab 2] Map
│   ├── Search Bar
│   ├── Filter Chips
│   ├── Map Canvas (4 zoom levels: World → Region → City → Court)
│   └── Bottom Sheet (court card list)
│       └── Court Card → Court Detail
│
├── [Tab 3] Saved
│   ├── Saved Courts
│   ├── Saved Collections
│   ├── Recently Viewed
│   └── Travel Wishlist (personalized map)
│
├── [Tab 4] Profile
│   ├── Membership status
│   ├── Saved count
│   ├── Subscription / Restore Purchases
│   ├── Contact Concierge
│   └── Settings
│
├── Court Detail (modal/push from any tab)
│   ├── Hero Media
│   ├── Name + Location
│   ├── Description
│   ├── Gallery
│   ├── Map Preview
│   ├── Related Courts
│   └── CTA: Unlock / Consultation
│
├── Paywall (modal)
│   ├── Hero visual
│   ├── Benefits
│   ├── Price
│   └── CTA: Unlock Full Access
│
└── Consultation Form (modal)
    ├── Fields
    ├── Submit
    └── Confirmation
```

---

**End of PRD.**
