import type { BillingPlanKey } from '@tennis/contracts';
import type { BillingConfig } from './billing.config';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side plan registry (Feature 65, intake §5.1). The ONE place a client
// `plan` key ('lifetime' | 'subscription') is mapped to the Stripe price id + the
// Checkout `mode`. The client NEVER sends a price id (it can't pick an arbitrary
// price — intake §5.1); it sends only the plan KEY, resolved here against
// server-only env (`BillingConfig`).
//
//   lifetime     → mode 'payment'      (one-time, EntitlementKind lifetime_unlock)
//   subscription → mode 'subscription' (recurring)
//
// A `subscription` request when `STRIPE_PRICE_SUBSCRIPTION` is unset is NOT a
// crash and NOT a 500 — the registry returns a typed "disabled plan" result the
// service turns into a clean 400 (task 5/9). A `lifetime` request with no
// `STRIPE_PRICE_LIFETIME` means the whole billing surface is misconfigured, so the
// service treats that as a server-misconfig 500 (guarded by `configuredForCheckout`
// BEFORE we get here). The union below makes the caller handle both outcomes.
// ─────────────────────────────────────────────────────────────────────────────

/** Stripe Checkout mode per plan — 'payment' for one-time, 'subscription' for recurring. */
export type CheckoutMode = 'payment' | 'subscription';

/** A fully-resolved plan ready to build a Checkout Session line item + mode. */
export interface ResolvedPlan {
  readonly plan: BillingPlanKey;
  readonly priceId: string;
  readonly mode: CheckoutMode;
}

/**
 * Result of resolving a plan key against the current config. `ok: false` carries a
 * client-safe `reason` string (no Stripe internals) for the 400 the service raises
 * when the plan is recognised but not currently offered (subscription price unset).
 */
export type PlanResolution =
  | { readonly ok: true; readonly resolved: ResolvedPlan }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve a validated plan key to its Stripe price id + Checkout mode using the
 * server-only config. The key itself is already validated to the `'lifetime' |
 * 'subscription'` union by the request DTO, so the `default` branch is defensive.
 *
 *   - lifetime     → { priceId: config.priceLifetime, mode: 'payment' }
 *   - subscription → { priceId: config.priceSubscription, mode: 'subscription' }
 *                    but a 400-style `ok: false` when the subscription price is unset.
 *
 * NOTE: a missing `priceLifetime` is NOT handled here (it's a server-misconfig the
 * service catches via `config.configuredForCheckout` before calling this) — this
 * registry only decides the plan-level "offered / not offered" question.
 */
export function resolvePlan(
  plan: BillingPlanKey,
  config: BillingConfig,
): PlanResolution {
  switch (plan) {
    case 'lifetime':
      return {
        ok: true,
        resolved: { plan, priceId: config.priceLifetime, mode: 'payment' },
      };
    case 'subscription':
      if (!config.priceSubscription) {
        return {
          ok: false,
          reason: 'The subscription plan is not currently available.',
        };
      }
      return {
        ok: true,
        resolved: {
          plan,
          priceId: config.priceSubscription,
          mode: 'subscription',
        },
      };
    default:
      // Unreachable given the DTO validation; kept exhaustive + client-safe.
      return { ok: false, reason: 'Unknown billing plan.' };
  }
}
