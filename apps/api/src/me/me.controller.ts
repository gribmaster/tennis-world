import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { UserProfileDTO } from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { UpdateProfileRequestDTO } from './me.dto';
import { MeService } from './me.service';

// ─────────────────────────────────────────────────────────────────────────────
// MeController — the first PROTECTED resource (Feature 53). Proves the AuthGuard
// (Feature 52) works on a real endpoint:
//
//   GET   /v1/me  → 200 UserProfileDTO (the authed user's public profile)
//   PATCH /v1/me  → 200 updated UserProfileDTO (edit `name`)
//
// `@UseGuards(AuthGuard)` at the class level guards BOTH routes — every request must
// carry a valid session cookie OR `Authorization: Bearer <jwt>` (the guard's two
// extractors). Missing/invalid/expired → 401 before the handler runs. `@CurrentUser()`
// reads the `{ userId, email }` the guard attached; the service scopes its reads/writes
// to that `userId` (a user only ever touches their OWN profile).
//
// No email is returned (the mapper strips it — Feature 50 §5.3); membership stays
// 'free' (entitlement out of scope). `DELETE /v1/me` is documented for later (Feature
// 50 §4.2) but intentionally NOT implemented here (the intake's Feature-53 scope is
// GET + PATCH only; account deletion is an App-Store requirement that can land as its
// own feature).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  /** GET /v1/me — the authenticated user's profile. */
  @Get()
  getProfile(@CurrentUser() user: AuthContext): Promise<UserProfileDTO> {
    return this.me.getProfile(user.userId);
  }

  /** PATCH /v1/me — update the authenticated user's editable profile fields. */
  @Patch()
  updateProfile(
    @CurrentUser() user: AuthContext,
    @Body() body: UpdateProfileRequestDTO,
  ): Promise<UserProfileDTO> {
    return this.me.updateProfile(user.userId, body);
  }
}
