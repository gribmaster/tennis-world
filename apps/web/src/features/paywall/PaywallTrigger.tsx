'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { PaywallModal } from './PaywallModal';
import type { PaywallCopy } from './paywall-copy';

// PaywallTrigger — the reusable control that opens the PaywallModal. This is the
// single client island for the paywall feature: it OWNS the open/close state locally
// (one `useState`, per the brief — no global store, no localStorage), renders a
// button, and renders the modal alongside it.
//
// Reusable across Home / Court Detail / Profile / Footer. The host page/component
// stays a server component; it just drops a <PaywallTrigger> where the inert CTA was.
//
// PRESENTATIONAL ONLY — clicking opens a modal; nothing is purchased or unlocked.
// No analytics is sent (the `source` prop is reserved for future analytics only).

export interface PaywallTriggerProps {
  /** Button content. Use this for custom markup (icon + label). */
  children?: ReactNode;
  /**
   * Convenience label, used as the button content when `children` is omitted, and as
   * the button's accessible name when `children` is non-text (e.g. icon-only).
   */
  label?: string;
  /** Class names applied to the trigger button (e.g. `btn btn-premium`). */
  className?: string;
  /**
   * Source of the trigger for FUTURE analytics (e.g. "home", "court-detail",
   * "profile", "footer"). NOT sent anywhere in Phase 1 — passed through to the modal
   * only so the eventual analytics wiring has a single place to read it.
   */
  source?: string;
  /** Override the modal copy if a surface needs different wording. */
  copy?: PaywallCopy;
}

export function PaywallTrigger({
  children,
  label,
  className,
  source,
  copy,
}: PaywallTriggerProps) {
  // The ONLY state in the paywall feature. Local on purpose (brief): not global.
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // When children are non-text (icon-only), `label` supplies the accessible name.
        aria-label={children && label ? label : undefined}
        aria-haspopup="dialog"
        className={className}
      >
        {children ?? label}
      </button>

      <PaywallModal open={open} onClose={() => setOpen(false)} copy={copy} source={source} />
    </>
  );
}
