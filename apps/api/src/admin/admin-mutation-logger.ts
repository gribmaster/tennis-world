import { Logger } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// Shared admin mutation log line (TASK_73, §7): one line per successful admin
// mutation naming WHO (adminId), WHAT action, WHAT it targeted, and WHICH
// fields changed — never the VALUES (decision: field names only). Used by every
// admin service that writes something; login success/failure logs its own line
// in `AdminAuthService`/`AdminAuthController` (not here, since those aren't
// "mutations" in this shape).
// ─────────────────────────────────────────────────────────────────────────────

const logger = new Logger('AdminMutation');

export function logAdminMutation(params: {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  changedFields?: readonly string[];
}): void {
  const fields =
    params.changedFields && params.changedFields.length > 0
      ? ` fields=[${params.changedFields.join(',')}]`
      : '';
  logger.log(
    `adminId=${params.adminId} action=${params.action} targetType=${params.targetType} targetId=${params.targetId}${fields}`,
  );
}
