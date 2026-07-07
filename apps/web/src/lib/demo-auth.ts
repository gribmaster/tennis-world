// Staging demo-auth FLAG helper (Feature 76) — safe on BOTH server and client.
//
// This module reads ONLY the NEXT_PUBLIC_ boolean flag — it NEVER touches the secret. It is
// therefore safe to import from client islands (unlike `demo-auth.server.ts`, which reads the
// secret and is `server-only`). Client mutation islands use `isDemoMode()` to decide whether
// to route a protected write through a SERVER ACTION (which holds the secret server-side)
// instead of the browser cookie path — because in demo mode there is no session cookie to
// send. ⚠️  See docs/STAGING_DEMO_AUTH.md.

/**
 * Whether staging demo auth is enabled. Reads the NEXT_PUBLIC_ flag, so it resolves to the
 * same value on the server and in the browser bundle. Carries NO secret. `false` in normal
 * operation (and always in production, where the flag must be unset).
 */
export function isDemoMode(): boolean {
  const raw = process.env.NEXT_PUBLIC_STAGING_DEMO_AUTH_ENABLED?.trim();
  return raw === 'true' || raw === '1';
}
