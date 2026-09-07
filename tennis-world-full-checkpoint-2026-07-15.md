# Tennis World — Full Project Checkpoint

**Checkpoint date:** 2026-07-15  
**Project:** Tennis World  
**Primary app:** Web + API monorepo for a tennis courts discovery platform  
**Current staging web URL:** `https://tennis-world-web.vercel.app/`  
**GitHub repo:** `gribmaster/tennis-world.git`  
**Current local root:** `D:\work\tennis`

---

## 1. High-Level Product Summary

Tennis World is a tennis courts discovery platform. The MVP is a web app that lets users browse curated tennis courts, view court detail pages, save courts, browse collections, read editorial/journal articles, and eventually support premium/member-only content and user accounts.

The long-term direction is a multi-app product:

- `apps/web` — public/mobile-first web app, built with Next.js.
- `apps/api` — API backend, built with NestJS.
- `apps/admin` — admin panel placeholder for future content/data management.
- Mobile app later, likely Flutter.
- Shared data/contracts/mock data used across apps.

The app currently uses a mock/API switchable architecture. The data source can be set through environment configuration, and core UI was built to work against mock data first, then real API/database data.

---

## 2. Current Tech Stack

### Monorepo

- Package manager: `pnpm`
- Monorepo layout:
  - `apps/web`
  - `apps/api`
  - `apps/admin`
  - `packages/*`
- TypeScript across the project.

### Web App

- Framework: Next.js App Router
- Styling: Tailwind CSS
- UI direction: mobile-first, elegant editorial/tennis travel style
- Current deployment: Vercel
- Current staging domain: `https://tennis-world-web.vercel.app/`

### API

- Framework: NestJS
- API prefix: `/v1`
- Health endpoint exists and was used during setup.
- Deployed through Railway during staging setup.

### Database

- PostgreSQL
- Prisma ORM
- Local dev DB used Docker Postgres.
- Staging/prod DB used Railway/Supabase depending on environment stage.
- Prisma migrations have been applied to staging.

### Auth

- Email magic link / JWT auth foundation.
- Staging demo auth implemented later for client demo access.
- Auth cookie behavior and persistence were debugged extensively.
- Demo auth is staging-only and uses a fixed demo user.

### Hosting / Infrastructure

- Web: Vercel
- API: Railway
- DB: PostgreSQL, with Prisma migrations
- Static images now live in `apps/web/public/placeholders`

---

## 3. Main Product Areas

### Public / Browse

- Home page
- Court listing/cards
- Single court detail pages
- Collections
- Single collection pages
- Journal/articles
- Single article pages
- About page
- Privacy Policy / Terms pages expected or partially planned
- Saved page
- Sign in / Sign up pages

### User Features

- Sign in via magic link / auth flow
- Demo auth on staging for client preview
- Save court toggle
- Saved courts page
- User collections
- Add to collection flow
- Create collection page/design
- Profile icon behavior still needs a final check/fix if not already completed

### Future / Premium

- Membership/paywall groundwork exists.
- Entitlement model/stub exists.
- Paywall copy and membership mock data exist.
- Future premium features need product and billing decisions.

---

## 4. Repository / App Structure Notes

The project is a monorepo with multiple apps and shared packages.

Expected/known structure:

```txt
apps/
  api/
    prisma/
    src/
    package.json
  web/
    public/
      placeholders/
    src/
    next.config.mjs
  admin/
packages/
  contracts/
  mock-data/
```

Important shared package:

```txt
packages/mock-data
```

This package acts as a central source for court/article/collection mock data and now also local image helper data.

---

## 5. Phase 0 / Foundation Work Completed

The initial foundation included:

- Created multi-app monorepo structure.
- Added `apps/api` health endpoint.
- Added `apps/admin` placeholder.
- Created shared contracts/entities:
  - `Court`
  - `CourtSummary`
  - `Collection`
  - `Article`
  - `Consultation`
  - stub `User`
  - stub `Entitlement`
- Created mock data:
  - 12 courts
  - 6 collections
  - membership/paywall copy
  - articles
  - users
  - site stats
- Added repository boundary:
  - repositories factory
  - single access point
  - data source switch through `NEXT_PUBLIC_DATA_SOURCE=mock`
