import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithAdmin } from './admin-auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCsrfGuard (TASK_73, decision 2) — every STATE-CHANGING request
// authenticated BY COOKIE must carry `X-Tennis-Admin: 1`, or 403. A browser
// can't be made to send a custom header on a plain cross-site form/fetch
// without a CORS preflight that our origin allowlist would already block, so
// requiring this header on cookie-authenticated mutations is a standard CSRF
// mitigation.
//
// EXEMPT: GET (read-only, no state change) and bearer-authenticated requests
// (not a browser-cookie-driven attack surface — a bearer caller already proves
// possession of the token). Must run AFTER `AdminAuthGuard` (reads
// `req.adminAuthVia`, which that guard sets) — `AdminOnly(...)` composes them in
// the right order.
// ─────────────────────────────────────────────────────────────────────────────

const CSRF_HEADER = 'x-tennis-admin';

@Injectable()
export class AdminCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & RequestWithAdmin>();

    if (req.method === 'GET' || req.method === 'HEAD') return true;
    if (req.adminAuthVia !== 'cookie') return true;

    const header = req.headers[CSRF_HEADER];
    const value = Array.isArray(header) ? header[0] : header;
    if (value !== '1') {
      throw new ForbiddenException(
        `Cookie-authenticated mutations must carry the ${CSRF_HEADER.toUpperCase()}: 1 header.`,
      );
    }
    return true;
  }
}
