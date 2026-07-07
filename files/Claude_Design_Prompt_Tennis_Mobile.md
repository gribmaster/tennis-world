# Claude Design Prompt — Luxury Tennis Discovery Mobile App

> **How to use this prompt:** Paste this entire document into Claude (or any high-capability AI design tool) as a single, self-contained brief. It will generate the full mobile UI for the MVP. No external context required.

---

## Role & Mission

You are a **Senior Mobile Product Designer** with deep experience in **luxury travel apps** (Aman, Airbnb Luxe, Mr Porter, Goop, Hodinkee, Cereal magazine digital). Your task is to design a **complete, production-grade mobile UI** for a premium iOS/Android app that helps affluent travelers discover the world's most beautiful and exclusive tennis courts.

This is **not a sports app, not a booking app, not a database**. It is a **cinematic discovery experience** in the spirit of luxury travel editorial — slow, atmospheric, premium.

Deliver a **complete React (Tailwind) prototype as a single-file artifact** that renders all key screens, simulating a mobile device viewport (390×844, iPhone 14 baseline). All screens must be reachable via in-prototype navigation.

---

## Product One-Liner

> A curated, map-first discovery app for the world's most iconic and hidden tennis courts. Discover. Save. Unlock. Travel.

---

## Core Product Philosophy (memorize this)

> **Discovery first. Emotion second. Utility third.**
>
> Users come for aspiration. Stay for exploration. Pay for access.

If a design decision contradicts this hierarchy, **redesign it**.

---

## Brand & Aesthetic Direction

### References (study these, do not copy)
- **Aman.com** — pacing, restraint, photography-first
- **Airbnb Luxe** — premium card design, editorial card type
- **Mushacay.com** — full-bleed cinematic feel
- **Wallpaper\*** and **Cereal magazine** — editorial typography
- **Apple TV documentaries** — letterboxed cinematic feel
- **Hodinkee** — craft, restraint, generous whitespace

### Aesthetic must-haves
- **Generous whitespace** — never crowd
- **Cinematic full-bleed imagery** — images breathe, no thumbnails
- **Editorial typography** — serif for display, refined sans for UI
- **Slow, weighty motion** — transitions feel considered, not snappy
- **Restrained color palette** — monochrome base, single accent
- **Minimal chrome** — UI gets out of the way of content

### Aesthetic forbidden list
- ❌ Bright, saturated colors (no electric blue, no neon)
- ❌ Drop shadows everywhere
- ❌ Round corners > 16px on cards (subtle, not playful)
- ❌ Generic Material Design or vanilla iOS feel
- ❌ Stock-icon overload
- ❌ Square thumbnails or grid spam
- ❌ Crowded layouts (more than one primary CTA per fold)
- ❌ Sports-app energy (no court diagrams, scoreboards, racquet icons as primary UI)

---

## Design Tokens (use these exactly)

### Color Palette
```
--ink:          #0F0F0F   /* primary text, headlines */
--graphite:     #2A2A2A   /* secondary text */
--stone:        #6B6B6B   /* tertiary text, icons */
--mist:         #B8B8B6   /* dividers, disabled */
--bone:         #F5F2EC   /* primary background — warm off-white, NOT pure white */
--ivory:        #FAF8F3   /* card backgrounds */
--clay:         #B95C3A   /* accent — clay-court terracotta, used SPARINGLY */
--moss:         #4A5D3F   /* secondary accent — used for "open" pin states */
--gold:         #B89968   /* premium accent — paywall, lifetime badge only */
--paper:        #FFFFFF   /* pure white reserved for media overlays */
--shadow:       rgba(15, 15, 15, 0.08)  /* subtle shadow for elevated cards */
```

**Rule:** 95% of the UI should live in ink/graphite/stone/bone/ivory. Clay and gold are precious — use only for CTAs, premium states, and key brand moments.

