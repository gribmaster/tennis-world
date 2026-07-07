import { Prisma } from '@prisma/client';
import type {
  ConsultationRequestDTO,
  GroupSize,
  SkillLevel,
} from '@tennis/contracts';
import type { ConsultationSubmitRequestDTO } from './consultations.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Consultation mapper (prompt task 5) — two directions:
//   1. `toCreateInput`  : validated request DTO → Prisma `ConsultationRequest`
//                         create payload.
//   2. `toConsultationRequestDTO` : created Prisma row → `ConsultationRequestDTO`
//                         response (the full stored shape, contract-aligned).
//
// Type-only @tennis/contracts import (same rule as the other mappers,
// [[api-contracts-type-only-import]]): the contract gives us the erased response
// type; no runtime zod is loaded.
//
// NULLABILITY / DEFAULTS (request → row):
//   - `userId` is ALWAYS null here — Phase-2 consultations are anonymous (no auth).
//   - `isFlexible` defaults to `false` when the client omits it (mirrors both the
//     contract's `z.boolean().default(false)` and the Prisma column default).
//   - `travelStart`/`travelEnd` arrive as ISO date STRINGS; Prisma's DateTime
//     columns need `Date`s, so present values are parsed via `new Date(...)`.
//     `status`/`createdAt` are NOT set — Prisma applies its column defaults
//     (`status = "new"`, `createdAt = now()`).
//
// SERIALIZATION (row → DTO):
//   - `createdAt` (DateTime) → ISO-8601 string (the wire format the contract
//     declares), same `toISOString()` idiom as the article mapper.
//   - `travelStart`/`travelEnd` (DateTime?) → ISO strings, omitted when null.
//   - optional/nullable scalars are omitted when null so the response matches the
//     contract's optional fields exactly (rather than emitting explicit nulls).
//   - `status` is a free-form String column; the contract narrows it to
//     `'new' | 'contacted' | 'closed'`. A freshly-created row is always `'new'`,
//     so the cast is safe for this endpoint (we never widen it here).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Prisma create payload from a validated request DTO. `userId` is
 * forced null (anonymous), `isFlexible` defaults to false, and ISO date strings
 * are parsed to `Date`. `status`/`createdAt` are left to Prisma defaults.
 */
export function toCreateInput(
  dto: ConsultationSubmitRequestDTO,
): Prisma.ConsultationRequestUncheckedCreateInput {
  return {
    userId: null, // anonymous — no auth in Phase 2
    email: dto.email,
    destinationInterest: dto.destinationInterest,
    isFlexible: dto.isFlexible ?? false,
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.travelStart !== undefined
      ? { travelStart: new Date(dto.travelStart) }
      : {}),
    ...(dto.travelEnd !== undefined
      ? { travelEnd: new Date(dto.travelEnd) }
      : {}),
    ...(dto.skillLevel !== undefined ? { skillLevel: dto.skillLevel } : {}),
    ...(dto.groupSize !== undefined ? { groupSize: dto.groupSize } : {}),
    ...(dto.additionalRequest !== undefined
      ? { additionalRequest: dto.additionalRequest }
      : {}),
    ...(dto.source !== undefined ? { source: dto.source } : {}),
  };
}

/** Select exactly the ConsultationRequestDTO-relevant columns (no relations, no
 *  internal-only fields beyond what the contract carries). */
export const consultationSelect = {
  id: true,
  name: true,
  email: true,
  destinationInterest: true,
  travelStart: true,
  travelEnd: true,
  isFlexible: true,
  skillLevel: true,
  groupSize: true,
  additionalRequest: true,
  source: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ConsultationRequestSelect;

/** Row payload derived from the select above. */
export type ConsultationRow = Prisma.ConsultationRequestGetPayload<{
  select: typeof consultationSelect;
}>;

/** ISO-8601 serialize a DateTime; null → undefined (so the key is omitted). */
function isoOrUndefined(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

/**
 * Serialize a created/stored ConsultationRequest row into the contract's
 * `ConsultationRequestDTO`. Optional/nullable fields are omitted when null so the
 * response matches the contract's optional shape.
 */
export function toConsultationRequestDTO(
  row: ConsultationRow,
): ConsultationRequestDTO {
  const travelStart = isoOrUndefined(row.travelStart);
  const travelEnd = isoOrUndefined(row.travelEnd);

  return {
    id: row.id,
    email: row.email,
    destinationInterest: row.destinationInterest,
    isFlexible: row.isFlexible,
    // `status` is a free String column; a created row is always "new". The
    // contract narrows it to a union — safe for this write-then-read path.
    status: row.status as ConsultationRequestDTO['status'],
    createdAt: row.createdAt.toISOString(),
    ...(row.name !== null ? { name: row.name } : {}),
    ...(travelStart !== undefined ? { travelStart } : {}),
    ...(travelEnd !== undefined ? { travelEnd } : {}),
    ...(row.skillLevel !== null
      ? { skillLevel: row.skillLevel as SkillLevel }
      : {}),
    ...(row.groupSize !== null
      ? { groupSize: row.groupSize as GroupSize }
      : {}),
    ...(row.additionalRequest !== null
      ? { additionalRequest: row.additionalRequest }
      : {}),
    ...(row.source !== null
      ? { source: row.source as ConsultationRequestDTO['source'] }
      : {}),
  };
}
