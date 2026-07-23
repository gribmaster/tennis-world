import { timingSafeEqual } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Constant-time string equality — shared by AuthGuard's staging demo-auth compare
// and the Google OAuth callback's state-cookie compare. Extracted unchanged from
// AuthGuard's original private `safeEqual`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constant-time string equality. `timingSafeEqual` requires equal-length buffers
 * and throws otherwise, so we length-check first — that check leaks only the
 * length, never the content, which is acceptable for fixed-length shared secrets
 * / random tokens. Avoids a short-circuiting `===` that could leak the value via
 * timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
