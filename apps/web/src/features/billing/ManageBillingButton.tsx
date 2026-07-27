'use client';

// ManageBillingButton — opens the hosted Stripe Customer Portal (Feature 67). Backs the
// profile "Subscription & Purchases" row and the footer "Restore" link, both of which
// were Phase-1 inert placeholders. The portal is where a user manages/cancels a
// subscription, updates a card, or restores a purchase (Stripe's hosted flows).
//
// On click it calls `createPortalSession()` via `useBillingAction` and navigates the
// browser to the returned hosted URL. Loading disables the control; a logged-out click
// routes to /signin?redirectTo=<current path>; a failure (unconfigured Stripe → 500,
// mock mode → not-available) shows a calm inline error and does NOT navigate.
//
// PRESENTATION: this is a headless-ish control — the caller supplies `children` (the row
// markup or the footer label) and `className` so it can look exactly like the row/link it
// replaces. It renders a <button> (a portal action is not a navigable href — it's a
// POST-then-redirect), styled by the caller to match its surroundings.
//
// NO Stripe.js, NO client secret — only an opaque hosted `url` is received and navigated to.

import type { ReactNode } from 'react';
import { useBillingAction } from './use-billing-action';
import { InlineSpinner } from '@/components/ui';

export interface ManageBillingButtonProps {
  /** Button content (row markup, or a plain label). */
  children: ReactNode;
  /** Class names applied to the button so it matches its host (row / footer link). */
  className?: string;
  /**
   * Accessible name when `children` is non-text (e.g. a row with icons). Optional —
   * omit when the children already provide readable text.
   */
  ariaLabel?: string;
  /**
   * Suppress the inline error node. The footer (dark, tight layout) sets this so a
   * failure doesn't disrupt the column — it stays a quiet link (the profile row is the
   * primary place a portal error surfaces). A boolean (not a render function) so a SERVER
   * component parent — the Footer — can pass it to this CLIENT island (functions aren't
   * serializable across that boundary). Defaults to false: the error renders inline.
   */
  hideError?: boolean;
}

export function ManageBillingButton({
  children,
  className,
  ariaLabel,
  hideError = false,
}: ManageBillingButtonProps) {
  const { pending, error, openPortal } = useBillingAction();

  const errorNode =
    error && !hideError ? (
      <p role="alert" className="body-s px-1 pb-2 text-clay">
        {error}
      </p>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={pending}
        aria-busy={pending}
        aria-disabled={pending || undefined}
        aria-label={ariaLabel}
        // `relative` so the pending overlay below can anchor to this exact button without
        // touching the row/footer-link's own layout (`children` is arbitrary caller markup
        // — a flex row with justify-between, or a plain label — so we don't insert an extra
        // flex child that would shift it; the spinner instead sits on top, right-aligned).
        className={['relative', className ?? ''].filter(Boolean).join(' ')}
      >
        <span className={pending ? 'opacity-0' : undefined}>{children}</span>
        {pending ? (
          <span
            aria-hidden
            className="absolute inset-y-0 right-1 flex items-center"
          >
            <InlineSpinner label="Opening billing portal…" />
          </span>
        ) : null}
      </button>
      {errorNode}
    </>
  );
}
