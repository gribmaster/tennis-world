// ─────────────────────────────────────────────────────────────────────────────
// Auth shared types — the JWT payload and the per-request auth context.
//
// Kept separate from the service/guard so both (and any future /v1/me controller)
// agree on one shape. NONE of these is a wire DTO — `AuthSessionDTO` (the response)
// lives in @tennis/contracts; these are server-internal.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signed access-token claims. `sub` is the user id (the standard subject claim);
 * `email` rides inside the SIGNED token for convenience (cheap to carry, can't be
 * tampered with) but is NEVER surfaced in `UserProfileDTO` (privacy — Feature 50
 * §5.3). `iat`/`exp` are added/verified by @nestjs/jwt, not set by hand.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * The auth context the guard attaches to the Express request on success. A future
 * `/v1/me` controller reads it via the `@CurrentUser()` decorator. Deliberately
 * minimal — just identity, no entitlement/role (out of scope, Feature 50 §10).
 */
export interface AuthContext {
  userId: string;
  email: string;
}

/**
 * Express request augmented with the guard's attached auth context. The guard sets
 * `req.auth`; `@CurrentUser()` reads it. Typed as optional because the property is
 * absent on unauthenticated requests (and on every request before the guard runs).
 */
export interface RequestWithAuth {
  auth?: AuthContext;
}
