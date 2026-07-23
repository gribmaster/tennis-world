// Browser-side auth transport for the magic-link flow (Feature 57).
//
// These three calls hit the PUBLIC, identity-establishing `/v1/auth/*` endpoints
// (Feature 52). They are NOT repository methods — they don't read/write a domain
// resource, they establish or end the session — so they live in the auth feature, not the
// domain/http repository layer. This keeps a small, purpose-built client here rather than
// widening the repository surface with auth concerns.
//
// COOKIE: `verify` and `logout` use `credentials:'include'` so the API's `Set-Cookie`
// (verify) / cookie-clear (logout) actually lands on the web origin's cookie jar. The web
// origin (NEXT_PUBLIC_API_BASE_URL host) must be on the API's CORS allowlist with
// credentials — it is in dev (API_CORS_ORIGINS=http://localhost:3000). `request-link`
// needs no cookie (it's pre-session) but is harmless to send same-shape.
//
// MODE: real network only matters in `api` mode. In MOCK mode there is no API; the forms
// keep their cosmetic success UX and never call these (they check the data source first).
// Base-URL resolution mirrors the http-client (NEXT_PUBLIC_API_BASE_URL incl. /v1, or the
// local-dev default) so there's one consistent target.

import type { AuthSessionDTO } from '@tennis/contracts';

const DEFAULT_API_BASE_URL = 'http://localhost:3001/v1';

export function resolveBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

/**
 * Build the URL the browser navigates to for Google sign-in — GET
 * `${API_BASE_URL}/auth/google[?redirectTo=...]`. This is a FULL-PAGE navigation
 * target (an `<a href>`), never fetched via AJAX: the API responds with a 302 to
 * Google, which only makes sense as a real browser navigation. `redirectTo` is
 * forwarded as-is (the same value the magic-link flow already reads from
 * `useSearchParams()`); the API re-validates it server-side (open-redirect guard)
 * before ever honoring it, so an untrusted value here is harmless.
 */
export function buildGoogleSignInUrl(redirectTo?: string): string {
  const url = new URL(`${resolveBaseUrl()}/auth/google`);
  if (redirectTo) url.searchParams.set('redirectTo', redirectTo);
  return url.toString();
}

/** True when the web app is wired to the live API (vs. the in-memory mock). */
export function isApiMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE?.trim() === 'api';
}

/** A failed auth request, carrying the status for the caller's inline error copy. */
export class AuthClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

/**
 * POST /v1/auth/request-link — start the magic-link flow for `email`. The API always
 * responds 202 `{ ok: true }` regardless of whether the email has an account (no
 * enumeration), so a 2xx here means "we accepted it" — NOT "this email exists". Throws
 * `AuthClientError` on a network failure or a non-2xx (e.g. 400 invalid email) so the form
 * can show an inline error. `redirectTo` is forwarded so verify can bounce the user back
 * to where they started; the API allowlists it server-side (open-redirect guard).
 */
export async function requestMagicLink(
  email: string,
  redirectTo?: string,
): Promise<void> {
  const res = await fetch(`${resolveBaseUrl()}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(redirectTo ? { email, redirectTo } : { email }),
  });
  if (!res.ok) {
    throw new AuthClientError(res.status, `request-link failed (${res.status})`);
  }
}

/**
 * POST /v1/auth/verify — exchange the single-use token for a session. Uses
 * `credentials:'include'` so the API's httpOnly session cookie is stored on the web
 * origin. Returns the `AuthSessionDTO` (the web path ignores the bearer token — the cookie
 * carries it). Throws `AuthClientError` on an invalid/expired token (400) or network fault.
 */
export async function verifyMagicLink(token: string): Promise<AuthSessionDTO> {
  const res = await fetch(`${resolveBaseUrl()}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new AuthClientError(res.status, `verify failed (${res.status})`);
  }
  return (await res.json()) as AuthSessionDTO;
}

/**
 * POST /v1/auth/logout — clear the session cookie. `credentials:'include'` so the
 * cookie-clear `Set-Cookie` overwrites the web origin's cookie. The endpoint is idempotent
 * and unguarded (safe even when already logged out), so a non-2xx is unusual; we still
 * throw `AuthClientError` so the caller can decide (it generally proceeds to redirect
 * regardless — being signed out locally is the goal either way).
 */
export async function logout(): Promise<void> {
  const res = await fetch(`${resolveBaseUrl()}/auth/logout`, {
    method: 'POST',
    headers: { accept: 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new AuthClientError(res.status, `logout failed (${res.status})`);
  }
}
