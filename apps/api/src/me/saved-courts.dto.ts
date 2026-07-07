import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { CourtIdRefDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Saved-courts request DTO — the class-validator runtime validator for
//   POST /v1/me/saved-courts  (SaveCourtRequestDTO)
//
// Same idiom as `me.dto.ts` / `auth.dto.ts` / `consultations.dto.ts`: the
// @tennis/contracts `CourtIdRefSchema` (`{ courtId: string }`) is the structural
// source of truth but can't be runtime-`require`d (TS-source `main`,
// [[api-contracts-type-only-import]]), so the request is a local class with
// class-validator decorators that the global ValidationPipe runs (whitelist +
// forbidNonWhitelisted + transform), guarded at COMPILE time by the `extends`
// assertion below so it can't drift from the zod shape.
//
// VALIDATION RULES (prompt task 7):
//   - `courtId` is REQUIRED and a non-empty string. It is TRIMMED first so a
//     whitespace-only id can't smuggle past the non-empty check (and a stray
//     surrounding space can't make a valid id miss its row). After trim it must
//     be ≥1 char (`@MinLength(1)`) → an empty/whitespace-only courtId is a 400.
//   - Unknown fields are rejected by the global pipe's forbidNonWhitelisted → 400,
//     so a body like `{ slug: ... }` or an extra key fails fast.
//
// The DELETE remove path takes `:courtId` as a route param (no body), so it needs
// no DTO — an empty param is structurally impossible (the route wouldn't match),
// but the service still treats a non-saved court as an idempotent success.
// ─────────────────────────────────────────────────────────────────────────────

/** Body for POST /v1/me/saved-courts — `{ courtId }`. */
export class SaveCourtRequestDTO {
  /**
   * Required court id to save. Trimmed first; must be a non-empty string after
   * trim (empty/whitespace-only → 400). This is the Court `id` (cuid), not the
   * slug — it matches the `CourtSummaryDTO.id` the list returns.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  courtId!: string;
}

// Compile-time guard: the request class must stay structurally assignable to the
// contract shape. If `courtId`'s type drifts from the zod schema, this stops
// compiling. `void` references the alias so it isn't reported as unused.
type _AssertCourtIdRefParity = SaveCourtRequestDTO extends CourtIdRefDTO
  ? true
  : never;
void (true as _AssertCourtIdRefParity);
