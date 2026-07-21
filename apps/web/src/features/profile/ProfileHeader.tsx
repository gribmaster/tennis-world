import type { UserProfileDTO } from '@tennis/contracts';
import { Badge } from '@/components/ui';
import { isDemoMode } from '@/lib/demo-auth';

// ProfileHeader — the top section of the Profile screen, ported from profile.html's
// header (initials avatar + serif name + membership status line).
//
// PRESENTATIONAL ONLY: receives the already-fetched user via props (the page is the
// only repository boundary). No repository, no @tennis/mock-data, no state.
//
// VISUAL: an 80px circular ink chip with the user's INITIALS in serif (not a photo —
// UserProfileDTO carries no avatar URL, and none is added in Phase 1), the serif name,
// and a membership status that branches on `membership`:
//   • lifetime     → gold "Lifetime Member" Badge (the Badge component's documented Profile use)
//   • subscription → gold "Active Subscriber" Badge (active recurring Stripe subscription)
//   • free         → "Explorer · Free" eyebrow in stone
//
// SCHEDULED CANCELLATION (follow-up to Feature 66/71): when the active subscription is
// `cancelAtPeriodEnd`, a small "Access until {date, time}" line renders under the badge,
// reading `activeUntil` off the DTO (the entitlement's real paid-through date — never a
// hardcoded example). `activeUntil` is a UTC instant, so a date-only label can land on a
// different calendar day than Stripe's Customer Portal shows once the browser converts it
// to local time (e.g. Europe/Kyiv rolls 23:51 UTC into the next day). Including the local
// time alongside the date makes clear this is the visitor's own local moment of expiry,
// not a mismatch with Stripe. Formatted with the browser's own locale/timezone
// (`Intl.DateTimeFormat` with no fixed `locale` or `timeZone` arg). Lifetime/free never
// show this (the DTO only carries these fields for an active subscription — see
// user-profile.mapper.ts).

export interface ProfileHeaderProps {
  user: UserProfileDTO;
}

const MEMBERSHIP_BADGE_LABEL: Record<'subscription' | 'lifetime', string> = {
  subscription: 'Active Subscriber',
  lifetime: 'Lifetime Member',
};

/**
 * Format an ISO-8601 instant as a local date + time using the browser's own locale and
 * timezone, or `null` if `iso` is missing/unparseable. Time is included (not just the
 * date) because `activeUntil` is a UTC instant near midnight — a date-only label can show
 * a different calendar day than Stripe's Customer Portal once converted to local time.
 */
function formatActiveUntil(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const badgeLabel =
    user.membership === 'free' ? null : MEMBERSHIP_BADGE_LABEL[user.membership];
  // STAGING-ONLY (Feature 76): a small, non-invasive marker so it's obvious the session is
  // the shared demo user, not a real magic-link login. Reads the NEXT_PUBLIC_ flag (no
  // secret). Absent in normal operation. See docs/STAGING_DEMO_AUTH.md.
  const demoMode = isDemoMode();

  const cancelsOn =
    user.membership === 'subscription' && user.cancelAtPeriodEnd && user.activeUntil
      ? formatActiveUntil(user.activeUntil)
      : null;

  return (
    <div className="flex items-center gap-6 border-b border-hairline pb-10">
      {/* Initials avatar — ink circle, serif initials. */}
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-pill bg-ink text-bone"
        aria-hidden
      >
        <span className="serif text-[30px] font-normal">{user.initials}</span>
      </div>

      <div>
        <h1 className="display-m text-ink">{user.name}</h1>
        <div className="mt-2 flex items-center gap-2">
          {badgeLabel ? (
            <Badge tone="gold">{badgeLabel}</Badge>
          ) : (
            <p className="eyebrow text-stone">Explorer · Free</p>
          )}
          {demoMode ? (
            <span
              className="inline-flex items-center rounded-pill border border-hairline px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone"
              title="Staging demo mode — you are signed in as the shared demo user."
            >
              Demo mode
            </span>
          ) : null}
        </div>
        {user.membership === 'subscription' && user.cancelAtPeriodEnd ? (
          <p className="body-s mt-1.5 text-stone">
            {cancelsOn ? `Access until ${cancelsOn}` : 'Cancellation scheduled'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
