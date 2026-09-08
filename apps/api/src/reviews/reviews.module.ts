import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsRateLimitGuard } from './reviews-rate-limit.guard';
import { ReviewsRateLimitService } from './reviews-rate-limit.service';

// ─────────────────────────────────────────────────────────────────────────────
// ReviewsModule (Feature 80) — the court-review WRITE path. A sibling module to
// ConsultationsModule, whose shape it follows.
//
// Imports AuthModule because the controller's `@UseGuards(AuthGuard)` needs AuthGuard
// (and transitively AuthService + AUTH_CONFIG), which AuthModule provides and EXPORTS
// — the same reason MeModule and BillingModule import it. ConsultationsModule does not,
// because consultation submission is anonymous; this is the one structural addition
// over that template, and it is what "submission requires sign-in" costs.
//
// PrismaService is global (PrismaModule is @Global), so ReviewsService injects it
// without importing PrismaModule here — same as every other feature module.
//
// The rate limiter (service + guard) is provided here and applied PER METHOD on the
// controller, mirroring BillingModule. No global guard, no APP_GUARD: nothing outside
// POST /v1/reviews is affected.
//
// NOTHING IS EXPORTED. No other module reads reviews, and none should — there is no
// read path in the product (task 8).
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [AuthModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRateLimitService, ReviewsRateLimitGuard],
})
export class ReviewsModule {}
