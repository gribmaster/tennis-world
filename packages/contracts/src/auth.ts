import { z } from 'zod';
import { UserProfileSchema } from './user';

// ─────────────────────────────────────────────────────────────────────────────
// Auth DTOs — Phase-4 groundwork (Feature 51). SHAPES ONLY; no behavior, no
// endpoints, no auth runtime is added by this feature. These exist so the auth
// foundation (Feature 52) and the web sign-in/up wiring (Feature 57) share a single
// source of truth, and so the API can derive its class-validator request classes
// from these types (imported `type`-only — Node can't `require` the TS-source zod
// contract at runtime; the [[api-contracts-type-only-import]] rule).
//
// Ratified design (Feature 50 §3.3): email MAGIC LINK is the auth method; a
// short-lived JWT is issued on verify, delivered to web as an httpOnly cookie AND
// returned in the body for non-browser (mobile) clients. Hence `accessToken` is
// OPTIONAL on `AuthSessionDTO` — present for the bearer/mobile path, omitted/ignored
// on the web cookie path. NO refresh token is modeled here (cookie-only / deferred,
// Feature 50 §3.3/§7).
//
// PRIVACY: `AuthSessionDTO.user` reuses the existing `UserProfileSchema`
// (id/name/initials/membership) — `email` is deliberately NOT exposed on the shared
// profile (Feature 50 §5.3). Don't widen it here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Body for `POST /v1/auth/request-link` — start the magic-link flow for an email.
 * The endpoint always responds the same way regardless of whether the email has a
 * `User` (no enumeration, Feature 50 §9); normalization (lower-casing) is the
 * service's job at write time, not enforced by this schema.
 */
export const RequestMagicLinkSchema = z.object({
  email: z.string().email(),
  /**
   * Optional post-verify destination (a path/URL the client wants to return to,
   * e.g. the page that triggered sign-in). The service MUST validate/allowlist this
   * server-side before honoring it (open-redirect guard) — its presence in the DTO
   * does not imply it is trusted.
   */
  redirectTo: z.string().optional(),
});
export type RequestMagicLinkDTO = z.infer<typeof RequestMagicLinkSchema>;

/**
 * Body for `POST /v1/auth/verify` — exchange a single-use magic-link token for a
 * session. The service hashes and looks up the token, checks TTL + unused, upserts
 * the `User`, and mints the session.
 */
export const VerifyMagicLinkSchema = z.object({
  token: z.string(),
});
export type VerifyMagicLinkDTO = z.infer<typeof VerifyMagicLinkSchema>;

/**
 * Response of `POST /v1/auth/verify` (and any session-returning endpoint). The
 * authenticated user's public profile plus, for non-browser clients, the bearer
 * access token; `expiresAt` is the token's expiry (ISO-8601) when known. The web
 * cookie path ignores `accessToken`/`expiresAt` (the token rides in an httpOnly
 * cookie set by the server).
 */
export const AuthSessionSchema = z.object({
  user: UserProfileSchema,
  /** Bearer access token for mobile/native clients; omitted on the web cookie path. */
  accessToken: z.string().optional(),
  /** ISO-8601 access-token expiry, when surfaced. */
  expiresAt: z.string().optional(),
});
export type AuthSessionDTO = z.infer<typeof AuthSessionSchema>;
