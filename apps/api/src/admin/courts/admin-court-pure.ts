import { BadRequestException } from '@nestjs/common';
import { slugify, URL_SAFE_SLUG_PATTERN } from '../../courts/court-derived-fields';

// ─────────────────────────────────────────────────────────────────────────────
// Pure court-field helpers shared by `AdminCourtsService.create()` and the
// bulk import (`AdminCourtImportService`, TASK_79 decision 5). Extracted
// VERBATIM from `AdminCourtsService` so both callers resolve a slug and check
// for 0/0 the exact same way — `create()`'s behaviour is unchanged by this
// extraction (byte-identical messages, byte-identical logic).
//
// `validateAdminTags` (admin-courts.dto.ts) and `validateMapLinkUrl`
// (admin-map-link.util.ts) are ALREADY standalone shared functions and do not
// need to move here — both `create()` and the import call them directly.
// ─────────────────────────────────────────────────────────────────────────────

export const SLUG_RULE_MESSAGE =
  'slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ and be at most 80 characters.';

/** Resolve the slug to store: the provided value, or `slugify(name)` when
 *  omitted. Throws `BadRequestException` if the result is empty or invalid —
 *  this is the only validation import needs here, since a PROVIDED slug's
 *  shape is already checked by `class-validator` before this runs. */
export function resolveCourtSlug(provided: string | undefined, name: string): string {
  const candidate = provided?.trim() || slugify(name);
  if (!candidate || !URL_SAFE_SLUG_PATTERN.test(candidate) || candidate.length > 80) {
    throw new BadRequestException(SLUG_RULE_MESSAGE);
  }
  return candidate;
}

/** lat/lng === 0/0 is never a real location (TASK_73 decision 11). */
export function assertCourtLatLngNotZeroZero(lat: number, lng: number): void {
  if (lat === 0 && lng === 0) {
    throw new BadRequestException('lat/lng of exactly 0,0 is not a valid location.');
  }
}
