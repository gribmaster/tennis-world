import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth configuration — a single typed read of the Google-relevant
// environment. Same lightweight idiom as `auth.config.ts` / `billing.config.ts`:
// a plain function (not a Nest provider) reading `process.env` once at module
// wiring, so the service never re-parses env.
//
// OPTIONAL-PROVIDER GATE (mirrors billing.config.ts's `configuredForCheckout`):
// this module NEVER throws at load time, no matter how incomplete the env is —
// the API must boot cleanly with zero Google env set (the default/off posture).
// `enabled` / `configured` are DERIVED booleans the Google routes check at
// REQUEST time via `assertGoogleAuthConfigured`, which is the only place this
// feature can fail loudly, and only when one of the two Google routes is hit.
//
// SECRETS LIVE HERE ONLY. `GOOGLE_CLIENT_SECRET` is server-only — never behind a
// NEXT_PUBLIC_* prefix (it would ship in the web bundle). The web app never reads
// any Google env; it only ever navigates the browser to `GET /v1/auth/google`.
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed, defaulted Google OAuth configuration derived from `process.env`. */
export interface GoogleAuthConfig {
  /** Explicit on/off flag (`GOOGLE_AUTH_ENABLED`). Default false — the ONLY safe
   *  default, and the only value that keeps the two Google routes inert. */
  enabled: boolean;
  /** OAuth 2.0 Client ID from the Google Cloud Console. Empty string when unset. */
  clientId: string;
  /** OAuth 2.0 Client Secret paired with `clientId`. Empty string when unset. */
  clientSecret: string;
  /** The exact callback URL registered with Google for this Client ID. Empty
   *  string when unset. */
  redirectUri: string;
  /** True when `enabled` AND all three credential values are present. Derived —
   *  the routes use this (via `assertGoogleAuthConfigured`) to tell "feature off"
   *  (404) apart from "feature on but misconfigured" (503). */
  configured: boolean;
}

/** Read + trim an env var; returns '' for absent OR whitespace-only values. */
function strEnv(raw: string | undefined): string {
  const v = raw?.trim();
  return v && v.length > 0 ? v : '';
}

/** Parse a boolean env var ("true"/"1" → true); defaults to `fallback`. */
function boolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Build the {@link GoogleAuthConfig} from `process.env`. Reads once at module
 * wiring (AuthModule provider factory) — env is already loaded by `dotenv` in
 * main.ts. Never throws.
 */
export function loadGoogleAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleAuthConfig {
  const enabled = boolEnv(env.GOOGLE_AUTH_ENABLED, false);
  const clientId = strEnv(env.GOOGLE_CLIENT_ID);
  const clientSecret = strEnv(env.GOOGLE_CLIENT_SECRET);
  const redirectUri = strEnv(env.GOOGLE_REDIRECT_URI);

  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    configured:
      enabled &&
      clientId.length > 0 &&
      clientSecret.length > 0 &&
      redirectUri.length > 0,
  };
}

/**
 * Request-time gate for both Google routes. Throws (never at boot — only when a
 * route handler calls this):
 *   - `NotFoundException` (404) when the feature is off (`enabled === false`) —
 *     the route conceptually doesn't exist, matching the "off by default" posture.
 *   - `ServiceUnavailableException` (503) when it's turned on but missing a
 *     credential — an ops misconfiguration, distinguishable from "off" in logs.
 */
export function assertGoogleAuthConfigured(config: GoogleAuthConfig): void {
  if (!config.enabled) {
    throw new NotFoundException();
  }
  if (!config.configured) {
    throw new ServiceUnavailableException('Google sign-in is not configured.');
  }
}

/** DI token for the singleton {@link GoogleAuthConfig} provided by AuthModule. */
export const GOOGLE_AUTH_CONFIG = 'GOOGLE_AUTH_CONFIG';
