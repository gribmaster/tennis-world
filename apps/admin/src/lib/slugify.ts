// ─────────────────────────────────────────────────────────────────────────────
// Mirrors `slugify` in `apps/api/src/courts/court-derived-fields.ts` BYTE FOR
// BYTE (TASK_74 Testing §2) — the UI's auto-slug-from-name must match what the
// API itself would generate for the same name. `scripts/verify-admin-ui.ts`
// imports the API's version relatively and asserts equality for a sample set;
// if you change this, change that file too (or the harness fails).
// ─────────────────────────────────────────────────────────────────────────────

export const URL_SAFE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lower-case, ASCII-fold diacritics, non-alphanumerics → `-`, trim leading/trailing `-`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
