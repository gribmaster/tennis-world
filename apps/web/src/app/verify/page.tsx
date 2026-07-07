import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout, VerifyMagicLink } from '@/features/auth';

// Verify page (`/verify`) — the magic-link landing route (Feature 57). The API emails a
// link to `${WEB_APP_URL}/verify?token=...&redirectTo=...`; this page runs the verify
// exchange in the browser (so the httpOnly session cookie is set on the web origin) and
// then forwards the user on. Uses the stripped AuthLayout, matching /signin and /signup.
//
// `VerifyMagicLink` reads the query via `useSearchParams`, which Next 15 requires to sit
// under a Suspense boundary (the page is otherwise statically renderable).

export const metadata: Metadata = {
  title: 'Verifying… — Tennis World',
  description: 'Completing your sign-in.',
  // Don't index a transient, token-bearing URL.
  robots: { index: false, follow: false },
};

export default function VerifyRoute() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="text-center">
            <h1 className="display-m text-ink">Signing you in…</h1>
          </div>
        }
      >
        <VerifyMagicLink />
      </Suspense>
    </AuthLayout>
  );
}
