import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
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
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & RequestWithAuth>();
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