- Built web shell:
  - `AppShell`
  - `AppHeader`
  - `BottomNavigation`
  - `PageContainer`
- Built base UI:
  - `Button`
  - `SectionHeader`
  - `Badge`
- Built `CourtCard` with:
  - image
  - name
  - location
  - surface
  - access
  - scenic flag
  - locked/open/featured state
  - saved state
  - detail link
- Built Home hero and featured carousel.

---

## 6. Local Database / Docker / Prisma History

Local database work included:

- Docker Postgres was used.
- Initial local port `5432` conflicted.
- PostgreSQL was switched to port `15432`.
- Local DB connection string example:

```env
DATABASE_URL="postgresql://tennis:tennis@localhost:15432/tennis_world?schema=public"
```

- Container name used earlier:

```txt
tennis_world_pg
```

Useful local commands:

```powershell
docker ps
docker start tennis_world_pg
pnpm --filter @tennis/api prisma migrate deploy
pnpm --filter @tennis/api db:seed
```

Important issue encountered:

```txt
Can't reach database server at localhost:15432
```

Cause:

- Local DB container was not running.
- Or `DATABASE_URL` was still pointing to local DB when trying to update staging/prod DB.

Fix:

- Start local Docker DB if targeting local DB.
- Or set `DATABASE_URL` to staging/prod DB before running scripts.

---

## 7. Prisma / Migration History

During staging setup, Prisma migrations were applied.

Known applied migrations included:

```txt
20260626224118_init
20260629132232_add_article_author
20260629213155_add_user_collection_slug_magic_link_token
20260630000000_phase5_entitlement_groundwork
```

There was an early staging migration issue:

```txt
P3005
```

This was related to Prisma trying to migrate a non-empty/default schema. The project was switched to a schema setup that allowed migrations to apply correctly.

Important note:

- Be careful with production/staging DB.
- Do not reseed or reset unless the target DB is intended to be overwritten.
- Prefer targeted update scripts for content changes on staging/prod.

---

## 8. Railway Deployment History

Railway was used for API staging deployment.

Issues encountered and solved:

### Node / pnpm version mismatch

Railway initially used Node 20, but the project required newer Node for pnpm 11.

Problem:

```txt
pnpm 11 requires Node >=22.13
```

Fix:

- Configure Railway/build environment for suitable Node version.
- Ensure build process supports monorepo and `@tennis/api`.

### Start command missing

Railway initially did not know how to start the API.

Fix:

- Add or configure proper start command for `@tennis/api`.

### Prisma generate / build issues

Prisma generation and package build order needed attention.

Fix:

- Ensure `prisma generate` runs where needed.
- Ensure API package can build and run in Railway.

### CORS

API CORS was configured to allow the Vercel web domain.

---

## 9. Vercel Deployment History

Web app deployed to:

```txt
https://tennis-world-web.vercel.app/
```

Important notes:

- Web deployment works.
- Local placeholder images now deploy through `apps/web/public/placeholders`.
- Next.js local public paths are used:

```txt
/placeholders/<file-name>.jpg
```

- Production absolute URL example:

```txt
https://tennis-world-web.vercel.app/placeholders/<file-name>.jpg
```

But code/database should prefer relative URLs:

```txt
/placeholders/<file-name>.jpg
```

Reason:

- Relative paths work locally, on staging, and on production.

---

## 10. Auth / Login / Demo Auth Work

### Initial auth

The app has login/sign-in flows, including magic link based flow and JWT/session behavior.

During staging testing:

- Magic link email arrived.
- Session persistence was initially not reliable.
- Cookie settings were debugged:
  - `AUTH_COOKIE_SECURE=true`
  - SameSite behavior was investigated.
- There were issues with login not persisting correctly after redirect.

### Demo auth mode

A staging-only demo auth mode was implemented.

Purpose:

- Let a client click through the Vercel staging app without real login friction.
- Use a fixed free demo user.

Implementation summary:

- Feature 76 completed and verified end-to-end.
- Demo auth uses a fixed demo user.
- Demo user name: `Demo User`.
- Auth provider: `demo`.
- Staging-only flag / secret-based behavior.
- Header-based demo auth existed:
  - `X-Tennis-Demo-Auth`
  - secret-protected
