import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ReviewDTO } from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { ReviewSubmitRequestDTO } from './reviews.dto';
import { ReviewsRateLimitGuard } from './reviews-rate-limit.guard';
import { ReviewsService } from './reviews.service';

// ─────────────────────────────────────────────────────────────────────────────
// ReviewsController (Feature 80) — the review WRITE surface, and the whole of it:
//
//   POST /v1/reviews → 201 ReviewDTO
//
// There is deliberately NO GET, on this controller or any other. Nothing in the
// product reads a review, an average or a count. Adding a read here is a later
// feature with its own moderation questions (task 8) — if you are about to add
// `@Get()`, stop.
//
// ── WHY /v1/reviews AND NOT /v1/courts/:slug/reviews ────────────────────────────
// The intake (§3 D4) sketched the nested path; the task offers either. This module
// takes the flat one, for two reasons:
//
//   1. `CourtsController` is the PUBLIC, unauthenticated discovery surface — four
//      GETs, no guard, no body. Hanging an AuthGuard-protected, rate-limited write
//      off `/v1/courts/*` puts two different security postures on one route prefix,
//      and the task's "do not change existing responses, status codes or route paths
//      for /v1/courts*" reads much more safely when that prefix simply gains nothing.
//   2. It mirrors the template this module follows end to end: consultations are a
//      sibling module at a flat `/v1/consultations` whose subject travels in the
//      body, and a review's `courtSlug` is the same kind of field. Reviews are their
//      own entity with a court FK, not a Court sub-resource, exactly as the contract
//      file's placement already says.
//
// ── AUTH ────────────────────────────────────────────────────────────────────────
// `@UseGuards(AuthGuard, ReviewsRateLimitGuard)`, the SAME AuthGuard `me` and
// `billing` use — cookie first, then `Authorization: Bearer`. An unauthenticated or
// expired request is a clean 401 BEFORE the handler and before the limiter; it is
// never quietly accepted as an anonymous review just because `Review.userId` is
// nullable at the schema level (that column is future headroom, not today's policy —
// see schema.prisma). The author comes from `@CurrentUser()`, never from the body:
// `ReviewSubmitRequestDTO` has no author field, and `forbidNonWhitelisted` turns an
// attempt to send one into a 400.
//
// ── STATUS CODES ────────────────────────────────────────────────────────────────
//   201 — created (Nest's default for @Post; the correct code for a created resource,
//         and what POST /v1/consultations and the billing POSTs already return, so no
//         @HttpCode override). A repeat submission for the same court by the same user
//         UPDATES their existing review (service upsert) and is also a 201: it is the
//         same "your review of this court now exists, and this is it" outcome, and the
//         response body is the row either way.
//   400 — validation (bad/missing rating, blank or over-long body, unknown property).
//   401 — no/invalid session.
//   404 — no such published court.
//   429 — per-user submission budget exhausted (Retry-After set).
//
// `ReviewSubmitRequestDTO` is imported as a VALUE (not type-only): the global
// ValidationPipe needs the class at runtime to read its decorator metadata. That is
// fine — the class is local to apps/api, unlike the @tennis/contracts zod objects
// ([[api-contracts-type-only-import]]).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** POST /v1/reviews — store the signed-in author's review, 201 with the stored DTO. */
  @Post()
  @UseGuards(AuthGuard, ReviewsRateLimitGuard)
  create(
    @CurrentUser() user: AuthContext,
    @Body() body: ReviewSubmitRequestDTO,
  ): Promise<ReviewDTO> {
    return this.reviews.create(user.userId, body);
  }
}
