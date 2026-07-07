import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout, SignUpForm } from '@/features/auth';

// Sign Up page (`/signup`) — the magic-link sign-up screen. Reached from the Sign In
// screen's "Create an account" link.
//
// SERVER component for the shell; the form is a client island (SignUpForm). It uses the
// stripped AuthLayout (wordmark top bar + legal line), NOT AppShell — there is no
// AppHeader and no Footer here, matching the prototype (files/signup.html).
//
// AUTH (Feature 57): magic-link auth is passwordless — sign-up and sign-in hit the same
// /v1/auth/request-link endpoint (api mode); the name field is collected but not sent
// (the contract has no name field — see SignUpForm). Reads `?redirectTo` via
// `useSearchParams`, which Next 15 requires under a Suspense boundary.

export const metadata: Metadata = {
  title: 'Sign Up — Tennis World',
  description: 'Create a Tennis World account to save courts, build collections, and unlock the full atlas.',
};

export default function SignUpRoute() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  );
}
