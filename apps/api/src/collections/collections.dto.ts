import { BadRequestException } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// Query parsing for GET /v1/collections (prompt task 5).
//
// Mirrors the courts.dto.ts style: a small, explicit manual parse with NO
// class-validator/class-transformer dependency (none exists in apps/api yet and
// the prompt forbids adding one just for this). Invalid values raise
// BadRequestException (→ HTTP 400); valid ones are returned typed.
//
// The shape mirrors the web `CollectionListOptions` 1:1 so the seeded API
// reproduces MockCollectionRepository behavior:
//   - `featured` — accepted for interface stability, but (like the mock) it does
//     NOT narrow the result: Phase-1 data has no per-collection featured flag, so
//     every editorial collection is eligible. Parsed only to 400 on a malformed
//     boolean, never used to filter (see collections.service.ts).
//   - `limit` — positive integer, trims AFTER ordering (mock's `slice(0, limit)`).
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed, validated collection list options — the API-side mirror of the web
 *  `CollectionListOptions`. */
export interface CollectionListQuery {
  /**
   * Accepted for interface parity with the web repository. Like the mock, it is
   * NOT used to narrow the set (no per-collection featured flag exists in Phase-1
   * data). Parsed here only so a malformed value is a 400 rather than ignored.
   */
  featured?: boolean;
  /** Cap applied AFTER ordering (matches the mock's `slice(0, limit)`). */
  limit?: number;
}

/** Trim a raw query string; treat empty/whitespace-only as absent. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse a `"true"`/`"false"` query flag; anything else for a present key is 400. */
function bool(value: unknown, field: string): boolean | undefined {
  const s = str(value);
  if (s === undefined) return undefined;
  if (s === 'true') return true;
  if (s === 'false') return false;
  throw new BadRequestException(
    `Query param "${field}" must be "true" or "false" (got "${s}").`,
  );
}

/** Parse a positive-integer `limit`; non-positive / non-integer is a 400. */
function limit(value: unknown): number | undefined {
  const s = str(value);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(
      `Query param "limit" must be a positive integer (got "${s}").`,
    );
  }
  return n;
}

/**
 * Build a validated `CollectionListQuery` from the raw Express query object.
 * Throws `BadRequestException` (→ HTTP 400) on a malformed `featured` / `limit`.
 */
export function parseCollectionListQuery(
  raw: Record<string, unknown>,
): CollectionListQuery {
  return {
    featured: bool(raw.featured, 'featured'),
    limit: limit(raw.limit),
  };
}