- Normal JWT fallback remains.

Important rule:

- Demo auth must stay staging-only.
- Do not expose it publicly in production without strict gating.

### Login/profile icon issue

User later reported:

- When logged in, clicking the profile/user icon still linked to `/signin`.
- The icon should redirect to profile/account when logged in.
- Example current HTML seen:

```html
<a aria-label="Sign in" class="p-2 transition-colors text-bone/85 hover:text-bone" href="/signin">
  <svg ...></svg>
</a>
```

Desired behavior:

- If logged out: profile icon leads to `/signin`.
- If logged in: profile icon leads to `/profile` or account/profile page.
- This should be checked/fixed if not already done.

---

## 11. Data Source Modes

The app can use mock or API data.

Known env concept:

```env
NEXT_PUBLIC_DATA_SOURCE=mock
```

Mock data lives in:

```txt
packages/mock-data
```

API/database mode pulls from backend/DB.

Important:

- Some image/content changes must be updated in both mock data and database seed/update scripts.
- If the deployed app is using API/database mode, changing mock data alone does not change live DB rows.
- Existing DB rows require migration/update scripts.

---

## 12. Court / Content Data

Initial seed data included:

- 11 countries
- 12 regions
- 12 courts
- 30 court images

Court properties and display data include:

- name
- location
- surface
- access
- scenic state
- locked/open/featured flags
- image/hero/gallery data
- saved state
- detail URL/slug

Court detail pages include a gallery section:

```html
<section id="court-gallery">
```

---

## 13. Local Placeholder Images Update

A major update replaced external/Unsplash/CDN images with local placeholder images.

### Reason

The previous images from external CDN/Unsplash were bad/unrelated.

### Final image location

The images were moved to:

```txt
apps/web/public/placeholders
```

In Next.js, this means they are served as:

```txt
/placeholders/<file-name>.jpg
```

### Important rule

Do not use:

```txt
apps/web/placeholders
```

for public static paths.

Use:

```txt
apps/web/public/placeholders
```

### Files involved in image update

Reported changed files included:

```txt
packages/mock-data/src/images.ts
packages/mock-data/src/courts.ts
packages/mock-data/src/index.ts
apps/web/src/features/home/HomeHero.tsx
apps/web/src/features/home/HomePaywallBand.tsx
apps/web/src/features/collections/CollectionsHero.tsx
apps/web/src/features/static-pages/AboutPage.tsx
apps/web/src/components/court/CourtImage.tsx
apps/web/next.config.mjs
apps/api/prisma/update-court-images.ts
apps/api/package.json
```

### Important implementation details

- `packages/mock-data/src/images.ts` now contains:
  - `PLACEHOLDER_FILES`
  - `PLACEHOLDERS`
  - cyclic `placeholder(i)` helper
  - `FALLBACK_COURT_IMAGE`
  - semantic `IMG` keys mapped to local placeholders
- `packages/mock-data/src/courts.ts` now assigns:
  - distinct hero images for 12 courts
  - gallery slots using deterministic running cursor
  - no repeated gallery image assignment in initial dataset
- `CourtImage` component now has a fallback local placeholder.
- `apps/web/next.config.mjs` removed the now-unused Unsplash remote pattern.

### External image URLs intentionally left

These should remain:

```txt
apps/web/src/features/map/map-config.ts
```

Reason:

- These are OpenStreetMap/MapTiler tile URLs for Leaflet base map.
- They are not court/app content images.
- Replacing them with static JPGs would break the map.

Historical docs/prototypes may still contain external image references:

```txt
files/*.html
docs/*.md
```

These are not app runtime files.

---

## 14. Database Image Update Script

Because court images are pulled from the database/API, code changes alone do not update existing staging/prod DB rows.

A targeted script was created:

```txt
apps/api/prisma/update-court-images.ts
```

Package script added:

```txt
pnpm --filter @tennis/api db:update-images
```

Alternate direct command:

```powershell
cd apps/api
npx tsx prisma/update-court-images.ts
```

### What the script updates

The script updates only image-related records:

- `CourtImage.url`
- `Article.heroImageUrl`
- `Collection.coverImageUrl`

