// ─────────────────────────────────────────────────────────────────────────────
// Billing configuration — a single typed read of the Stripe-relevant environment
// (Feature 65, intake §5.1/§5.4). Same lightweight idiom as `auth.config.ts`: a
// plain function (not a Nest provider) that reads `process.env` once at module
// wiring, so the service never re-parses env and the defaults live in ONE place.
//
// SECRETS LIVE HERE ONLY (intake §5.4 / §12). `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
// and the price ids are server-only — NEVER behind a `NEXT_PUBLIC_*` prefix (they'd ship
// in the web bundle). The web app needs NONE of them: the redirect-to-Checkout flow hands
// the browser a hosted Stripe URL, so no publishable key and no client Stripe.js exist.
//
// WEBHOOK GATE (Feature 66): `STRIPE_WEBHOOK_SECRET` (+ the secret key) enable the
// signature-verified `POST /v1/webhooks/stripe`. It is INDEPENDENT of the checkout gate:
// the API boots with neither, and the webhook fails cleanly at request time when unset
// (§9), never at boot. Checkout still works if only the checkout config is present.
//
// "CONFIGURED FOR REAL CHECKOUT" gate (prompt task 3): `STRIPE_SECRET_KEY` +
// `STRIPE_PRICE_LIFETIME` are the minimum for a working lifetime checkout. When they
// are absent the module still boots (so lint/typecheck/build/dev and the non-Stripe
// harnesses run with no Stripe env) — but a checkout/portal REQUEST fails cleanly at
// call time (§9), never at boot. `STRIPE_PRICE_SUBSCRIPTION` is optional: a
// subscription checkout is a clean 400 when it isn't configured (task 5), while
// lifetime still works.
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed, defaulted billing configuration derived from `process.env`. */
export interface BillingConfig {
  /** Stripe secret API key (`sk_test_…` / `sk_live_…`). Empty string when unset. */
  stripeSecretKey: string;
  /**
   * Stripe webhook signing secret (`whsec_…`) for `POST /v1/webhooks/stripe` (Feature
   * 66). Server-only, NEVER `NEXT_PUBLIC_*`. Empty string when unset — the webhook then
   * fails SAFELY at request time (500 "webhook not configured"), never at boot, so
   * lint/typecheck/build/dev and the non-Stripe harnesses still run with no Stripe env.
   */
  stripeWebhookSecret: string;
  /** Stripe Price id (`price_…`) for the one-time lifetime unlock. Empty when unset. */
  priceLifetime: string;
  /**
   * Stripe Price id for the recurring subscription plan. Optional (undefined when
   * unset) — a `subscription` checkout is a 400 until this is configured (task 5).
   */
  priceSubscription: string | undefined;
  /**
   * Where Stripe redirects after a successful Checkout. Falls back to
   * `${webAppUrl}/profile?checkout=success` when `STRIPE_SUCCESS_URL` is unset.
   */
  successUrl: string;
  /**
   * Where Stripe redirects after a cancelled Checkout. Falls back to
   * `${webAppUrl}/profile?checkout=cancelled` when `STRIPE_CANCEL_URL` is unset.
   */
  cancelUrl: string;
  /**
   * Where the Customer Portal returns the user. Falls back to `${webAppUrl}/profile`.
   */
  portalReturnUrl: string;
  /** The web origin (shared with auth config); the URL fallbacks derive from it. */
  webAppUrl: string;
  /**
   * True when the minimum for a REAL lifetime checkout is present (secret key +
   * lifetime price). Derived, not an env var — the service reads it to decide whether
   * to attempt Stripe at all (a missing config is a server-misconfig 500, §9).
   */
  configuredForCheckout: boolean;
  /**
   * True when the webhook can be processed (secret key + webhook signing secret). The
   * webhook needs the SECRET KEY too (some events retrieve a subscription from Stripe),
   * plus the signing secret to verify `Stripe-Signature`. Derived; the webhook service
   * reads it and returns a safe 500 when false — checkout config is independent (either
   * surface can be configured without the other).
   */
  configuredForWebhook: boolean;
  /**
   * Per-user rate limiting for the billing endpoints (Feature 69, intake §10). These
   * govern the lightweight IN-MEMORY limiter that guards ONLY `POST /v1/billing/checkout`
   * and `POST /v1/billing/portal` — no public/discovery/auth/webhook route is touched.
   * Independent of the Stripe config above (the limiter runs even with no Stripe env; it
   * just fronts the two protected routes). Defaults are the intake's suggested values.
   */
  rateLimit: BillingRateLimitConfig;
}

