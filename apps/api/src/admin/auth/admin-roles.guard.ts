import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminCsrfGuard } from './admin-csrf.guard';
import type { RequestWithAdmin } from './admin-auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// Role gate (TASK_73, decision 5) — `AdminUser.role` is a free string; for now
// only `'admin'` has access to anything beyond `GET /v1/admin/me`.
//
// DEFAULT-DENY: a route that applies `AdminRolesGuard` with NO `@AdminRoles(...)`
// metadata is REJECTED (empty/missing roles list → 403), so a forgotten
// decorator can never leave a route open to any authenticated admin regardless
// of role. `GET /v1/admin/me` deliberately does NOT apply this guard at all
// (any role may read its own identity) — that is a one-route exception, not a
// gap this guard fails to cover.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_ROLES_KEY = 'adminRoles';

/** Attach the allowed-roles metadata `AdminRolesGuard` reads. */
export const AdminRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // `@AdminOnly(...)` (and the `@AdminRoles(...)` it sets) is applied at the
    // CONTROLLER (class) level on AdminCourtsController/AdminGeoController/
    // AdminImagesController, and could in principle be overridden per-method —
    // `getAllAndOverride` checks the handler first, falling back to the class,
    // so both placements work. `context.getHandler()` ALONE would never see
    // class-level metadata and every route would default-deny.
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      throw new ForbiddenException('This route has no configured admin roles.');
    }

    const req = context.switchToHttp().getRequest<Request & RequestWithAdmin>();
    const role = req.admin?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Insufficient admin role.');
    }
    return true;
  }
}

/**
 * Composite decorator (decision 5: "compose both guards in one decorator") —
 * applies `AdminAuthGuard` (authenticate) then `AdminCsrfGuard` (inert for GET /
 * bearer, enforced for a cookie-authenticated mutation) then `AdminRolesGuard`
 * (authorize), and attaches the `@AdminRoles(...)` metadata the last guard reads.
 * Use this on every `/v1/admin/*` route EXCEPT login (public) and `GET /me`
 * (auth-only, no role restriction).
 */
export const AdminOnly = (...roles: string[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseGuards(AdminAuthGuard, AdminCsrfGuard, AdminRolesGuard),
    AdminRoles(...roles),
  );
