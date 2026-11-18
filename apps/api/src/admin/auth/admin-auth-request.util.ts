import type { Request } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Admin token extraction (TASK_73) — cookie first (the admin web app), then
// `Authorization: Bearer` (any API client / the `verify:admin-courts` harness).
// Mirrors `auth/auth-request.util.ts`'s shape but reads the ADMIN cookie name and
// returns which transport was used, since `AdminCsrfGuard` needs to know.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedAdminToken {
  token: string;
  via: 'cookie' | 'bearer';
}

export function extractAdminToken(
  req: Request,
  cookieName: string,
): ExtractedAdminToken | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[cookieName];
  if (fromCookie) return { token: fromCookie, via: 'cookie' };

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return { token, via: 'bearer' };
  }
  return undefined;
}
