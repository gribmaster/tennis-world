import type { CookieOptions, Response } from 'express';
import type { AuthConfig } from '../../auth/auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { ADMIN_SESSION_COOKIE_NAME } from './admin-auth.config';

// ─────────────────────────────────────────────────────────────────────────────
// Admin session-cookie helpers (TASK_73, decision 2) — set/clear the httpOnly
// admin cookie. `Path=/v1/admin` (never sent to `/v1/me`-style user routes, and
// never read by the user `AuthGuard`, which never looks at this cookie name
// anyway). `Secure`/`SameSite`/`Domain` come from the EXISTING `AuthConfig`
// (`auth/auth.config.ts`'s `loadAuthConfig()`) — called directly as a pure
// function here, NOT via AuthModule's DI-provided AUTH_CONFIG, so this module
// stays fully independent of the user auth module (decision 1: never reuse
// AuthGuard/AuthService/the user cookie name — only the shared cookie-attribute
// VALUES are read, not the module).
// ─────────────────────────────────────────────────────────────────────────────

function baseCookieOptions(authConfig: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: authConfig.cookieSameSite,
    secure: authConfig.cookieSecure,
    path: '/v1/admin',
    ...(authConfig.cookieDomain ? { domain: authConfig.cookieDomain } : {}),
  };
}

export function setAdminSessionCookie(
  res: Response,
  authConfig: AuthConfig,
  adminConfig: AdminAuthConfig,
  token: string,
): void {
  res.cookie(ADMIN_SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(authConfig),
    maxAge: adminConfig.tokenTtlSeconds * 1000, // express expects ms
  });
}

export function clearAdminSessionCookie(res: Response, authConfig: AuthConfig): void {
  res.clearCookie(ADMIN_SESSION_COOKIE_NAME, baseCookieOptions(authConfig));
}
