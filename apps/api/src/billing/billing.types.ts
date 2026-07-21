import type { BillingPlanKey } from '@tennis/contracts';
import { isPlanConfigured, type BillingConfig } from './billing.config';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side plan registry (Feature 65, intake §5.1; reworked for the
// monthly/quarterly/yearly plan model). The ONE place a client `plan` key is mapped
// to the Stripe price id + the Checkout `mode`. The client NEVER sends a price id (it
// can't pick an arbitrary price — intake §5.1); it sends only the plan KEY, resolved
// here against server-only env (`BillingConfig.prices`).
//
//   monthly / quarterly / yearly → mode 'subscription' (recurring), ALWAYS — there is
//   no one-time/lifetime plan in this model.
//
// A request for a plan whose price id isn't configured is NOT a crash and NOT a 500 —
// the registry returns a typed "disabled plan" result the service turns into a clean
// 400 (task 4/9), naming the specific plan. Each of the three plans is validated
// independently, so a missing price for one never blocks the other two.
// ─────────────────────────────────────────────────────────────────────────────

/** Stripe Checkout mode per plan — all current plans are recurring 'subscription'. */
export type CheckoutMode = 'subscription';

/** A fully-resolved plan ready to build a Checkout Session line item + mode. */
export interface ResolvedPlan {
  readonly plan: BillingPlanKey;
  readonly priceId: string;
  readonly mode: CheckoutMode;
}

/**
 * Result of resolving a plan key against the current config. `ok: false` carries a
 * client-safe `reason` string (no Stripe internals) for the 400 the service raises
 * when the plan is recognised but not currently offered (its price id is unset).
 */
export type PlanResolution =
  | { readonly ok: true; readonly resolved: ResolvedPlan }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve a validated plan key to its Stripe price id + Checkout mode using the
 * server-only config. The key itself is already validated to the `'monthly' |
 * 'quarterly' | 'yearly'` union by the request DTO, so the `default` branch is
 * defensive.
 *
 * A plan with no configured price id is a clean 400-style `ok: false` — "Stripe price
 * is not configured for plan: <plan>" — never a crash. This registry only decides the
 * plan-level "offered / not offered" question; the account-level gate (secret key +
 * return URLs) is `BillingConfig.configuredForCheckout`, checked by the service first.
 */
export function resolvePlan(
  plan: BillingPlanKey,
  config: BillingConfig,
): PlanResolution {
  switch (plan) {
    case 'monthly':
    case 'quarterly':
    case 'yearly': {
      if (!isPlanConfigured(config, plan)) {
        return {
          ok: false,
          reason: `Stripe price is not configured for plan: ${plan}`,
        };
      }
      // Non-null: `isPlanConfigured` just verified `config.prices[plan]` is truthy.
      return { ok: true, resolved: { plan, priceId: config.prices[plan]!, mode: 'subscription' } };
    }
    default:
      // Unreachable given the DTO validation; kept exhaustive + client-safe.
      return { ok: false, reason: 'Unknown billing plan.' };
  }
}
