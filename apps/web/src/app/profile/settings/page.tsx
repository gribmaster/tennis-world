import type { Metadata } from 'next';
import { AppShell, PageContainer } from '@/components/layout';
import { BackButton, PendingLink } from '@/components/navigation';
import { SettingsMenuCard } from '@/features/profile';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';

// Settings page (`/profile/settings`) — Feature 81/82, restyled to the v3 narrow centred
// column (TASK_61 §4).
//
// PRIVATE, same as /profile: a thin SERVER component and the only repository boundary
// on this screen (`getRepositoriesForRequest()` + `loadOrSignIn`, redirecting a
// logged-out visitor to `/signin?redirectTo=/profile/settings`). Only `user` is read —
// this screen needs membership (for the Subscription & access subcopy) and
// name/email (for the Account settings → edit-profile modal); it has no stats of its
// own.
//
// NESTED PAGE ⇒ the shared BackButton (CLAUDE.md §5), fallbackHref="/profile". TWO
// instances (TASK_61, matching Court Detail's split): a mobile icon back inside the
// header row (`md:hidden`), and a desktop plain-text "Back to Profile" link above the
// heading (`hidden md:inline-flex`). `verify:ux-pending-states` reads this file and wants
// `fallbackHref="/profile"`.
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
//   • Sign In / Sign Out                          → SIGN-OUT SURVIVES as the LAST row
//     inside SettingsMenuCard (TASK_45), above the Privacy/Terms links (this screen
//     only ever renders for a signed-in visitor, so it always renders <SignOutButton>,
//     never the signed-out "Sign In" branch the old list also carried).
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

  return (
    <AppShell signedIn>
      <PageContainer className="py-section-lg md:py-section-xl min-h-[70vh]">
        <div className="mx-auto max-w-[480px]">
          {/* Desktop plain-text back link, above the heading (hidden on mobile, which
              gets the icon back inside the header row below). */}
          <BackButton
            fallbackHref="/profile"
            label="Back to Profile"
            className="eyebrow mb-5 hidden items-center gap-1.5 text-[13px] normal-case tracking-normal text-stone transition-colors hover:text-ink md:inline-flex"
          />

          <div className="mb-8 flex items-center gap-3.5 md:mb-6">
            <BackButton
              fallbackHref="/profile"
              className="eyebrow inline-flex items-center gap-1.5 text-stone transition-colors hover:text-ink disabled:cursor-default disabled:opacity-70 md:hidden"
            />
            <h1 className="serif display-m text-ink md:text-[34px] md:font-normal md:leading-[1.1]">
              Settings
            </h1>
          </div>

          <SettingsMenuCard user={user} />

          <div className="mt-4 flex justify-center gap-4 md:mt-[18px] md:gap-[18px]">
            <PendingLink
              href="/privacy"
              className="text-[11px] underline underline-offset-2 text-stone hover:text-ink md:text-[12px]"
            >
              Privacy Policy
            </PendingLink>
            <PendingLink
              href="/terms"
              className="text-[11px] underline underline-offset-2 text-stone hover:text-ink md:text-[12px]"
            >
              Terms of Service
            </PendingLink>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}
