import type { Metadata } from 'next';
import { AppShell, PageContainer } from '@/components/layout';
import { BackButton, PendingLink } from '@/components/navigation';
import { SettingsMenuCard } from '@/features/profile';
import { SignOutButton } from '@/features/auth';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';

// Settings page (`/profile/settings`) — Feature 81/82, the screen the Profile page's
// gear icon leads to (`docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.8; prototype
// `SettingsScreen`, `new design/tennis_world_v2_standalone.html` lines 1519-1554).
//
// PRIVATE, same as /profile: a thin SERVER component and the only repository boundary
// on this screen (`getRepositoriesForRequest()` + `loadOrSignIn`, redirecting a
// logged-out visitor to `/signin?redirectTo=/profile/settings`). Only `user` is read —
// this screen needs membership (for the Subscription & access subcopy) and
// name/email (for the Account settings → edit-profile modal); it has no stats of its
// own.
//
// NESTED PAGE ⇒ the shared BackButton (CLAUDE.md §5), fallbackHref="/profile" (the only
// place this screen is reached from).
//
// ── WHERE EVERY OLD ProfileMenuList ROW ENDED UP (the old list is retired) ──────────
//   • Subscription & Purchases (action:'portal')  → SettingsMenuCard's "Subscription &
//     access" row (ManageBillingButton, unchanged mechanism — Feature 67).
//   • Contact Concierge (action:'consult')        → SettingsMenuCard's "Contact us" row
//     (ConsultationTrigger, unchanged mechanism).
//   • Notifications / Language / Help & Support   → OMITTED. These were always inert
//     placeholders (no backing capability, no endpoint, no data) — TASK_14 says a row
//     with nothing real to wire to is omitted, not rendered inert again on this screen.
//   • Privacy / Terms (real /privacy, /terms routes) → kept below the card as
//     PendingLinks, same destinations.
//   • Sign In / Sign Out                          → SIGN-OUT SURVIVES here, below the
//     card + Privacy/Terms links (this screen only ever renders for a signed-in
//     visitor, so it always renders <SignOutButton>, never the signed-out "Sign In"
//     branch the old list also carried).
// "Account settings" (new, prototype-only) → SettingsAccountRow, opening the SAME
// EditProfileModal the Profile screen's "Edit profile" pill opens (TASK_14 decision 3 —
// not a second settings surface).

export const metadata: Metadata = {
  title: 'Settings — Tennis World',
  description: 'Manage your subscription, account, and support.',
};

export default async function ProfileSettingsPage() {
  const repositories = await getRepositoriesForRequest();
  const user = await loadOrSignIn(() => repositories.user.getCurrentUser(), '/profile/settings');
  const unlocked = user.membership !== 'free';

  return (
    <AppShell
      unlocked={unlocked}
      signedIn
      headerUser={{ name: user.name, initials: user.initials, avatarUrl: user.avatarUrl }}
    >
      <PageContainer className="py-section-lg md:py-section-xl">
        <div className="mx-auto max-w-[680px]">
          <div className="mb-8 flex items-center gap-3.5">
            <BackButton fallbackHref="/profile" />
            <h1 className="serif display-m text-ink">Settings</h1>
          </div>

          <SettingsMenuCard user={user} />

          <div className="mt-4 flex justify-center gap-4">
            <PendingLink href="/privacy" className="body-s text-stone underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </PendingLink>
            <PendingLink href="/terms" className="body-s text-stone underline underline-offset-2 hover:text-ink">
              Terms of Service
            </PendingLink>
          </div>

          <div className="mt-8">
            <SignOutButton />
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}