It does not delete or modify:

- users
- auth
- saved courts
- collections ownership
- entitlements
- unrelated production data

It is intended to be:

- safe
- idempotent
- deterministic

### Important command usage

To update staging/prod DB, the command must run with the staging/prod `DATABASE_URL`.

If `DATABASE_URL` is:

```env
DATABASE_URL="postgresql://tennis:tennis@localhost:15432/tennis_world?schema=public"
```

then it only targets local DB.

For staging/prod, set:

```powershell
$env:DATABASE_URL="postgresql://REAL_STAGING_OR_PROD_DB_URL"
pnpm --filter @tennis/api db:update-images
```

Do not paste real secrets into chat.

### Confirmed outcome

The user ran the script and reported:

```txt
заработало. найс.
```

Meaning:

- The image update script successfully ran after correcting DB target/environment.
- Staging/prod images should now come from `/placeholders/...`.

---

## 15. Court Detail Gallery Interactive Update

### Problem

On court detail pages, the section:

```html
id="court-gallery"
```

rendered:

- a main image
- thumbnails

But thumbnails did not switch the main image. The gallery was static.

### Desired behavior

Standard lightweight gallery:

- Main image
- Thumbnail row
- Clicking thumbnail changes main image
- Previous/Next buttons
- Looping first/last
- Keyboard ArrowLeft/ArrowRight
- No extra package

### Implemented solution

`CourtDetailGallery` was converted from a static/server component into a client component.

Changed file:

```txt
apps/web/src/features/court-detail/CourtDetailGallery.tsx
```

No other files changed.

### Implementation details

- `'use client'` added at the top.
- Props kept the same:
  - `images`
  - `heroImageUrl`
  - `courtName`
- Page did not require changes because the server page can render across the client boundary.
- Active image state lives inside the component:

```ts
const [activeIndex, setActiveIndex] = useState(0)
```

- Safe index fallback prevents invalid active index.
- Thumbnails are buttons:

```ts
onClick={() => setActiveIndex(i)}
```

- Active thumbnail gets:
  - `opacity-100`
  - `ring-2`
  - `ring-ink`
  - `aria-current="true"`
- Inactive thumbnails get:
  - `opacity-60`
  - `hover:opacity-100`
- Prev/Next buttons only show when more than one image exists.
- Keyboard support:
  - wrapper has `tabIndex={0}`
  - wrapper has `aria-label="Court image gallery"`
  - ArrowLeft/ArrowRight move slides.
- `id="court-gallery"` was retained.
- `resolveSlides()` builds an ordered deduped list:
  - hero first
  - then sorted gallery images
  - duplicates removed
- If images are empty:
  - use `heroImageUrl`
  - if that is also empty, reused `CourtImage` fallback supplies local placeholder.

### Verification reported

- Typecheck passed.
- Lint passed.
- Production build passed.
- Mock mode HTML verified:
  - 5-image court showed arrows + 5 thumbnails
  - 1-image temp case showed no arrows/thumbnails
  - 0-image temp case fell back correctly
- Real browser click/hydration should still be manually checked after deploy.

### Manual test checklist

Open a court detail page and test:

```txt
1. Scroll to #court-gallery.
2. Click each thumbnail.
3. Main image changes.
4. Active thumbnail style updates.
5. Click Next.
6. Click Previous.
7. Verify looping.
8. Focus the gallery and press ArrowLeft / ArrowRight.
9. Confirm no broken local image paths.
```

---

## 16. Map Work / OpenStreetMap Notes

There was an earlier map feature.

Known state:

- Initial map showed as an empty block or user disliked the look.
- User requested OpenStreetMap/Leaflet.
- Later map work was postponed.
- External OSM tile URLs remain intentionally in map config.
- Do not replace OSM tile URLs when replacing court/content images.

Need future work:

- Decide final map UX.
- Ensure map loads reliably.
- Improve visual style.
- Integrate real court markers.
- Add marker popups/cards.
- Optimize mobile map performance.

---

## 17. Designs / Pages Added or Requested

Around 2026-07-06, user had new designs for:

- Single article
- Single collection
- User collection
- Create collection
- Add to collection from court page
- About
- Privacy Policy + Terms
- Sign in
- Sign up

