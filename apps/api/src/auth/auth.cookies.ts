import type { CookieOptions, Response } from 'express';
import type { AuthConfig } from './auth.config';

// ─────────────────────────────────────────────────────────────────────────────
// Session-cookie helpers — set/clear the httpOnly access-token cookie for the web
// client. Centralized so `set` and `clear` use IDENTICAL attributes (name, path,
// domain, secure, sameSite) — a mismatch is the classic "logout doesn't clear the
// cookie" bug, since the browser only overwrites a cookie whose name+path+domain
// all match.
//
// SECURITY (Feature 50 §9):
//   - httpOnly  : the JWT is not readable by JS → an XSS injection can't exfiltrate
//                 the session (the whole reason web uses a cookie, not localStorage).
//   - sameSite  : from AUTH_COOKIE_SAME_SITE (default 'lax'). 'lax' blocks the cookie
//                 on cross-site POST/fetch (CSRF baseline) while still sending it on the
//                 top-level GET navigation that the emailed magic link produces (a
//                 'strict' cookie would be withheld on that first click-from-email,
//                 breaking the verify landing). But when web and API live on DIFFERENT
//                 sites (e.g. Vercel web ↔ Railway API), the browser treats every
//                 credentialed API call as cross-site and withholds a 'lax' cookie, so
//                 the session never persists — those deployments MUST set 'none' (which
//                 the config layer pairs with Secure, or refuses to boot). The stronger
//                 double-submit-token control on /v1/me/* mutations is a documented
//                 follow-on (Feature 50 §7.5).
//   - secure    : from AUTH_COOKIE_SECURE — false on local http, MUST be true on https.
//   - path '/'  : the cookie is sent to every API route (the guard reads it anywhere).
//   - maxAge    : matches the JWT TTL so the cookie and token expire together.
// ─────────────────────────────────────────────────────────────────────────────

/** Shared attributes for both set and clear (everything except `maxAge`/value). */
function baseCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

/** Set the session cookie carrying the signed access token (web cookie path). */
export function setSessionCookie(
  res: Response,
  config: AuthConfig,
  token: string,
): void {
  res.cookie(config.cookieName, token, {
    ...baseCookieOptions(config),
    maxAge: config.tokenTtlSeconds * 1000, // express expects ms
  });
}

/**
 * Clear the session cookie (logout). Uses the SAME name/path/domain/flags as `set`
 * so the browser actually overwrites it; `res.clearCookie` emits a `Set-Cookie`
 * with an expired date and empty value.
 */
export function clearSessionCookie(res: Response, config: AuthConfig): void {
  res.clearCookie(config.cookieName, baseCookieOptions(config));
}
