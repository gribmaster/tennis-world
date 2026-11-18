import { ApiError, NETWORK_ERROR_MESSAGE } from './api-error';

// ─────────────────────────────────────────────────────────────────────────────
// apiFetch — the ONE place every /v1/admin/* request goes through (TASK_74
// decision 3/4). Every caller (authProvider, dataProvider, the countries/
// regions/images helper calls) goes through this function, never `fetch`
// directly, so the session cookie, the CSRF header, and the 401 -> /login
// redirect all live in exactly one place.
// ─────────────────────────────────────────────────────────────────────────────

// `import.meta.env` is injected by Vite in the browser bundle; it's `undefined`
// when this module is imported under plain Node (the `verify:admin-ui`
// harness runs `data-provider.ts`, which imports this file, via `tsx`) — the
// optional chain keeps that path from crashing on module load.
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:18001/v1').replace(
  /\/+$/,
  '',
);

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once by the app shell (see `components/SessionBoundary.tsx`) so
 *  this module can trigger a redirect without importing react-router itself. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** A plain JSON-serializable body, or a `FormData` for multipart uploads. */
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET';

  const headers: Record<string, string> = {};
  // CSRF (TASK_73 decision 2): every non-GET request authenticated by the
  // cookie must carry this header. Bearer-authenticated requests don't need
  // it, but this app never uses a bearer token (decision 3 — the token is
  // never stored), so every mutation always sends it.
  if (isMutation) {
    headers['X-Tennis-Admin'] = '1';
  }

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  const data = raw.length > 0 ? safeJsonParse(raw) : undefined;

  if (!response.ok) {
    // A 401 on `/admin/auth/login` itself is a REJECTED CREDENTIAL, not an
    // expired session — the server's own message ("Invalid email or
    // password.") is what the login form must show, not a generic fallback.
    // Every other 401 means the session cookie is gone/expired, which is what
    // triggers the central redirect (decision 3) — login never does, since
    // the admin is already sitting on `/login` trying to get IN.
    if (response.status === 401 && !path.startsWith('/admin/auth/login')) {
      unauthorizedHandler?.();
    }
    const message =
      data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : `Request failed (${response.status}).`;
    const missing =
      data && typeof data === 'object' && Array.isArray((data as { missing?: unknown }).missing)
        ? ((data as { missing: string[] }).missing)
        : undefined;
    const errors =
      data && typeof data === 'object' && typeof (data as { errors?: unknown }).errors === 'object'
        ? ((data as { errors: Record<string, unknown> }).errors)
        : undefined;
    throw new ApiError(message, response.status, { missing, errors });
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
