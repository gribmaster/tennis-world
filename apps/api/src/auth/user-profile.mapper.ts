import type { MembershipStatus, UserProfileDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// User row → UserProfileDTO (prompt task 12). The auth verify response embeds the
// user's PUBLIC profile (`AuthSessionDTO.user`), which is exactly the existing
// `UserProfileDTO` (`id, name, initials, membership`) — the same shape the web's
// `UserRepository.getCurrentUser()` returns, so the `GET /v1/me` is a drop-in.
//
// FIELD SOURCES / DEFAULTS:
//   - id          : the User row id.
//   - name        : `User.name` is nullable (a magic-link signup may not supply one).
//                   When absent we derive a friendly fallback from the email local-part
//                   so the UI never renders an empty name. EMAIL IS NOT EXPOSED as a
//                   field — only used to compute a display name when `name` is null
//                   (Feature 50 §5.3: the shared profile DTO carries no `email`).
//   - initials    : DERIVED from the resolved name (first letters of up to two words,
//                   upper-cased), mirroring the mock's "Eleanor Morgan" → "EM".
//   - membership  : a REQUIRED ARGUMENT (Feature 62, values extended in the F62-follow-up
//                   subscription-vs-lifetime fix). The mapper no longer decides
//                   entitlement — its caller derives `membership` from the
//                   EntitlementsService (`getEffectiveEntitlement().membership`) and
//                   passes it in. It defaults to 'free' ONLY so a caller with no
//                   entitlement context (none in production today) stays back-compatible;
//                   the live auth/me paths ALWAYS pass the derived value. Shape is
//                   unchanged — only the derivation moved out of this function.
//
// `createdAt`/`updatedAt` exist on the row but are NOT part of `UserProfileDTO`, so
// they are intentionally not surfaced (don't widen the shared profile shape).
// ─────────────────────────────────────────────────────────────────────────────

/** The minimal User-row fields this mapper needs (a Prisma `select` subset). */
export interface UserProfileSource {
  id: string;
  name: string | null;
  email: string;
}

/** Derive a display name: prefer `name`, else the email local-part (before `@`). */
function resolveDisplayName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const local = email.split('@')[0] ?? email;
  return local || email;
}

/** Up to two initials from a display name, upper-cased ("Eleanor Morgan" → "EM"). */
function deriveInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  // Multi-word name: first letter of the first two words ("Eleanor Morgan" → "EM").
  // Single-word name (incl. an email-derived fallback like "verify.test"): take its
  // first two characters so the avatar is never a lonely single letter ("VE").
  const initials =
    words.length >= 2
      ? `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`
      : (words[0] ?? '').slice(0, 2);
  return initials.toUpperCase();
}

/**
 * The slice of `EffectiveEntitlement` (entitlements.types.ts) needed to fill in the
 * DTO's cancellation fields. Kept as a narrow structural type (not an import of the
 * full type) so this mapper doesn't need to depend on the entitlements module — the
 * caller already has the full `EffectiveEntitlement` and passes the relevant fields.
 */
export interface EntitlementDisplayInfo {
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Map a User row to the public `UserProfileDTO` (no email). `membership` is supplied by
 * the caller (entitlement-derived — Feature 62); it defaults to 'free' for callers with
 * no entitlement context. `entitlement` (optional, scheduled-cancellation follow-up)
 * supplies the raw `activeUntil`/`cancelAtPeriodEnd` from the effective entitlement — the
 * mapper decides HOW those surface on the DTO:
 *   - membership 'subscription': `activeUntil` passes through (the current paid-through
 *     date, whether or not it's cancelling) and `cancelAtPeriodEnd` passes through.
 *   - membership 'lifetime' or 'free': neither field is set (no expiry to report for a
 *     lifetime member — never a misleading date — and nothing to report for a free user).
 * Omitting `entitlement` (e.g. the no-entitlement-context default) leaves both fields
 * unset, matching the pre-existing DTO shape exactly.
 */
export function toUserProfileDTO(
  user: UserProfileSource,
  membership: MembershipStatus = 'free',
  entitlement?: EntitlementDisplayInfo,
): UserProfileDTO {
  const name = resolveDisplayName(user.name, user.email);
  const dto: UserProfileDTO = {
    id: user.id,
    name,
    initials: deriveInitials(name),
    membership,
  };
  if (membership === 'subscription' && entitlement) {
    dto.activeUntil = entitlement.activeUntil;
    dto.cancelAtPeriodEnd = entitlement.cancelAtPeriodEnd;
  }
  return dto;
}
