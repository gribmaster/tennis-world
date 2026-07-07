import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithAuth } from '../auth/auth.types';
import {
  BillingRateLimitService,
  type BillingRateLimitAction,
} from './billing-rate-limit.service';

// ─────────────────────────────────────────────────────────────────────────────
// BillingRateLimitGuard (Feature 69, intake §10) — applied ONLY to the two
// BillingController methods (per-method `@UseGuards`), AFTER AuthGuard.
//
// GUARD ORDER: NestJS runs guards in the order they appear. The controller lists
// `@UseGuards(AuthGuard, BillingRateLimitGuard)` — so AuthGuard runs FIRST and has
// already 401'd an unauthenticated request (and attached `req.auth`) before this guard
// sees it. That means: (a) an unauthenticated caller is rejected by auth, not rate
// limiting (a 401 is never masked by a 429), and (b) we always have a real `userId` to
// key on. If `req.auth` were somehow missing we fail CLOSED with a 401 rather than key
// the limiter on an anonymous bucket.
//
// ACTION: derived from the route's static suffix (`checkout` | `portal`) via the
// handler name — NOT from user input — so the two actions keep independent per-user
// budgets. This guard touches no other route; the public discovery endpoints, the auth
// magic-link flow, and the signature-verified Stripe webhook are all UNAFFECTED.
//
// 429 BEHAVIOR (task 3): when `hit()` reports `allowed=false` we set a `Retry-After`
// header (whole seconds until the window resets) and throw a 429 with a SAFE, generic
// message — no internal counters, no user id, no window internals leak to the client.
// ─────────────────────────────────────────────────────────────────────────────

/** Safe client-facing message on a 429 (no internal detail — task 3). */
const RATE_LIMITED_MESSAGE =
  'Too many billing requests. Please try again later.';

@Injectable()
export class BillingRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: BillingRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & RequestWithAuth>();

    // AuthGuard runs first and attaches `req.auth`. If it's missing, fail closed (401)
    // rather than rate-limit an anonymous request — we must never key on "no user".
    const userId = req.auth?.userId;
    if (!userId) {
      throw new HttpException('Authentication required.', HttpStatus.UNAUTHORIZED);
    }

    const action = this.actionFor(context);
    const result = this.limiter.hit(userId, action);
    if (result.allowed) {
      return true;
    }

    // Advisory header — some clients honor it, and it doesn't leak counters.
    const res = http.getResponse<Response>();
    res.setHeader('Retry-After', String(result.retryAfterSeconds));

    throw new HttpException(RATE_LIMITED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Map the handler to its rate-limit action from the method name on BillingController
   * (`createCheckout` → 'checkout', `createPortal` → 'portal'). Server-derived, never
   * from the request body/params. Defaults to 'checkout' (the stricter budget) if the
   * name is ever unrecognized, so an unmapped route can only be MORE restricted.
   */
  private actionFor(context: ExecutionContext): BillingRateLimitAction {
    const handlerName = context.getHandler().name;
    return handlerName === 'createPortal' ? 'portal' : 'checkout';
  }
}
