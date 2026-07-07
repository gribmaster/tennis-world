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
  };
}

/** DI token for the singleton {@link AuthConfig} provided by AuthModule. */
export const AUTH_CONFIG = 'AUTH_CONFIG';
