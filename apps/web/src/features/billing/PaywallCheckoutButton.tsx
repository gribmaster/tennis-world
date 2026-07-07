'use client';

// PaywallCheckoutButton — the paywall's primary CTA, now WIRED to real billing
// (Feature 67). Replaces the Phase-1 inert `<button disabled>` in PaywallModal.
//
// On click it starts a hosted Stripe Checkout for the `'lifetime'` plan via
// `useBillingAction` and navigates the browser to the returned hosted URL. While the
// request is in flight the button shows a loading label and is disabled (no double
// submit). A logged-out click routes to /signin?redirectTo=<current path> (the hook
// handles that). A failure (unconfigured Stripe → 500, mock mode → not-available, or a
// network blip) shows a calm inline error under the button and does NOT navigate.
//
// NO Stripe.js, NO publishable key, NO price id — only the plan KEY is sent; the browser
// only ever receives an opaque hosted `url`. Styling matches the previous CTA exactly
// (`btn btn-premium`, gold, arrow glyph) so the modal looks unchanged when idle.

import type { ReactNode } from 'react';
import { useBillingAction } from './use-billing-action';

function ArrowGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface PaywallCheckoutButtonProps {
  /** The button label when idle (e.g. "Unlock Full Access"). */
  label: ReactNode;
  /** Class names applied to the button (defaults to the gold premium CTA). */
  className?: string;
}

export function PaywallCheckoutButton({
  label,
  className = 'btn btn-premium w-full justify-center gap-2',
}: PaywallCheckoutButtonProps) {
  const { pending, error, startCheckout } = useBillingAction();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void startCheckout()}
        disabled={pending}
        aria-busy={pending}
        className={className}
      >
        {pending ? 'Starting checkout…' : label}
        {pending ? null : <ArrowGlyph />}
      </button>

      {/* Inline error — calm copy, never the raw API/Stripe detail. Only shown on
          a non-auth failure (a 401 navigates to sign-in instead of erroring here). */}
      {error ? (
        <p role="alert" className="body-s text-clay/90">
          {error}
        </p>
      ) : null}
    </div>
  );
}
