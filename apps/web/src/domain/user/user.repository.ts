// User domain — repository INTERFACE.
//
// The contract the Profile page's data source must satisfy (Architecture Plan Decision
// #7 / Phase 1 §1.1, and docs/FEATURE_21_PROFILE_PAGE_LAYOUT.md §4). UI depends ONLY on
// this interface; the central factory decides which implementation is wired in (mock
// now, an auth-backed implementation in Phase 4), so the swap is a configuration change,
// not a UI rewrite (Architecture Plan §9 Risk #7 — the mock returns a User-SHAPED object,
// not a flat boolean).
//
// READ-ONLY by design for Phase 1: just `getCurrentUser()`. There is NO auth, NO login,
// NO logout, NO mutation of any kind, and explicitly NO `getEntitlementStatus()` —
// Profile derives `unlocked` from `UserProfileDTO.membership`, and the full
// entitlement/account model is Phase 4 work (Decision #11 / #12). New methods would be
// ADDED to this interface then, not faked now.
//
// Signatures are typed against `@tennis/contracts` DTOs so the data shape is defined
// exactly once and reused by both the mock and the future real repository.

import type { UserProfileDTO } from '@tennis/contracts';

export interface UserRepository {
  /** The current (Phase-1 mock) user: name, initials, membership status. */
  getCurrentUser(): Promise<UserProfileDTO>;
}