### Typography
```
Display (serif):     "Cormorant Garamond" or "Canela" — h1, hero titles
Subhead (serif):     "Cormorant Garamond" — court names, section titles
Body (sans):         "Inter" weights 300–500 — body copy, UI
Caption (sans):      "Inter" 400 letter-spacing 0.04em — eyebrows, metadata
```

**Type scale (mobile):**
```
Display XL:   44px / 48px line-height / 300 weight / -0.02em tracking
Display L:    32px / 38px / 300 / -0.02em
Display M:    24px / 30px / 400 / -0.01em
Headline:     20px / 26px / 500 / 0
Body L:       17px / 26px / 400 / 0
Body M:       15px / 22px / 400 / 0
Body S:       13px / 20px / 400 / 0
Caption:      11px / 16px / 500 / 0.08em uppercase
```

### Spacing scale
```
4, 8, 12, 16, 20, 24, 32, 40, 56, 80
```

Use generously. Default vertical rhythm between sections: 40–56px on mobile.

### Radii
```
sm:   4px   /* chips, buttons */
md:   8px   /* small cards */
lg:   12px  /* medium cards */
xl:   16px  /* large cards, sheets */
none: 0     /* hero imagery — sharp edges */
```

### Elevation
- Use **borders + warm background contrast** instead of drop shadows where possible.
- One subtle shadow allowed: `0 4px 24px rgba(15,15,15,0.08)` for floating elements like the map bottom sheet.

### Motion
- **Page transitions:** 400ms ease-out
- **Bottom sheet:** 350ms cubic-bezier(0.32, 0.72, 0, 1) — iOS-feel
- **Image fades:** 600ms ease-out
- **Hover/press states:** 150ms ease
- **Default:** if in doubt, slower than you think

---

## Asset Sourcing (CRITICAL — read before designing)

**All imagery, video, and visual assets must come from free, openly-licensed sources. Do NOT generate images with AI tools, and do NOT use placeholder boxes or solid color blocks where photography is called for.**

### Approved sources
- **Photography:** Unsplash (`unsplash.com`), Pexels (`pexels.com`), or Pixabay (`pixabay.com`) — all CC0 / free commercial use
- **Video (for hero loops, used as poster images only in prototype):** Pexels Video, Coverr.co, Mixkit
- **Maps:** Mapbox tiles with a custom style, or static map screenshots from OpenStreetMap

### How to reference images in the prototype
- **Preferred** (deterministic, stable): direct Unsplash photo URLs like
  `https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80`
- **Acceptable** (keyword-based, results may vary): `https://source.unsplash.com/800x600/?tennis-court,luxury`

### Suggested keyword pool
`tennis-court`, `clay-court`, `grass-court`, `luxury-resort`, `infinity-pool`, `lake-como`, `capri`, `morocco-marrakech`, `bali-villa`, `mediterranean-coast`, `mountain-resort`, `desert-architecture`, `english-countryside`, `cypress-trees`, `terracotta-walls`

### Hero video treatment in prototype
Do NOT embed real video files. Use a high-quality still image with a subtle play-icon overlay (`▷`) and a "0:00 / 0:15" caption to communicate "this is a video in production". The cinematic feel comes from photography choice, gradient overlays, and typography — not from playing video.

### Forbidden
- ❌ AI-generated imagery (Midjourney, DALL-E, Stable Diffusion outputs)
- ❌ Stock photos with visible watermarks
- ❌ Generic placeholder services (placeholder.com, picsum.photos) — they break the premium feel
- ❌ Random gradient blocks or color swatches where a real image is specified

---



All screens render inside a **390×844 viewport** simulating an iPhone 14. Show:
- Status bar (time, signal, battery)
- Home indicator at bottom (4px wide, 134px long, centered)
- Bottom tab bar **above** home indicator (height 83px including safe area)

For Android consistency, the same layout applies — bottom nav has 56px content height + 16px safe area.

---

## Information Architecture

