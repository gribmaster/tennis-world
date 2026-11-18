// ─────────────────────────────────────────────────────────────────────────────
// Trust-proxy hop count (TASK_75, decision 2). The API never set Express's
// `trust proxy` setting, so on the real host (behind a reverse proxy) `req.ip`
// is the PROXY's address for every client — meaning every IP-keyed in-memory
// limiter (admin login, magic-link, billing, reviews) effectively keys on one
// shared bucket. For the admin login limiter specifically: five failed logins
// from ANYONE locks the IP bucket for EVERYONE for 15 minutes — a real lockout
// vector, not just a weaker limiter.
//
// `TRUST_PROXY_HOPS` (integer, default 0) tells Express how many `X-Forwarded-
// For` hops to trust when deriving `req.ip` (passed straight to Express's
// `app.set('trust proxy', hops)` in main.ts — see
// https://expressjs.com/en/guide/behind-proxies.html). Default 0 means "trust
// no forwarded header at all" — the only safe default without a reverse proxy,
// since a header is otherwise attacker-controlled and could pick the rate-limit
// key. A misconfigured value (negative, non-integer, or implausibly large)
// fails BOOT rather than silently falling back — guessing wrong here is a
// security property, not a convenience default.
// ─────────────────────────────────────────────────────────────────────────────

/** Upper bound on a sane hop count — this API sits behind at most a couple of
 *  reverse-proxy layers (Railway, Vercel, Cloudflare); anything higher is
 *  almost certainly a misconfiguration, not a real topology. */
const MAX_HOPS = 5;

/**
 * Parse `TRUST_PROXY_HOPS` from `process.env`. Unset/empty → 0 (trust
 * nothing). Throws on any other invalid value (non-integer, negative, or
 * > {@link MAX_HOPS}) — called from `main.ts` at bootstrap, before
 * `app.listen`, so an invalid value crashes boot rather than running with an
 * unintended trust posture.
 */
export function loadTrustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (!raw) return 0;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_HOPS) {
    throw new Error(
      `Invalid TRUST_PROXY_HOPS="${raw}". Expected an integer between 0 and ${MAX_HOPS} ` +
        '(0 = trust no X-Forwarded-For header — the only safe default with no reverse proxy).',
    );
  }
  return n;
}