Additional UI requests:

- Burger menu below `991px`
- test harnesses
- audit verification
- prompts for Claude
- model used: Claude 4.8 xhigh

Need verify which of these are fully implemented versus only designed.

---

## 18. Saved Courts / Collections Work

Implemented/verified at various points:

- Login/logout OK.
- Add to collections OK.
- Collections display OK.
- Save feature had earlier ambiguity:
  - User initially reported “Save” not found.
  - Later saved/add-to-collections flow worked.
- Saved page exists.
- User collection features are in progress/design stage.

Need final verification:

- Saved state persists across reload.
- Saved page uses authenticated user data.
- Save toggle works from:
  - court card
  - court detail page
  - collections
- Add-to-collection modal/page works.
- Create collection works.
- Collection ownership/slug/magic token flow works if relevant.

---

## 19. Legal Pages / Privacy / Terms

For the Tennis app specifically, legal pages were part of design request:

- Privacy Policy
- Terms of Service / Terms & Conditions

Need confirm implementation state.

Future legal work should include:

- Public legal routes:
  - `/privacy-policy`
  - `/terms`
- Avoid conflict if there is an onboarding/privacy-acceptance route.
- Footer/login links should connect to these pages.
- Content should be reviewed by a legal professional before launch.

---

## 20. Security / Secrets / Git Incident

There was a GitHub incident:

- User accidentally pushed `.env.example`.
- It contained keys/secrets.
- User asked how to remove it from Git.
- History cleaning was done.
- User later asked if it could be reverted.

Important security rule:

- If any real keys were ever pushed, rotate them.
- Removing from Git history is not enough if repo was pushed remotely.
- Check:
  - Vercel tokens/envs
  - Railway envs
  - Supabase DB URLs/passwords
  - API secrets
  - auth secrets
  - demo auth secret
- Ensure `.env`, `.env.local`, production secrets are gitignored.
- `.env.example` should contain placeholders only.

---

## 21. Environment Variables

Known/local env examples:

```env
DATABASE_URL="postgresql://tennis:tennis@localhost:15432/tennis_world?schema=public"
NEXT_PUBLIC_DATA_SOURCE=mock
```

Likely envs needed:

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_DATA_SOURCE=
AUTH_COOKIE_SECRET=
AUTH_COOKIE_SECURE=
DEMO_AUTH_SECRET=
```

Need verify actual env list in code.

Important:

- Never commit real env values.
- For scripts that update DB, confirm target DB before running:

```powershell
echo $env:DATABASE_URL
```

If it says `localhost:15432`, it targets local DB.

---

## 22. Testing / Verification Done

### API / DB

- API health was tested.
- Prisma migrate deploy was tested.
- Seed was tested.
- Parity tests were attempted.
- Port `3001` blocked some API local tests at one point.

### Web

- Next.js build has passed after image/gallery updates.
- Mock mode rendered pages with local images.
- Static image serving tested:
  - `/placeholders/...` returns `200 image/jpeg`.
- Next/image optimizer works with local placeholders.

### Image update verification

Reported verified routes:

```txt
/
 /map
 /courts/grand-hotel-tremezzo
 /saved
 /collections
 /collections/coastal-courts
 /journal
 /journal/the-world-as-a-tennis-map
 /about
