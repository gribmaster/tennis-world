import { redirect } from 'next/navigation';
import { AuthRequiredError } from '@/lib/repositories';

// Logged-out boundary helper for PRIVATE server pages (Feature 57).
//
// The protected saved/user reads throw `AuthRequiredError` (a 401 subclass) when the
// request carries no valid session — in `api` mode with no/expired cookie. A PRIVATE
// page (/profile, /saved, /saved/collections/[slug]) should send those visitors to
// sign in rather than render a broken/empty shell. This wraps that pattern in one place:
//
//   const data = await loadOrSignIn(() => getProtectedData());
//
// On `AuthRequiredError` it calls `redirect('/signin?redirectTo=…')` (which throws the
// Next redirect signal, so control never returns). ANY OTHER error is re-thrown
// unchanged — a real API/network fault must surface as an error, NOT masquerade as
// "logged out". In MOCK mode the protected reads never throw `AuthRequiredError`, so this
// is transparently a pass-through and the page keeps its mock behavior.

/**
 * Run a protected server-side read; on a 401 (`AuthRequiredError`) redirect to /signin
 * (optionally preserving where to return via `redirectTo`). Re-throws every other error.
 *
 * @param load The protected read (e.g. `() => repos.saved.getSavedCourts()`).
 * @param redirectTo Optional path to return to after sign-in (passed to /signin and
 *   honored by the magic-link `redirectTo`, allowlisted server-side).
 */
export async function loadOrSignIn<T>(
  load: () => Promise<T>,
  redirectTo?: string,
): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      redirect(
        redirectTo
          ? `/signin?redirectTo=${encodeURIComponent(redirectTo)}`
          : '/signin',
      );
    }
    throw err;
  }
}
