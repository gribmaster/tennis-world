import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { ExactLocationDTO } from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { ExactLocationService } from './exact-location.service';

// ─────────────────────────────────────────────────────────────────────────────
// ExactLocationController — the protected exact-coordinate unlock (Feature 63,
// intake §4):
//
//   GET /v1/me/courts/:slug/exact-location → 200 ExactLocationDTO (entitled viewer)
//
// `@UseGuards(AuthGuard)` at the class level guards the route — every request must
// carry a valid session cookie OR `Authorization: Bearer <jwt>` (the guard's two
// extractors). Missing/invalid/expired → 401 before the handler runs. `@CurrentUser()`
// supplies the `{ userId, email }` the guard attached; the service uses `userId` for
// the entitlement gate.
//
// It lives in the Me module (under `me/*`, alongside profile + saved-courts) because
// the unlock is scoped to the authenticated user's entitlement — the same guard and the
// same `@CurrentUser()` ergonomics. The path is `me/courts/:slug/exact-location` (a
// Me-scoped sibling of the PUBLIC `/v1/courts/:slug`, which stays masked).
//
// FAILURE SEMANTICS (intake §4.5; delegated to the service):
//   - no/invalid auth         → 401 (AuthGuard, before handler)
//   - real court, not entitled → 403
//   - unknown/unpublished slug → 404 (existence checked first — leaks nothing new)
//   - entitled + real court    → 200 ExactLocationDTO
// ─────────────────────────────────────────────────────────────────────────────

@Controller('me/courts')
@UseGuards(AuthGuard)
export class ExactLocationController {
  constructor(private readonly exactLocation: ExactLocationService) {}

  /** GET /v1/me/courts/:slug/exact-location — exact coords for an entitled viewer. */
  @Get(':slug/exact-location')
  getExactLocation(
    @CurrentUser() user: AuthContext,
    @Param('slug') slug: string,
  ): Promise<ExactLocationDTO> {
    return this.exactLocation.getExactLocation(user.userId, slug);
  }
}
