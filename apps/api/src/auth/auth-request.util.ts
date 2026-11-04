import type { Request } from 'express';
import type { AuthConfig } from './auth.config';
import type { AuthContext, RequestWithAuth } from './auth.types';
import { safeEqual } from './crypto.util';

// ─────────────────────────────────────────────────────────────────────────────
// Shared request-auth extraction (TASK_72) — pulled out of `AuthGuard` so a second
// guard (`OptionalAuthGuard`, for public-but-viewer-aware routes) can reuse the
// EXACT SAME cookie/bearer/demo-auth logic rather than a copy that could drift.
// `AuthGuard`'s own behavior is UNCHANGED by this refactor — it just calls these
// same two functions instead of private methods on itself.
// ─────────────────────────────────────────────────────────────────────────────

/** Header carrying the staging demo-auth secret (Feature 76). Lower-case: Node lowercases header keys. */
const DEMO_AUTH_HEADER = 'x-tennis-demo-auth';

/**
 * Cookie first (web), then `Authorization: Bearer` (mobile/API). Never throws.
 * Returns `undefined` when neither is present.
 */
export function extractToken(req: Request, config: AuthConfig): string | undefined {
  // cookie-parser populates `req.cookies`; typed loosely (no global augmentation).
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[config.cookieName];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || undefined;
  }
  return undefined;
}

/**
 * STAGING-ONLY (Feature 76) demo-auth header check — never throws. Result is a
 * tri-state so each GUARD decides what "present but wrong" means for its own route
 * (`AuthGuard` hard-rejects; `OptionalAuthGuard` falls back to anonymous):
 *   - `'absent'`  — no demo header at all (or demo mode is off).
 *   - `'invalid'` — header present but does not match the configured secret.
 *   - `AuthContext` — header matches; the demo user is resolved/created.
 */
export type DemoAuthResult = 'absent' | 'invalid' | AuthContext;

export async function tryDemoAuth(
  req: Request,
  config: AuthConfig,
  resolveDemoUser: (email: string) => Promise<{ sub: string; email: string }>,
): Promise<DemoAuthResult> {
  if (!config.stagingDemoAuth) return 'absent';
  const provided = req.headers[DEMO_AUTH_HEADER];
  // Header may arrive as string | string[] | undefined; only a single string is valid.
  const value = typeof provided === 'string' ? provided : undefined;
  if (value === undefined || value.length === 0) {
    return 'absent';
  }
  if (!safeEqual(value, config.stagingDemoAuth.secret)) {
    return 'invalid';
  }
  const payload = await resolveDemoUser(config.stagingDemoAuth.email);
  return { userId: payload.sub, email: payload.email };
}

/** Convenience re-export so both guards type their request the same way. */
export type { RequestWithAuth };
