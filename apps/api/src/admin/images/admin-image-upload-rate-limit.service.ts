import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// AdminImageUploadRateLimitService (TASK_73, decision 15) — in-memory,
// dependency-free, per-admin fixed-window limiter for
// `POST /v1/admin/courts/:id/images`. Same structural idiom as the billing /
// reviews / admin-login limiters in this repo (fixed window, lazy prune with a
// sweep threshold) — 30 uploads / 10 minutes per admin.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_IMAGE_UPLOAD_RATE_LIMIT_MAX = 30;
export const ADMIN_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

export interface AdminImageUploadRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

@Injectable()
export class AdminImageUploadRateLimitService {
  private readonly windows = new Map<string, WindowState>();
  private static readonly SWEEP_THRESHOLD = 10_000;

  /** Record one upload attempt for `adminId` and report whether it is allowed.
   *  A rejected attempt still consumes budget (standard fixed-window behavior). */
  hit(adminId: string, now: number = Date.now()): AdminImageUploadRateLimitResult {
    const windowMs = ADMIN_IMAGE_UPLOAD_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const existing = this.windows.get(adminId);
    let state: WindowState;
    if (!existing || existing.resetAt <= now) {
      state = { count: 1, resetAt: now + windowMs };
      this.windows.set(adminId, state);
    } else {
      existing.count += 1;
      state = existing;
    }

    this.maybeSweep(now);

    const allowed = state.count <= ADMIN_IMAGE_UPLOAD_RATE_LIMIT_MAX;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }

  private maybeSweep(now: number): void {
    if (this.windows.size < AdminImageUploadRateLimitService.SWEEP_THRESHOLD) return;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  /** Test/inspection helper — unused at runtime. */
  get size(): number {
    return this.windows.size;
  }
}
