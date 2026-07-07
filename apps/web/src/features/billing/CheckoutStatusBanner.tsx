// CheckoutStatusBanner — a small, presentational banner for the profile page's
// `?checkout=success|cancelled` query (Feature 67).
//
// The API's DEFAULT Stripe redirect URLs are `${WEB_APP_URL}/profile?checkout=success`
// and `…?checkout=cancelled` (billing.config.ts). When an operator hasn't repointed
// STRIPE_SUCCESS_URL at `/billing/return`, the browser lands on /profile with that query —
// this banner makes that landing meaningful instead of a silent no-op:
//   • success   → a calm "membership is being set up / is active" note (the profile page's
//                 own membership card/stats reflect the real state once the webhook lands).
//   • cancelled → a neutral "no payment was taken" note.
//
// PURELY PRESENTATIONAL: it reads nothing and mutates nothing — the Profile page passes the
// parsed status down as a prop. It does NOT claim entitlement itself; `/v1/me` (read by the
// page) remains the single source of truth for the membership card. Operators who prefer
// the richer, race-aware landing should point STRIPE_SUCCESS_URL at /billing/return instead.

export type CheckoutStatus = 'success' | 'cancelled';

/** Narrow an arbitrary `?checkout=` query value to a known status (or null). */
export function parseCheckoutStatus(raw: string | undefined): CheckoutStatus | null {
  if (raw === 'success' || raw === 'cancelled') return raw;
  return null;
}

export interface CheckoutStatusBannerProps {
  status: CheckoutStatus;
}

export function CheckoutStatusBanner({ status }: CheckoutStatusBannerProps) {
  if (status === 'success') {
    return (
      <div
        role="status"
        className="mt-6 border border-gold/40 bg-gold/10 px-5 py-4 text-ink"
      >
        <p className="body-m font-medium">Thanks for your purchase.</p>
        <p className="body-s mt-1 text-graphite">
          Your membership is being set up and will unlock automatically — it may take a few
          moments to appear below.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mt-6 border border-hairline bg-bone px-5 py-4 text-ink"
    >
      <p className="body-m font-medium">Checkout cancelled.</p>
      <p className="body-s mt-1 text-graphite">
        No payment was taken. You can unlock membership whenever you’re ready.
      </p>
    </div>
  );
}
