import { IsIn, IsNumber, IsString, Length, Matches, Max, Min } from 'class-validator';
import type { Continent } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Admin geo (countries/regions) request DTOs (TASK_73, "What to build" §4).
// ─────────────────────────────────────────────────────────────────────────────

// Exported so the court-import DTOs (TASK_79) can reuse this exact vocabulary
// instead of retyping it (decision 5 in docs/TASK_79_COURT_IMPORT_API.md).
export const CONTINENTS = ['Europe', 'Asia', 'Americas', 'Africa', 'Oceania'] as const;

export class CreateCountryRequestDTO {
  @IsString()
  @Length(2, 80)
  name!: string;

  /** Exactly 2 letters; the service upper-cases it before storing/comparing. */
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  isoCode!: string;

  @IsIn(CONTINENTS)
  continent!: Continent;
}

export class CreateRegionRequestDTO {
  @IsString()
  countryId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
