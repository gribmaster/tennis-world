import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// ReviewsRateLimitService — a dependency-free, in-memory, per-user fixed-window
// limiter for POST /v1/reviews (Feature 80).
//
// ── WHY A LIMITER AT ALL ────────────────────────────────────────────────────────
// The task asks for a decision between billing's shape and consultations' none. This
// endpoint is closer to billing than to consultations on the axis that matters:
// consultations are anonymous and unauthenticated, so a per-user limiter has no key to
// use there, whereas a review is an AUTHENTICATED write with a real `userId` to bucket
// on — the same thing that makes billing's limiter possible makes one possible here.
//
// The `@@unique([userId, courtId])` upsert already caps the TABLE: one signed-in user
// can never grow it past one row per court, so unbounded insertion is not the risk. The
// risk is the WRITE PATH itself — a hammered submit button is an unbounded stream of
// court lookups plus upserts, each carrying up to 2 KB of body text, against a table
// nothing reads and so nothing would notice. A limiter costs one Map lookup and closes
// that off. Cheap insurance on a write with no reader watching it.
//
// ── WHY ITS OWN SERVICE RATHER THAN REUSING BillingRateLimitService ─────────────
// The ALGORITHM is reused verbatim (fixed window, per-user key, count-the-rejected-hit,
// lazy prune with a sweep threshold); this file is deliberately the billing service with
// its billing specifics removed. What is NOT reused is the class, because that one is
// constructor-injected with BILLING_CONFIG and keys on a `'checkout' | 'portal'` action
// union. Sharing it would mean either importing BillingModule's Stripe-shaped config into
// the reviews module or widening billing's action union to know about reviews — coupling
// an unrelated write path to the payment module's configuration in both directions. Two
// small independent limiters are the smaller thing. If a third endpoint needs one, THAT
// is the moment to lift a shared `FixedWindowRateLimiter` out of these two, with a real
// second call site to shape it.
//
// ── CONSTANTS, NOT ENV ──────────────────────────────────────────────────────────
// Billing's knobs are env-driven because its budgets are commercial choices that differ
// per environment. A review budget is not: 10 submissions in 10 minutes is generously
// above any honest use (a person reviews the court they just played on, once) and well
// below abuse, everywhere. Constants keep this from adding env surface that would then
// need documenting in three `.env.example` files and could drift between them.
//
// MVP LIMITATION, identical to billing's and equally deliberate: the counters live in
// THIS process's memory, so the limit is per-instance. Behind N instances a user gets up
// to N× the budget until a shared store (Redis) backs it. `hit()` is shaped so such an
// implementation drops in behind the same method without touching the guard or the
// controller.
// ─────────────────────────────────────────────────────────────────────────────

/** Window length in seconds. 10 minutes, matching billing's default window. */
export const REVIEW_RATE_LIMIT_WINDOW_SECONDS = 600;
/** Max review submissions per user per window. */
export const REVIEW_RATE_LIMIT_MAX = 10;

/** Outcome of a single `hit()` — allowed, and if not, when to retry. */
export interface ReviewRateLimitResult {
  /** True when the request is within budget; false when it should be rejected (429). */
  allowed: boolean;
  /** The configured max submissions within the window. */
  limit: number;
  /** Submissions still allowed in this window AFTER this hit (0 when limited). */
  remaining: number;
  /** Whole seconds until the current window resets (the `Retry-After` value). */
  retryAfterSeconds: number;
}

/** A single per-user fixed window: hits so far and when it resets (epoch ms). */
interface WindowState {
  count: number;
  resetAt: number;
}

@Injectable()
export class ReviewsRateLimitService {
  /** `userId` → its current window. Pruned lazily; never persisted. */
  private readonly windows = new Map<string, WindowState>();

  /**
   * Rough cap on distinct keys before expired ones are swept eagerly — a safety valve
   * so a burst of distinct users can't grow the map without bound between the per-key
   * lazy prunes that handle steady state. Same value and rationale as billing's.
   */
  private static readonly SWEEP_THRESHOLD = 10_000;

  /**
   * Record one submission attempt for `userId` and report whether it is allowed.
   *
   * Called by ReviewsRateLimitGuard BEFORE the handler runs; a `false` result becomes a
   * 429 there. A REJECTED attempt still consumes budget — standard fixed-window
   * behavior, and it is what makes hammering the endpoint while limited not free.
   * `now` is injectable purely for deterministic tests.
   */
  hit(userId: string, now: number = Date.now()): ReviewRateLimitResult {
    const windowMs = REVIEW_RATE_LIMIT_WINDOW_SECONDS * 1000;

    const existing = this.windows.get(userId);
    let state: WindowState;
    if (!existing || existing.resetAt <= now) {
      // No window yet, or the previous one fully elapsed → start a fresh one.
      state = { count: 1, resetAt: now + windowMs };
      this.windows.set(userId, state);
    } else {
      // Within the active window → count this attempt (even if it will be rejected).
      existing.count += 1;
      state = existing;
    }

    this.maybeSweep(now);

    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    const allowed = state.count <= REVIEW_RATE_LIMIT_MAX;
    return {
      allowed,
      limit: REVIEW_RATE_LIMIT_MAX,
      remaining: allowed ? REVIEW_RATE_LIMIT_MAX - state.count : 0,
      retryAfterSeconds,
    };
  }

  /**
   * Drop expired windows so the map holds only live counters. Eager only past
   * SWEEP_THRESHOLD (cheap amortized cost); otherwise the per-key reset in `hit` is
   * enough. Steady-state memory is O(active submitters).
   */
  private maybeSweep(now: number): void {
    if (this.windows.size < ReviewsRateLimitService.SWEEP_THRESHOLD) return;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test/inspection helper — the number of live window entries. Unused at runtime. */
  get size(): number {
    return this.windows.size;
  }
}
