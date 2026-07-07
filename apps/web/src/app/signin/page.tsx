import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout, SignInForm } from '@/features/auth';

// Sign In page (`/signin`) — the magic-link sign-in screen. The nav user-icon and the
// profile "Sign In" affordance point here for logged-out visitors, and private pages
// redirect here (with `?redirectTo=…`) in `api` mode.
//
// SERVER component for the shell; the form is a client island (SignInForm). It uses the
// stripped AuthLayout (wordmark top bar + legal line), NOT AppShell — there is no
// AppHeader and no Footer here, matching the prototype (files/signin.html).
//
// AUTH (Feature 57): in `api` mode SignInForm POSTs /v1/auth/request-link; in mock mode it
// keeps the cosmetic success UX. It reads `?redirectTo` via `useSearchParams`, which Next
// 15 requires under a Suspense boundary (the page is otherwise statically prerendered).

export const metadata: Metadata = {
  title: 'Sign In — Tennis World',
  description: 'Sign in to access your saved courts, collections, and membership.',
};

export default function SignInRoute() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </AuthLayout>
  );
}
