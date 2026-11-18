# @tennis/admin — Tennis World admin app (TASK_74)

A small internal tool for the owner and her team: sign in, list courts, create/edit a
court, add countries/regions on the fly, upload and arrange photos, publish/unpublish.
Vite + React 18 + [Refine](https://refine.dev/) + Ant Design. Fast to launch, plain to
use, not pretty.

- **No Prisma, no database connection string.** This app talks to the API over HTTP
  only (`VITE_API_BASE_URL`), via `@tennis/contracts` types.
- **Auth is the TASK_73 admin cookie session**, not the user auth system. The access
  token a login response carries is never stored (no `localStorage`, no
  `sessionStorage`) — the httpOnly `tennis_admin_session` cookie is the session, and
  every mutation sends `X-Tennis-Admin: 1`.
- Out of scope (see `docs/TASK_74_ADMIN_UI.md`): consultations, users, entitlements,
  reviews, collections, articles, roles UI, audit view, bulk import, i18n, dark mode,
  mobile layout polish.

## Env vars

Copy `.env.example` to `.env.local`:

| Var | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of `/v1/admin/*`. Local dev: `http://127.0.0.1:18001/v1`. |
| `VITE_WEB_BASE_URL` | Public web app origin — used only for "View on site" links and to resolve root-relative (local-storage-mode) image URLs. Optional. |

Vite only exposes `VITE_*`-prefixed variables to the browser bundle — there is no
server-only half of this app, so nothing secret belongs in any of its env vars.

## Run locally

```bash
pnpm db:up
pnpm --filter @tennis/api prisma:migrate:deploy
pnpm --filter @tennis/api db:seed

# apps/api/.env — this app's origin must be allow-listed for CORS, and local
# image storage needs no Supabase account:
#   ADMIN_APP_URL=http://127.0.0.1:18002
#   COURT_IMAGE_STORAGE=local
pnpm --filter @tennis/api dev

# Create the first admin (prompts for a password, ≥ 12 chars, no CLI argument):
pnpm --filter @tennis/api admin:create -- --email owner@example.com --role admin

pnpm --filter @tennis/admin dev   # http://127.0.0.1:18002
```

## Commands

| Purpose | Command |
|---|---|
| Dev server (port 18002) | `pnpm --filter @tennis/admin dev` |
| Typecheck | `pnpm --filter @tennis/admin typecheck` |
| Lint | `pnpm --filter @tennis/admin lint` |
| Build | `pnpm --filter @tennis/admin build` |
| Pure-logic tests | `pnpm --filter @tennis/admin verify:admin-ui` |

`verify:admin-ui` is this repo's `verify:*`-script test coverage (no jest/vitest here —
see CLAUDE.md §2): the Google-Maps-link parser, the slug helper (checked for byte-for-byte
equality against the API's own `slugify`), the data-provider's request mapping (headers,
credentials, 401/422/network handling), a source scan for token persistence /
`dangerouslySetInnerHTML`, and an env-var name scan. It needs no running API.

## Production checklist (for the owner, not done by this app)

1. Create a **public** Supabase Storage bucket for court photos (default name
   `court-images`) and set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
   `SUPABASE_STORAGE_BUCKET` on the API; set `COURT_IMAGE_STORAGE=supabase` (the API
   refuses to boot in production with `local` or an unset value).
2. Set `ADMIN_JWT_SECRET` (a long random value — the API refuses to boot in
   production without it, and `/v1/admin/*` would otherwise not exist at all) and
   `ADMIN_APP_URL` (this app's production origin) on the API.
3. Host this app as its own static site/project (it is a plain Vite SPA — any static
   host that serves `index.html` for unknown paths works). Set `VITE_API_BASE_URL` and
   `VITE_WEB_BASE_URL` for that deployment.
4. If the admin app and the API are on different sites (not just different
   subdomains), set `AUTH_COOKIE_SAME_SITE=none` and `AUTH_COOKIE_SECURE=true` on the
   API (shared by the user and admin cookies — see CLAUDE.md §3) and make sure both
   origins are HTTPS; `SameSite=None` cookies are dropped otherwise.
5. Mint the first admin account with
   `pnpm --filter @tennis/api admin:create -- --email … --role admin` (prompts for a
   password on a TTY; never pass one as a CLI argument). Decide who else gets an
   account — there is no self-signup and no endpoint creates one.
