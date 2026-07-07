// Shared HTTP client for the Phase-2 `api` data-source repositories.
//
// This is the ONE place the web app talks to the public API over HTTP. The HTTP
// repositories (http-court / http-collection / http-article / consultation, plus
// the Feature-56 http-user / http-saved) are thin adapters over the methods here;
// they never call `fetch` directly. Keeping the transport in a single tiny module
// means the base URL, JSON parsing, query-string building, the 404→null convention,
// and (Feature 56) the auth transport are defined exactly once.
//
// DELIBERATELY SMALL (prompt task 1: "no large abstraction, no dependency"):
//   - no client class, no interceptors, no retry/backoff, no caching layer;
//   - `getJson` / `getJsonOrNull` / `postJson` / `patchJson` / `deleteJson` plus a
//     `buildQuery` helper, all thin wrappers over one private `requestJson`.
//
// BASE URL resolution (prompt task 1):
//   - `NEXT_PUBLIC_API_BASE_URL` when set (the `NEXT_PUBLIC_` prefix so the value
//     is readable in BOTH server components and client islands — the consultation
//     modal submits from the browser);
//   - else the local-dev default `http://localhost:3001/v1`.
//   The production URL is NEVER hardcoded — it comes from the env var.
//
// The base URL already includes the `/v1` version segment, so repository paths are
// passed WITHOUT it (e.g. `/courts`, `/collections/:slug`). A trailing slash on the
// configured base is tolerated.
//
// AUTH TRANSPORT (Feature 56) — see `HttpAuthOptions` below. The protected /v1/me/*
// reads/writes need to carry identity. This module stays ENVIRONMENT-NEUTRAL: it
// NEVER imports `next/headers` (domain code is bundled for both server and client),
// so it can't read cookies itself. Instead the CALLER supplies how to authenticate:
//   - `auth: 'include'`   → browser: send the httpOnly session cookie (fetch
//                           `credentials: 'include'`). No-op effect on the server
//                           (there is no ambient cookie jar there) — harmless.
//   - `cookie: '<header>'` → server: attach a literal `Cookie:` header (a server
//                           component reads its incoming cookies via `next/headers`
//                           in a SERVER-ONLY factory helper — Feature 57 — and passes
//                           the string in here; this module never touches next/headers).
//   - `bearerToken: '<jwt>'` → attach `Authorization: Bearer <jwt>` (the mobile-like
//                           path; also how the Feature-56 verification script authenticates).
//   - `demoAuthSecret: '<secret>'` → STAGING ONLY (Feature 76): attach
//                           `X-Tennis-Demo-Auth: <secret>` so the API's staging demo-auth
//                           branch authenticates as the fixed demo user (no cookie needed).
//                           This module never READS the secret — a server-only caller
//                           (lib/repositories.server.ts) supplies it. See docs/STAGING_DEMO_AUTH.md.
// Public repositories pass NONE of these and keep working exactly as before.

/** Local-dev default. The `/v1` version segment is part of the base. */
const DEFAULT_API_BASE_URL = 'http://localhost:3001/v1';

/**
 * Resolve the API base URL from the environment, trimming any trailing slash so
 * `${base}${path}` never produces a double slash. Read at call time (not module
 * load) so tests can vary it; the lookup is trivial.
 */
function resolveBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