**Bottom tab bar (always visible on top-level screens, hidden on modals):**
```
[ Home ]   [ Map ]   [ Saved ]   [ Profile ]
```

Use **outlined icons at rest, filled when active**. Active state uses `--ink` color. Inactive: `--stone`. Active label visible; inactive label visible at reduced contrast.

---

## Screens to Design (in order)

You must produce **complete, pixel-final mockups** for every screen below. Each screen reachable from the previous via working in-prototype navigation.

### 1. Splash Screen
- Centered logotype in `--bone` over fullbleed cinematic video poster image (use a placeholder of a clay court at golden hour — visually evocative)
- Logotype: serif wordmark "TENNIS WORLD" in `--paper` at 24px, 0.2em tracking, 300 weight
- Below logotype: thin horizontal line, 1px, 24px wide, `--paper` at 60% opacity
- 2 seconds → fade to first onboarding slide

### 2. Onboarding (3 slides)
- Each slide is **fullbleed cinematic background image** with overlay gradient (linear, bottom: rgba(15,15,15,0.7) → top: transparent)
- Content bottom-aligned, 56px from bottom:
  - Eyebrow caption ("CHAPTER 01") in `--paper` at 11px tracking 0.08em
  - Headline in Display L, `--paper`, 300 weight
  - Subhead in Body L, `--paper` at 80% opacity
- Slide indicator: 3 thin lines, 24px wide, 1px tall, active state full white, inactive 30% white
- Skip button top-right, Body S, `--paper` at 70%
- Final slide CTA: `Start Exploring` — full-width button, `--paper` background, `--ink` text, 56px tall, 0 radius (sharp edges), uppercase caption tracking
- **Background imagery suggestions:**
  - Slide 1: Clay court at dusk with cypress trees (Italy)
  - Slide 2: Aerial of an oceanside court (Maldives/Caribbean)
  - Slide 3: Vintage grass court with empty wooden chairs (English country club feel)

### 3. Home Screen

**Top bar (transparent, over hero):**
- Logo word mark left
- Search icon right

**Hero section (top, 100vh):**
- Fullbleed looping video (use poster: dramatic court image)
- Bottom-aligned content over gradient overlay:
  - Eyebrow: `THE WORLD OF TENNIS`
  - Headline (Display XL, `--paper`): "Where the game meets the extraordinary"
  - Stat line (Body M, `--paper` 80%): "50 countries · 1,000 courts · endless inspiration"
  - CTA pill: `Explore the Map →` — outlined `--paper` border, transparent fill, Body M, 12px vertical padding, 24px horizontal

**Section 1 — Featured Destinations (horizontal carousel):**
- Section header eyebrow: `DESTINATIONS`
- Section title (Display M): "This week, we're dreaming of…"
- 6 cards, horizontal scroll, **first card peeks the next** (290px wide, 380px tall, 16px gap)
- Card: full-bleed image, gradient overlay at bottom, country name in caption + court name in Headline serif over image
- Cards sample content:
  - Lake Como, Italy — "Grand Hotel Tremezzo"
  - Capri, Italy — "Hotel Punta Tragara"
  - Marrakech, Morocco — "Royal Mansour"
  - Mallorca, Spain — "Belmond La Residencia"
  - Bali, Indonesia — "Como Shambhala"
  - Aspen, USA — "The Little Nell"

**Section 2 — Editor's Cut (vertical stack):**
- Section eyebrow: `EDITOR'S CUT`
- Section title: "Where they're playing this season"
- 3 large cards, full-width, stacked vertically (16:11 image + content below image on `--ivory` card)
- Each card has: court name (Display M serif), region (caption), short pull quote (Body M italic)

**Section 3 — Collections (horizontal pills + grid):**
- Section eyebrow: `COLLECTIONS`
- Section title: "Curated journeys"
- 6 collection cards in 2-column grid (square aspect):
  - Coastal Courts (ocean horizon image)
  - Desert Courts (Middle East / Morocco image)
  - Hidden Resorts (jungle / remote)
  - Historic Clubs (English wood + green)
  - Mountain Courts (alpine snow + clay)
  - Rooftop & Urban (city skyline)
