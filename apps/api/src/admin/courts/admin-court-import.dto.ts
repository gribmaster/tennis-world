import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AccessType, Continent, IndoorOutdoor, Surface } from '@tennis/contracts';
import { URL_SAFE_SLUG_PATTERN } from '../../courts/court-derived-fields';
import { ACCESS_TYPES, INDOOR_OUTDOOR, SURFACES } from './admin-courts.dto';
import { CONTINENTS } from '../geo/admin-geo.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Court import request DTOs (TASK_79). Mirrors the shape rules in the task's
// "The template (item shape)" table. Enum/limit constants are IMPORTED from
// `admin-courts.dto.ts` / `admin-geo.dto.ts` (decision 5 — no retyped
// vocabularies). This DTO carries only the SHAPE checks `class-validator` can
// express naturally (types, lengths, patterns, enums, nested object, URL
// shape); the business-rule checks it cannot express well — tag vocabulary
// with per-index paths, URL source count/shape with per-index paths, the "no
// `<`/`>`" rule, the 0/0 + ≤7-decimal-place lat/lng rules, and the blurb
// paragraph-count rule — are done in `AdminCourtImportService` so the report
// can name the exact offending index (`tags[1]`, `sources[3]`, …).
//
// `forbidNonWhitelisted: true` on this DTO is what turns a `status`, `images`,
// or any other unknown key into a clean per-item error instead of a silent
// drop (decision 1/7) — see `AdminCourtImportService.validateItemShape`.
// ─────────────────────────────────────────────────────────────────────────────

const NO_ANGLE_BRACKETS = /^[^<>]*$/;

export class ImportCourtCountryDTO {
  @IsString()
  @Length(2, 80)
  name!: string;

  /** Case-insensitive on input; the service upper-cases it before resolving/storing. */
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  isoCode!: string;

  @IsIn(CONTINENTS)
  continent!: Continent;
}

export class ImportCourtItemDTO {
  @IsString()
  @Length(2, 120)
  @Matches(NO_ANGLE_BRACKETS, { message: 'name must not contain "<" or ">".' })
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(URL_SAFE_SLUG_PATTERN)
  @MaxLength(80)
  slug?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ImportCourtCountryDTO)
  country!: ImportCourtCountryDTO;

  @IsString()
  @Length(2, 80)
  region!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  /** `null` clears; strict host/path rules checked by `validateMapLinkUrl` in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mapLinkUrl?: string | null;

  @IsIn(SURFACES)
  surface!: Surface;

  @IsIn(ACCESS_TYPES)
  access!: AccessType;

  @IsIn(INDOOR_OUTDOOR)
  indoorOutdoor!: IndoorOutdoor;

  @IsString()
  @Length(1, 120)
  @Matches(NO_ANGLE_BRACKETS, { message: 'setting must not contain "<" or ">".' })
  setting!: string;

  @IsOptional()
  @IsBoolean()
  isScenic?: boolean;

  /** Shape only — vocabulary membership is checked (with per-index paths) in the service. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @Length(40, 4000)
  @Matches(NO_ANGLE_BRACKETS, { message: 'blurb must not contain "<" or ">".' })
  blurb!: string;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  sources!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export interface ImportRequestBody {
  courts: unknown[];
  dryRun: boolean;
}

/**
 * Manually parses the top-level `{ courts, dryRun }` envelope — deliberately
 * NOT a `class-validator` DTO bound via `@Body()`. The global `ValidationPipe`
 * (`transform: true`) deep-clones nested plain objects even without a
 * `@ValidateNested()`/`@Type()` decorator on `courts`, and that clone crashes
 * (`TypeError: Cannot read properties of undefined (reading 'constructor')`)
 * on an item carrying an own `constructor` key — exactly one of the keys this
 * endpoint must reject as a clean per-item error, never a 500 (see the
 * comment in `admin-court-import-body-limit.ts`). Parsing manually here means
 * `req.body` never passes through that pipe, so a `__proto__`/`constructor`/
 * `prototype` key survives, untouched, for
 * `AdminCourtImportService`'s own forbidden-key check.
 */
export function parseImportRequestBody(raw: unknown): ImportRequestBody {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key !== 'courts' && key !== 'dryRun') {
      throw new BadRequestException(`Unknown property "${key}".`);
    }
  }

  const courts = body.courts;
  if (!Array.isArray(courts) || courts.length < 1 || courts.length > 50) {
    throw new BadRequestException('"courts" must be an array of 1 to 50 items.');
  }

  const dryRunRaw = body.dryRun;
  if (dryRunRaw !== undefined && typeof dryRunRaw !== 'boolean') {
    throw new BadRequestException('"dryRun" must be a boolean.');
  }

  return { courts, dryRun: dryRunRaw ?? true };
}
