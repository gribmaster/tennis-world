import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { UpdateProfileDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Profile update request DTO — the class-validator runtime validator for
//   PATCH /v1/me  (UpdateProfileRequestDTO)
//
// Same idiom as `auth.dto.ts` / `consultations.dto.ts`: the @tennis/contracts
// `UpdateProfileSchema` (`{ name?: string }`) is the structural source of truth but
// can't be runtime-`require`d (TS-source `main`, [[api-contracts-type-only-import]]),
// so the request is a local class with class-validator decorators that the global
// ValidationPipe runs (whitelist + forbidNonWhitelisted + transform), guarded at
// COMPILE time by the `extends` assertion below so it can't drift from the zod shape.
//
// VALIDATION RULES (prompt task 5):
//   - `name` is OPTIONAL (it's the only editable profile field in Phase-4 scope).
//   - It is TRIMMED before validation (@Transform) so leading/trailing whitespace
//     doesn't smuggle in a "non-empty" value or inflate the length.
//   - When present it must be NON-EMPTY after trim (@IsNotEmpty-equivalent via the
//     MinLength check below — an empty/whitespace-only name → 400). A trim that
//     reduces the string to '' is rejected, NOT silently accepted as a no-op.
//   - Max length 80 (the contract defines no bound; 80 is a sensible display cap,
//     documented here — Feature 50 §5.2 left this to the implementer).
//   - Unknown fields (e.g. an `email` patch attempt) are rejected by the global
//     pipe's forbidNonWhitelisted → 400, so this DTO needs no `email`/`membership`.
//
// "All-undefined / empty patch" handling (prompt task 4) lives in the SERVICE, which
// rejects a patch with no `name` (after trim) with a 400 — avoiding a no-op write.
// This DTO only validates the shape of whatever IS sent.
// ─────────────────────────────────────────────────────────────────────────────

/** Max display-name length. The contract defines no bound; 80 is a sensible cap. */
export const PROFILE_NAME_MAX_LENGTH = 80;

/** Body for PATCH /v1/me — `{ name? }`. */
export class UpdateProfileRequestDTO {
  /**
   * Optional new display name. Trimmed first; when present must be 1..80 chars after
   * trim (an empty/whitespace-only string is a 400, not a silent no-op). `email` and
   * `membership` are intentionally absent — they're not user-editable and an attempt
   * to send them is rejected as a non-whitelisted field by the global pipe.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(PROFILE_NAME_MAX_LENGTH)
  name?: string;
}

// Compile-time guard: the request class must stay structurally assignable to the
// contract shape. If `name`'s optionality/type drifts from the zod schema, this stops
// compiling. `void` references the alias so it isn't reported as unused.
type _AssertUpdateProfileParity = UpdateProfileRequestDTO extends UpdateProfileDTO
  ? true
  : never;
void (true as _AssertUpdateProfileParity);
