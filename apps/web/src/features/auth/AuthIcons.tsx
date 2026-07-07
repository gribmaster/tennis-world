import type { SVGProps } from 'react';

// AuthIcons — the small icon set used by the auth screens, ported verbatim from the
// `AuthIcons` object in files/signin.html / files/signup.html (mail / apple / google)
// plus the shared "arrow" glyph used on the primary submit buttons.
//
// PRESENTATIONAL only — no icon-library dependency (Decision #6); each is an inline
// <svg> taking SVGProps so callers can size/colour them. The Apple/Google marks are
// purely decorative here: the buttons they sit on are INERT placeholders (no OAuth in
// Phase 1 — see SignInForm/SignUpForm and PHASE_1_PLACEHOLDER_CTA_AUDIT §5).

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

// Brand glyphs — coloured/filled marks, ported from the prototype. They are decorative
// (the buttons are inert), so they stay aria-hidden.
export function AppleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-2.003 1.59-3.067 1.59-.04-1.1.522-2.27 1.21-3.04.802-.9 2.156-1.58 3.034-1.63zM21.6 17.13c-.602 1.39-.892 2.01-1.674 3.24-1.09 1.71-2.625 3.84-4.527 3.86-1.69.02-2.137-1.1-4.442-1.09-2.304.01-2.79 1.11-4.485 1.09-1.901-.02-3.351-1.94-4.443-3.65C-1.99 14.93-.515 7.6 4.46 7.32c1.79-.1 3.04 1 4.085 1 1.04 0 2.62-1.13 4.43-1 .76.03 2.99.31 4.41 2.32-3.81 2.31-3.19 7.42-1.78 7.49z" />
    </svg>
  );
}

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.99 6.99 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.85c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

// Forward-arrow glyph used on the primary submit CTAs (ported from the prototype's
// shared `I.arrow`).
export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
