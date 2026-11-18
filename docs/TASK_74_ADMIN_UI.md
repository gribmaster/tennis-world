# TASK 74 — Minimal admin, part 2: the admin app (`apps/admin`, Refine)

**Model: Sonnet 5, reasoning effort: high.** Prerequisite: **TASK_73 is done and verified, and TASK_75 (its hardening follow-up) is done** (admin API for auth, courts, countries/regions, images). Read `docs/TASK_73_ADMIN_COURTS_API.md` and the `apps/api/src/admin/` code and `packages/contracts/src/admin.ts` first — this UI is a thin client over exactly those endpoints and must not need a single API change. If it does, stop and report instead of editing the API.

## Goal

Replace the empty placeholder `apps/admin` with a small internal web app where the owner and her team can: sign in, list courts, create/edit a court, add countries/regions on the fly, upload and arrange photos, and publish or unpublish. Fast to launch, plain to use, not pretty.

**Out of scope:** consultations, users, entitlements, reviews, collections, articles, roles UI, an audit view, bulk import, i18n, dark mode, mobile layout polish (it must be usable at ≥ 1024 px; below that it only needs to not break), any change to `apps/web`, `apps/api`, `packages/*`, deployment config (report what's needed, don't create it).

## Decisions already made (do not re-litigate)

