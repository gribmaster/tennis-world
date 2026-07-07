import type { ReactNode } from 'react';
import Link from 'next/link';
import { AuthTopBar } from './AuthTopBar';

// AuthLayout — the shared presentational shell for the /signin and /signup screens,
// ported from the outer structure both prototypes share (files/signin.html /
// files/signup.html):
//   • a full-height column;
//   • the stripped AuthTopBar (wordmark + "Continue exploring");
//   • a vertically-centred content area capped at ~400px (the form / success island);
//   • a bottom legal line linking to /terms and /privacy.
//
// SERVER component, presentational only — it owns layout/chrome and renders the form
// island (a client component) as `children`. It does NOT use AppShell (no AppHeader,
// no Footer) by design, matching the prototype (FEATURE_28_NEW_DESIGNS_INTAKE §5).

export interface AuthLayoutProps {
  /** The auth form island (SignInForm / SignUpForm). */
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AuthTopBar />

      <div className="flex flex-1 items-center justify-center px-[clamp(20px,4vw,64px)] pb-16 pt-6">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>

      {/* Legal line, ported from the prototype's footer. Now points at the real
          /terms and /privacy routes (Feature 29). */}
      <div className="px-6 pb-8 text-center">
        <span className="body-s text-mist">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-stone underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-stone underline">
            Privacy Policy
          </Link>
          .
        </span>
      </div>
    </div>
  );
}
