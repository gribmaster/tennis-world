import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type {
  CourtIdRefDTO,
  CreateUserCollectionDTO,
  RenameUserCollectionDTO,
} from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// User-collection request DTOs — the class-validator runtime validators for the
//   POST  /v1/me/collections            (CreateUserCollectionRequestDTO)
//   PATCH /v1/me/collections/:id        (RenameUserCollectionRequestDTO)
//   POST  /v1/me/collections/:id/courts (AddCourtRequestDTO)
//
// Same idiom as `me.dto.ts` / `saved-courts.dto.ts` / `auth.dto.ts`: the
// @tennis/contracts zod schemas (`CreateUserCollectionSchema`,
// `RenameUserCollectionSchema`, `CourtIdRefSchema`) are the structural source of
// truth but can't be runtime-`require`d (TS-source `main`,
// [[api-contracts-type-only-import]]), so each request is a local class with
// class-validator decorators the global ValidationPipe runs (whitelist +
// forbidNonWhitelisted + transform), guarded at COMPILE time by the `extends`
// assertions below so they can't drift from the zod shapes.
//
// VALIDATION RULES (prompt task 3):
//   - `name` (create + rename) is REQUIRED, a string, TRIMMED first (@Transform) so
//     leading/trailing whitespace can't smuggle a "non-empty" value past the check,
//     must be 1..80 chars after trim (the contract sets no bound; 80 matches the
//     PATCH-/v1/me display cap — same value `me.dto.ts` chose). Empty/whitespace-only
//     → 400 via @MinLength(1).
//   - `courtId` (add-court body) is REQUIRED, trimmed, non-empty (@MinLength(1)) — the
//     SAME shape as `saved-courts.dto.ts` (both derive from CourtIdRefSchema). The
//     remove path is a `:courtId` route param (no body), so it needs no DTO.
//   - Unknown fields on any body → 400 via the global pipe's forbidNonWhitelisted.
// ─────────────────────────────────────────────────────────────────────────────

/** Max display-name length for a user collection (matches the profile name cap). */
export const COLLECTION_NAME_MAX_LENGTH = 80;

/** Body for POST /v1/me/collections — `{ name }`. */
export class CreateUserCollectionRequestDTO {
  /**
   * Required folder display name. Trimmed first; must be 1..80 chars after trim
   * (empty/whitespace-only → 400). The server derives a unique-per-user slug from it.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(COLLECTION_NAME_MAX_LENGTH)
  name!: string;
}

/** Body for PATCH /v1/me/collections/:id — `{ name }`. */
export class RenameUserCollectionRequestDTO {
  /**
   * Required new folder display name. Same trim + 1..80 rule as create; the server
   * re-derives the slug from it (kept unique against the user's OTHER folders).
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(COLLECTION_NAME_MAX_LENGTH)
  name!: string;
}

/** Body for POST /v1/me/collections/:id/courts — `{ courtId }`. */
export class AddCourtRequestDTO {
  /**
   * Required court id to add to the folder. Trimmed; must be non-empty after trim
   * (empty/whitespace-only → 400). This is the Court `id` (cuid), matching the
   * `CourtSummaryDTO.id` the collection's `courts` list returns.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  courtId!: string;
}

// Compile-time guards: each request class must stay structurally assignable to its
// contract shape. If a field's type/optionality drifts from the zod schema, these
// stop compiling. `void` references the aliases so they aren't reported as unused.
type _AssertCreateParity = CreateUserCollectionRequestDTO extends CreateUserCollectionDTO
  ? true
  : never;
type _AssertRenameParity = RenameUserCollectionRequestDTO extends RenameUserCollectionDTO
  ? true
  : never;
type _AssertCourtIdParity = AddCourtRequestDTO extends CourtIdRefDTO ? true : never;
void (true as _AssertCreateParity);
void (true as _AssertRenameParity);
void (true as _AssertCourtIdParity);