- Each card: image, dark gradient overlay, name in serif white at bottom-left, count caption below ("12 courts")

**Section 4 — Editorial Inspiration (optional 2 cards):**
- Section eyebrow: `JOURNAL`
- Section title: "Reading list"
- 2 article teaser cards: image + headline + reading time

**Footer CTA:**
- Full-width section, `--bone` background, 80px vertical padding
- Centered Display L: "Begin your journey"
- Centered subhead Body L `--stone`: "Explore the world's most extraordinary tennis destinations"
- Centered button `Open World Map →` — `--ink` bg, `--paper` text, 56px tall

### 4. Map Screen (Core Product)

**Top bar (sticky, over map):**
- Background: `--bone` with 1px bottom border `--mist`
- Search field: pill-shaped, `--ivory` bg, placeholder "Search courts, cities, countries", left magnifying glass icon
- Filter icon right (3 horizontal lines, with a small dot indicator if filters active)

**Filter chips row (horizontal scroll, below top bar):**
- Pill chips, 36px tall, 16px horizontal padding, 1px `--mist` border, transparent bg
- Active chip: `--ink` background, `--paper` text, no border
- Chips: `All · Resorts · Clubs · Academies · Private · Indoor · Scenic`

**Map canvas (occupies remaining vertical space):**
- Custom map style:
  - Land: `--bone`
  - Water: `--mist` at 40%
  - Borders: 0.5px `--stone` at 30%
  - Labels: serif font, `--graphite`, restrained density
- Map pins:
  - **Open pin** (free, full content): small circle, `--moss` fill, `--paper` ring, 14px
  - **Locked pin** (paywall required): same as open but with a small lock glyph overlay, `--graphite` fill
  - **Featured pin** (editorial highlight): larger 18px, `--clay` fill, subtle pulse animation
  - **Cluster** (zoomed out, multiple courts): larger circle with count number in serif type
- Country/region labels at low zoom: serif Display M, `--graphite`
- Zoom levels demonstrate the 4-tier hierarchy (World → Region → City → Court)

**Bottom sheet (peeks at 120px, expandable to 60vh):**
- Drag handle at top: 36px wide, 4px tall, `--mist`, 12px from top
- Header: "Courts in view" (Caption) + count
- Horizontal scroll of court cards at peek state:
  - 240px wide, 280px tall
  - Image top 16:11, name + region below on `--paper`
  - Tap → opens Court Detail
- When expanded: vertical list of full court rows

### 5. Court Detail Screen

**Hero (top, 100vh):**
- Fullbleed image carousel (5–7 images, swipeable, page indicator dots bottom-center)
- Image overlay gradient (subtle, bottom 30% only)
- Top-left back arrow `--paper`, 44px tap target
- Top-right save (heart) and share icons, `--paper`, with subtle background blur capsules

**Content (scrolls up over hero):**
- Card sheet rises with sharp top corners, `--bone` background
- 32px from top edge of sheet:
  - Eyebrow caption: country, comma, region (`ITALY · LAKE COMO`)
  - Court name in Display XL serif (e.g., "Grand Hotel Tremezzo")
  - Below name (24px gap): 4 metadata pills in a row — surface (Clay), setting (Lakefront), access (Resort), indoor/outdoor (Outdoor)
  
- **Location row (with lock):**
  - Section eyebrow `LOCATION`
  - For free users: blurred map preview (16:9), centered "Unlock to reveal exact location" overlay with lock icon, `Unlock Full Access` CTA button below
  - For unlocked users: full map preview with pin, `Get Directions` CTA

- **Description block:**
  - Eyebrow `ABOUT THIS COURT`
  - Body L copy, ~600 chars, serif italic pull-quote treatment for first line, then editorial paragraph in sans

