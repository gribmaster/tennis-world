import { Inject, Injectable } from '@nestjs/common';
import { BILLING_CONFIG, type BillingConfig } from './billing.config';

// ─────────────────────────────────────────────────────────────────────────────
// BillingRateLimitService — a lightweight, DEPENDENCY-FREE, in-memory per-user
// rate limiter for the billing endpoints (Feature 69, intake §10).
//
// SCOPE: this limiter fronts ONLY `POST /v1/billing/checkout` and
// `POST /v1/billing/portal` (via BillingRateLimitGuard on those two methods). It is
// NOT global — no public discovery route, no auth magic-link flow, and NOT the Stripe
// webhook (which Stripe retries on non-2xx) pass through it.
//
// KEY: `${userId}:${action}` — per AUTHENTICATED USER id (not IP), per action, so a
// user's checkout budget is separate from their portal budget and one user can't
// exhaust another's. The guard reads `userId` from `req.auth` (set by AuthGuard, which
// runs first — see the guard file), so an unauthenticated request never even reaches
// this service (the AuthGuard 401s first).
//
// ALGORITHM: a simple FIXED WINDOW. The first hit for a key opens a window of
// `windowSeconds`; each subsequent hit in that window increments a counter; once the
// counter would exceed the action's max the request is limited until the window's
// `resetAt`. When a hit lands after `resetAt` the window is reset (fresh count). This is
// the smallest correct implementation — no timers, no external store; expired entries
// are pruned lazily on access (and opportunistically swept) so the map can't grow
// unbounded.
//
// MVP LIMITATION (documented, intake §10): the counters live in THIS process's memory,
// so the limit is per-instance. On a single-instance dev/MVP deployment that is the real
// per-user limit; behind N instances a user gets up to N× the limit until a shared store
// (Redis) backs it. The service interface is deliberately shaped so a Redis-backed impl
// can drop in behind the same `hit()` method without touching the guard or controller.
// ─────────────────────────────────────────────────────────────────────────────

/** The two rate-limited billing actions. Part of the per-user key. */
export type BillingRateLimitAction = 'checkout' | 'portal';

/** Outcome of a single `hit()` — whether it is allowed and, if not, when to retry. */
export interface RateLimitResult {
  /** True when the request is within budget; false when it should be rejected (429). */
  allowed: boolean;
  /** Configured max attempts for this action within the window. */
  limit: number;
  /** Requests still allowed in the current window AFTER this hit (0 when limited). */
  remaining: number;
  /** Whole seconds until the current window resets (the `Retry-After` value). */
  retryAfterSeconds: number;
}

/** A single per-key fixed window: how many hits so far and when it resets (epoch ms). */
interface WindowState {
  count: number;
  resetAt: number;
}

@Injectable()
export class BillingRateLimitService {
  /** `${userId}:${action}` → its current window. Pruned lazily; never persisted. */
  private readonly windows = new Map<string, WindowState>();

  /**
   * Rough cap on distinct keys before we sweep expired ones eagerly. A safety valve so
   * a burst of distinct users can't grow the map without bound between lazy prunes; the
   * normal lazy prune (on each `hit` for the touched key) handles steady state.
   */
  private static readonly SWEEP_THRESHOLD = 10_000;

  constructor(
    @Inject(BILLING_CONFIG) private readonly config: BillingConfig,
  ) {}

  /**
   * Record one attempt for `userId` + `action` and report whether it is allowed.
   *
   * Called by BillingRateLimitGuard BEFORE the handler runs. A `false` result becomes a
   * 429 in the guard (the attempt is still counted — a limited request consumes budget,
   * which is the standard fixed-window behavior and makes hammering the endpoint while
   * limited not "free"). `now` is injectable purely for deterministic tests.
   */
  hit(
    userId: string,
    action: BillingRateLimitAction,
    now: number = Date.now(),
  ): RateLimitResult {
    const limit = this.maxFor(action);
    const windowMs = this.config.rateLimit.windowSeconds * 1000;
    const key = `${userId}:${action}`;

    const existing = this.windows.get(key);
    let state: WindowState;
    if (!existing || existing.resetAt <= now) {
      // No window yet, or the previous one has fully elapsed → start a fresh one.
      state = { count: 1, resetAt: now + windowMs };
      this.windows.set(key, state);
    } else {
      // Within the active window → count this attempt (even if it will be rejected).
      existing.count += 1;
      state = existing;
    }

    this.maybeSweep(now);

    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    const allowed = state.count <= limit;
    return {
      allowed,
      limit,
      remaining: allowed ? limit - state.count : 0,
      retryAfterSeconds,
    };
  }

  /** The configured max attempts for an action within one window. */
  private maxFor(action: BillingRateLimitAction): number {
    return action === 'checkout'
      ? this.config.rateLimit.checkoutMax
      : this.config.rateLimit.portalMax;
  }

  /**
   * Drop expired windows so the map reflects only live counters. Prunes eagerly only
   * when the map has grown past SWEEP_THRESHOLD (cheap amortized cost); otherwise the
   * per-key reset in `hit` is enough. Steady-state memory is O(active users × 2 actions).
   */
  private maybeSweep(now: number): void {
    if (this.windows.size < BillingRateLimitService.SWEEP_THRESHOLD) return;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test/inspection helper — the number of live window entries. Not used at runtime. */
  get size(): number {
    return this.windows.size;
  }
}
