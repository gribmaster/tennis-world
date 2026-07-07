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
//   - membership  : a REQUIRED ARGUMENT (Feature 62). The mapper no longer decides
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
 * Map a User row to the public `UserProfileDTO` (no email). `membership` is supplied by
 * the caller (entitlement-derived — Feature 62); it defaults to 'free' for callers with
 * no entitlement context. The shape is identical to before — only the membership
 * derivation moved to the EntitlementsService.
 */
export function toUserProfileDTO(
  user: UserProfileSource,
  membership: MembershipStatus = 'free',
): UserProfileDTO {
  const name = resolveDisplayName(user.name, user.email);
  return {
    id: user.id,
    name,
    initials: deriveInitials(name),
    membership,
  };
}
