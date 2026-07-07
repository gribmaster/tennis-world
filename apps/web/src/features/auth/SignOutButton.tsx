'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isApiMode, logout } from './auth-client';

// SignOutButton — the logout control (Feature 57). A tiny client island so the otherwise
// server-rendered ProfileMenuList can end the session without becoming a client component.
//
// AUTH: in `api` mode it POSTs `/v1/auth/logout` with `credentials:'include'` (so the
// cookie-clear `Set-Cookie` overwrites the web origin's session cookie), then navigates to
// /signin and refreshes so the now-logged-out server pages re-render. The logout endpoint
// is idempotent and unguarded, so we proceed to the redirect even on an unexpected
// non-2xx — being signed out locally is the goal either way. In MOCK mode there is no
// session to end; we just route to /signin (keeps the affordance honest without faking a
// backend).
//
// Styling mirrors the clay "Sign Out" ProfileMenuRow it replaces (danger tone, no chevron).

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    if (isApiMode()) {
      try {
        await logout();
      } catch {
        // Idempotent endpoint — proceed regardless; local sign-out is what matters.
      }
    }
    // Full navigation + refresh so server components re-read auth (header, private pages).
    router.replace('/signin');
    router.refresh();
  }

  return (
    // Styling matches a danger-tone ProfileMenuRow (h-14, border-b, clay, no chevron).
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="flex h-14 w-full items-center justify-between border-b border-hairline px-1 text-left text-clay transition-opacity hover:opacity-70 disabled:opacity-50"
    >
      <span className="body-l">{busy ? 'Signing out…' : 'Sign Out'}</span>
    </button>
  );
}
