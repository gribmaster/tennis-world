import { BadRequestException } from '@nestjs/common';
import type {
  AccessType,
  CourtTag,
  IndoorOutdoor,
  Surface,
} from '@tennis/contracts';
import { COURT_TAGS } from './court-tags';

// ─────────────────────────────────────────────────────────────────────────────
// Query parsing for GET /v1/courts (intake §5; prompt task 9).
//
// No class-validator/class-transformer dependency exists in apps/api and the
// prompt forbids adding a large validation dependency just for this — so we do a
// small, explicit manual parse: booleans from "true"/"false", a positive-integer
// limit, and enum values validated against a fixed allow-list. Invalid values
// raise BadRequestException (HTTP 400); valid ones are returned typed.
//
// The enum value-lists below are the same closed vocabularies declared in
// @tennis/contracts (zod enums) and mirrored in the Prisma schema. We keep the
// @tennis/contracts *types* (imported `type`-only, so erased at build time) but
// do NOT import its runtime zod objects: the API runs as plain Node
// (`node dist/main.js`) and @tennis/contracts' package `main` points at TS source
// (`src/index.ts`) which Node cannot `require` at runtime. Type-only usage keeps
// @tennis/contracts a zero-runtime-cost, single-source-of-truth for the shapes.
//
// This mirrors the web `CourtFilter` shape 1:1 so the seeded API reproduces the
// MockCourtRepository behavior.
// ─────────────────────────────────────────────────────────────────────────────

// Closed enum vocabularies (mirror @tennis/contracts enums + the Prisma schema).
const SURFACES = ['Clay', 'Hard', 'Grass'] as const;
const ACCESS_TYPES = ['Resort', 'Club', 'Academy', 'Private'] as const;
const INDOOR_OUTDOOR = ['Indoor', 'Outdoor'] as const;

/** Parsed, validated court list filter — the API-side mirror of web `CourtFilter`. */
export interface CourtListQuery {
  country?: string;
  region?: string;
  /** Collection SLUG — restricts to members of that collection via CollectionCourt. */
  collection?: string;
  surface?: Surface;
  access?: AccessType;
  indoorOutdoor?: IndoorOutdoor;
  scenic?: boolean;
  featured?: boolean;
  /**
   * Closed "Experience" tag vocabulary (Feature 72). Multiple tags are OR-ed:
   * a court matches if it carries ANY of the listed tags — see `list()` in
   * courts.service.ts for the reasoning.
   */
  tags?: CourtTag[];
  /** Free-text search over name/country/region/setting. */
  q?: string;
  /** Cap applied AFTER filtering (matches the mock's `slice(0, limit)`). */
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

/** Validate a present value against a fixed enum allow-list, else 400. */
function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  const s = str(value);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s)) {
    throw new BadRequestException(
      `Query param "${field}" must be one of: ${allowed.join(', ')} (got "${s}").`,
    );
  }
  return s as T;
}

/**
 * Parse the comma-separated `tags` param into a validated, de-duplicated list.
 *
 * Repeated keys (`?tags=a&tags=b`) arrive from Express as an array, so both the
 * comma form and the repeated form are accepted and normalized to one flat list.
 * Any value outside the closed vocabulary is a 400 — consistent with how
 * `surface`/`access`/`indoorOutdoor` reject unknown enum values rather than
 * silently ignoring them. An empty/whitespace-only param is treated as absent.
 */
function tagList(value: unknown): CourtTag[] | undefined {
  const rawParts = Array.isArray(value) ? value : [value];
  const parts: string[] = [];
  for (const part of rawParts) {
    const s = str(part);
    if (s === undefined) continue;
    for (const piece of s.split(',')) {
      const trimmed = piece.trim();
      if (trimmed.length > 0) parts.push(trimmed);
    }
  }
  if (parts.length === 0) return undefined;

  const allowed = COURT_TAGS as readonly string[];
  const seen = new Set<string>();
  const tags: CourtTag[] = [];
  for (const part of parts) {
    if (!allowed.includes(part)) {
      throw new BadRequestException(
        `Query param "tags" must contain only: ${COURT_TAGS.join(', ')} (got "${part}").`,
      );
    }
    if (seen.has(part)) continue;
    seen.add(part);
    tags.push(part as CourtTag);
  }
  return tags;
}

/**
 * Build a validated `CourtListQuery` from the raw Express query object. Throws
 * `BadRequestException` (→ HTTP 400) on any malformed enum / boolean / limit.
 */
export function parseCourtListQuery(raw: Record<string, unknown>): CourtListQuery {
  return {
    country: str(raw.country),
    region: str(raw.region),
    collection: str(raw.collection),
    surface: enumValue<Surface>(raw.surface, SURFACES, 'surface'),
    access: enumValue<AccessType>(raw.access, ACCESS_TYPES, 'access'),
    indoorOutdoor: enumValue<IndoorOutdoor>(
      raw.indoorOutdoor,
      INDOOR_OUTDOOR,
      'indoorOutdoor',
    ),
    scenic: bool(raw.scenic, 'scenic'),
    featured: bool(raw.featured, 'featured'),
    tags: tagList(raw.tags),
    q: str(raw.q),
    limit: limit(raw.limit),
  };
}
