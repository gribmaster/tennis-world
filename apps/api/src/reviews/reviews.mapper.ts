import { Prisma } from '@prisma/client';
import type { ReviewDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Review mapper (Feature 80) — mirrors consultations.mapper.ts.
//
// Type-only @tennis/contracts import (same rule as every other mapper,
// [[api-contracts-type-only-import]]): the contract supplies the erased response
// type; no runtime zod is loaded.
//
// ONE DIRECTION ONLY. The consultation mapper carries a `toCreateInput` because its
// request shape has eleven fields with defaults and date parsing. A review's create
// payload is four values the service already holds (`courtId` resolved from the slug,
// the authenticated `userId`, `rating`, `body`) with no defaulting and no parsing, so
// building it inline in the service is clearer than routing it through a function that
// would only re-list its arguments. Documented here because it is a deliberate
// deviation from the template.
//
// SERIALIZATION (row → DTO):
//   - `createdAt` (DateTime) → ISO-8601 string, same `toISOString()` idiom as the
//     consultation and article mappers.
//   - `body` is nullable in the column and OPTIONAL in the contract, so a null is
//     OMITTED from the response rather than emitted as an explicit null — matching how
//     the consultation mapper handles its optional scalars.
//   - `courtSlug` comes from the joined court, not from the request echo, so the
//     response reports what was actually resolved and stored against.
//   - `status` is a free-form String column; the contract narrows it to a three-value
//     union. A freshly created (or freshly updated) review is always "new", so the cast
//     is safe on this write-then-read path — the same reasoning, and the same narrowing,
//     as the consultation mapper.
//
// NO AGGREGATE OF ANY KIND is computed here — no average, no count, no rollup onto a
// court. This file's only job is to serialize the single row that was just written.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exactly the ReviewDTO-relevant columns, plus the court's `slug` (the contract's
 * `courtSlug`) via the relation. No `userId` is selected: the author is never on the
 * wire — the contract carries no author field and the client already knows it is
 * itself.
 */
export const reviewSelect = {
  id: true,
  rating: true,
  body: true,
  status: true,
  createdAt: true,
  court: { select: { slug: true } },
} satisfies Prisma.ReviewSelect;

/** Row payload derived from the select above. */
export type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

/**
 * Serialize a created/updated Review row into the contract's `ReviewDTO`. The
 * optional `body` is omitted when null so the response matches the contract's
 * optional shape.
 */
export function toReviewDTO(row: ReviewRow): ReviewDTO {
  return {
    id: row.id,
    courtSlug: row.court.slug,
    rating: row.rating,
    // A created/updated row is always "new"; the contract narrows the free String
    // column to its moderation union.
    status: row.status as ReviewDTO['status'],
    createdAt: row.createdAt.toISOString(),
    ...(row.body !== null ? { body: row.body } : {}),
  };
}
