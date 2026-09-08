import type { UserProfileDTO } from '@tennis/contracts';
import { Badge, UserAvatar } from '@/components/ui';
import { isDemoMode } from '@/lib/demo-auth';
import { ProfileEditTrigger } from './ProfileEditTrigger';

// ProfileHeader — the top "profile block" of the /profile screen (v2 prototype's
// ProfileScreen, `new design/tennis_world_v2_standalone.html` lines 1400-1412): an 80px
// circular avatar, serif name, and an "Edit profile" pill that opens EditProfileModal.
// The gear icon + wordmark row above this block is the PAGE's job, not this
// component's — AppHeader already owns the wordmark (CLAUDE.md instruction), so this
// component starts at the avatar row.
//
// PRESENTATIONAL, plus ONE client island (`ProfileEditTrigger`, which owns the modal's
// open state and the save mutation) dropped in for the edit affordance — same pattern
// as ProfileMembershipCard's PaywallTrigger / ProfileMenuRow's ConsultationTrigger. No
// repository read of its own; the user DTO arrives via props from the page.
//
// AVATAR: the user's Google profile photo when `avatarUrl` is set and loads, else the
// ink-circle serif-INITIALS fallback (`UserAvatar`, `@/components/ui`). NO avatar-change
// control — `PATCH /v1/me` has no image field and there is no upload storage (TASK_14
// point 1); the prototype's photo-cycle button is intentionally not built.
//
// MEMBERSHIP STATUS branches on `membership`:
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
    <div className="flex items-start gap-4">
      <UserAvatar
        name={user.name}
        initials={user.initials}
        avatarUrl={user.avatarUrl}
        size="lg"
        className="shadow-[0_2px_12px_rgba(15,15,15,0.15)] ring-[3px] ring-paper"
      />

      <div className="flex-1">
        <h1 className="serif text-[26px] font-normal leading-[1.1] text-ink">{user.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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

        <ProfileEditTrigger name={user.name} email={user.email} />
      </div>
    </div>
  );
}
