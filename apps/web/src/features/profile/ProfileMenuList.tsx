import { SignOutButton } from '@/features/auth';
import { ProfileMenuRow } from './ProfileMenuRow';

// ProfileMenuList — the menu/settings list, ported from profile.html's menu rows plus
// the trailing clay "Sign Out" row.
//
// PRESENTATIONAL list + ONE auth island. The row labels/values are local page chrome (not
// domain data), held in the config below. The only behavioral piece is the trailing
// Sign Out control.
//
// SIGN-OUT (Feature 57): when `signedIn` (the Profile page always passes true — it only
// renders for an authenticated user in `api` mode, and for the mock user in mock mode) the
// list renders the <SignOutButton> island, which POSTs `/v1/auth/logout` (api mode) and
// routes to /signin. When NOT signed in it shows the Sign In affordance (→ /signin)
// instead. Row behavior:
//   • Subscription & Purchases → opens the hosted Stripe Customer Portal (Feature 67 —
//     `action:'portal'`, backed by POST /v1/billing/portal; a logged-out click → /signin)
//   • Contact Concierge        → opens the shared Consultation modal (presentational only)
//   • Notifications/Language/Help → inert (Phase 4+ settings)
//   • Privacy/Terms            → real /privacy and /terms routes (Features 29/30)

export interface ProfileMenuListProps {
  /**
   * Whether the visitor has an active session (Feature 57). The Profile page passes true
   * (it redirects logged-out visitors before rendering in `api` mode). Controls the
   * trailing affordance: Sign Out island (true) vs. a Sign In link (false). Defaults to
   * false so any other caller degrades safely.
   */
  signedIn?: boolean;
}

interface MenuRow {
  label: string;
  value?: string;
  /**
   * `'consult'` opens the Consultation modal; `'portal'` opens the Stripe Customer Portal
   * (Feature 67); default `'link'` is a link row.
   */
  action?: 'link' | 'consult' | 'portal';
  /** Real destination for a link row; when omitted the row is an inert "#" placeholder. */
  href?: string;
}

// Ported in order from profile.html's menu. "Subscription & Purchases" opens the hosted
// Stripe Customer Portal (Feature 67). "Contact Concierge" is kept as a menu row (the
// prototype does the same) and routes to the shared Consultation modal (the prototype's
// `onConsult`). Privacy/Terms link to the real static routes added in Feature 29.
const MENU_ROWS: MenuRow[] = [
  { label: 'Subscription & Purchases', action: 'portal' },
  { label: 'Contact Concierge', action: 'consult' },
  { label: 'Notifications' },
  { label: 'Language', value: 'English' },
  { label: 'Help & Support' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export function ProfileMenuList({ signedIn = false }: ProfileMenuListProps) {
  return (
    <div className="mt-2">
      {MENU_ROWS.map((row) => (
        <ProfileMenuRow
          key={row.label}
          label={row.label}
          value={row.value}
          action={row.action}
          href={row.href}
          source={row.action === 'consult' ? 'profile' : undefined}
        />
      ))}

      {/* Sign In / Sign Out affordance (Feature 57). Signed-in: the real <SignOutButton>
          island (POSTs /v1/auth/logout in api mode, then routes to /signin). Signed-out: a
          "Sign In" link to /signin. */}
      {signedIn ? <SignOutButton /> : <ProfileMenuRow label="Sign In" href="/signin" />}
    </div>
  );
}
