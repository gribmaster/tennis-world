import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { ReviewSubmitDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Request-body DTO for POST /v1/reviews (Feature 80).
//
// Same construction as ConsultationSubmitRequestDTO — the template this module
// mirrors. The global ValidationPipe (main.ts) runs these decorators, strips
// unknown keys (whitelist), and 400s on an unknown property (forbidNonWhitelisted)
// or any failed rule.
//
// SHAPE = `ReviewSubmitDTO` (@tennis/contracts), imported TYPE-ONLY: the contract's
// package `main` points at TS source (zod) that Node cannot `require` at runtime
// ([[api-contracts-type-only-import]]). So the class is the runtime validator and
// the `satisfies`-style assertion at the bottom is the compile-time guarantee that
// it stays structurally in sync with the zod schema.
//
// BOUNDS are duplicated here as literals rather than imported from the contract for
// the same reason: `REVIEW_RATING_MIN` etc. are runtime VALUES in a package this app
// may only import types from. The compile-time parity assertion below cannot catch a
// drifted *number*, so the numbers are restated in comments next to each decorator
// and the contract file is named as their source of truth.
//
// NO AUTHOR FIELD. There is deliberately no `userId`/`email` property: the author is
// the authenticated session (AuthGuard → `@CurrentUser()`), never client-supplied.
// Because `forbidNonWhitelisted` is on, a client that tries to send `userId` gets a
// 400 rather than having it silently ignored.
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewSubmitRequestDTO {
  /** Required. The court being reviewed, by slug — resolved (and existence/published
   *  checked) by the service. */
  @IsString()
  @MinLength(1)
  courtSlug!: string;

  /**
   * Required. 1–5 whole stars (REVIEW_RATING_MIN / REVIEW_RATING_MAX in
   * packages/contracts/src/review.ts). `@IsInt` rejects 4.5 and "4" alike — the pipe's
   * `transform` coerces the declared primitive type, but a non-integer number still
   * fails the rule rather than being rounded.
   */
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  /**
   * Optional free text, 1–2000 characters AFTER trimming
   * (REVIEW_BODY_MAX_LENGTH in the contract).
   *
   * The `@Transform` trims first so the length rules below see the same string the
   * service will store, which makes a whitespace-only body a clean 400 (it trims to
   * '' and fails `@MinLength(1)`) instead of a stored blank. Trimming in the DTO
   * rather than the service keeps validation and persistence looking at one value.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;
}

// Compile-time guard: the request class must stay structurally assignable to the
// contract's submit shape. A renamed field, a changed type, or a changed optionality
// stops this compiling. (The `void` references the alias so it isn't reported unused —
// same idiom as consultations.dto.ts.)
type _AssertContractParity = ReviewSubmitRequestDTO extends ReviewSubmitDTO
  ? true
  : never;
void (true as _AssertContractParity);
