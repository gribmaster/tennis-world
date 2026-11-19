import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCourtImportRateLimitService (TASK_79) — in-memory, dependency-free,
// per-admin fixed-window limiter for `POST /v1/admin/courts/import`. Same
// structural idiom as `AdminImageUploadRateLimitService`: commits are the
// expensive/destructive action (10 / 10 min); dry runs are read-only and get a
// much looser budget (60 / 10 min) so an admin iterating on a file isn't
// throttled while fixing validation errors.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_COURT_IMPORT_COMMIT_LIMIT = 10;
export const ADMIN_COURT_IMPORT_DRY_RUN_LIMIT = 60;
export const ADMIN_COURT_IMPORT_WINDOW_SECONDS = 10 * 60;

export interface AdminCourtImportRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

@Injectable()
export class AdminCourtImportRateLimitService {
  private readonly commitWindows = new Map<string, WindowState>();
  private readonly dryRunWindows = new Map<string, WindowState>();
  private static readonly SWEEP_THRESHOLD = 10_000;

  hitCommit(adminId: string, now: number = Date.now()): AdminCourtImportRateLimitResult {
    return this.hit(this.commitWindows, adminId, ADMIN_COURT_IMPORT_COMMIT_LIMIT, now);
  }

  hitDryRun(adminId: string, now: number = Date.now()): AdminCourtImportRateLimitResult {
    return this.hit(this.dryRunWindows, adminId, ADMIN_COURT_IMPORT_DRY_RUN_LIMIT, now);
  }

  private hit(
    windows: Map<string, WindowState>,
    adminId: string,
    max: number,
    now: number,
  ): AdminCourtImportRateLimitResult {
    const windowMs = ADMIN_COURT_IMPORT_WINDOW_SECONDS * 1000;
    const existing = windows.get(adminId);
    let state: WindowState;
    if (!existing || existing.resetAt <= now) {
      state = { count: 1, resetAt: now + windowMs };
      windows.set(adminId, state);
    } else {
      existing.count += 1;
      state = existing;
    }

    if (windows.size >= AdminCourtImportRateLimitService.SWEEP_THRESHOLD) {
      for (const [key, s] of windows) {
        if (s.resetAt <= now) windows.delete(key);
      }
    }

    const allowed = state.count <= max;
    return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((state.resetAt - now) / 1000)) };
  }
}
