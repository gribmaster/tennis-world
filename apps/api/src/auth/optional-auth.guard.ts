import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import type { RequestWithAuth } from './auth.types';
import { extractToken, tryDemoAuth } from './auth-request.util';

// ─────────────────────────────────────────────────────────────────────────────
// OptionalAuthGuard (TASK_72) — the viewer-aware step for a PUBLIC route that must
// still know WHO (if anyone) is asking, so it can decide what to redact
// (`redactCourtGeo`) without ever turning the route into a protected one.
//
// Reuses AuthGuard's own extraction (`extractToken`/`tryDemoAuth` from
// `auth-request.util.ts`) so the two guards can never drift on cookie/bearer/demo
// semantics — but NEVER throws: missing, invalid, expired, or a wrong demo secret
// all resolve to "anonymous" (`req.auth` stays undefined) rather than a 401. The
// handler always runs; `@CurrentUser()` (which already returns `undefined` when
// the guard didn't attach anything) is how a controller reads the result.
//
// `AuthGuard` itself is NOT touched by this file — its 401 behavior for the
// protected /v1/me/* surface is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithAuth>();

    const demoResult = await tryDemoAuth(req, this.config, (email) =>
      this.auth.resolveDemoUser(email),
    );
    if (demoResult !== 'absent' && demoResult !== 'invalid') {
      req.auth = demoResult;
      return true;
    }
    // 'absent' (no header / demo mode off) or 'invalid' (wrong secret) → fall through
    // to cookie/bearer rather than rejecting; this guard never 401s.

    const token = extractToken(req, this.config);
    if (token) {
      try {
        const payload = this.auth.verifyAccessToken(token);
        req.auth = { userId: payload.sub, email: payload.email };
      } catch {
        // Invalid/expired/malformed → stay anonymous, never throw.
      }
    }
    return true;
  }
}
