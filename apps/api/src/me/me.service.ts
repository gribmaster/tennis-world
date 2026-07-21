import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserProfileDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toUserProfileDTO } from '../auth/user-profile.mapper';
import { EntitlementsService } from '../entitlements/entitlements.service';
import type { UpdateProfileRequestDTO } from './me.dto';

// ─────────────────────────────────────────────────────────────────────────────
// MeService — the authenticated user's own profile (Feature 53).
//
// Reuses the auth foundation's `toUserProfileDTO` mapper (Feature 52) so GET /v1/me
// returns EXACTLY the same `UserProfileDTO` (`id, name, initials, membership`) the
// verify response embeds — making the future web `HttpUserRepository.getCurrentUser()`
// a drop-in for the mock. The mapper needs `{ id, name, email }`; `email` is used ONLY
// to derive a fallback display name when `name` is null and is NEVER surfaced.
//
// AUTH CONTEXT: callers pass the `userId` the AuthGuard attached (`@CurrentUser()`).
// The token was already verified by the guard — but the user row it points at may have
// been deleted since the token was minted. We treat a valid-token / missing-user as a
// 401 (the auth context is no longer valid — Feature 50 §4.2 / prompt task 3 preferred
// choice), not a 404, because the request IS authenticated against a now-stale identity.
//
// MEMBERSHIP is entitlement-derived (Feature 62): both GET and PATCH resolve it via the
// EntitlementsService (the one place the effective rule lives) and pass it to the mapper.
// A user with no entitlement rows (everyone today) resolves to 'free'; an entitled user
// gets 'subscription' or 'lifetime' depending on the winning entitlement's kind. No DB write on GET.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** GET /v1/me — the authed user's public profile. 401 if the row no longer exists. */
  async getProfile(userId: string): Promise<UserProfileDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      // Valid token, but the identity it names is gone → the auth context is stale.
      throw new UnauthorizedException('Session is no longer valid.');
    }
    const entitlement = await this.entitlements.getEffectiveEntitlement(userId);
    return toUserProfileDTO(user, entitlement.membership, entitlement);
  }

  /**
   * PATCH /v1/me — update the authed user's editable profile fields (currently only
   * `name`). The DTO already trimmed + length-checked `name`; here we:
   *   - reject an EMPTY patch (no `name` after the pipe) with 400 — avoid a no-op write
   *     that would still bump `updatedAt` (prompt task 4, preferred behavior).
   *   - update ONLY `name` (never email/membership/authProvider/entitlements).
   *   - 401 if the user row is gone (same staleness rule as GET).
   * Returns the updated `UserProfileDTO`.
   */
  async updateProfile(
    userId: string,
    body: UpdateProfileRequestDTO,
  ): Promise<UserProfileDTO> {
    // The DTO trims + rejects empty/whitespace `name`; an absent `name` reaches here as
    // undefined. With only `name` editable, that means "nothing to change" → 400 rather
    // than a no-op write (which @updatedAt would still touch).
    if (body.name === undefined) {
      throw new BadRequestException('No updatable profile fields were provided.');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { name: body.name },
        select: { id: true, name: true, email: true },
      });
      // Membership is entitlement-derived, not affected by a name edit — but we still
      // resolve and return the REAL value so PATCH and GET agree (Feature 62).
      const entitlement = await this.entitlements.getEffectiveEntitlement(userId);
      return toUserProfileDTO(user, entitlement.membership, entitlement);
    } catch (err) {
      // P2025 = "record to update not found": the authed user row was deleted since
      // the token was minted → stale auth context, same 401 rule as GET (not a 500).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new UnauthorizedException('Session is no longer valid.');
      }
      throw err;
    }
  }
}
