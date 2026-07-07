import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { RequestMagicLinkDTO, VerifyMagicLinkDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Auth request-body DTOs — the class-validator runtime validators for
//   POST /v1/auth/request-link  (RequestMagicLinkRequestDTO)
//   POST /v1/auth/verify        (VerifyMagicLinkRequestDTO)
//
// Same idiom as `consultations.dto.ts`: the @tennis/contracts zod shapes are the
// structural source of truth but can't be runtime-`require`d (TS-source `main`,
// [[api-contracts-type-only-import]]), so each request is a local class with
// class-validator decorators (the global ValidationPipe runs them: whitelist +
// forbidNonWhitelisted + transform), guarded at COMPILE time by a `satisfies`-style
// assertion against the contract type so the class can't drift from the zod schema.
// ─────────────────────────────────────────────────────────────────────────────

/** Body for POST /v1/auth/request-link — `{ email, redirectTo? }`. */
export class RequestMagicLinkRequestDTO {
  /** Required, syntactically-valid email. Normalized (lower-case/trim) in the
   *  service, not here — the contract makes no casing guarantee. */
  @IsEmail()
  email!: string;

  /**
   * Optional post-verify destination. Its presence does NOT make it trusted — the
   * service allowlists it server-side (relative path, or same-origin as WEB_APP_URL)
   * before ever honoring it (open-redirect guard).
   */
  @IsOptional()
  @IsString()
  redirectTo?: string;
}

/** Body for POST /v1/auth/verify — `{ token }`. */
export class VerifyMagicLinkRequestDTO {
  /** The raw single-use token from the magic link. Hashed + looked up server-side. */
  @IsString()
  token!: string;
}

// Compile-time guards: each request class must stay structurally assignable to its
// contract shape. `redirectTo`/`email` optionality and types are checked here — if a
// field drifts from the zod schema, this stops compiling. `void` references the
// aliases so they aren't reported as unused.
type _AssertRequestParity = RequestMagicLinkRequestDTO extends RequestMagicLinkDTO
  ? true
  : never;
type _AssertVerifyParity = VerifyMagicLinkRequestDTO extends VerifyMagicLinkDTO
  ? true
  : never;
void (true as _AssertRequestParity);
void (true as _AssertVerifyParity);
