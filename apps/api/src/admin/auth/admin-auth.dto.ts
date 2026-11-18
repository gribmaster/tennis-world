import { IsEmail, IsString, MinLength } from 'class-validator';
import { ADMIN_PASSWORD_MIN_LENGTH } from './admin-password.util';

// ─────────────────────────────────────────────────────────────────────────────
// Request-body DTO for POST /v1/admin/auth/login (TASK_73). Same class-validator
// + global ValidationPipe idiom as `consultations.dto.ts` — whitelist +
// forbidNonWhitelisted reject any unknown field.
// ─────────────────────────────────────────────────────────────────────────────

export class AdminLoginRequestDTO {
  @IsEmail()
  email!: string;

  /**
   * The length floor here is the DTO-level shape check only (reject an
   * obviously-too-short password before even hashing); it is NOT what makes a
   * wrong-length password indistinguishable from a wrong-but-valid-length one —
   * `AdminAuthService.login` returns the SAME generic 401 either way.
   */
  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN_LENGTH)
  password!: string;
}
