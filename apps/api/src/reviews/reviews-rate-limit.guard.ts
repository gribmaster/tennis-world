import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithAuth } from '../auth/auth.types';
import { ReviewsRateLimitService } from './reviews-rate-limit.service';

// ─────────────────────────────────────────────────────────────────────────────
// ReviewsRateLimitGuard (Feature 80) — applied to the ONE ReviewsController method,
// per-method, AFTER AuthGuard. Mirrors BillingRateLimitGuard exactly.
//
// GUARD ORDER: Nest runs guards in listed order, and the controller lists
// `@UseGuards(AuthGuard, ReviewsRateLimitGuard)`. So AuthGuard runs FIRST — an
// unauthenticated request is already a 401 before this guard is reached, and a real
// `req.auth.userId` is always present to key on. Two consequences, both intended:
// (a) a 401 is never masked by a 429, and (b) the limiter never keys an anonymous
// bucket. If `req.auth` were somehow absent we fail CLOSED with a 401 rather than
// rate-limit an unidentified caller.
//
// SCOPE: this guard touches exactly one route (POST /v1/reviews). No public discovery
// endpoint, no auth flow, no /v1/me/* read and no Stripe webhook passes through it.
//
// 429 BEHAVIOR: on rejection we set `Retry-After` (whole seconds until the window
// resets) and throw a 429 with a generic message — no counters, no user id, no window
// internals leak to the client. Same shape as the billing guard's.
// ─────────────────────────────────────────────────────────────────────────────

/** Safe client-facing message on a 429 (no internal detail). */
const RATE_LIMITED_MESSAGE =
  'Too many reviews submitted. Please try again later.';

@Injectable()
export class ReviewsRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: ReviewsRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & RequestWithAuth>();

    // AuthGuard runs first and attaches `req.auth`. Missing ⇒ fail closed (401) rather
    // than rate-limit an unidentified request — we must never key on "no user".
    const userId = req.auth?.userId;
    if (!userId) {
      throw new HttpException('Authentication required.', HttpStatus.UNAUTHORIZED);
    }

    const result = this.limiter.hit(userId);
    if (result.allowed) {
      return true;
    }

    // Advisory header — some clients honor it, and it leaks no counters.
    const res = http.getResponse<Response>();
    res.setHeader('Retry-After', String(result.retryAfterSeconds));

    throw new HttpException(RATE_LIMITED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }
}
