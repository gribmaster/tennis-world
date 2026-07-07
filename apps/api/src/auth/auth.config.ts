// ─────────────────────────────────────────────────────────────────────────────
// Auth configuration — a single typed read of the auth-relevant environment.
//
// The API does not use @nestjs/config (env is read from `process.env`, populated
// by `dotenv` in main.ts before bootstrap). This module centralizes every auth env
// read into ONE place so the service/guard/cookies don't each re-parse env, and so
// the defaults/fallbacks are documented once. It is a plain function (not a Nest
// provider) — cheap, testable, no DI needed, matching the lightweight idiom the rest
// of apps/api uses for its `.dto.ts`/`.mapper.ts` helpers.
//
// SECRETS: `JWT_SECRET` lives in the API env only (never NEXT_PUBLIC_*). The dev
// sentinel "change-me" is allowed to boot locally but is flagged below so it can't
// silently ship — a real deployment MUST override it.
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed, defaulted auth configuration derived from `process.env`. */
export interface AuthConfig {
  /** HS256 signing secret for the access JWT. */
  jwtSecret: string;
  /** Name of the httpOnly session cookie. */
  cookieName: string;
  /** Access token / session lifetime, in seconds. */
  tokenTtlSeconds: number;
  /** Magic-link token lifetime, in minutes. */
  magicLinkTtlMinutes: number;
  /** Web origin the emailed magic link points at. */
  webAppUrl: string;
  /** CORS origin allowlist (credentialed). */
  corsOrigins: string[];
  /** `Secure` flag for the session cookie (false in local http dev). */
  cookieSecure: boolean;
  /**
   * `SameSite` attribute for the session cookie. 'lax' locally; 'none' is required
   * for cross-site auth (e.g. Vercel web ↔ Railway API on different domains) and
   * MUST be paired with Secure or the browser drops the cookie.
   */
  cookieSameSite: 'lax' | 'none' | 'strict';
  /** Optional cookie Domain; undefined → host-only cookie. */
  cookieDomain: string | undefined;
  /** When true, the dev mailer logs the magic link to the console. */
  magicLinkDevLog: boolean;
  /** True when the JWT secret is still the obvious dev sentinel. */
  usingDefaultSecret: boolean;
  /**
   * STAGING-ONLY demo auth (Feature 76). See {@link StagingDemoAuthConfig}. `null` when
   * disabled (the default, and the ONLY safe production value) — the guard's demo branch
   * is then completely inert. Never enabled implicitly (no NODE_ENV coupling): it is on
   * ONLY when `STAGING_DEMO_AUTH_ENABLED` is explicitly true.
   */
  stagingDemoAuth: StagingDemoAuthConfig | null;
}

/**
 * STAGING-ONLY demo auth configuration (Feature 76).
 *
 * ⚠️  DANGER — READ BEFORE TOUCHING. This lets any caller who knows a shared secret
 * authenticate as a fixed demo user WITHOUT a magic link, by sending the
 * `X-Tennis-Demo-Auth` header. It exists SOLELY so a client can walk through the Vercel
 * staging deployment (where the cross-domain session cookie doesn't stick) without login
 * friction. It is:
 *   - OFF by default and MUST stay off in production (`stagingDemoAuth === null`);
 *   - gated on an EXPLICIT `STAGING_DEMO_AUTH_ENABLED=true` — never on NODE_ENV;
 *   - limited to a single, free demo user (no entitlement bypass);
 *   - NOT a password/general backdoor — it grants exactly one identity.
 * The proper long-term fix is same-parent-domain subdomains so the real session cookie
 * works cross-site; this is a temporary staging convenience. See docs/STAGING_DEMO_AUTH.md.
 */
export interface StagingDemoAuthConfig {
  /** Shared secret the caller must present in the `X-Tennis-Demo-Auth` header. */
  secret: string;
  /** Email of the demo user (found-or-created on first authenticated demo request). */
  email: string;
}

/** Default CORS origins when `API_CORS_ORIGINS` is empty/missing (dev fallback —
 *  the web app on :3000 and the API's own :3001, never a production origin). */
const DEV_FALLBACK_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