```

All returned `200`, image sources were local `/placeholders/...`, zero `images.unsplash.com`.

### Gallery update verification

- Typecheck passed.
- Lint passed.
- Production build passed.
- Static HTML verified.
- Manual browser click tests still recommended.

---

## 23. Known Issues / Things to Verify

### 1. Profile icon route

Need verify/fix:

- If logged in, profile icon should link to `/profile` or account page.
- If logged out, profile icon should link to `/signin`.

### 2. Real auth persistence

Demo auth works, but real auth should be retested:

- magic link
- cookies
- cross-domain/staging behavior
- reload persistence
- `/saved` auth redirects
- `/signin?redirectTo=...`

### 3. Map UX

Map needs final UX/design pass.

### 4. Legal pages

Need confirm pages exist and login/footer links connect.

### 5. Admin panel

Currently placeholder. Needs future implementation.

### 6. Production data updates

When code/seed data changes, existing DB rows need targeted scripts or migrations.

### 7. Mobile responsive QA

Need full QA on mobile widths:

- header
- burger menu under 991px
- bottom navigation
- cards
- court detail
- gallery
- saved page
- collections
- login/sign-up

### 8. Performance

Need basic production checks:

- Lighthouse
- image optimization
- API response times
- DB query performance
- Vercel function cold starts
- Railway API logs

---

## 24. Commands Reference

### Install

```bash
pnpm install
```

### Run web locally

```bash
pnpm --filter @tennis/web dev
```

### Run API locally

```bash
pnpm --filter @tennis/api dev
```

### Start local DB

```powershell
docker start tennis_world_pg
```

### Prisma migrate deploy

```bash
pnpm --filter @tennis/api prisma migrate deploy
```

### Seed DB

```bash
pnpm --filter @tennis/api db:seed
```

### Update court/article/collection image URLs

```bash
pnpm --filter @tennis/api db:update-images
```

or:

```bash
cd apps/api
npx tsx prisma/update-court-images.ts
```

### Check current DB target in PowerShell

```powershell
echo $env:DATABASE_URL
```

### Set DB target temporarily in PowerShell

```powershell
$env:DATABASE_URL="postgresql://REAL_DB_URL"
pnpm --filter @tennis/api db:update-images
```

### Search for old image URLs — PowerShell

```powershell
Select-String -Path "apps/web/**/*.*","apps/api/**/*.*","packages/**/*.*","prisma/**/*.*","scripts/**/*.*" -Pattern "images.unsplash.com|unsplash.com|cdn"
```

### Search for old image URLs — Unix

```bash
grep -R "images.unsplash.com\|unsplash.com\|cdn" apps/web apps/api packages prisma scripts
```

---

## 25. Recent Completed Work Summary

### Local placeholder image replacement

Completed:

- Moved images to `apps/web/public/placeholders`.
- Replaced app/page heroes.
- Updated mock data.
- Updated seed source transitively.
- Added DB update script.
- Ran DB update successfully after fixing target DB.
- Confirmed no need for remote Unsplash config.

### Court detail gallery

Completed:

- Made `CourtDetailGallery.tsx` a client component.
- Added active image state.
- Thumbnail click switches main image.
- Prev/Next buttons added.
- Keyboard support added.
- Fallback behavior preserved.
- `id="court-gallery"` retained.
- Build/typecheck/lint passed.

---

## 26. Recommended Next Work — Short Term

### A. Manual QA after latest gallery deploy

Check:

```txt
/courts/grand-hotel-tremezzo
```

and several other courts.

Verify:

- Gallery thumbnails switch images.
- Prev/Next works.
- Keyboard works.
- No broken images.
- All images local `/placeholders/...`.

### B. Confirm live DB image update

Open DevTools Network on Vercel:

- No `images.unsplash.com`
- No old CDN court images
- `/placeholders/...` returns 200

### C. Fix profile icon behavior

If still unresolved:

- Logged-in user icon -> `/profile`
- Logged-out user icon -> `/signin`

### D. Auth QA

Check real auth, not only demo auth:

- sign in
- sign out
- session reload
- saved page access
- redirect to intended route

### E. Mobile QA

Test at:

```txt
390px
430px
768px
991px
1024px
1440px
```

### F. Legal pages

Implement/finish:

- `/terms`
- `/privacy-policy`
- footer links
- login/signup screen links

### G. Staging demo flow

Confirm client can open staging and click through without auth issues.

---

## 27. Recommended Next Work — Medium Term

### 1. Admin panel

Build admin for:

- courts CRUD
- court image/gallery management
- collections CRUD
- articles CRUD
- region/country management
- featured items
- locked/premium flags
- user management
- saved stats
- basic analytics

### 2. Real content management

Move from seed/mock to admin-managed content.

Need:

- image upload/storage strategy
- validation
- preview
- slug generation
- publication states

### 3. Map feature finalization

- Use Leaflet/OpenStreetMap.
- Markers for courts.
- Court cards in popups.
- Filter sync with map.
- Mobile-friendly bottom sheet.

### 4. Premium / membership

Need decide:

- pricing
- paywall rules
- locked courts/collections/articles
- Stripe integration
- entitlement logic
- customer portal
- subscription status
- cancellation rules

### 5. Search/filter improvements

Potential filters:

- country
- region
- surface
- indoor/outdoor
- scenic
- access
- hotel/resort/public/private
- lights
- coaching
- booking availability

### 6. SEO

Need:

- metadata per court
- OpenGraph images
- sitemap
- robots.txt
- structured data if appropriate
- canonical URLs

### 7. Performance

- Image sizes
- Next/image optimization
- API caching
- DB query indexing
- route-level loading states
- skeletons
- reduce client bundle

---

## 28. Recommended Final Launch Checklist

### Product

- Core browse flow complete
- Court detail page polished
- Gallery working
- Saved courts working
- Collections working
- Articles working
- About/Legal pages complete
- Empty states complete
- Loading/error states complete

### Auth

- Sign in works
- Sign out works
- Session persists
- Protected routes behave correctly
- Demo auth disabled or strictly gated for production

### Data

- Staging/prod DB has correct images
- No old CDN image URLs
- Seed/update scripts documented
- Content verified

### Legal

- Terms complete
- Privacy Policy complete
- Cookie/local storage notice if needed
- Company details inserted
- Legal review complete

### Infrastructure

- Vercel envs set
- Railway envs set
- DB envs set
- CORS correct
- Secrets rotated after accidental push
- Error logging enabled

### QA

- Desktop QA
- Mobile QA
- Safari/iOS QA
- Chrome/Android QA
- Slow network check
- Build passing
- Typecheck passing
- Lint passing

### Monitoring

- Vercel logs checked
- Railway logs checked
- DB logs checked
- Basic uptime/error alerts considered

---

## 29. Important Rules for Future Claude/AI Tasks

Use one task per prompt.

Always include:

- Project context
- Exact files to search
- What to change
- What not to change
- Testing requirements
- Expected report back

Avoid:

- broad refactors
- package installs unless explicitly approved
- schema changes unless needed
- touching auth/paywall/saved/collections when working on unrelated UI
- replacing map tile URLs when replacing court images
- reseeding production data unless explicitly intended

Preferred prompt style:

```txt
Task:
...

