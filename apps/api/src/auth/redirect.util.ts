// ─────────────────────────────────────────────────────────────────────────────
// Open-redirect guard — shared by the magic-link flow (AuthService.requestLink)
// and the Google OAuth start route. Extracted from AuthService's original private
// `sanitizeRedirect` unchanged, parameterized on `webAppUrl` instead of reading
// `this.config`, so both callers validate a client-supplied `redirectTo` the same
// way without duplicating the logic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an optional `redirectTo` (open-redirect guard, Feature 50 §3.1 / §9).
 * ACCEPTED: a relative path beginning with a single '/', OR an absolute URL whose
 * origin exactly equals `webAppUrl`. Anything else (external host,
 * protocol-relative `//evil`, malformed) is dropped → undefined (we ignore, not
 * 400, so a stray client value can't break sign-in). Returns the SAFE value or
 * undefined.
 */
export function sanitizeRedirect(
  redirectTo: string | undefined,
  webAppUrl: string,
): string | undefined {
  if (!redirectTo) return undefined;
  const value = redirectTo.trim();
  if (value.length === 0) return undefined;

  // Relative path: must start with exactly one '/' (reject '//host' which a browser
  // treats as protocol-relative → external).
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }

  // Absolute URL: only honor it if its origin matches the trusted web origin.
  try {
    const candidate = new URL(value);
    const allowed = new URL(webAppUrl);
    if (candidate.origin === allowed.origin) {
      // Return just the path+query+hash (we re-base onto webAppUrl ourselves).
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {
    // not a parseable URL → ignore
  }
  return undefined;
}