1. **Stack:** Vite + React + TypeScript, **Refine** (`@refinedev/core`, `@refinedev/antd`, `@refinedev/react-router`) with **Ant Design** for forms/tables/upload (the fastest path to a working internal tool; the project's Tailwind design system is for the public site, not this). React **18.3** is pinned in this package — antd 5 does not officially support React 19, and `apps/web` stays on 19 (pnpm isolates them; do not hoist or change `apps/web`'s React). Keep the dependency list short; list every package you add in the report with its purpose.
2. **No `@prisma/client`, no database URL, no import from `apps/api`** (Architecture Plan Decision #9 / Risk #12): the app talks to the API over HTTP only. Types come from **`@tennis/contracts`** (`admin.ts` + enums). Do not copy enum values by hand into the UI — import `Surface`, `AccessType`, `IndoorOutdoor`, `Continent`, `CourtTag` from the contracts package.
3. **Auth = the cookie session from TASK_73.** `fetch(..., { credentials: 'include' })` to `${VITE_API_BASE_URL}` (e.g. `http://127.0.0.1:18001/v1`), and **every non-GET request sends `X-Tennis-Admin: 1`**. The access token returned by login is **never stored** (no `localStorage`, no `sessionStorage`, no memory cache): the httpOnly cookie is the session. `authProvider.check` calls `GET /v1/admin/auth/me`; a 401 anywhere in the app redirects to `/login` (one central place — the shared fetch wrapper), and a 403 on a business call shows "Your account has no access to this tool" instead of a crash. Logout calls the API then clears Refine's state.
4. **Custom data provider, not `simple-rest`.** The API returns `{ items, page, pageSize, total }`, mutations use `PATCH` and sub-resources for images; a ~100-line custom provider over one shared `apiFetch` wrapper is simpler than bending a generic one. Resources: `courts` only (countries/regions/images are plain helper calls).
5. **Dev port 18002** (`vite --port 18002 --host 127.0.0.1`), the API's `ADMIN_APP_URL` must be `http://127.0.0.1:18002` locally. Env: `VITE_API_BASE_URL`, `VITE_WEB_BASE_URL` (public site origin, for "View on site" links). Provide `apps/admin/.env.example`. Never put a secret in a `VITE_*` variable.
6. **No state the API doesn't own.** No draft autosave, no local cache of courts beyond Refine's query cache.
7. **Honest UX over cleverness:** every API error body's `message` is shown to the user verbatim; the 422 publish-gate response (`missing: string[]`) is rendered as a checklist, not a toast; a network failure says "Can't reach the server", never "Something went wrong".

## What to build

### 1. Scaffold
- Replace the placeholder files in `apps/admin` (README, `package.json` scripts: `dev`, `build`, `typecheck`, `lint`, `preview`). The root `turbo`/`pnpm` scripts, `pnpm typecheck`, `pnpm lint`, `pnpm build` must now run real work for this package and pass. If `pnpm dev` at the root starts all apps, make sure the admin app starts on 18002 without breaking the others (check how `turbo.json` wires `dev`; don't change it if it already picks up the script).
- Follow the repo's lint/prettier config (`@tennis/config`, root `prettier.config.js`).

### 2. Pages
- **`/login`** — email + password, submit on Enter, disabled button + spinner while pending (element size must not jump), API error message shown inline. After login go to `/courts` (or the originally requested page).
- **`/courts` (list)** — Ant Design table, server-side pagination/search/filter against `GET /v1/admin/courts`: search box (`q`), status filter (All / Draft / Published), columns: hero thumbnail (small; placeholder if none), name, country · region, status tag, "Locked" tag, "Featured" tag, image count, last updated. Row click → edit. Button **"New court"**. Debounce search (300 ms). Empty state with a "New court" call to action.
- **`/courts/create` and `/courts/:id/edit`** — one shared form component, sections in this order:
  1. **Basics** — name; slug (auto-filled from the name until the user edits it; **read-only with an explanatory tooltip when the court is published**, because the API rejects changes — still show it); status radio Draft/Published.
  2. **Place** — country `Select` (searchable) with an **"Add country…"** entry opening a small modal (name, ISO code, continent → `POST /admin/countries`, then selects it); region `Select` filtered by the chosen country (changing country clears region) with **"Add region…"** modal (name, lat, lng → `POST /admin/regions`, then selects it). Both lists come from `GET /v1/admin/countries`; refresh after adding.
  3. **Exact location** — `lat`, `lng` number inputs, and a "Google Maps link" input (`mapLinkUrl`). Next to the link a **"Fill coordinates from link"** button: a **client-side parser only** (no network calls, no geocoding) that extracts `lat,lng` from the common forms `…/@LAT,LNG,…`, `…!3dLAT!4dLNG…`, `…?q=LAT,LNG` / `…?ll=LAT,LNG`; if the link is a short link (`maps.app.goo.gl`, `goo.gl`) or nothing is found, show "Couldn't read coordinates from this link — open it in the browser and copy the numbers from the address bar" and change nothing. The parser is a pure function in its own file with unit tests (see Testing). A note under the section: "Visitors without premium only ever see an approximate area; this exact point is shown to members only." Do **not** show derived `approxLat/Lng` as editable; on the edit page show them as read-only text ("Approximate point shown publicly: …").
  4. **Details** — surface, access, indoor/outdoor (selects), setting (short text), `isScenic`, `isFeatured`, **`isLocked`** (Switch, with helper text "Premium court: name and exact location are hidden from non-members"), tags (checkbox group over `CourtTag`), blurb (textarea with a character counter, max 4000).
  5. **Photos** — see below. Shown **only after the court exists**; on the create page show a muted card "Save the court as a draft first, then add photos."
- **Create flow:** "Save draft" → `POST` with `status: 'draft'`, then navigate to `/courts/:id/edit` (so photos become available). **"Publish"** is a separate primary button on the edit page: it saves the form and sets `status: 'published'` in one `PATCH`; on 422 show the `missing` checklist in an `Alert` above the form and keep the court in draft. **"Unpublish"** (shown when published) asks for confirmation (`Modal.confirm`) and says what it does ("The court disappears from the public site and from users' saved lists").
- **"View on site"** link (opens `${VITE_WEB_BASE_URL}/courts/${slug}` in a new tab, `rel="noopener noreferrer"`) only for published courts; drafts show "Drafts are not visible on the public site."
- **Unsaved changes:** leaving the edit page with a dirty form prompts (Refine's `warnWhenUnsavedChanges`).

### 3. Photos panel (edit page)
- **Upload:** Ant Design `Upload` (multiple, `accept="image/jpeg,image/png,image/webp"`, custom request → `POST /admin/courts/:id/images` as `multipart/form-data` with the `X-Tennis-Admin` header and credentials, one request per file, **sequentially — one at a time, never in parallel**, even though TASK_75 makes the API safe under concurrency). Client-side pre-check: type and ≤ 8 MB (the API is the real gate; show its 415/413 messages per file). The first uploaded image becomes the hero server-side — the UI just re-fetches.
- **Grid of thumbnails** in `sortOrder`: a "Hero" badge, **"Make hero"** button on others, an alt-text input (saves on blur via `PATCH …/images/:imageId`), **delete** (confirm; if the API answers 409 for the last image of a published court, show its message), and **reorder by drag-and-drop** (use `@dnd-kit/core` + `@dnd-kit/sortable` or the equivalent already pulled in by antd-compatible tooling — pick one, list it in the report) with **← / → buttons as the keyboard-accessible alternative**; a reorder calls `PUT …/images/order` with the full id list and rolls back the UI on failure.
- Thumbnails render the image URL as stored (absolute Supabase URL, root-relative `/uploads/...` in local mode, or a legacy `/courts/...` path). For root-relative URLs prefix `VITE_WEB_BASE_URL` so previews work in dev; if that env is unset, show a neutral placeholder tile with the URL as text instead of a broken image.
- Per-file upload errors never block the others.

### 4. Shell
- Layout: a minimal top bar (app name "Tennis World Admin", the signed-in email, **Sign out**) and a left menu with one item, **Courts**. A not-found page. An error boundary at the root that shows the error message and a "Reload" button.
- Page titles via `document.title`. No analytics, no external fonts or CDNs (everything from npm).
- **Never render `dangerouslySetInnerHTML`**; all user text goes through React. Links to external hosts use `rel="noopener noreferrer"`.

### 5. Docs
- `apps/admin/README.md`: what it is, env vars, how to run locally (API env `ADMIN_APP_URL=http://127.0.0.1:18002`, `COURT_IMAGE_STORAGE=local`, create an admin with the CLI, `pnpm --filter @tennis/admin dev`), and the **production checklist** the owner has to do (Supabase bucket, API env vars, a new hosting project for this app, `ADMIN_APP_URL` on the API, cookie `SameSite=none` + `Secure` across domains, who gets an admin account).
- **CLAUDE.md**: a short "Admin app" section (rule-list voice): HTTP-only to `/v1/admin/*`, no Prisma/DB, cookie session + `X-Tennis-Admin` on every mutation, token never stored, types from `@tennis/contracts`, React 18 pin and why, dev port 18002. Add the new harness (below) to the inventory in §2. Update §1's repo map / app list if it still calls `apps/admin` a placeholder, and update `apps/admin/package.json`'s `description`.

## Testing

There is no jest/vitest in this repo; follow the `verify:*` convention. Add `apps/admin/scripts/verify-admin-ui.ts` (run with `tsx`) and script `verify:admin-ui` for the **pure logic** only:

1. **Maps-link parser:** table-driven cases — `@45.4642,9.1900,15z`, `!3d45.4642!4d9.19`, `?q=45.4642,9.19`, `?ll=…`, negative coordinates, swapped/out-of-range values rejected, a short link → "unreadable", garbage → "unreadable", a URL with two coordinate-looking pairs (prefers the `!3d!4d` place pin over the `@` viewport centre — document the rule in a comment).
2. **Slug helper:** the UI's auto-slug from a name matches the API's rule (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, diacritics folded) for ≥ 10 samples including `Château de la Messardière`, `Hôtel du Cap-Eden-Roc`, `Monte-Carlo Country Club`, and names with `&`, `'`, digits, or leading/trailing punctuation. If you can import the API's slugify from `@tennis/contracts`, do; otherwise duplicate it **and** assert equality against the API's function for the sample set in the harness by importing it relatively from `apps/api` **in the harness only** (not in app code).
3. **Data-provider mapping:** with an injected `fetch` stub, assert the list mapping (`items/total`), the `PATCH` payload only contains changed editable fields, `X-Tennis-Admin: 1` is on every non-GET and absent on GET, `credentials: 'include'` is set everywhere, a 401 triggers the central redirect handler, a 422 surfaces `missing`, and a thrown network error becomes "Can't reach the server".
4. **No token persistence:** a source scan of `apps/admin/src` asserting there is no `localStorage`/`sessionStorage`/`document.cookie` access and no `dangerouslySetInnerHTML`.
5. **Env scan:** no `VITE_*` variable name containing `SECRET`, `KEY`, `TOKEN` or `PASSWORD`.

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` at the root (stop `pnpm dev` first; delete `apps/web/.next` before restarting dev), plus the unchanged API suites that TASK_73 listed must still pass (`verify:admin-courts` included).

**Live walkthrough** — with the API running (`COURT_IMAGE_STORAGE=local`) and the admin dev server up, do the following in a real browser if you have a browser tool, otherwise state plainly that it was **not** done and leave the steps in the report for the owner: create an admin with the CLI → sign in with a wrong then the right password → create country + region → create a draft with a pasted Google Maps link → upload 3 images (one invalid file) → reorder, change hero, edit alt → try to publish without a blurb and see the checklist → publish → open "View on site" and confirm the court is on the public site → unpublish → confirm it disappears → sign out → direct URL to `/courts` redirects to login. Include screenshots descriptions or failures, whatever you can verify.

## Do not touch

`apps/web`, `apps/api`, `packages/contracts`, `packages/mock-data`, Prisma, CI beyond what `pnpm typecheck/lint/build` already cover (if `.github/workflows/ci.yml` runs per-app jobs and the admin package needs adding, report it instead of editing), `turbo.json` unless `dev` provably does not pick the script up. No git commit or push unless asked.

## Report

1. Files created/changed (grouped) and every dependency added with its purpose and version.
2. How the session works (cookie, CSRF header, 401/403 handling) and where the single central handler lives.
3. `verify:admin-ui` check count and the result of typecheck/lint/build and the API suites.
4. The live walkthrough: each step done or **not done**, with what you observed. Be explicit about anything untested (the real Supabase upload path is out of reach here by design).
5. Every deviation or interpretation (the parser rule, the drag-and-drop library choice, the React 18 pin) and why.
6. UX gaps you noticed that the owner will hit on day one (report, don't build).
7. The exact commands run.
