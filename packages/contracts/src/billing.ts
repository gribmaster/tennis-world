import { z } from 'zod';
import { EntitlementKind, EntitlementSource } from './enums';
import { MembershipStatus } from './user';

// ─────────────────────────────────────────────────────────────────────────────
// Billing / entitlement wire DTOs — Phase-5 groundwork (Feature 61). SHAPES ONLY:
// no endpoint, no repo, no Stripe, no behavior is added here. These exist so the
// Phase-5 features (62/63/65/67) and the web billing wiring share a single source of
// truth, and so the API can derive class-validator request classes from these types
// (imported `type`-only — the [[api-contracts-type-only-import]] rule; the zod schema
// is the structural source of truth and is NEVER imported into the API runtime).
//
// HARD PRIVACY RULE: no provider internals ever appear on the wire — no Stripe
// `cus_`/`sub_`/`pi_`/`cs_` id, no client/webhook secret, no price id. Those live on
// the server (`Entitlement.provider*`, `User.stripeCustomerId`, server-only env). A
// DTO carries only the EFFECTIVE projection + redirect URLs. All dates are ISO-8601
// strings (mobile-friendly flat JSON, same convention as the rest of @tennis/contracts).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The billable plan key the CLIENT sends. The server maps it to a Stripe price id
 * (server-only env) — the client NEVER sees or sends a price id (intake §5.1), so it
 * can't pick an arbitrary price. All three are recurring subscription plans that differ
 * only in billing cadence (and Stripe price); they grant the same premium entitlement.
 * Kept as a shared enum so the request/plan DTOs don't redeclare the literal union.
 */
export const BillingPlanKey = z.enum(['monthly', 'quarterly', 'yearly']);
export type BillingPlanKey = z.infer<typeof BillingPlanKey>;

/**
 * The PUBLIC projection of the server-internal effective-entitlement result
 * (intake §3.1) — what a `/v1/billing/status` read (or a folded-in `/v1/me` field)
 * would surface. Deliberately carries NO row id and NO provider id: just the derived
 * membership badge, the one `isEntitled` boolean every gate reads, the ISO expiry
 * (null = lifetime/none), and where the winning entitlement came from (null = none).
 */
export const EntitlementStatusSchema = z.object({
  membership: MembershipStatus,
  isEntitled: z.boolean(),
  /** ISO-8601 expiry of the effective entitlement; null for lifetime or no entitlement. */
  activeUntil: z.string().nullable(),
  /** Where the effective entitlement originated; null when not entitled. */
  source: EntitlementSource.nullable(),
});
export type EntitlementStatusDTO = z.infer<typeof EntitlementStatusSchema>;

/**
 * A purchasable plan as the paywall renders it. `priceLabel` is a display string
 * (e.g. "$29 one-time") — NOT a Stripe price id (that is server-only, intake §5.1).
 * `kind` ties the plan to the `EntitlementKind` it grants.
 */
export const BillingPlanSchema = z.object({
  plan: BillingPlanKey,
  priceLabel: z.string(),
  kind: EntitlementKind,
});
export type BillingPlanDTO = z.infer<typeof BillingPlanSchema>;

/**
 * Body for `POST /v1/billing/checkout` — the client sends only the plan KEY; the
 * server resolves the Stripe price id and creates the Checkout Session (intake §5.2).
 */
export const CheckoutRequestSchema = z.object({
  plan: BillingPlanKey,
});
export type CheckoutRequestDTO = z.infer<typeof CheckoutRequestSchema>;

/**
 * Response of `POST /v1/billing/checkout` — the hosted Checkout redirect URL only.
 * No session id, no secret; the client just navigates to `url`.
 */
export const CheckoutSessionSchema = z.object({
  url: z.string(),
});
export type CheckoutSessionDTO = z.infer<typeof CheckoutSessionSchema>;

/**
 * Response of `POST /v1/billing/portal` — the hosted Customer Portal redirect URL.
 * Identity comes from the session, so the request needs no body (no
 * `CustomerPortalRequestDTO`); the customer is resolved server-side from the authed
 * user's `stripeCustomerId`, never from a client-supplied id (intake §10 scoping).
 */
export const CustomerPortalSessionSchema = z.object({
  url: z.string(),
});
export type CustomerPortalSessionDTO = z.infer<typeof CustomerPortalSessionSchema>;
