import { IsIn } from 'class-validator';
import type { BillingPlanKey, CheckoutRequestDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Billing request-body DTO — the class-validator runtime validator for
//   POST /v1/billing/checkout  (CheckoutRequestClass)
//
// Same idiom as `auth.dto.ts` / `me.dto.ts`: the @tennis/contracts
// `CheckoutRequestSchema` (`{ plan }`) is the structural source of truth but can't
// be runtime-`require`d (TS-source `main`, [[api-contracts-type-only-import]]), so
// the request is a local class with class-validator decorators the global
// ValidationPipe runs (whitelist + forbidNonWhitelisted + transform), guarded at
// COMPILE time by the `extends` assertion below so it can't drift from the zod shape.
//
// VALIDATION RULES (prompt task 8):
//   - `plan` MUST be one of the two known keys ('lifetime' | 'subscription'); an
//     unknown value → 400 (@IsIn against the literal set). The client NEVER sends a
//     price id — only the plan key (intake §5.1), so the server maps it internally.
//   - Unknown fields (e.g. a smuggled `priceId`/`amount`) → 400 via the global pipe's
//     forbidNonWhitelisted, so this DTO carries ONLY `plan`.
//
// POST /v1/billing/portal takes NO body (identity comes from the session — intake
// §6), so it has no request DTO at all; the controller reads no `@Body()` for it.
// ─────────────────────────────────────────────────────────────────────────────

/** The two accepted plan keys, kept as a runtime array for @IsIn (mirrors the zod enum). */
const BILLING_PLAN_KEYS: readonly BillingPlanKey[] = ['lifetime', 'subscription'];

/** Body for POST /v1/billing/checkout — `{ plan }`. */
export class CheckoutRequestClass {
  /**
   * The billable plan key. Exactly one of the two known keys; any other value is a
   * 400. The server resolves this to a Stripe price id + Checkout mode via the plan
   * registry — the client never sees or sends a price id.
   */
  @IsIn(BILLING_PLAN_KEYS as string[])
  plan!: BillingPlanKey;
}

// Compile-time guard: the request class must stay structurally assignable to the
// contract shape. If `plan`'s type drifts from the zod schema, this stops compiling.
// `void` references the alias so it isn't reported as unused.
type _AssertCheckoutParity = CheckoutRequestClass extends CheckoutRequestDTO
  ? true
  : never;
void (true as _AssertCheckoutParity);
