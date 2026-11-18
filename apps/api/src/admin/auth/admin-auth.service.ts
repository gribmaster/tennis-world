import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AdminSessionDTO } from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_AUTH_CONFIG, ADMIN_JWT_AUDIENCE, type AdminAuthConfig } from './admin-auth.config';
import { dummyAdminPasswordHash, verifyAdminPassword } from './admin-password.util';
import type { AdminAccessTokenPayload } from './admin-auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// AdminAuthService (TASK_73) — login + session issuance. Deliberately NOT a
// copy-paste of `AuthService`: no magic link, no mailer, password-based with its
// own scrypt hashing (`admin-password.util.ts`).
//
// UNIFORM 401 (decision: "Wrong email *or* password → the same 401"): whether
// the email doesn't exist or the password is wrong, this throws the identical
// `UnauthorizedException('Invalid email or password.')` — no detail leak about
// which condition failed. Login-attempt rate limiting (keyed by IP + email) and
// the Retry-After header live in the CONTROLLER (needs the raw `Response` to set
// a header before this service even runs) — see `AdminAuthController.login`.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
  ) {
    if (this.config.usingDefaultSecret) {
      this.logger.warn(
        'ADMIN_JWT_SECRET is the default dev sentinel — override it outside local dev.',
      );
    }
  }

  /**
   * POST /v1/admin/auth/login core. Email is normalized by the CONTROLLER
   * (trim + lower-case) before being passed here, matching `AuthService`'s
   * convention of normalizing once at the boundary.
   */
  async login(email: string, password: string, context: { ip?: string }): Promise<AdminSessionDTO> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });

    // Burn a real scrypt derivation either way (decision 3) — compare against the
    // real stored hash when the admin exists, or a fixed dummy hash when it
    // doesn't, so an unknown email takes the same time as a wrong password.
    const hashToCompare = admin?.passwordHash ?? (await dummyAdminPasswordHash());
    const passwordOk = await verifyAdminPassword(password, hashToCompare);

    if (!admin || !passwordOk) {
      this.logger.warn(
        `admin login failed email=${email}${context.ip ? ` ip=${context.ip}` : ''}`,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.logger.log(`admin login success adminId=${admin.id}`);
    return this.issueSession(admin.id, admin.email, admin.role);
  }

  private issueSession(adminId: string, email: string, role: string): AdminSessionDTO {
    const payload: AdminAccessTokenPayload = { sub: adminId, email };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.tokenTtlSeconds,
      audience: ADMIN_JWT_AUDIENCE,
    });
    const expiresAt = new Date(Date.now() + this.config.tokenTtlSeconds * 1000).toISOString();

    return {
      admin: { id: adminId, email, role },
      accessToken,
      expiresAt,
    };
  }
}
