import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import type { AuthContext, RequestWithAuth } from './auth.types';
import { Inject } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// AuthGuard (prompt task 10) — the REUSABLE guard the future /v1/me/* surface will
// apply. It is NOT attached to any route in this feature (no protected endpoint is
// added — Feature 50 §8 acceptance keeps a probe out of scope here); it exists, is
// exported, and is unit-shaped so Features 53/54/55 can `@UseGuards(AuthGuard)`.
//
// TWO EXTRACTORS, ONE GUARD (Feature 50 §7.1) — the single most important
// forward-compatibility decision:
//   1. cookie  : the web client's httpOnly session cookie (read by cookie-parser,
//                wired in main.ts) — checked FIRST (browsers always send it).
//   2. bearer  : `Authorization: Bearer <jwt>` — the mobile/native path (and any
//                API client). Checked when there's no cookie.
// On success it verifies the JWT and attaches `{ userId, email }` to `req.auth`,
// which `@CurrentUser()` reads. Any failure (missing/invalid/expired) → 401.
//
// STAGING-ONLY DEMO BRANCH (Feature 76): when `config.stagingDemoAuth` is non-null
// (ONLY when `STAGING_DEMO_AUTH_ENABLED=true` + a secret is set — never in production,
// never via NODE_ENV), a request carrying `X-Tennis-Demo-Auth: <secret>` authenticates
// as a fixed, FREE demo user without a magic link. This is checked BEFORE the JWT path.
// It is inert (skipped entirely) whenever the config is null. ⚠️  See docs/STAGING_DEMO_AUTH.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Header carrying the staging demo-auth secret (Feature 76). Lower-case: Node lowercases header keys. */
const DEMO_AUTH_HEADER = 'x-tennis-demo-auth';

/**
 * Constant-time string equality (Feature 76 demo-auth compare). `timingSafeEqual`
 * requires equal-length buffers and throws otherwise, so we length-check first — that
 * check leaks only the length, never the content, which is acceptable for a fixed-length
 * shared secret. Avoids a short-circuiting `===` that could leak the secret via timing.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithAuth>();

    // STAGING-ONLY demo branch (Feature 76) — checked first, but ONLY active when the
    // config opted in (null in production → this whole block is skipped). A correct secret
    // authenticates as the demo user; a WRONG secret when demo mode is on is a hard 401
    // (don't fall through to the JWT path with an attacker-supplied demo header present).
    if (this.config.stagingDemoAuth) {
      const demoResult = await this.tryDemoAuth(req);
      if (demoResult !== 'absent') {
        return demoResult; // authenticated (true) or rejected (throws) — never falls through
      }
      // 'absent' → no demo header at all; fall through to the normal cookie/bearer path so
      // magic-link auth still works alongside demo auth on staging.
    }

    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const payload = this.auth.verifyAccessToken(token);
      req.auth = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      // Invalid signature / expired / malformed — uniform 401, no detail leak.
      throw new UnauthorizedException('Invalid or expired session.');
    }
  }

  /**
   * STAGING-ONLY (Feature 76). Inspect the demo-auth header:
   *   - no header            → `'absent'` (caller falls through to cookie/bearer auth).
   *   - header === secret    → attach the demo user to `req.auth`, return `true`.
   *   - header ≠ secret      → throw 401 (a present-but-wrong demo secret is an attempt,
   *                            not a fall-through). Uses a constant-time compare so a
   *                            wrong header can't be brute-forced by timing.
   * Only reached when `config.stagingDemoAuth` is non-null.
   */
  private async tryDemoAuth(
    req: Request & RequestWithAuth,
  ): Promise<true | 'absent'> {
    const demo = this.config.stagingDemoAuth!;
    const provided = req.headers[DEMO_AUTH_HEADER];
    // Header may arrive as string | string[] | undefined; only a single string is valid.
    const value = typeof provided === 'string' ? provided : undefined;
    if (value === undefined || value.length === 0) {
      return 'absent';
    }
    if (!safeEqual(value, demo.secret)) {
      throw new UnauthorizedException('Invalid demo authentication.');
    }
    const payload = await this.auth.resolveDemoUser(demo.email);
    req.auth = { userId: payload.sub, email: payload.email };
    return true;
  }

  /** Cookie first (web), then `Authorization: Bearer` (mobile/API). */
  private extractToken(req: Request): string | undefined {
    // cookie-parser populates `req.cookies`; typed loosely (no global augmentation).
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const fromCookie = cookies?.[this.config.cookieName];
    if (fromCookie) return fromCookie;

    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || undefined;
    }
    return undefined;
  }
}

/**
 * `@CurrentUser()` — read the auth context the guard attached. Intended for the
 * future /v1/me/* handlers (e.g. `@CurrentUser() user: AuthContext`). Returns
 * `undefined` if used on a route the guard didn't protect (so misuse fails loudly
 * in the handler rather than silently reading a wrong identity).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    return req.auth;
  },
);
