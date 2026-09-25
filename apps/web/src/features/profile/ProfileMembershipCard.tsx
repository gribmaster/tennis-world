import type { MembershipStatus } from '@tennis/contracts';
import { PaywallTrigger } from '@/features/paywall';
import { ManageBillingButton } from '@/features/billing';

// ProfileMembershipCard — the Profile screen's membership card, restyled to the v2
// prototype's two variants (`new design/tennis_world_v2_standalone.html` lines
// 1430-1449):
//   • `membership === 'free'`         → the existing dark "Choose your membership." card
//     (unchanged copy/CTA — PaywallTrigger opens the shared Paywall modal).
//   • `membership !== 'free'` (active) → the prototype's gradient dark card with a
//     subhead + "✦ Active" badge, its CTA swapped for ManageBillingButton (the
//     existing "Subscription & Purchases" mechanism — Feature 67 — not a new one).
//     Task 44: the status-label eyebrow above the subhead ("Active Subscriber" /
//     "Lifetime Member") was removed — redundant with the "✦ Active" pill and not in
//     the mobile design.
//
// `lifetime` IS a real membership state (`MembershipStatus`, `EntitlementKind.
// lifetime_unlock`) reachable via manual grant or promo — its handling is kept, not
// collapsed into `subscription` (TASK_14 point 4).
//
// The page now renders this UNCONDITIONALLY (both branches are real UI, matching the
// prototype's `!unlocked`/`unlocked` split at the SAME card, rather than the page
// deciding whether to render it at all).
//
// PRESENTATIONAL ONLY. The free-tier CTA opens the shared Paywall modal (Phase 1 —
// checkout is Stripe-backed, Feature 66/67); the active-tier CTA opens the real hosted
// Stripe Customer Portal via the existing ManageBillingButton — no new billing
// mechanism, no Stripe artifact added here.
//
// DATA SOURCE: the free-tier copy + price live in a small feature-local config object
// below (unchanged from before this restyle) — this component must NOT import
// `@tennis/mock-data` in UI (hard rule).

interface MembershipCardCopy {
  eyebrow: string;
  headline: string;
  ctaLabel: string;
}

// Copy ported from profile.html's membership block, updated for recurring plans
// (Monthly/Quarterly/Yearly) — no more stale one-time "$29" price point here; the
// real prices live in the Paywall modal's plan CTAs (feature-local paywall-copy.ts).
const MEMBERSHIP_CARD_COPY: MembershipCardCopy = {
  eyebrow: 'Membership',
  headline: 'Choose your membership.',
  ctaLabel: 'See Membership',
};

const ACTIVE_SUBHEAD: Record<'subscription' | 'lifetime', string> = {
  subscription: 'Full atlas access · Renews automatically',
  lifetime: 'Full atlas access · Lifetime unlock',
};

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface ProfileMembershipCardProps {
  membership: MembershipStatus;
  /** Override the default (prototype) free-tier copy if needed. */
  copy?: MembershipCardCopy;
}

export function ProfileMembershipCard({
  membership,
  copy = MEMBERSHIP_CARD_COPY,
}: ProfileMembershipCardProps) {
  if (membership !== 'free') {
    return (
      <div
        className="my-8 flex items-center justify-between gap-3 rounded-lg p-5 text-bone"
        style={{ background: 'linear-gradient(135deg, #1A1A1A, #2A2A2A)' }}
      >
        <div>
          <div className="body-m text-bone/90">{ACTIVE_SUBHEAD[membership]}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="eyebrow inline-flex items-center gap-1 rounded-pill border border-gold px-2.5 py-1 text-gold">
            ✦ Active
          </span>
          {/* Existing "manage subscription" mechanism (Feature 67) — the hosted Stripe
              Customer Portal, not a new billing surface. */}
          <ManageBillingButton className="body-s text-stone underline underline-offset-2 transition-colors hover:text-ink">
            Manage
          </ManageBillingButton>
        </div>
      </div>
    );
  }

  const { eyebrow, headline, ctaLabel } = copy;

  return (
    <div className="my-8 bg-ink p-7 text-bone">
      <div className="eyebrow text-gold">{eyebrow}</div>
      <div className="display-m mt-2 text-bone">{headline}</div>

      {/* CTA — opens the shared Paywall modal (presentational only; the modal's
          checkout is a Phase 4 placeholder). The gold `btn-premium` variant is
          reserved for the paywall (this is it). */}
      <PaywallTrigger source="profile" className="btn btn-premium mt-5 gap-2">
        {ctaLabel}
        <ArrowGlyph />
      </PaywallTrigger>
    </div>
  );
}
