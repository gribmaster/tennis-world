import Link from 'next/link';

// AuthTopBar — the stripped auth chrome, ported from the minimal top bar in
// files/signin.html / files/signup.html. Unlike AppShell's AppHeader, the auth screens
// intentionally use this reduced bar: just the wordmark and a "Continue exploring" link,
// both pointing home — no primary nav, no saved/profile icons, no Unlock CTA, no footer
// (FEATURE_28_NEW_DESIGNS_INTAKE §5).
//
// SERVER component, presentational only. The wordmark mirrors AppHeader's exactly.

const WORDMARK = 'TENNIS · WORLD';

export function AuthTopBar() {
  return (
    <div className="flex items-center justify-between px-[clamp(20px,4vw,64px)] py-6">
      <Link
        href="/"
        aria-label="Tennis World — home"
        className="serif text-[18px] font-normal tracking-wordmark text-ink"
      >
        {WORDMARK}
      </Link>
      <Link href="/" className="eyebrow text-stone transition-colors hover:text-ink">
        Continue exploring
      </Link>
    </div>
  );
}