- **Gallery:**
  - Eyebrow `THE COURT`
  - 2×2 grid + 1 wide image (5 total), tappable, opens fullscreen viewer

- **Related courts:**
  - Eyebrow `IF YOU LOVE THIS, YOU'LL LOVE`
  - Horizontal scroll of 4 small court cards (180px wide)

- **Bottom sticky CTA section:**
  - Primary: `Unlock Full Access` (or `Get Directions` if unlocked) — `--ink` bg, `--paper` text, full width, 56px tall
  - Secondary: `Request a Consultation` — `--paper` bg, `--ink` text, 1px `--ink` border, full width, 56px tall

### 6. Paywall Screen (full-screen modal)

- Close (X) top-right, 44px tap target, `--paper`
- Top hero (60% viewport): fullbleed cinematic court image with gradient overlay (heavy at top and bottom)
- Center hero content:
  - Small `--gold` line, 32px wide, 1px thick
  - Eyebrow `MEMBERSHIP` (caption, `--gold`)
  - Display XL `--paper`: "The world, unlocked."
- Bottom 40% (on `--bone`):
  - Headline (Display M, `--ink`): "What you'll discover"
  - 6 benefit rows, each:
    - Custom small line-icon (no generic check marks — minimal serif tick or thin geometric symbol) in `--clay`
    - Text in two lines: bold short title (Body L 500) + descriptive subtitle (Body S `--stone`)
    - Benefits:
      1. **Exact locations** — Pinpoint coordinates for 120+ curated courts
      2. **The full atlas** — Every hidden destination on the global map
      3. **Premium collections** — Coastal, Desert, Hidden, Historic, more
      4. **Editorial guides** — Insider notes from those who've played there
      5. **Concierge priority** — Skip the line on travel consultations
      6. **Lifetime access** — One payment, every future destination included
  - Price block: centered, 32px vertical padding
    - Caption: `ONE-TIME PAYMENT`
    - Price: Display XL `--ink` "$29"
    - Below: Body S `--stone` "Lifetime access · No recurring fees"
  - Primary CTA: `Unlock Full Access` — `--ink` bg, `--paper` text, 56px tall, full width
  - Secondary CTA: `Request a Consultation` — text link, Body M, `--stone`
  - Footer fine print: `Restore Purchases` · `Terms` · `Privacy` in Caption, centered, `--stone`

### 7. Saved Screen

**Top bar:**
- Title "Saved" in Display M serif
- Right: edit / select icon

**Tab strip (segmented):**
- 3 tabs: `Courts` · `Collections` · `Wishlist Map`
- Active: underline 2px `--ink`, ink text. Inactive: stone text.

**Courts tab (default view):**
- 2-column grid, 8px gap
- Cards: 16:11 image, name + region below on `--paper`, small saved heart in upper-right
- Filter row above grid: `All · Recently Saved · By Country`

**Collections tab:**
- Vertical list of user collections
- Each row: 3-image stacked mini-grid preview (left), collection name + count (right)
- Empty state: cinematic illustration + "Create your first collection — Group courts by trip, season, or dream"
- `+ New Collection` floating button bottom-right (subtle, not material FAB — pill button with `--ink` bg, `--paper` text)

**Wishlist Map tab:**
- Mini-version of the main Map showing only saved courts as pins
- "Plan a trip" CTA at bottom — opens Consultation form pre-filled

### 8. Profile Screen

**Top section (`--ivory` background):**
- 32px padding
- Avatar circle (top-left), 64px, with serif initial if no photo
- Name in Headline serif right of avatar
- Below: membership badge:
  - Free user: small caption `EXPLORER · FREE`
  - Member: small badge with `--gold` thin border and gold text `LIFETIME MEMBER`

**Stats row:**
- 3 columns: `Saved Courts (n)` · `Collections (n)` · `Countries Explored (n)`
- Numbers in Display M serif, labels in Caption below

