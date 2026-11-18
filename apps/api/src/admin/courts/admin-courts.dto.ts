import { BadRequestException } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AccessType, CourtStatus, CourtTag, IndoorOutdoor, Surface } from '@tennis/contracts';
import { URL_SAFE_SLUG_PATTERN } from '../../courts/court-derived-fields';
import { COURT_TAGS } from '../../courts/court-tags';

// ─────────────────────────────────────────────────────────────────────────────
// Admin court request DTOs (TASK_73, decisions 9–13). Same class-validator +
// global ValidationPipe idiom as `consultations.dto.ts` (whitelist +
// forbidNonWhitelisted → an unknown field, including any derived field the
// admin never sends — `approxLat`, `mapX`, `mapY`, `seedOrder`, `id`,
// `createdAt`, `updatedAt` — is a clean 400, never silently dropped-then-ignored).
//
// Enum vocabularies are local `as const` arrays — the same mirrored-vocabulary
// idiom `courts.dto.ts` already uses, since @tennis/contracts' zod runtime
// objects can't be `require`d by the API at runtime (type-only import rule).
// ─────────────────────────────────────────────────────────────────────────────

const SURFACES = ['Clay', 'Hard', 'Grass'] as const;
const ACCESS_TYPES = ['Resort', 'Club', 'Academy', 'Private'] as const;
const INDOOR_OUTDOOR = ['Indoor', 'Outdoor'] as const;
const COURT_STATUSES = ['draft', 'published'] as const;

export class CreateCourtRequestDTO {
  @IsString()
  @Length(2, 120)
  name!: string;

  /** Optional — generated from `name` via `slugify` when omitted (service layer). */
  @IsOptional()
  @IsString()
  @Matches(URL_SAFE_SLUG_PATTERN)
  @MaxLength(80)
  slug?: string;

  @IsString()
  countryId!: string;

  @IsString()
  regionId!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  /** `null` clears; validated strictly by `admin-map-link.util.ts` in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mapLinkUrl?: string | null;

  @IsIn(SURFACES)
  surface!: Surface;

  @IsString()
  @Length(1, 120)
  setting!: string;

  @IsIn(ACCESS_TYPES)
  access!: AccessType;

  @IsIn(INDOOR_OUTDOOR)
  indoorOutdoor!: IndoorOutdoor;

  @IsOptional()
  @IsBoolean()
  isScenic?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  /** Defaults to 'draft' in the service when omitted. */
  @IsOptional()
  @IsIn(COURT_STATUSES)
  status?: CourtStatus;

  /** Defaults to '' in the service when omitted (publish gate then requires it). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  blurb?: string;

  /** Validated against the closed vocabulary + canonically ordered in the service. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateCourtRequestDTO {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(URL_SAFE_SLUG_PATTERN)
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mapLinkUrl?: string | null;

  @IsOptional()
  @IsIn(SURFACES)
  surface?: Surface;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  setting?: string;

  @IsOptional()
  @IsIn(ACCESS_TYPES)
  access?: AccessType;

  @IsOptional()
  @IsIn(INDOOR_OUTDOOR)
  indoorOutdoor?: IndoorOutdoor;

  @IsOptional()
  @IsBoolean()
  isScenic?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsIn(COURT_STATUSES)
  status?: CourtStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  blurb?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Parsed, validated `GET /v1/admin/courts` query (manual parse — a GET's query
 *  params have no metatype for the global ValidationPipe to validate, same as
 *  the public `parseCourtListQuery` in `courts/courts.dto.ts`). */
export interface AdminCourtListQuery {
  q?: string;
  status?: CourtStatus;
  page: number;
  pageSize: number;
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  const s = str(value);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s)) {
    throw new BadRequestException(`Query param "${field}" must be one of: ${allowed.join(', ')} (got "${s}").`);
  }
  return s as T;
}

function positiveInt(value: unknown, fallback: number, field: string): number {
  const s = str(value);
  if (s === undefined) return fallback;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`Query param "${field}" must be a positive integer (got "${s}").`);
  }
  return n;
}

export function parseAdminCourtListQuery(raw: Record<string, unknown>): AdminCourtListQuery {
  const page = positiveInt(raw.page, 1, 'page');
  const pageSize = positiveInt(raw.pageSize, 25, 'pageSize');
  if (pageSize > 100) {
    throw new BadRequestException('Query param "pageSize" must be <= 100.');
  }
  return {
    q: str(raw.q),
    status: enumValue<CourtStatus>(raw.status, COURT_STATUSES, 'status'),
    page,
    pageSize,
  };
}

/** Validate a tag list against the closed vocabulary; unknown → 400 (decision 11 —
 *  unlike `orderCourtTags`, which silently drops unknown values, the admin write
 *  path must reject them so a typo doesn't silently disappear). */
export function validateAdminTags(tags: readonly string[]): CourtTag[] {
  const allowed = COURT_TAGS as readonly string[];
  for (const tag of tags) {
    if (!allowed.includes(tag)) {
      throw new BadRequestException(`Unknown tag "${tag}". Allowed: ${COURT_TAGS.join(', ')}.`);
    }
  }
  const seen = new Set(tags);
  return COURT_TAGS.filter((tag) => seen.has(tag));
}
