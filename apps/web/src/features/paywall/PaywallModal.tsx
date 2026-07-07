'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PaywallCheckoutButton } from '@/features/billing';
import { PAYWALL_COPY } from './paywall-copy';
import type { PaywallCopy } from './paywall-copy';

// PaywallModal — the Phase-1 paywall dialog. Premium/luxury styling consistent with
// HomePaywallBand (ink background, gold "Membership" eyebrow flanked by hairline
// rules, serif headline, gold `btn-premium` primary CTA).
//
// CHECKOUT (Feature 67): the primary CTA is now the <PaywallCheckoutButton> island —
// clicking it starts a hosted Stripe Checkout for the 'lifetime' plan and navigates the
// browser to the returned hosted URL (loading/error/auth states handled inside the
// button). There is still NO Stripe.js, NO publishable key, NO price id in the browser —
// only the plan KEY is sent and an opaque hosted `url` is received. The rest of the modal
// stays presentational (copy/benefits/price display come from the feature-local copy).
//
// State: this component is fully controlled (`open` + `onClose`). Open/close state
// lives in PaywallTrigger (per the feature brief), not here and not in any global
// store — there is intentionally no state library.
//
// Accessibility:
//   • role="dialog" + aria-modal="true", labelled by the headline + described by the
//     value-prop line.
//   • Closes on Escape and on backdrop click.
//   • Moves focus to the dialog on open and restores it to the trigger on close.
//   • Locks body scroll while open.

export interface PaywallModalProps {
  /** Whether the dialog is open. Controlled by PaywallTrigger. */
  open: boolean;
  /** Called when the user requests close (Escape, backdrop, ✕, "Not now"). */
  onClose: () => void;
  /** Override the default copy if needed (defaults to the feature-local PAYWALL_COPY). */
  copy?: PaywallCopy;
  /**
   * Optional source label of the trigger (e.g. "home", "court-detail"). Reserved for
   * future analytics — NOT sent anywhere in Phase 1. Accepted here only so the modal
   * can be told where it was opened from once analytics exist.
   */
  source?: string;
}

function CheckGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PaywallModal({ open, onClose, copy = PAYWALL_COPY, source }: PaywallModalProps) {
  // `source` is intentionally unused in Phase 1 (no analytics yet); referenced here so
  // it isn't flagged as an unused prop and to document the future wiring point.
  void source;

  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Remember what had focus before opening so we can restore it on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog (the close button is focused via autoFocus below;
    // fall back to the dialog container for assistive tech).
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever opened the modal (the trigger button).
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Render nothing when closed, and guard against SSR (portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    // Backdrop — click closes (simple backdrop dismissal per the brief).
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      {/* Dialog. stopPropagation so clicks inside don't bubble to the backdrop. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-[560px] overflow-y-auto bg-ink px-[clamp(24px,5vw,48px)] py-[clamp(32px,5vw,48px)] text-bone outline-none"
      >
        {/* Close button (✕). autoFocus places initial focus here on open. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          autoFocus
          className="absolute right-4 top-4 p-2 text-bone/60 transition-colors hover:text-bone"
        >
          <CloseGlyph />
        </button>

        {/* Gold "MEMBERSHIP" eyebrow flanked by hairline rules (matches HomePaywallBand). */}
        <div className="mb-5 flex items-center gap-2.5">
          <span aria-hidden className="h-px w-7 bg-gold/70" />
          <span className="serif text-[13px] uppercase tracking-[0.28em] text-gold">
            {copy.eyebrow}
          </span>
          <span aria-hidden className="h-px w-7 bg-gold/70" />
        </div>

        <h2 id={titleId} className="display-m text-bone">
          {copy.headline}
        </h2>

        <p id={descId} className="body-m mt-3 max-w-[420px] text-bone/70">
          {copy.valueProp}
        </p>

        {/* Benefit list. */}
        <ul className="mt-7 flex flex-col gap-3.5">
          {copy.benefits.map((benefit) => (
            <li key={benefit.title} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-gold"
              >
                <CheckGlyph />
              </span>
              <span>
                <span className="body-m block text-bone">{benefit.title}</span>
                <span className="body-s block text-bone/55">{benefit.subtitle}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* One-time price copy (rendered only if present). */}
        {copy.price ? (
          <p className="serif mt-7 text-[28px] font-light text-bone">
            {copy.price.display}{' '}
            <span className="eyebrow align-middle text-bone/60">{copy.price.cadence}</span>
          </p>
        ) : null}

        {/* Actions. */}
        <div className="mt-8 flex flex-col gap-2.5">
          {/* PRIMARY CTA — real checkout (Feature 67). Starts a hosted Stripe Checkout
              for the 'lifetime' plan and navigates to the returned URL; owns its own
              loading/error/auth-redirect states. No Stripe.js / price id in the browser. */}
          <PaywallCheckoutButton label={copy.primaryCtaLabel} />

          {/* SECONDARY — "not now" closes the modal (the only real behavior here). */}
          <button
            type="button"
            onClick={onClose}
            className="btn w-full justify-center border border-bone/30 bg-transparent text-bone/75"
          >
            {copy.secondaryCtaLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
