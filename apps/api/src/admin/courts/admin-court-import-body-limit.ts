import type { NextFunction, Request, Response } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Route-scoped JSON body size limit for `POST /v1/admin/courts/import` only
// (TASK_79 — 50 long blurbs don't fit the Nest/Express default 100 kB JSON
// limit). Hand-rolled instead of `express.json({ limit })` because neither
// `express` nor `body-parser` is a direct dependency of apps/api (pnpm's
// strict per-package node_modules — no phantom deps) and the task forbids
// adding one.
//
// HOW THIS STAYS SCOPED TO ONE ROUTE: `main.ts` mounts this via
// `app.use(ADMIN_COURT_IMPORT_ROUTE, ...)` in the window BETWEEN
// `NestFactory.create()` returning and `app.listen()` being called — Nest's
// own global body-parser middleware is registered lazily, inside
// `app.listen()` (`NestApplication.init() -> registerParserMiddleware()`), so
// this middleware runs FIRST for this one path and nowhere else. Once it has
// parsed the body it sets `req._body = true` (the same flag `body-parser`
// itself sets), which makes Nest's own global `json()` parser skip re-reading
// the (already-consumed) stream for this request — every OTHER admin route
// never sees this middleware at all and keeps the default 100 kB limit.
//
// The controller reads the resulting `req.body` through a PLAIN
// `@Body() rawBody: Record<string, unknown>` parameter, never through a
// `class-validator` DTO class — the global `ValidationPipe`'s
// `plainToInstance` crashes (`TypeError: Cannot read properties of undefined
// (reading 'constructor')`) while generically deep-cloning a nested plain
// object that has an OWN `constructor` key, which is exactly one of the keys
// the task requires to be a clean per-item error, never a 500. A parameter
// typed as `Record<string, unknown>` has no class metatype, so Nest's pipe
// skips transformation/validation for it entirely (the same documented
// mechanism `apps/api/src/main.ts` already relies on for
// `@Query() query: Record<string, unknown>`) — `req.body` then reaches the
// controller completely untouched, so a literal `__proto__`/`constructor`/
// `prototype` own key survives for the service's own forbidden-key check.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_COURT_IMPORT_ROUTE = '/v1/admin/courts/import';
export const ADMIN_COURT_IMPORT_BODY_LIMIT_BYTES = 1024 * 1024; // 1 MB

interface BodyParsedRequest extends Request {
  _body?: boolean;
}

export function createJsonBodyLimitMiddleware(limitBytes: number) {
  return (req: BodyParsedRequest, res: Response, next: NextFunction): void => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      next();
      return;
    }
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      next();
      return;
    }

    let totalBytes = 0;
    const chunks: Buffer[] = [];
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        aborted = true;
        const err = Object.assign(new Error('request entity too large'), {
          status: 413,
          statusCode: 413,
          type: 'entity.too.large',
        });
        next(err);
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks);
      if (raw.length === 0) {
        req.body = {};
        req._body = true;
        next();
        return;
      }
      try {
        req.body = JSON.parse(raw.toString('utf8'));
        req._body = true;
        next();
      } catch {
        const err = Object.assign(new Error('invalid JSON'), { status: 400, statusCode: 400, type: 'entity.parse.failed' });
        next(err);
      }
    });

    req.on('error', (err) => {
      if (!aborted) next(err);
    });
  };
}
