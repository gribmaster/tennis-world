// ─────────────────────────────────────────────────────────────────────────────
// Admin auth configuration (TASK_73) — a single typed read of the
// ADMIN_JWT_SECRET-relevant environment. Mirrors the lightweight idiom of
// `auth/auth.config.ts`: a plain function, read once at module wiring.
//
// SEPARATE IDENTITY, SEPARATE SECRET: this is intentionally NOT `auth/auth.config.ts`.
// Admin tokens are signed with their OWN secret and carry `aud: 'tennis-admin'`
// (see `ADMIN_JWT_AUDIENCE` below); a user token can never pass `AdminAuthGuard`
// and an admin token can never pass the user `AuthGuard` (different secrets alone
// already guarantee this — the audience claim is belt-and-braces).
//
// ROUTE-ENABLEMENT GATE: admin routes are enabled when `ADMIN_JWT_SECRET` is set,
// OR when `NODE_ENV !== 'production'` (so local dev/CI gets a working admin API
// with no env setup, via the obvious dev sentinel below). In production with NO
// secret set, `routesEnabled` is false — `AdminModule.register()` then returns a
// module with NO controllers/providers at all, so `/v1/admin/*` doesn't exist
// (plain Express 404, not a guard-thrown one) and the API still boots cleanly.
//
// BOOT REFUSAL: if admin routes ARE enabled (so, in production, only reachable by
// EXPLICITLY setting ADMIN_JWT_SECRET) and that secret is literally still the
// obvious dev sentinel string, boot is refused — this is the "someone copy-pasted
// the example .env into production" case, not the normal "secret unset" case
// (which instead disables the routes, see above). Thrown here, the error
// propagates out of `AdminModule.register()`, which runs while `app.module.ts` is
// being evaluated (at import time, before `main.ts`'s `bootstrap()` even starts) —
// so the process never listens on a port.
// ─────────────────────────────────────────────────────────────────────────────

/** `aud` claim every admin JWT carries and every verify call requires. */
export const ADMIN_JWT_AUDIENCE = 'tennis-admin';

/** httpOnly cookie name for the admin session (Path=/v1/admin — see admin-auth.cookies.ts). */
export const ADMIN_SESSION_COOKIE_NAME = 'tennis_admin_session';

/** Obvious, loudly-logged dev-only sentinel — never valid in production. */
const ADMIN_JWT_SENTINEL = 'admin-change-me-insecure-dev-secret';

export interface AdminAuthConfig {
  /** HS256 signing secret for the admin access JWT. Never the sentinel in production. */
  jwtSecret: string;
  /** True when `jwtSecret` is still the dev sentinel (only possible outside production). */
  usingDefaultSecret: boolean;
  /** Admin session TTL in seconds (`ADMIN_TOKEN_TTL_SECONDS`, default 28800 = 8h). */
  tokenTtlSeconds: number;
  /**
   * Whether `/v1/admin/*` should exist at all. False only in production with no
   * `ADMIN_JWT_SECRET` set — see the module-level comment above.
   */
  routesEnabled: boolean;
}

/** Parse a positive-integer env var, falling back to `fallback` when absent/invalid. */
function intEnv(raw: string | undefined, fallback: number): number {
  const n = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Build the {@link AdminAuthConfig} from `process.env`. Called from
 * `AdminModule.register()` — i.e. at `app.module.ts` import time, before Nest
 * bootstraps — so a thrown Error here crashes the process before any route is
 * ever reachable (matching `loadStagingDemoAuthConfig` / `loadDevMembershipOverride`'s
 * "refuses to boot" idiom elsewhere in this API).
 */
export function loadAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const rawSecret = env.ADMIN_JWT_SECRET?.trim();
  const hasExplicitSecret = Boolean(rawSecret && rawSecret.length > 0);
  const jwtSecret = hasExplicitSecret ? rawSecret! : ADMIN_JWT_SENTINEL;
  const usingDefaultSecret = jwtSecret === ADMIN_JWT_SENTINEL;
  const isProduction = env.NODE_ENV === 'production';
  const routesEnabled = hasExplicitSecret || !isProduction;

  if (isProduction && routesEnabled && usingDefaultSecret) {
    throw new Error(
      'ADMIN_JWT_SECRET is set to the well-known dev sentinel value while ' +
        'NODE_ENV=production — admin routes would be reachable with a secret anyone ' +
        'can read in this repo. Set a long random ADMIN_JWT_SECRET, or unset it entirely ' +
        'to boot with admin routes disabled.',
    );
  }

  return {
    jwtSecret,
    usingDefaultSecret,
    tokenTtlSeconds: intEnv(env.ADMIN_TOKEN_TTL_SECONDS, 28800),
    routesEnabled,
  };
}

/** DI token for the singleton {@link AdminAuthConfig} provided by `AdminModule.register()`. */
export const ADMIN_AUTH_CONFIG = 'ADMIN_AUTH_CONFIG';
