# TASK 15 / FEATURE 83 — Billing return screens

**Model: Sonnet 5, reasoning effort: high.**

Task:
Graft the prototype's PurchaseSuccess / PurchaseFailed visuals onto the EXISTING
`/billing/return` state machine. Change no timing, no polling, no billing logic.

Context:
- `CLAUDE.md` §7 (billing) binds in full, plus §4 and §5.
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.9, §2.10.
- Prototype: `PurchaseSuccessScreen`, `PurchaseFailedScreen`. Strip the base64 first —
  recipe in `docs/TASK_07_FEATURE_74_HOME.md`.
- Existing: `features/billing/BillingReturn.tsx` + `CheckoutStatusBanner.tsx`.

## SIX STATES, NOT TWO — this is the whole feature

`BillingReturn` already models what actually happens:

| State | Meaning |
|---|---|
| `checking` | the bounded poll is running (6 attempts × 2000 ms) |
| `success` | `/v1/me` reports membership !== 'free' |
| `processing` | still 'free' after all attempts — **the webhook has not landed yet. NOT a failure.** |
| `cancelled` | `?status=cancelled` — the user backed out of Checkout deliberately |
| `signed-out` | a 401 during the poll |
| `error` | any other throw |

The prototype only drew two of these. **Do not collapse the other four into "Payment
unsuccessful."** Telling someone who just paid that their payment failed, because a webhook
is three seconds late, is the worst thing this screen can do.

Map them deliberately and report the mapping:
- `success` → the prototype's success screen.
- `processing` → its own calm treatment: the money is fine, confirmation is still arriving,
  here is what to do (wait / refresh / where to check). Reuse the success screen's structural
  language if you like, but the copy must not promise access that is not active yet, and must
  not read as an error.
- `cancelled` → not a failure either. The user chose this. Offer the way back to the plans.
- `error` and `signed-out` → distinct, actionable, and honest about what went wrong.
- `checking` → a quiet waiting state, not a full-page blocking loader (§4 rule 4).

## THE SUCCESS SCREEN'S STATS ARE INVENTED

The prototype prints "120+ Countries", "1800+ Courts". The real database has **11 countries
and 12 courts**. Do not print those numbers, and do not invent replacements. Either drop the
stats row, or feed it from something real (`GET /v1/countries` exists and returns real
counts — but only add a fetch if you can do it without slowing this screen, and say what you
chose). Fabricated scale numbers on a post-payment screen are a straight misrepresentation.

## Requirements

Numbers from the stripped prototype. Existing tokens and `globals.css` primitives only.

1. **Do not touch the state machine.** `MAX_ATTEMPTS`, `POLL_INTERVAL_MS`, the loop, the
   `?status=cancelled` branch, the 401 handling, the `/v1/me` read — all byte-unchanged.
   This feature edits what each state RENDERS, nothing else. Quote the constants in your
   report to prove they are untouched.
2. **Never mark anyone premium from this screen** (§7). Membership comes from the webhook;
   this page only reads `/v1/me`.
3. Success screen: hero image with the fade, the check circle, the eyebrow, the serif
   headline, the body copy, the primary CTA and the secondary pair. CTAs go to real routes
   (`/map`, `/saved`, `/profile`) ⇒ `PendingLink`.
4. Failure screen: the image treatment, the error circle, the serif headline, the
   reassurance list ("card not charged / your courts still saved / progress not affected"),
   Try again, Go back. **Only render that reassurance list where it is TRUE** — it is true
   for `cancelled` and for a pre-charge `error`; it is not true, and must not appear, on the
   `processing` state where a charge did happen.
5. `BackButton` fallback stays `/profile` (§5) wherever the screen offers a back path.
6. "Try again" reopens the existing paywall/checkout path. **Add no checkout call, plan key,
   price id, publishable key or Stripe.js** — reuse what `features/billing` already has.
7. `CheckoutStatusBanner` — decide whether it survives, is absorbed, or is deleted, and
   check every importer before removing it.

## Do not change

`apps/api/**`, `packages/contracts/**`, schema, migrations, seed. Any billing endpoint, the
plan registry, the webhook, `EntitlementsService`. The polling contract above. Auth.
`components/filters/**`, `features/map/**`, or the other redesigned screens. No package
installs. No git commit or push.

## Testing

- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `verify:web-billing` — the harness that covers this screen. Report the count and name any
  skips and why they skipped.
- `verify:ux-pending-states` — 90 checks.
- `verify:api-parity` — still 42/42.
- Manual: drive each of the six states. `?status=cancelled` gives the cancelled screen; a
  free user landing without the query exercises `checking` → `processing`; a seeded entitled
  user gives `success`. Confirm `processing` never reads as a failure and never shows the
  "card not charged" list.

## Report back

1. The six-state → screen mapping, with the copy you used for `processing`.
2. `MAX_ATTEMPTS` and `POLL_INTERVAL_MS` as they now stand, and confirmation the loop is
   unchanged.
3. What you did with the invented stats row.
4. Where the reassurance list appears and where it is suppressed.
5. `CheckoutStatusBanner`'s fate and the importers you checked.
6. Confirmation no Stripe artifact was added.
7. Files changed and pass/fail counts.