**Menu (vertical list, each row 56px):**
- `Subscription & Purchases` (chevron right)
- `Contact Concierge` (chevron right)
- `Notifications` (chevron right)
- `Language` (chevron right + current value "English")
- `Help & Support` (chevron right)
- `Privacy` (chevron right)
- `Terms` (chevron right)
- `Sign Out` (no chevron, `--clay` text)

**Footer:**
- Logo wordmark, version number in Caption, `--stone`, centered

### 9. Consultation Form (full-screen modal)

- Close X top-right
- Top: serif Display L title "A bespoke recommendation"
- Subhead Body L `--stone`: "Tell us about the trip you're dreaming of. We respond within 24 hours."

- Form (each field 56px tall, label above in Caption):
  - Email field (pre-filled if signed in)
  - Destination field with autocomplete chips
  - Travel period (date range picker, optional toggle "Flexible")
  - Skill level: 4 pill chips (`Beginner · Intermediate · Advanced · Pro`)
  - Group size: 4 pill chips (`Solo · Couple · Family · Group`)
  - Additional request: multi-line textarea, 4 lines visible, "Anything specific you'd love?"

- Submit button at bottom, sticky: `Submit Request` — full-width, `--ink` bg, `--paper` text, 56px tall

- Confirmation state:
  - Fullbleed serene image (clay court at dawn)
  - Centered text in `--paper`:
    - Eyebrow `RECEIVED`
    - Display L "We'll be in touch soon."
    - Body L "A member of our team will reach out within 24 hours."
  - CTA: `Return to Exploring` (outlined `--paper`)

---

## Cross-Screen Components

### Court Card (used throughout)
- Image always 16:11 (or 4:5 for vertical contexts)
- Name in Headline serif, 1 line, ellipsis if needed
- Region in Caption tracking 0.08em uppercase, `--stone`
- Optional saved heart top-right, 32px tap target
- Optional `LOCKED` pill if locked court — `--graphite` bg, `--paper` caption text, top-left

### Section Header
```
EYEBROW CAPTION (Caption, --stone, uppercase tracking 0.08em)
Section title in serif (Display M, --ink)
```
Always 56px above content. Eyebrow + title pair never separated.

### Buttons

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `--ink` | `--paper` | none | Main CTAs |
| Secondary | `--paper` | `--ink` | 1px `--ink` | Secondary actions |
| Ghost | transparent | `--ink` | none | Tertiary links |
| Over-image | transparent | `--paper` | 1px `--paper` | CTAs over photos |
| Premium | `--gold` | `--ink` | none | Reserved for paywall ONLY |

All buttons: 56px tall (mobile primary), Body M weight 500, no uppercase except caption-style. Press state: 96% scale + 8% opacity overlay.

### Form Fields
- Background `--ivory`, no border at rest, 1px `--ink` border on focus
- 56px tall, 16px horizontal padding
- Label as Caption above field, never floating

---

## Interaction & Motion Notes

- **Tab switch:** no slide, just opacity crossfade 200ms
- **Push navigation:** 400ms ease-out from right
- **Modal:** slides up from bottom, 350ms cubic-bezier(0.32, 0.72, 0, 1)
- **Bottom sheet drag:** physical feel, slight overshoot
- **Image fade-in:** blur-up (low-res placeholder → sharp) over 600ms
- **Save heart:** quick scale-pop 1.0 → 1.2 → 1.0 in 250ms, color fill at apex
- **Pin tap on map:** 200ms scale 1.0 → 1.15 → 1.0
- **Paywall reveal:** unlock CTA triggers a slow lock-icon-opens animation (1s) before pushing back to Court Detail with location now revealed

---

## Accessibility

- All tap targets ≥ 44×44 pt
- Color contrast WCAG AA minimum (AAA for body text)
- All imagery has descriptive alt text in code
- Dynamic Type support (text scales with system setting)
- VoiceOver labels for all icon-only buttons
- Reduce motion: replace transitions with crossfades when system flag set
- No critical info conveyed by color alone (locked state has icon + label, not just color)

