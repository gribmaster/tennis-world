// User domain — HTTP repository implementation (Phase 4, `api` data source).
//
// Implements the SAME `UserRepository` interface as `MockUserRepository`, backed by
// the protected `GET /v1/me` endpoint (Feature 53). This is the Phase-4 swap point
// the interface was designed for (user.repository.ts header) — the UI never changes.
//
// NOT WIRED YET (Feature 56): the factory keeps `user` on the mock in `api` mode
// until Feature 57 flips it (auth/logged-out UX is designed there). This class is
// added + verified directly (scripts/verify-user-saved-http.ts) so it is ready to
// drop in.
//
// AUTH TRANSPORT: the constructor takes optional `HttpAuthOptions` — a server
// component passes the incoming `cookie`, a browser island passes `auth: 'include'`,
// and the verification script passes a `bearerToken`. The repo forwards them on every
// request. With no auth options it will simply 401 (→ `AuthRequiredError`).
//
// 401 BEHAVIOR (prompt task 3): a 401 throws `AuthRequiredError` (from the
// http-client) rather than silently falling back to a mock/empty profile — "logged
// out" must be distinguishable from "free user" so Feature 57 can route to sign-in.
// We DO NOT catch it here; the caller (or the Feature-57 boundary) decides the UX.
//
// Response typing follows the same "type assertion, not zod" choice documented in the
// other HTTP repositories; the DTO TYPE comes from `@tennis/contracts`. No `email` is
// expected — `UserProfileDTO` deliberately omits it (the API mapper strips it).

import type { UserProfileDTO } from '@tennis/contracts';
import type { UserRepository } from '../user/user.repository';
import { getJson, type HttpAuthOptions } from './http-client';

export class HttpUserRepository implements UserRepository {
  constructor(private readonly auth: HttpAuthOptions = {}) {}

  /**
   * GET /v1/me — the authenticated user's public profile (`UserProfileDTO`:
   * id/name/initials/membership; no email). Throws `AuthRequiredError` on 401
   * (no silent fallback), `HttpError` on any other non-2xx.
   */
  async getCurrentUser(): Promise<UserProfileDTO> {
    return getJson<UserProfileDTO>('/me', this.auth);
  }
}
