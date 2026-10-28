import { NOT_ENTITLED, type EffectiveEntitlement } from './entitlements.types';

// ─────────────────────────────────────────────────────────────────────────────
// Dev membership override (Task 65) — a LOCAL-DEV-ONLY env switch that lets a
// developer see the app as a `free` or `subscribed` user without completing a
// Stripe payment (which locally needs the Stripe CLI + webhook forwarding; see
// CLAUDE.md §7 "Local development: Stripe webhooks"). It is read ONCE at boot
// (`loadDevMembershipOverride`) and injected into `EntitlementsService`, which is
// the ONLY place it is consulted — never a call site, controller, or guard.
//
// SAFETY: a typo in the value, or leaving the switch on in production / against a
// live Stripe key, must never silently do nothing or silently apply. All three
// are a hard boot failure (`loadDevMembershipOverride` throws), matching the
// `loadStagingDemoAuthConfig` idiom in `auth.config.ts`. The thrown Error
// propagates out of the `DEV_MEMBERSHIP_OVERRIDE` provider factory in
// `EntitlementsModule`, so `NestFactory.create` rejects and the API never starts.
// ─────────────────────────────────────────────────────────────────────────────

/** Local-dev override of the effective entitlement. `null` = no override (default). */
export type DevMembershipOverride = 'free' | 'subscribed' | null;

const VALID_OVERRIDE_VALUES = ['free', 'subscribed'] as const;

/**
 * Parse + validate `DEV_FORCE_MEMBERSHIP` from `process.env`. Pure function (no
 * Nest, no I/O) so it can be unit-tested without booting the app.
 *
 * - unset / empty / whitespace-only → `null` (no override — the default, and the
 *   only value that is safe in any environment).
 * - `free` | `subscribed` (case-insensitive, trimmed) → that value, PROVIDED the
 *   two safety checks below pass.
 * - anything else → throws (a typo must never silently mean "no override").
 *
 * Safety (checked only when a value is set — an unset variable is always fine):
 *   - `NODE_ENV === 'production'` → throws, regardless of the value.
 *   - `STRIPE_SECRET_KEY` starts with `sk_live_` → throws, regardless of `NODE_ENV`.
 */
export function loadDevMembershipOverride(
  env: NodeJS.ProcessEnv = process.env,
): DevMembershipOverride {
  const raw = env.DEV_FORCE_MEMBERSHIP?.trim();
  if (!raw) {
    return null;
  }

  const value = raw.toLowerCase();
  if (!(VALID_OVERRIDE_VALUES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid DEV_FORCE_MEMBERSHIP="${raw}". Expected one of: ` +
        `${VALID_OVERRIDE_VALUES.join(', ')} (or unset for no override).`,
    );
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `DEV_FORCE_MEMBERSHIP="${raw}" is set but NODE_ENV=production. This is a ` +
        'LOCAL-DEV-ONLY override of the entitlement gate and must never run in ' +
        'production — unset DEV_FORCE_MEMBERSHIP.',
    );
  }

  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (stripeSecretKey.startsWith('sk_live_')) {
    throw new Error(
      `DEV_FORCE_MEMBERSHIP="${raw}" is set alongside a LIVE Stripe secret key ` +
        '(sk_live_…). This override must never run against real Stripe — unset ' +
        'DEV_FORCE_MEMBERSHIP or use a test-mode (sk_test_…) key.',
    );
  }

  return value as DevMembershipOverride;
}

/** How long a `subscribed` override's synthetic entitlement stays "active" for. */
const SUBSCRIBED_OVERRIDE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Build the `EffectiveEntitlement` an override value stands in for. Computed fresh
 * per call (not cached) so `activeUntil` for `subscribed` is always ~30 days out
 * from "now", the way a real renewing subscription would read.
 */
export function buildOverrideEntitlement(
  override: 'free' | 'subscribed',
): EffectiveEntitlement {
  if (override === 'free') {
    return NOT_ENTITLED;
  }

  return {
    isEntitled: true,
    membership: 'subscription',
    reason: 'subscription',
    source: 'stripe_web',
    activeUntil: new Date(Date.now() + SUBSCRIBED_OVERRIDE_DURATION_MS).toISOString(),
    cancelAtPeriodEnd: false,
  };
}

/** DI token for the singleton {@link DevMembershipOverride} provided by EntitlementsModule. */
export const DEV_MEMBERSHIP_OVERRIDE = 'DEV_MEMBERSHIP_OVERRIDE';
