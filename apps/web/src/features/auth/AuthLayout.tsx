import type { ReactNode } from 'react';
import Link from 'next/link';
import { AuthTopBar } from './AuthTopBar';
import { AppHeader } from '@/components/layout';
import { NavigationPendingProvider } from '@/components/navigation';

// AuthLayout — the shared presentational shell for the /signin, /signup and /verify
// screens, restyled to v3's `AuthGateScreen` (TASK_62).
//
// The auth pages don't use `AppShell` (no Footer here), so this is the one place that
// mounts `NavigationPendingProvider` for them (CLAUDE.md §4 — exactly one provider per
// page). Desktop (md+) gets the same floating pill nav every other screen uses
// (`AppHeader`, Profile lit via `nav-items.ts`'s extra prefixes); mobile keeps the
// standalone `AuthTopBar` instead — a `hidden md:block` wrapper around `AppHeader`
// also hides its `fixed` pill, so the two never double up.
//
// SERVER component, presentational only — it owns layout/chrome and renders the form
// island (a client component) as `children`.

export interface AuthLayoutProps {
  /** The auth form island (SignInForm / SignUpForm / VerifyMagicLink). */
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <NavigationPendingProvider>
      <div className="flex min-h-dvh flex-col">
        <div className="hidden md:block">
          <AppHeader signedIn={false} />
        </div>
        <div className="md:hidden">
          <AuthTopBar />
        </div>

        <div className="flex flex-1 justify-center px-7 pb-12 pt-11 md:px-6 md:pb-20 md:pt-[calc(var(--nav-offset)+40px)]">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>

        {/* Legal line, ported from the prototype's footer. Points at the real /terms
            and /privacy routes. */}
        <div className="px-6 pb-6 pt-6 text-center md:pb-8 md:pt-10">
          <span className="text-[10px] text-mist">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </span>
        </div>
      </div>
    </NavigationPendingProvider>
  );
}