Context:
...

Requirements:
1.
2.
3.

Do not change:
...

Testing:
...

Report back:
...
```

---

## 30. Current Status Snapshot

As of this checkpoint:

### Done

- Monorepo foundation.
- Web shell and main UI components.
- Mock data/contracts.
- API foundation.
- DB/Prisma foundation.
- Railway/Vercel staging deployment.
- Auth and staging demo auth.
- Saved/collections major pieces.
- Local placeholder image migration.
- DB image update script.
- Court detail gallery made interactive.
- Builds/typechecks have passed for recent tasks.

### Needs verification

- Live gallery click behavior after deployment.
- Profile icon logged-in behavior.
- Real auth persistence.
- Mobile responsive QA.
- Legal pages status.
- Map final UX.
- Production image network check after DB update.

### Not yet final

- Admin panel.
- Full CMS/content management.
- Premium/membership final implementation.
- Full legal compliance review.
- Full launch QA.
- Production monitoring/alerts.
- Final SEO/performance polish.

---

## 31. Suggested Next Prompt After Opening a New Chat

Use this if continuing with Claude/ChatGPT:

```txt
We are continuing the Tennis World project.

I have a full checkpoint in this markdown file. Please read it first and treat it as the current source of truth.

Current priority:
1. Verify the latest court gallery behavior on court detail pages.
2. Confirm all production/staging images load from /placeholders.
3. Fix the profile icon so logged-in users go to /profile and logged-out users go to /signin.
4. Do not change unrelated features.

Before making changes, summarize:
- the relevant current architecture
- files you will inspect
- exact intended changes
- what you will avoid touching
```

---

## 32. Final Notes

The project is in a strong MVP/staging state, but not yet final-launch ready. The biggest technical risks are no longer basic rendering or image loading; they are:

- auth/session edge cases
- production DB data consistency
- admin/content workflow
- mobile QA
- final legal/compliance pages
- map UX
- future premium/paywall implementation

Continue with small, controlled tasks and verify each change with build + manual browser QA.
