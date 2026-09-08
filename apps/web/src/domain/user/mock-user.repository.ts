// User domain — MOCK repository implementation.
//
// Reads the current-user profile from `@tennis/mock-data` (Architecture Plan Decision
// #5) — `DEFAULT_MOCK_USER` (Eleanor Morgan / "EM" / membership "free", ported from
// profile.html).
//
// MUTATION SEAM (Feature 81/82): `updateProfile` (currently just `name`) is a LOCAL MOCK
// SEAM ONLY, mirroring `MockSavedRepository`'s user-collection mutations — a
// module-level mutable copy of the seed, held for the lifetime of this process. No
// backend, no auth/session, no persistence (Decision #11); the HTTP implementation
// behind the same interface is the real thing.
//
// Plain TypeScript only — no React, no Next.js — so it is independently unit-testable
// (Phase 1 §1.2). Wiring it into the app is the factory's job, not this file's.

import { DEFAULT_MOCK_USER } from '@tennis/mock-data';
import type { UpdateProfileDTO, UserProfileDTO } from '@tennis/contracts';
import type { UserRepository } from './user.repository';

// Module-level mutable store, seeded (cloned) from the mock dataset. Same
// singleton-via-module pattern as MockSavedRepository's folder state — survives
// in-session navigation, may reset across dev-server reloads.
let currentUser: UserProfileDTO = { ...DEFAULT_MOCK_USER };

export class MockUserRepository implements UserRepository {
  async getCurrentUser(): Promise<UserProfileDTO> {
    // Copy so callers can't mutate the shared mock object.
    return { ...currentUser };
  }

  async updateProfile(patch: UpdateProfileDTO): Promise<UserProfileDTO> {
    const name = patch.name?.trim();
    if (!name) {
      throw new Error('No updatable profile fields were provided.');
    }
    currentUser = { ...currentUser, name };
    return { ...currentUser };
  }
}