/** Parse a positive-integer env var, falling back to `fallback` when absent/invalid. */
function intEnv(raw: string | undefined, fallback: number): number {
  const n = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse a boolean env var ("true"/"1" → true); defaults to `fallback`. */
function boolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** Valid `SameSite` values (lowercased). */
const SAME_SITE_VALUES = ['lax', 'none', 'strict'] as const;
type SameSite = (typeof SAME_SITE_VALUES)[number];

/**
 * Parse `AUTH_COOKIE_SAME_SITE` ("lax" | "none" | "strict", case-insensitive).
 * Empty/missing → 'lax' (the safe local/dev default). An unrecognized value is a
 * misconfiguration, so throw rather than silently coerce.
 */
function sameSiteEnv(raw: string | undefined): SameSite {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'lax';
  if ((SAME_SITE_VALUES as readonly string[]).includes(value)) {
    return value as SameSite;
  }
  throw new Error(
    `Invalid AUTH_COOKIE_SAME_SITE="${raw}". Expected one of: ${SAME_SITE_VALUES.join(', ')}.`,
  );
}

/**
 * Build the {@link AuthConfig} from `process.env`. Reads once at module wiring
 * (AuthModule provider factory) — env is already loaded by `dotenv` in main.ts.
 */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwtSecret = env.JWT_SECRET ?? 'change-me';

  // Empty/missing → dev fallback. Otherwise split on commas, trim, drop blanks.
  const originsRaw = env.API_CORS_ORIGINS?.trim();
  const corsOrigins =
    originsRaw && originsRaw.length > 0
      ? originsRaw
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o.length > 0)
      : DEV_FALLBACK_ORIGINS;

  const cookieDomain = env.AUTH_COOKIE_DOMAIN?.trim();

  const cookieSecure = boolEnv(env.AUTH_COOKIE_SECURE, false);
  const cookieSameSite = sameSiteEnv(env.AUTH_COOKIE_SAME_SITE);

  // Browsers REJECT a `SameSite=None` cookie that isn't also `Secure` — the cookie
  // is silently dropped, which is exactly the "login doesn't persist" failure this
  // configuration is meant to fix. Fail fast at boot rather than ship a cookie the
  // browser will discard.
  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error(
      'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true — browsers reject ' +
        'a SameSite=None cookie without the Secure attribute (the cookie is dropped).',
    );
  }

  const stagingDemoAuth = loadStagingDemoAuthConfig(env);

  return {
    jwtSecret,
    cookieName: env.AUTH_COOKIE_NAME?.trim() || 'tennis_session',
    tokenTtlSeconds: intEnv(env.AUTH_TOKEN_TTL_SECONDS, 3600),
    magicLinkTtlMinutes: intEnv(env.MAGIC_LINK_TTL_MINUTES, 15),
    webAppUrl: env.WEB_APP_URL?.trim() || 'http://localhost:3000',
    corsOrigins,
    cookieSecure,
    cookieSameSite,
    cookieDomain: cookieDomain && cookieDomain.length > 0 ? cookieDomain : undefined,
    magicLinkDevLog: boolEnv(env.MAGIC_LINK_DEV_LOG, true),
    usingDefaultSecret: jwtSecret === 'change-me',
    stagingDemoAuth,
  };
}

/** Default demo user email when `STAGING_DEMO_EMAIL` is unset (but demo auth is enabled). */
const DEFAULT_STAGING_DEMO_EMAIL = 'demo@tennisworld.local';

/**
 * Parse the STAGING-ONLY demo-auth env (Feature 76). Returns `null` (disabled) unless
 * `STAGING_DEMO_AUTH_ENABLED` is explicitly true — the default, and the only safe
 * production posture. When enabled it REQUIRES `STAGING_DEMO_AUTH_SECRET`; a missing/blank
 * secret is a fail-fast BOOT ERROR (prompt task 7) rather than a silently-open door with an
 * empty secret. `STAGING_DEMO_EMAIL` defaults to the documented demo address.
 *
 * NODE_ENV is deliberately NOT consulted here (prompt task 6): demo auth turns on ONLY via
 * this explicit flag, so it can never be enabled implicitly by an environment name.
 */
function loadStagingDemoAuthConfig(
  env: NodeJS.ProcessEnv,
): StagingDemoAuthConfig | null {
  if (!boolEnv(env.STAGING_DEMO_AUTH_ENABLED, false)) {
    return null;
  }

  const secret = env.STAGING_DEMO_AUTH_SECRET?.trim();
  if (!secret) {
    // Fail fast: an enabled-but-secretless demo mode would either reject every request
    // (useless) or, worse, match an empty header (an open door). Neither is acceptable.
    throw new Error(
      'STAGING_DEMO_AUTH_ENABLED=true requires a non-empty STAGING_DEMO_AUTH_SECRET. ' +
        'Set a long random secret, or disable staging demo auth (unset ' +
        'STAGING_DEMO_AUTH_ENABLED). This is a STAGING-ONLY convenience — never enable it ' +
        'in production.',
    );
  }

  const email =
    env.STAGING_DEMO_EMAIL?.trim() || DEFAULT_STAGING_DEMO_EMAIL;

  return { secret, email };
}

/** DI token for the singleton {@link AuthConfig} provided by AuthModule. */
export const AUTH_CONFIG = 'AUTH_CONFIG';
