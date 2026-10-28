import Link from 'next/link';

// AuthTopBar — the standalone mobile chrome for the auth screens (`/signin`, `/signup`,
// `/verify`). TASK_62 (v3): the pill nav (`AppHeader`) now renders at md+ instead of a
// second bespoke bar (see `AuthLayout`); this component is the mobile-only fallback,
// restyled to v3's `AuthGateScreen` top bar — just the wordmark and a "Continue
// exploring" link, both pointing home. No primary nav, no saved/profile icons, no
// Unlock CTA, no footer.
//
// SERVER component, presentational only.

const WORDMARK = 'TENNIS · WORLD';

export function AuthTopBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-[22px]">
      <Link
        href="/"
        aria-label="Tennis World — home"
        className="serif text-[15px] font-normal uppercase tracking-wordmark text-ink"
      >
        {WORDMARK}
      </Link>
      <Link
        href="/"
        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone transition-colors hover:text-ink"
      >
        Continue exploring
      </Link>
    </div>
  );
}
