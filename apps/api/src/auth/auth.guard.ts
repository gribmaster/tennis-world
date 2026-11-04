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
import { extractToken, tryDemoAuth } from './auth-request.util';

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

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithAuth>();

    // STAGING-ONLY demo branch (Feature 76) — checked first, but ONLY active when the
    // config opted in (null in production → tryDemoAuth short-circuits to 'absent'). A
    // correct secret authenticates as the demo user; a WRONG secret when demo mode is on
    // is a hard 401 (don't fall through to the JWT path with an attacker-supplied demo
    // header present).
    const demoResult = await tryDemoAuth(req, this.config, (email) =>
      this.auth.resolveDemoUser(email),
    );
    if (demoResult === 'invalid') {
      throw new UnauthorizedException('Invalid demo authentication.');
    }
    if (demoResult !== 'absent') {
      req.auth = demoResult;
      return true;
    }
    // 'absent' → no demo header (or demo mode off); fall through to the normal
    // cookie/bearer path so magic-link auth still works alongside demo auth on staging.

    const token = extractToken(req, this.config);
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
