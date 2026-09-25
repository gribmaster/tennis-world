import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { CollectionIdRefDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Saved-collections request DTO — the class-validator runtime validator for
//   POST /v1/me/saved-collections  (SaveCollectionRequestDTO)
//
// Mirrors `saved-courts.dto.ts` exactly, `Court` → `Collection`: the
// @tennis/contracts `CollectionIdRefSchema` (`{ collectionId: string }`) is the
// structural source of truth but can't be runtime-`require`d (TS-source `main`,
// [[api-contracts-type-only-import]]), so the request is a local class with
// class-validator decorators that the global ValidationPipe runs (whitelist +
// forbidNonWhitelisted + transform), guarded at COMPILE time by the `extends`
// assertion below so it can't drift from the zod shape.
//
// VALIDATION RULES (mirrors saved-courts.dto.ts):
//   - `collectionId` is REQUIRED and a non-empty string. Trimmed first so a
//     whitespace-only id can't smuggle past the non-empty check. After trim it
//     must be ≥1 char (`@MinLength(1)`) → an empty/whitespace-only collectionId
//     is a 400.
//   - Unknown fields are rejected by the global pipe's forbidNonWhitelisted → 400.
//
// The DELETE remove path takes `:collectionId` as a route param (no body), so it
// needs no DTO — the service treats a non-saved collection as an idempotent
// success.
// ─────────────────────────────────────────────────────────────────────────────

/** Body for POST /v1/me/saved-collections — `{ collectionId }`. */
export class SaveCollectionRequestDTO {
  /**
   * Required collection id to save. Trimmed first; must be a non-empty string
   * after trim (empty/whitespace-only → 400). This is the Collection `id`
   * (cuid), not the slug — it matches `CollectionDTO.id`.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  collectionId!: string;
}

// Compile-time guard: the request class must stay structurally assignable to the
// contract shape. If `collectionId`'s type drifts from the zod schema, this stops
// compiling. `void` references the alias so it isn't reported as unused.
type _AssertCollectionIdRefParity = SaveCollectionRequestDTO extends CollectionIdRefDTO
  ? true
  : never;
void (true as _AssertCollectionIdRefParity);
