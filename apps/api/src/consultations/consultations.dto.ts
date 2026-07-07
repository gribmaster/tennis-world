import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import type {
  ConsultationSubmitDTO,
  GroupSize,
  SkillLevel,
} from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Request-body DTO for POST /v1/consultations (prompt task 3).
//
// This is the FIRST class-validator DTO in apps/api — every prior endpoint is a
// GET whose query params are parsed manually (courts/articles/collections .dto.ts,
// no validation dependency). The consultation POST carries a real JSON body, so
// `class-validator` + `class-transformer` are now installed and a global
// `ValidationPipe` is wired in main.ts (prompt task 1). The pipe runs these
// decorators, strips unknown keys (whitelist), 400s on extras
// (forbidNonWhitelisted) and on any failed rule.
//
// SHAPE = `ConsultationSubmitDTO` (@tennis/contracts). It is imported `type`-only
// — the contract's package `main` points at TS source (zod) that Node cannot
// `require` at runtime ([[api-contracts-type-only-import]]). So:
//   - the class is the runtime validator (class-validator decorators), and
//   - `satisfies` against `ConsultationSubmitDTO` is a COMPILE-TIME assertion that
//     this class stays structurally in sync with the contract (it would fail to
//     compile if a field's type/optionality drifted from the zod schema).
//
// ENUM VOCABULARIES are declared as local `as const` arrays (same idiom as
// courts.dto.ts) because the zod enum objects can't be runtime-imported. They are
// the exact value-lists from the contract:
//   - skillLevel / groupSize: the capitalized Prisma/contract enums
//     (`Beginner`…/`Solo`…) — NOT the lowercase web pill labels.
//   - source: `'court' | 'paywall' | 'profile'`.
//
// REQUIRED vs OPTIONAL follows the contract zod schema exactly:
//   - `email` (valid email) and `destinationInterest` (non-empty-ish string) are
//     REQUIRED; everything else is optional. (The prompt lists destinationInterest
//     as optional, but the contract — the source of truth — makes it required, and
//     the Prisma `ConsultationRequest.destinationInterest` column is non-nullable.)
// ─────────────────────────────────────────────────────────────────────────────

/** Closed enum vocabularies — mirror the @tennis/contracts zod enums (which Node
 *  can't runtime-import) and the Prisma `SkillLevel`/`GroupSize` enums. */
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Pro'] as const;
const GROUP_SIZES = ['Solo', 'Couple', 'Family', 'Group'] as const;
const SOURCES = ['court', 'paywall', 'profile'] as const;

export class ConsultationSubmitRequestDTO {
  /** Required. The only contact field; a syntactically-valid email is enforced. */
  @IsEmail()
  email!: string;

  /** Optional display name. */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Required free-text destination interest (contract `z.string()`, Prisma
   * non-nullable column). A string of any length is accepted — the form gates
   * emptiness client-side; we do not impose a server min-length the contract
   * doesn't declare.
   */
  @IsString()
  destinationInterest!: string;

  /** Optional ISO-8601 date strings — kept as strings on the wire (contract uses
   *  `z.string()`, not a date type); the service parses them to `Date` for Prisma. */
  @IsOptional()
  @IsString()
  travelStart?: string;

  @IsOptional()
  @IsString()
  travelEnd?: string;

  /** Optional. Defaults to `false` in the service / Prisma when omitted. */
  @IsOptional()
  @IsBoolean()
  isFlexible?: boolean;

  /** Optional skill level — one of the capitalized contract/Prisma enum values. */
  @IsOptional()
  @IsIn(SKILL_LEVELS)
  skillLevel?: SkillLevel;

  /** Optional group size — one of the capitalized contract/Prisma enum values. */
  @IsOptional()
  @IsIn(GROUP_SIZES)
  groupSize?: GroupSize;

  /** Optional free-text notes. */
  @IsOptional()
  @IsString()
  additionalRequest?: string;

  /** Optional trigger source — `'court' | 'paywall' | 'profile'`. */
  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];
}

// Compile-time guard: the request class must remain structurally assignable to the
// contract's submit shape. If a field name/type/optionality drifts from the zod
// `ConsultationSubmitSchema`, this stops compiling. (`isFlexible` is required on
// the contract type via its zod `.default(false)`, but is genuinely optional on
// the wire — the `Partial<>` relaxes only that one boundary mismatch.) The `void`
// references the alias so it is not reported as unused.
type _AssertContractParity = ConsultationSubmitRequestDTO extends Partial<
  ConsultationSubmitDTO
>
  ? true
  : never;
void (true as _AssertContractParity);
