import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Admin image request DTOs (TASK_73, "What to build" §5).
// ─────────────────────────────────────────────────────────────────────────────

/** Optional `alt` form field alongside the uploaded file (multipart). */
export class UploadImageFieldsDTO {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class PatchImageRequestDTO {
  /** `null` clears the alt text. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string | null;

  /**
   * `isHero: false` is REJECTED (400) — you set a hero by promoting ANOTHER
   * image, never by un-setting this one (decision: "you set a hero by
   * promoting another image"). `@IsIn([true])` only accepts `true`; a literal
   * `false` fails validation (it is defined, so `@IsOptional()` does not skip
   * it) and is rejected by the global ValidationPipe before this ever reaches
   * the service.
   */
  @IsOptional()
  @IsBoolean()
  @IsIn([true])
  isHero?: true;
}

export class ReorderImagesRequestDTO {
  @IsArray()
  @IsString({ each: true })
  imageIds!: string[];
}