---

## Sample Content for Renders (use these in the prototype)

**Featured courts to populate cards:**
- Grand Hotel Tremezzo — Lake Como, Italy
- Hotel Punta Tragara — Capri, Italy
- Royal Mansour — Marrakech, Morocco
- Belmond La Residencia — Mallorca, Spain
- Como Shambhala Estate — Bali, Indonesia
- The Little Nell — Aspen, USA
- Beit Al Bahar — Madinat Jumeirah, Dubai, UAE
- Cheval Blanc — Randheli, Maldives
- Aman Tokyo — Tokyo, Japan
- Soho Farmhouse — Cotswolds, UK
- Hotel du Cap-Eden-Roc — Antibes, France
- Six Senses Douro Valley — Lamego, Portugal

**Sample court description (Grand Hotel Tremezzo):**
> "Suspended above Lake Como's mirror-still water, the court at Grand Hotel Tremezzo is set within a century-old garden of cypress and bougainvillea. Players rally against a backdrop of the Grigne mountains and a horizon of pale stucco villas. After play, retreat to the lakeside terrace for a campari and the slow hours that follow."

**Sample collections:**
- Coastal Courts — 14 courts
- Desert Courts — 8 courts
- Hidden Resorts — 22 courts
- Historic Clubs — 11 courts
- Mountain Courts — 9 courts
- Rooftop & Urban — 6 courts

---

## Deliverables Checklist

Produce a **single React + Tailwind artifact** (HTML/JSX) that:

- [ ] Renders all 9 screens listed above
- [ ] Uses the exact color tokens, type scale, and spacing system defined
- [ ] Simulates 390×844 mobile viewport
- [ ] Includes working tab bar navigation between Home / Map / Saved / Profile
- [ ] Includes Court Detail reachable from Home cards and Map pins
- [ ] Includes Paywall reachable from any "Unlock" CTA
- [ ] Includes Consultation form reachable from Court Detail and Profile
- [ ] **All imagery must be sourced from free open-source providers — never AI-generated.** Use Unsplash (`https://images.unsplash.com/photo-{id}` direct links, or `https://source.unsplash.com/{w}x{h}/?{keywords}` for keyword-based) and/or Pexels (`https://images.pexels.com/photos/{id}/...`). For consistency, prefer direct photo IDs over keyword queries where possible. Suggested keyword queries: `tennis-court`, `luxury-resort`, `lake-como`, `clay-court`, `mediterranean-coast`, `morocco-architecture`, `bali-villa`. Hero videos should reference open-licensed clips from Pexels Video or Coverr.co — do not embed actual video files in the prototype; use a poster image with a play overlay as a stand-in.
- [ ] No square thumbnails — every image is 16:9, 4:5, or fullbleed
- [ ] Serif font loaded (Cormorant Garamond from Google Fonts is acceptable substitute for licensed faces)
- [ ] Lucide-react icons used only when necessary, never decoratively
- [ ] Subtle motion: at minimum, page transitions and bottom-sheet open/close
- [ ] Realistic content (use sample names/descriptions above, not lorem ipsum)
- [ ] No unused or "placeholder" UI elements visible to the user

---

## Acceptance Bar

The final design should make a viewer think:
- "This feels like a magazine, not an app."
- "I want to go there."
- "I would pay $29 without thinking."
- "This is for people who travel for the love of the place."

If the design instead reads as "tennis booking app" or "Google Maps for sports", **start over**.

---

## Final Note

This brief is intentionally exhaustive because the brand bar is high. When in doubt:
- **More whitespace, not less.**
- **Larger images, fewer of them.**
- **Serif headlines, never sans for display.**
- **Slow over snappy.**
- **One CTA per fold.**
- **Bone background, not white.**

Now design.
