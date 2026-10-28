import type { MembershipStatus } from '@tennis/contracts';
import { PaywallTrigger } from '@/features/paywall';
import { ManageBillingButton } from '@/features/billing';
import { MEMBERSHIP_BADGE_LABEL } from './ProfileHeader';

// ProfileMembershipCard — the Profile screen's membership card, with two variants
// (TASK_61):
//   • `membership === 'free'`         → the dark "Choose your membership." row —
//     unchanged copy/CTA (PaywallTrigger opens the shared Paywall modal), v3's row
//     geometry. Never shows a price (TASK_61 decision 3 — our model is a recurring
//     subscription, not v3's one-time $29).
//   • `membership !== 'free'` (active) → a gold uppercase eyebrow ("Active Subscriber" /
//     "Lifetime Member", reusing `ProfileHeader`'s `MEMBERSHIP_BADGE_LABEL` map instead of
//     a third copy) above the real subhead, with `ManageBillingButton` on the right (the
//     existing hosted Stripe Customer Portal mechanism — Feature 67 — not a new one).
//
// `lifetime` IS a real membership state (`MembershipStatus`, `EntitlementKind.
// lifetime_unlock`) reachable via manual grant or promo — its handling is kept, not
// collapsed into `subscription` (TASK_14 point 4).
//
// The page renders this UNCONDITIONALLY — both branches are real UI, not a `?` the page
// decides on.
//
// PRESENTATIONAL ONLY. The free-tier CTA opens the shared Paywall modal (Phase 1 —
// checkout is Stripe-backed, Feature 66/67); the active-tier CTA opens the real hosted
// Stripe Customer Portal via the existing ManageBillingButton — no new billing
// mechanism, no Stripe artifact added here.
//
// DATA SOURCE: the free-tier copy lives in a small feature-local config object below
// (unchanged from before this restyle) — this component must NOT import
// `@tennis/mock-data` in UI (hard rule).
//
// REAL DEFECT FIXED HERE (TASK_61): the active variant's `Manage` link used to be
// `text-stone … hover:text-ink` — ink-on-near-black is invisible on hover against this
// card's dark gradient. It is now `text-bone/70 hover:text-bone`.

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
        className="rounded-lg px-4 py-3.5 text-bone md:rounded-[14px] md:px-6 md:py-[18px]"
        style={{ background: 'linear-gradient(135deg, #1A1A1A, #2A2A2A)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow text-gold">{MEMBERSHIP_BADGE_LABEL[membership]}</div>
            <div className="mt-1 text-[13px] text-bone md:text-[14px]">
              {ACTIVE_SUBHEAD[membership]}
            </div>
          </div>
          {/* Existing "manage subscription" mechanism (Feature 67) — the hosted Stripe
              Customer Portal, not a new billing surface. */}
          <ManageBillingButton className="body-s shrink-0 text-bone/70 underline underline-offset-2 transition-colors hover:text-bone">
            Manage
          </ManageBillingButton>
        </div>
      </div>
    );
  }

  const { eyebrow, headline, ctaLabel } = copy;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-ink p-4 py-[18px] md:gap-4 md:rounded-[14px] md:px-6 md:py-[22px]">
      <div className="flex-1">
        <div className="eyebrow text-gold">{eyebrow}</div>
        <div className="serif mt-2 text-[20px] font-light leading-[1.15] text-bone md:text-[24px]">
          {headline}
        </div>
      </div>

      {/* CTA — opens the shared Paywall modal (presentational only; the modal's
          checkout is a Phase 4 placeholder). The gold `btn-premium` variant is
          reserved for the paywall (this is it). Never shows a price (decision 3). */}
      <PaywallTrigger source="profile" className="btn btn-premium h-9 shrink-0 gap-2 px-4 text-[11px]">
        {ctaLabel}
        <ArrowGlyph />
      </PaywallTrigger>
    </div>
  );
}
