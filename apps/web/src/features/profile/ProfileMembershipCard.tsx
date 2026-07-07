import { PaywallTrigger } from '@/features/paywall';

// ProfileMembershipCard — the dark "Membership" unlock card, ported from
// profile.html's `!unlocked` membership block (gold eyebrow + serif headline + gold
// CTA on an ink background).
//
// RENDERED ONLY WHEN `!unlocked` — the page decides whether to render it (matching the
// prototype, which gates it on `!unlocked`). This component itself is unconditionally
// presentational.
//
// PRESENTATIONAL ONLY (Phase 1 — no auth, no payments, no real unlock; Decision #11 /
// hard rules). The CTA opens the shared Paywall modal (presentational only — the
// modal's checkout is a Phase 4 placeholder; no entitlement is read or mutated).
//
// DATA SOURCE: the copy + price live in a small feature-local config object below. This
// component must NOT import `@tennis/mock-data` in UI (hard rule) — a `PAYWALL_COPY`
// config does exist there for the future paywall modal, and in Phase 4 this card's copy
// would flow from there through a sanctioned boundary. For now it is intentionally local
// and presentational, exactly as HomePaywallBand keeps its copy local.

interface MembershipCardCopy {
  eyebrow: string;
  headline: string;
  ctaLabel: string;
}

// Copy ported from profile.html's membership block ("The world, unlocked. $29.").
const MEMBERSHIP_CARD_COPY: MembershipCardCopy = {
  eyebrow: 'Membership',
  headline: 'The world, unlocked. $29.',
  ctaLabel: 'See Membership',
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
  /** Override the default (prototype) copy if needed. */
  copy?: MembershipCardCopy;
}

export function ProfileMembershipCard({ copy = MEMBERSHIP_CARD_COPY }: ProfileMembershipCardProps) {
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