/** In-memory billing rate-limit knobs (Feature 69). */
export interface BillingRateLimitConfig {
  /**
   * Sliding-/fixed-window length in SECONDS. One window shared by both actions; each
   * action has its own count/max within it. Default 600 (10 minutes, intake §10).
   */
  windowSeconds: number;
  /** Max `POST /v1/billing/checkout` attempts per user per window. Default 5 (intake §10). */
  checkoutMax: number;
  /** Max `POST /v1/billing/portal` attempts per user per window. Default 10 (intake §10). */
  portalMax: number;
}

/** Read + trim an env var; returns undefined for absent OR whitespace-only values. */
function strEnv(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v && v.length > 0 ? v : undefined;
}

/**
 * Parse a positive-integer env var (rate-limit knobs), falling back to `fallback` for
 * absent / non-numeric / non-positive values. A misconfigured limit must never DISABLE
 * the limiter (0 or negative would let unlimited requests through) or crash boot — an
 * invalid value silently uses the safe default. Fractional values are floored.
 */
function positiveIntEnv(raw: string | undefined, fallback: number): number {
  const v = strEnv(raw);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * Build the {@link BillingConfig} from `process.env`. Reads once at module wiring
 * (BillingModule provider factory) — env is already loaded by `dotenv` in main.ts.
 * The `webAppUrl` default mirrors `auth.config.ts` so the redirect fallbacks match
 * the origin the magic link points at.
 */
export function loadBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  const stripeSecretKey = strEnv(env.STRIPE_SECRET_KEY) ?? '';
  const stripeWebhookSecret = strEnv(env.STRIPE_WEBHOOK_SECRET) ?? '';
  const priceLifetime = strEnv(env.STRIPE_PRICE_LIFETIME) ?? '';
  const priceSubscription = strEnv(env.STRIPE_PRICE_SUBSCRIPTION);
  const webAppUrl = strEnv(env.WEB_APP_URL) ?? 'http://localhost:3000';

  return {
    stripeSecretKey,
    stripeWebhookSecret,
    priceLifetime,
    priceSubscription,
    successUrl: strEnv(env.STRIPE_SUCCESS_URL) ?? `${webAppUrl}/profile?checkout=success`,
    cancelUrl: strEnv(env.STRIPE_CANCEL_URL) ?? `${webAppUrl}/profile?checkout=cancelled`,
    portalReturnUrl: strEnv(env.STRIPE_PORTAL_RETURN_URL) ?? `${webAppUrl}/profile`,
    webAppUrl,
    configuredForCheckout:
      stripeSecretKey.length > 0 && priceLifetime.length > 0,
    configuredForWebhook:
      stripeSecretKey.length > 0 && stripeWebhookSecret.length > 0,
    rateLimit: {
      windowSeconds: positiveIntEnv(env.BILLING_RATE_LIMIT_WINDOW_SECONDS, 600),
      checkoutMax: positiveIntEnv(env.BILLING_CHECKOUT_RATE_LIMIT_MAX, 5),
      portalMax: positiveIntEnv(env.BILLING_PORTAL_RATE_LIMIT_MAX, 10),
    },
  };
}

/** DI token for the singleton {@link BillingConfig} provided by BillingModule. */
export const BILLING_CONFIG = 'BILLING_CONFIG';
