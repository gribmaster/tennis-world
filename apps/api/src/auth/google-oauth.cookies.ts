import type { CookieOptions, Request, Response } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth state-cookie helpers — the transient, single-use httpOnly cookie
// that CSRF-protects the `GET /v1/auth/google` → Google → `GET
// /v1/auth/google/callback` round-trip. This is a SEPARATE cookie from the
// application session cookie (`auth.cookies.ts`) — it never carries identity,
// only the random nonce (compared against Google's `state` param) and the
// already-sanitized `redirectTo` the user asked to return to.
//
// WHY THE REDIRECT DESTINATION LIVES HERE (not in the `state` param sent to
// Google): the `state` param round-trips through Google and is visible in the
// browser's address bar/history on the callback leg. Piggy-backing `redirectTo`
// on the cookie — which is already the trust anchor for the nonce, and already
// has to be read back — avoids leaking the destination into browser history and
// avoids inventing a second signing/encoding scheme. `state` itself stays a
// single opaque random token, as Google's own docs recommend.
//
// ATTRIBUTES:
//   - httpOnly : not readable by JS (same reasoning as the session cookie).
//   - sameSite : FIXED 'lax' — NOT derived from AUTH_COOKIE_SAME_SITE. Google's
//                redirect back to our callback is a top-level cross-site GET
//                navigation, which Lax is specifically designed to allow (Lax
//                only withholds cookies on cross-site subresource/XHR/POST).
//                'strict' would break the flow (Google's redirect IS cross-site
//                from google's origin); 'none' is unnecessary and strictly worse
//                (larger CSRF surface). Lax is the least-permissive value that
//                still works.
//   - secure   : reuses the EXISTING `AuthConfig.cookieSecure` — no new env var.
//   - path     : scoped to '/v1/auth/google' so the cookie never rides along on
//                unrelated requests.
//   - maxAge   : short (10 minutes) — the state cookie's own expiry IS the
//                "reject expired state" mechanism; once it's gone, the callback's
//                "read the cookie" step returns undefined and state comparison
//                fails closed, identical to a missing/mismatched state.
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_STATE_COOKIE_NAME = 'tennis_google_oauth_state';
const GOOGLE_STATE_COOKIE_PATH = '/v1/auth/google';
const GOOGLE_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Payload stored (as JSON) in the state cookie. */
export interface GoogleStateCookiePayload {
  /** Crypto-random nonce — compared (timing-safe) against Google's `state` query param. */
  nonce: string;
  /** Already-sanitized post-login destination, if the caller supplied one. */
  redirectTo?: string;
}

/** Shared attributes for set/clear (everything except `maxAge`/value). */
function baseStateCookieOptions(cookieSecure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    path: GOOGLE_STATE_COOKIE_PATH,
  };
}

/** Set the OAuth state cookie carrying the nonce + validated redirect target. */
export function setGoogleStateCookie(
  res: Response,
  cookieSecure: boolean,
  payload: GoogleStateCookiePayload,
): void {
  res.cookie(GOOGLE_STATE_COOKIE_NAME, JSON.stringify(payload), {
    ...baseStateCookieOptions(cookieSecure),
    maxAge: GOOGLE_STATE_MAX_AGE_MS,
  });
}

/**
 * Read + parse the state cookie. Returns undefined for a missing cookie OR any
 * parse failure (malformed/tampered value) — never throws. The callback treats
 * both cases identically to "no matching state".
 */
export function readGoogleStateCookie(
  req: Request,
): GoogleStateCookiePayload | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const raw = cookies?.[GOOGLE_STATE_COOKIE_NAME];
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { nonce?: unknown }).nonce === 'string'
    ) {
      const { nonce, redirectTo } = parsed as GoogleStateCookiePayload;
      return typeof redirectTo === 'string' ? { nonce, redirectTo } : { nonce };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Clear the state cookie. Uses the SAME name/path/attrs used when set, so the
 * browser actually overwrites it. Called unconditionally on every callback
 * outcome (success, error, mismatch) — the cookie is single-use regardless.
 */
export function clearGoogleStateCookie(res: Response, cookieSecure: boolean): void {
  res.clearCookie(GOOGLE_STATE_COOKIE_NAME, baseStateCookieOptions(cookieSecure));
}
