# Staging Demo Auth (Feature 76)

> ⚠️ **STAGING ONLY.** This is a deliberate, narrow authentication bypass. It must **never**
> be enabled in production. Read this whole document before touching it.

## Why this exists

The Railway API and the Vercel web app live on **different domains**. Magic-link sign-in works
(the API verifies the token and sends `Set-Cookie` with `SameSite=None; Secure`), but the
session cookie belongs to the **Railway** domain. Server-rendered Vercel pages read cookies
from the **Vercel** request, so they never see the API's cookie — and the user appears logged
out on every server-rendered page even though sign-in "succeeded".

The **proper long-term fix** is to put web and API on **subdomains of the same parent domain**
(e.g. `app.tennisworld.example` + `api.tennisworld.example`) with a cookie `Domain` of
`.tennisworld.example`, so the real session cookie is sent cross-subdomain. See
["The real fix"](#the-real-fix-custom-domains) below.

Until that DNS/hosting change lands, the client needs to **walk through the staging deployment
without login friction**. Staging demo auth provides that: with one flag + one shared secret,
the app treats the visitor as a fixed, free **demo user** — no magic link required.

## What it does (and does not) do

**Does:**

- Authenticate a request as a single, stable demo user when it carries the header
  `X-Tennis-Demo-Auth: <secret>` — **only** when demo auth is explicitly enabled.
- Let `/profile`, `/saved`, user collections, add-to-collection, and save/unsave work end-to-end
  against the real API and database (state persists across reloads).
- Keep magic-link auth fully working alongside it (demo auth is checked first, but a request
  with **no** demo header falls through to the normal cookie/bearer path).

**Does not:**

- Grant any entitlement. The demo user is a plain **free** user (zero `Entitlement` rows). It
  gets no lifetime unlock, and **exact court coordinates remain gated** exactly as for any free
  user — the public `/v1/courts*` surface never exposes exact `lat`/`lng`, even with the demo
  header present. (Verified: `verify:staging-demo-auth` scenario H.)
- Add a password, a general public backdoor, or any second identity. It grants exactly **one**
  fixed identity, and only to a caller who knows the secret.
- Touch Stripe/billing. Checkout/portal are unchanged (and untested under demo mode by design).
- Turn on based on `NODE_ENV`. It is enabled **only** by the explicit flag below.

## Environment variables

### API (Railway)

| Var | Required | Meaning |
| --- | --- | --- |
| `STAGING_DEMO_AUTH_ENABLED` | yes | `true`/`1` turns demo auth on. Anything else (or unset) = off. **Never set in production.** |
| `STAGING_DEMO_AUTH_SECRET` | yes when enabled | Long random shared secret the caller must present in `X-Tennis-Demo-Auth`. **Boot fails fast if enabled without this.** |
| `STAGING_DEMO_EMAIL` | no | Demo user's email (found-or-created). Defaults to `demo@tennisworld.local`. |

The demo user is created on first authenticated demo request with a stable
`name: "Demo User"` and `authProvider: "demo"`, and **no** entitlements.

### Web (Vercel)

| Var | Required | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED` | yes | `true`/`1` tells the web app demo mode is on. `NEXT_PUBLIC_` because both server components and client islands read the **flag** (it carries no secret). |
| `STAGING_DEMO_AUTH_SECRET` | yes when enabled | Same secret as the API. **No `NEXT_PUBLIC_` prefix** — it must never ship to the browser bundle. Read **only** on the server. |

Generate a secret with e.g. `openssl rand -hex 32`. Use the **same** value on both sides.

## How it works (architecture)

```
                       ┌─────────────── Vercel (web) ───────────────┐
 server component ────▶│ getRepositoriesForRequest()                │
 (/profile, /saved)    │   + demoAuthOptions()  ← reads server-only  │──▶ X-Tennis-Demo-Auth ──▶ API
                       │     STAGING_DEMO_AUTH_SECRET                 │
                       ├─────────────────────────────────────────────┤
 client island ───────▶│ getMutationSavedRepository()                │
 (save / add-to-       │   demo mode → server action (saved-actions) │──▶ (server) X-Tennis-Demo-Auth ──▶ API
  collection / rename) │     which reads the secret server-side      │
                       └─────────────────────────────────────────────┘
```

**Secret stays server-side.** The web app splits the two env vars on purpose:

- The **flag** (`NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED`) is public and readable everywhere.
- The **secret** (`STAGING_DEMO_AUTH_SECRET`) is read **only** in server code:
  - `src/lib/demo-auth.server.ts` (imports `next/headers`, making it server-only, the same
    self-enforcing boundary `repositories.server.ts` uses) — used by server components.
  - `src/lib/saved-actions.ts` (Next server actions) — used by client islands for mutations,
    because in demo mode there is no session cookie for the browser to send, and the browser
    must not hold the secret.

**API side.** `AuthGuard` (`apps/api/src/auth/auth.guard.ts`) has a demo branch that runs
**only** when `stagingDemoAuth` config is non-null:

- No demo header → fall through to the normal cookie/bearer JWT path (magic link still works).
- Header present and matches the secret (constant-time compare) → find-or-create the demo user
  and attach the same `req.auth = { userId, email }` shape as a normal JWT session. Every
  downstream handler treats the demo user like any authenticated user.
- Header present but **wrong** → hard `401` (no fall-through).

The config (`apps/api/src/auth/auth.config.ts`) **fails fast at boot** if
`STAGING_DEMO_AUTH_ENABLED=true` but the secret is missing.

## Verifying

With the API running and demo auth enabled (same secret on both sides):

```bash
# API booted with STAGING_DEMO_AUTH_ENABLED=true STAGING_DEMO_AUTH_SECRET=<secret>
DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://<api>/v1 \
  STAGING_DEMO_AUTH_SECRET=<same secret> \
  pnpm --filter @tennis/api verify:staging-demo-auth
```

It checks: no-auth → 401, wrong secret → 401, correct secret → 200 demo profile, membership is
`free`, no email leak, stable identity across requests, saved-courts round-trip, collection
create, and that public `/v1/courts` still masks exact coordinates. (Unset the secret to make
the harness skip cleanly.)

Manual staging walkthrough (fresh/incognito browser, **no** magic link):

1. Open `/profile`, `/saved`, `/map`, `/courts/grand-hotel-tremezzo`.
2. Confirm profile and saved render as the demo user (a small **"Demo mode"** chip shows in the
   profile header, and the profile menu shows an inert **"Demo mode"** row instead of Sign Out).
3. Add a court to a collection; refresh — the state persists (it's in the real DB).
4. Confirm the public court page never reveals exact coordinates.

## How to disable it

**To turn it off (including in production — where it must always be off):**

- **API (Railway):** remove `STAGING_DEMO_AUTH_ENABLED` (or set it to anything other than
  `true`/`1`). With it off, the demo branch in the guard is completely inert.
- **Web (Vercel):** remove `NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED` and
  `STAGING_DEMO_AUTH_SECRET`. Re-deploy so the flag change is baked into the build.

With demo auth off, only magic-link auth remains — the app behaves exactly as before Feature 76.
Rotating the secret (change it on both sides) instantly invalidates any previously-shared header.

## The real fix (custom domains)

Staging demo auth is a **temporary convenience**, not the auth model. The correct fix for
"logged-in state doesn't persist on server-rendered pages" is to serve web and API from
**subdomains of one parent domain** and scope the session cookie to that parent:

- `app.example.com` (web) + `api.example.com` (API), cookie `Domain=.example.com`,
  `SameSite=None; Secure` (or `Lax` once same-site).
- Then the real magic-link session cookie is sent on cross-subdomain requests, server-rendered
  pages see it, and no demo bypass is needed.

Once custom domains are in place, **disable staging demo auth** and delete these env vars.
