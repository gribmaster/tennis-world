import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { extractAdminToken } from './admin-auth-request.util';
import { ADMIN_AUTH_CONFIG, ADMIN_JWT_AUDIENCE, ADMIN_SESSION_COOKIE_NAME } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import type { AdminAccessTokenPayload, RequestWithAdmin } from './admin-auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// AdminAuthGuard (TASK_73) — the ONE guard every `/v1/admin/*` route except
// login applies (directly, or via `AdminOnly(...)` in admin-roles.guard.ts).
//
// SEPARATION FROM THE USER AuthGuard: a completely independent JwtService
// instance (its own `JwtModule.register({})` in AdminModule), the admin-only
// secret (`ADMIN_AUTH_CONFIG`), and the `aud: 'tennis-admin'` claim enforced via
// the jsonwebtoken `audience` verify option — so a user token (different
// secret) and an admin token with the wrong/missing audience both fail
// signature/claim verification here, and a USER route's `AuthGuard` never reads
// this cookie name at all. Both directions are 401, never 403 (401 = "you are
// not authenticated on this surface", not "authenticated but forbidden").
//
// LOADS THE AdminUser ROW ON EVERY REQUEST (never trusts only the JWT payload)
// so a deleted admin or a changed `role` takes effect on the very next call —
// the JWT's 8h TTL would otherwise let a revoked admin keep acting for hours.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithAdmin>();

    const extracted = extractAdminToken(req, ADMIN_SESSION_COOKIE_NAME);
    if (!extracted) {
      throw new UnauthorizedException('Admin authentication required.');
    }

    let payload: AdminAccessTokenPayload;
    try {
      payload = this.jwt.verify<AdminAccessTokenPayload>(extracted.token, {
        secret: this.config.jwtSecret,
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      // Bad signature (wrong secret), wrong/missing aud, malformed, or expired —
      // uniform 401, no detail leak about which condition failed.
      throw new UnauthorizedException('Invalid or expired admin session.');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Invalid or expired admin session.');
    }

    req.admin = { adminId: admin.id, email: admin.email, role: admin.role };
    req.adminAuthVia = extracted.via;
    return true;
  }
}
