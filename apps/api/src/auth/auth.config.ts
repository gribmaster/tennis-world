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
  /** Optional cookie Domain; undefined → host-only cookie. */
  cookieDomain: string | undefined;
  /** When true, the dev mailer logs the magic link to the console. */
  magicLinkDevLog: boolean;
  /** True when the JWT secret is still the obvious dev sentinel. */
  usingDefaultSecret: boolean;
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

  return {
    jwtSecret,
    cookieName: env.AUTH_COOKIE_NAME?.trim() || 'tennis_session',
    tokenTtlSeconds: intEnv(env.AUTH_TOKEN_TTL_SECONDS, 3600),
    magicLinkTtlMinutes: intEnv(env.MAGIC_LINK_TTL_MINUTES, 15),
    webAppUrl: env.WEB_APP_URL?.trim() || 'http://localhost:3000',
    corsOrigins,
    cookieSecure: boolEnv(env.AUTH_COOKIE_SECURE, false),
    cookieDomain: cookieDomain && cookieDomain.length > 0 ? cookieDomain : undefined,
    magicLinkDevLog: boolEnv(env.MAGIC_LINK_DEV_LOG, true),
    usingDefaultSecret: jwtSecret === 'change-me',
  };
}

/** DI token for the singleton {@link AuthConfig} provided by AuthModule. */
export const AUTH_CONFIG = 'AUTH_CONFIG';
