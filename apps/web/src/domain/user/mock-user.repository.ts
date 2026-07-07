// User domain — MOCK repository implementation.
//
// Reads the fixed current-user profile from `@tennis/mock-data` (Architecture Plan
// Decision #5) — `DEFAULT_MOCK_USER` (Eleanor Morgan / "EM" / membership "free",
// ported from profile.html). This adapter does no joining or derivation; it simply
// returns the mock profile shaped as a `UserProfileDTO`.
//
// READ-ONLY (Phase 1, Decision #11): no auth, no login/logout, NO localStorage, no
// mutation. Phase 4 swaps this for an auth-backed implementation behind the same
// interface.
//
// Plain TypeScript only — no React, no Next.js — so it is independently unit-testable
// (Phase 1 §1.2). Wiring it into the app is the factory's job, not this file's.

import { DEFAULT_MOCK_USER } from '@tennis/mock-data';
import type { UserProfileDTO } from '@tennis/contracts';
import type { UserRepository } from './user.repository';

export class MockUserRepository implements UserRepository {
  async getCurrentUser(): Promise<UserProfileDTO> {
    // Copy so callers can't mutate the shared mock object.
    return { ...DEFAULT_MOCK_USER };
  }
}
