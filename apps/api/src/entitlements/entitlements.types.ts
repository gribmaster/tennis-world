import type {
  EntitlementKind,
  EntitlementSource,
  MembershipStatus,
} from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Entitlement runtime types — Feature 62 (Phase 5, intake §3.1).
//
// `EffectiveEntitlement` is the SERVER-INTERNAL result of collapsing a user's many
// `Entitlement` rows into the single "is this user currently premium?" answer. It is
// NOT a wire DTO — the public projection (if a /v1/billing/status endpoint is ever
// added) is `EntitlementStatusDTO` in @tennis/contracts (which is a strict SUBSET:
// it drops `reason`, the only field here that names an `EntitlementKind`). This shape
// deliberately carries NO row id and NO provider id (intake §6 hard privacy rule);
// `reason`/`source` are coarse enum labels, never `cus_…`/`sub_…`/`pi_…` values.
//
// The enum imports are `type`-only — the API never pulls the zod runtime from
// @tennis/contracts ([[api-contracts-type-only-import]]); these are the inferred TS
// unions, used purely for typing the fields.
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectiveEntitlement {
  /** The one boolean every gate reads: does ANY of the user's rows currently apply? */
  isEntitled: boolean;
  /**
   * The badge `UserProfileDTO.membership` needs. Maps directly off `isEntitled`:
   * entitled → 'lifetime', not entitled → 'free'. `MembershipStatus` has only those
   * two members today (no 'subscriber' — intake open question #1), so even a
   * `kind=subscription` row surfaces as 'lifetime' for the badge.
   */
  membership: MembershipStatus;
  /** Which kind of entitlement won (the strongest effective row), or null if none. */
  reason: EntitlementKind | null;
  /** Where the winning entitlement originated, or null if none. */
  source: EntitlementSource | null;
  /**
   * ISO-8601 expiry of the winning entitlement; null for a non-expiring (lifetime/
   * promo-forever) entitlement OR when not entitled at all. (A consumer reads
   * `isEntitled` to tell those two null cases apart.)
   */
  activeUntil: string | null;
}

/** The constant "nobody home" result — no effective row → free, with everything null. */
export const NOT_ENTITLED: EffectiveEntitlement = {
  isEntitled: false,
  membership: 'free',
  reason: null,
  source: null,
  activeUntil: null,
};
