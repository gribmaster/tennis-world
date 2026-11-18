import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// AdminLoginRateLimitService (TASK_73) — in-memory, dependency-free, FAILURE-
// counted fixed-window limiter for `POST /v1/admin/auth/login`. Same structural
// idiom as `billing/billing-rate-limit.service.ts` / `reviews-rate-limit.service.ts`
// (fixed window, lazy prune with a sweep threshold) — deliberately not a fourth
// style.
//
// KEYED BY IP **AND** EMAIL, INDEPENDENTLY (decision: "5 failures / 15 min per
// key"). The controller checks BOTH keys before attempting a password
// verification and is blocked if EITHER is at/over budget — so a single IP
// spraying many emails is capped per-IP even though each individual email has
// its own budget too.
//
// ONLY FAILURES ARE RECORDED (unlike billing's "every hit counts" — a
// successful login must not count toward the next attempt's budget). Checking
// before the 6th attempt's password verification is what turns that attempt
// into a 429 instead of a 6th 401 — see `AdminAuthController.login`.
//
// "success resets that email's counter" (decision, verbatim) — `reset()` is
// called ONLY with the email key on a successful login; the IP key is left
// alone, so a successful login from an IP that was also being used to spray
// OTHER emails doesn't erase that IP's standing failure count.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export interface AdminLoginRateLimitResult {
  /** True when this key is still within budget (attempt may proceed). */
  allowed: boolean;
  /** Whole seconds until the current window resets (the `Retry-After` value). */
  retryAfterSeconds: number;
}

interface WindowState {
  failures: number;
  resetAt: number;
}

@Injectable()
export class AdminLoginRateLimitService {
  private readonly windows = new Map<string, WindowState>();
  private static readonly SWEEP_THRESHOLD = 10_000;

  /** Is `key` currently blocked? Does NOT record an attempt. */
  check(key: string, now: number = Date.now()): AdminLoginRateLimitResult {
    const state = this.windows.get(key);
    if (!state || state.resetAt <= now) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const allowed = state.failures < ADMIN_LOGIN_RATE_LIMIT_MAX_FAILURES;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }

  /** Record one FAILED login attempt for `key` (IP or email). */
  recordFailure(key: string, now: number = Date.now()): void {
    const windowMs = ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { failures: 1, resetAt: now + windowMs });
    } else {
      existing.failures += 1;
    }
    this.maybeSweep(now);
  }

  /** Clear `key`'s window (called with the EMAIL key only, on a successful login). */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private maybeSweep(now: number): void {
    if (this.windows.size < AdminLoginRateLimitService.SWEEP_THRESHOLD) return;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test/inspection helper — unused at runtime. */
  get size(): number {
    return this.windows.size;
  }
}
