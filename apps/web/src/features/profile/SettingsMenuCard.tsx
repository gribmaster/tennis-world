import type { MembershipStatus, UserProfileDTO } from '@tennis/contracts';
import { ConsultationTrigger } from '@/features/consultation';
import { ManageBillingButton } from '@/features/billing';
import { SettingsAccountRow } from './SettingsAccountRow';

// SettingsMenuCard — the /profile/settings three-row card (TASK_14 point 8), ported
// from the v2 prototype's SettingsScreen (`new design/tennis_world_v2_standalone.html`
// lines 1527-1545): a single rounded paper card, hairline dividers between rows, each
// row a label (+ optional stone subcopy) and a trailing chevron.
//
// Every row is wired to something REAL — no inert placeholders (per
// docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md, and TASK_14's explicit "omitted, not rendered
// inert" instruction):
//   • Subscription & access → ManageBillingButton (existing hosted Stripe Customer
//     Portal, Feature 67). Subcopy reflects the real membership, not the prototype's
//     hardcoded "Lifetime member — active" — `free`/`subscription`/`lifetime` all get
//     their own real copy.
//   • Account settings      → SettingsAccountRow, which opens the SAME EditProfileModal
//     the Profile screen's "Edit profile" pill opens (TASK_14 decision 3 — no second
//     settings surface).
//   • Contact us             → ConsultationTrigger (the existing, already-real
//     mechanism used elsewhere as "Contact Concierge" — NOT a `mailto:` link, which
//     does not exist as a wired capability here).
//
// Rows the OLD ProfileMenuList carried that have NO real backing (Notifications,
// Language, Help & Support) are simply not present here — see the Settings page's own
// header comment for the full old-row inventory.

const SUBSCRIPTION_SUBCOPY: Record<MembershipStatus, string> = {
  free: 'Free plan',
  subscription: 'Active subscriber',
  lifetime: 'Lifetime member — active',
};

const ROW_CLASS = 'block w-full px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.02]';

export interface SettingsMenuCardProps {
  user: UserProfileDTO;
}

export function SettingsMenuCard({ user }: SettingsMenuCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-paper">
      <ManageBillingButton className={ROW_CLASS} ariaLabel="Subscription & access">
        <RowContent label="Subscription & access" sub={SUBSCRIPTION_SUBCOPY[user.membership]} />
      </ManageBillingButton>
      <div className="h-px bg-hairline" />

      <SettingsAccountRow name={user.name} email={user.email} className={ROW_CLASS} />
      <div className="h-px bg-hairline" />

      <ConsultationTrigger source="settings" className={ROW_CLASS}>
        <RowContent label="Contact us" />
      </ConsultationTrigger>
    </div>
  );
}

function RowContent({ label, sub }: { label: string; sub?: string }) {
  return (
    <span className="flex w-full items-center justify-between">
      <span>
        <span className="block text-[14px] font-normal text-ink">{label}</span>
        {sub ? <span className="mt-0.5 block text-[11px] text-stone">{sub}</span> : null}
      </span>
      <ChevronGlyph />
    </span>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-stone"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