/**
 * Error thrown for a non-2xx response that the caller did not special-case (404 is
 * mapped to `null` by `getJsonOrNull`, so it does not reach here for those reads).
 * Carries the status and the offending path for a clear, actionable message.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    /** The response body text, when available — useful for surfacing API 400s. */
    readonly bodyText?: string,
  ) {
    super(`API request to ${path} failed with ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Raised when a protected /v1/me/* request comes back 401 (missing/invalid/expired
 * session). A distinct, typed subclass of {@link HttpError} so the future
 * logged-out UX (Feature 57) can branch on "not authenticated" specifically —
 * `err instanceof AuthRequiredError` — instead of string-matching a status. The
 * HTTP repositories throw this rather than silently falling back to mock/empty data,
 * so "logged out" never masquerades as "you have nothing saved" (prompt task 3).
 */
export class AuthRequiredError extends HttpError {
  constructor(path: string, bodyText?: string) {
    super(401, path, bodyText);
    this.name = 'AuthRequiredError';
  }
}

/**
 * How a request authenticates against the protected API (Feature 56). All fields are
 * optional; a request that supplies none is unauthenticated (the public reads). The
 * three are not mutually exclusive at the type level, but in practice a caller picks
 * ONE per environment (browser → `auth: 'include'`; server component → `cookie`;
 * script/mobile → `bearerToken`). See the file header for the per-environment story.
 */
export interface HttpAuthOptions {
  /**
   * Browser only: send the httpOnly session cookie with the request (fetch
   * `credentials: 'include'`). `true` and `'include'` are equivalent. Has no effect
   * on the server (no ambient cookie jar) — pass `cookie` there instead.
   */
  auth?: boolean | 'include';
  /**
   * Server only: a literal value for the `Cookie:` request header (e.g. the
   * `tennis_session=…` string a server component reads from its incoming request via
   * `next/headers`). Supplied by a SERVER-ONLY caller; this module never reads cookies.
   */
  cookie?: string;
  /**
   * Attach `Authorization: Bearer <jwt>`. The mobile-like path and the transport the
   * Feature-56 verification script uses (obtain a token from `POST /v1/auth/verify`).
   */
  bearerToken?: string;
  /**
   * STAGING-ONLY (Feature 76): attach `X-Tennis-Demo-Auth: <secret>` so the API's
   * staging demo-auth branch authenticates the request as the fixed demo user (no cookie
   * needed). This module never READS the secret — a SERVER-ONLY caller passes it in
   * (lib/repositories.server.ts reads it from the server-only `STAGING_DEMO_AUTH_SECRET`
   * env), keeping it out of the browser bundle. Undefined in normal operation. ⚠️  See
   * docs/STAGING_DEMO_AUTH.md.
   */
  demoAuthSecret?: string;
}

/**
 * Internal request options: the HTTP method, an optional JSON body, and the auth
 * transport. `GET`/`DELETE` carry no body; `POST`/`PATCH` do. Kept private — callers
 * use the named `getJson`/`postJson`/… wrappers, not this shape directly.
 */
interface RequestOptions extends HttpAuthOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON request body (serialized + `content-type: application/json`). Omit for GET/DELETE. */
  body?: unknown;
  /**
   * When true, a 404 resolves to `null` instead of throwing (the
   * `getBySlug`-style reads). The caller is responsible for the `T | null` typing.
   */
  allowNull?: boolean;
}

/**
 * Value types accepted in a query object. `undefined` keys are dropped entirely so
 * an absent filter never appears as `?country=` (matching how the API's manual
 * parsers treat a missing vs. empty param). Booleans/numbers are stringified.
 */
export type QueryValue = string | number | boolean | undefined;

/**
 * Build a `?a=1&b=2` query string from a flat object, omitting `undefined` values
 * and URL-encoding keys/values. Returns `''` when nothing remains, so it can be
 * appended unconditionally (`${path}${buildQuery(q)}`).
 */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Join the resolved base URL with a repository-relative path. */
function url(path: string): string {
  // Paths are authored with a leading slash (`/courts`); the base has none trailing.
  return `${resolveBaseUrl()}${path}`;
}

/** Read a non-2xx response body as text, swallowing any read error. */
async function safeBodyText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

/**
 * Build the `fetch` init from the request options, applying the auth transport. The
 * `Accept` header is always present; `content-type` only when there's a JSON body.
 * Returns the init AND whether `credentials: 'include'` should be set (browser cookie
 * path). Kept tiny and pure so the auth wiring lives in exactly one place.
 */
function buildInit(options: RequestOptions): RequestInit {
  const headers: Record<string, string> = { accept: 'application/json' };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  // Server-side cookie forwarding: a literal Cookie header (the browser path uses
  // credentials:'include' instead, below — never both, but harmless if both given).
  if (options.cookie) {
    headers['cookie'] = options.cookie;
  }
  // Bearer path (mobile-like / verification script).
  if (options.bearerToken) {
    headers['authorization'] = `Bearer ${options.bearerToken}`;
  }
  // STAGING-ONLY demo-auth header (Feature 76). Only set when a server-only caller supplies
  // the secret; never present in normal operation. ⚠️  See docs/STAGING_DEMO_AUTH.md.
  if (options.demoAuthSecret) {
    headers['x-tennis-demo-auth'] = options.demoAuthSecret;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    // Always hit the API for fresh data; Next's fetch cache is not desired for the
    // repository layer (pages opt into their own caching/revalidation if needed).
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  // Browser cookie path: send the httpOnly session cookie. No effect server-side.
  if (options.auth === true || options.auth === 'include') {
    init.credentials = 'include';
  }
  return init;
}

/**
 * The single transport primitive every wrapper goes through. Issues the request,
 * maps a 404 to `null` when `allowNull` is set (the `getBySlug` convention), maps a
 * 401 to {@link AuthRequiredError} (so logged-out is distinguishable), and throws
 * {@link HttpError} for any other non-2xx.
 *
 * The result is returned as `T` via assertion: the API responses are already
 * contract-shaped DTOs (validated server-side), so re-validating every payload with
 * the zod schemas here would add runtime cost for no real safety gain. (See the
 * repository files for the documented "type assertion, not zod" choice.)
 */
async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(url(path), buildInit(options));
  if (options.allowNull && res.status === 404) {
    return null as T;
  }
  if (res.status === 401) {
    throw new AuthRequiredError(path, await safeBodyText(res));
  }
  if (!res.ok) {
    throw new HttpError(res.status, path, await safeBodyText(res));
  }
  return (await res.json()) as T;
}

/**
 * GET `path` and parse the JSON body as `T`. Throws `HttpError` for any non-2xx
 * response (including 404 — use `getJsonOrNull` for the `getBySlug`-style reads
 * whose repository interface returns `null` on a miss), or `AuthRequiredError` on 401.
 * `auth` carries the optional auth transport for protected reads (Feature 56).
 */
export async function getJson<T>(path: string, auth?: HttpAuthOptions): Promise<T> {
  return requestJson<T>(path, { method: 'GET', ...auth });
}

/**
 * GET `path` like {@link getJson}, but map a 404 to `null` instead of throwing —
 * the convention every `getBySlug(slug): Promise<… | null>` repository method
 * relies on. A 401 still throws `AuthRequiredError`; other non-2xx still throw
 * `HttpError`.
 */
export async function getJsonOrNull<T>(
  path: string,
  auth?: HttpAuthOptions,
): Promise<T | null> {
  return requestJson<T | null>(path, { method: 'GET', allowNull: true, ...auth });
}

/**
 * POST a JSON `body` to `path` and parse the JSON response as `T`. Throws
 * `HttpError` for any non-2xx response (the consultation submit surfaces this as a
 * non-blocking in-modal error), or `AuthRequiredError` on 401. `auth` carries the
 * optional auth transport for protected writes (Feature 56).
 */
export async function postJson<T>(
  path: string,
  body: unknown,
  auth?: HttpAuthOptions,
): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body, ...auth });
}

/**
 * PATCH a JSON `body` to `path` and parse the JSON response as `T` (Feature 56 —
 * backs the rename endpoint). Throws `HttpError`/`AuthRequiredError` on failure.
 */
export async function patchJson<T>(
  path: string,
  body: unknown,
  auth?: HttpAuthOptions,
): Promise<T> {
  return requestJson<T>(path, { method: 'PATCH', body, ...auth });
}

/**
 * DELETE `path` and parse the JSON response as `T` (Feature 56 — backs the
 * remove-court endpoint, which returns the updated folder DTO). No request body.
 * Throws `HttpError`/`AuthRequiredError` on failure.
 */
export async function deleteJson<T>(path: string, auth?: HttpAuthOptions): Promise<T> {
  return requestJson<T>(path, { method: 'DELETE', ...auth });
}
