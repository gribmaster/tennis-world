// Importing `next/headers` (even without using it) makes Next mark this module
// server-only: importing it into a `'use client'` file is a build error. This is the SAME
// self-enforcing boundary `lib/repositories.server.ts` relies on — no `server-only` package
// dependency needed. It guarantees the secret read below can never reach the browser bundle.
import 'next/headers';

// SERVER-ONLY staging demo-auth helper (Feature 76).
//
// ⚠️  DANGER — STAGING ONLY. This centralizes the ONE place the web app reads the demo
// secret and turns it into an `HttpAuthOptions.demoAuthSecret` for the protected /v1/me/*
// calls. It exists so a client can walk through the Vercel STAGING deployment without magic
// link login (the cross-domain session cookie doesn't stick between Vercel and Railway).
//
// The proper long-term fix is same-parent-domain subdomains so the real session cookie works
// cross-site; this is a temporary staging convenience. See docs/STAGING_DEMO_AUTH.md.
//
// TWO ENV VARS, DELIBERATELY SPLIT so the secret NEVER ships to the browser:
//   • NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED — the on/off FLAG. NEXT_PUBLIC_ so both server
//     components AND client islands can tell whether demo mode is active (islands use it to
//     route mutations through a server action instead of the browser cookie path). It is a
//     boolean flag ONLY — it carries no secret.
//   • STAGING_DEMO_AUTH_SECRET — the SECRET. NO NEXT_PUBLIC_ prefix, so Next never inlines it
//     into the client bundle. Read ONLY here (and by server actions), on the server.
//
// SERVER-ONLY GUARANTEE: the `import 'next/headers'` above makes importing this module from a
// `'use client'` file a BUILD ERROR — the secret physically cannot reach the browser through
// this path. Client code checks the flag via `isDemoMode()` in demo-auth.ts (no secret) and
// delegates the actual authenticated call to a server action.

/**
 * Whether staging demo auth is enabled (the NEXT_PUBLIC_ flag). Cheap boolean read — safe on
 * both server and client, but this module is server-only, so callers here are already on the
 * server. Client code uses the flag-only helper in `demo-auth.ts` instead.
 */
export function isDemoModeEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED?.trim();
  return raw === 'true' || raw === '1';
}

/**
 * The auth-transport fragment that authenticates a protected call as the demo user in staging
 * demo mode — i.e. `{ demoAuthSecret: <secret> }`, a structural subset of `HttpAuthOptions`
 * (kept as a local shape here so this file stays off the `@/domain` import boundary — only
 * `lib/repositories*.ts` may import the factory; the exempt `repositories.server.ts` spreads
 * this into the real `HttpAuthOptions`). Returns `{}` when demo mode is off, OR when the flag
 * is on but the secret is missing (fail SOFT to unauthenticated rather than crash a page
 * render — the API is the fail-fast authority for a misconfigured secret; a missing secret
 * here simply means "no demo auth", so the reads 401 → the normal logged-out UX).
 */
export function demoAuthOptions(): { demoAuthSecret?: string } {
  if (!isDemoModeEnabled()) return {};
  const secret = process.env.STAGING_DEMO_AUTH_SECRET?.trim();
  if (!secret) return {};
  return { demoAuthSecret: secret };
}
