import type { AdminCourtImportReportDTO } from '@tennis/contracts';
import { apiFetch } from './api-client';

/**
 * `POST /v1/admin/courts/import` (TASK_79) — the ONE call the Import courts
 * page makes, same `apiFetch` seam as every other admin request (credentials,
 * `X-Tennis-Admin`, the central 401 handler). `dryRun: true` is Check,
 * `false` is Create.
 */
export function importCourts(courts: unknown[], dryRun: boolean): Promise<AdminCourtImportReportDTO> {
  return apiFetch<AdminCourtImportReportDTO>('/admin/courts/import', {
    method: 'POST',
    body: { courts, dryRun },
  });
}
