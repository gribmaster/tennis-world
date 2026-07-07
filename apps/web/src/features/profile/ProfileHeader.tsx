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
//   • lifetime → gold "Lifetime Member" Badge (the Badge component's documented Profile use)
//   • free     → "Explorer · Free" eyebrow in stone

export interface ProfileHeaderProps {
  user: UserProfileDTO;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const isLifetime = user.membership === 'lifetime';
  // STAGING-ONLY (Feature 76): a small, non-invasive marker so it's obvious the session is
  // the shared demo user, not a real magic-link login. Reads the NEXT_PUBLIC_ flag (no
  // secret). Absent in normal operation. See docs/STAGING_DEMO_AUTH.md.
  const demoMode = isDemoMode();

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
          {isLifetime ? (
            <Badge tone="gold">Lifetime Member</Badge>
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
      </div>
    </div>
  );
}
