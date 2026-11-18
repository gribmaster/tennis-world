// ─────────────────────────────────────────────────────────────────────────────
// Admin auth shared types (TASK_73) — the JWT payload and per-request admin
// context. Deliberately separate from `auth/auth.types.ts` (the user-session
// types) — nothing here is interchangeable with them.
// ─────────────────────────────────────────────────────────────────────────────

/** Signed admin access-token claims. `aud` is enforced by `ADMIN_JWT_AUDIENCE`
 *  via the jsonwebtoken `audience` sign/verify option (see admin-auth.guard.ts /
 *  admin-auth.service.ts) rather than carried as an explicit field here. */
export interface AdminAccessTokenPayload {
  sub: string;
  email: string;
}

/** The admin identity `AdminAuthGuard` attaches on success — loaded fresh from
 *  the `AdminUser` row on EVERY request (see the guard), so a role change or a
 *  deleted admin takes effect on the very next call. */
export interface AdminAuthContext {
  adminId: string;
  email: string;
  role: string;
}

/** Express request augmented with the admin guard's attached context + how this
 *  request authenticated (cookie vs bearer) — `AdminCsrfGuard` reads the latter
 *  to exempt bearer-authenticated calls from the CSRF header requirement. */
export interface RequestWithAdmin {
  admin?: AdminAuthContext;
  adminAuthVia?: 'cookie' | 'bearer';
}
