'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ConsultationModal } from './ConsultationModal';
import type { ConsultationCopy } from './consultation-copy';

// ConsultationTrigger — the reusable control that opens the ConsultationModal. This is
// the single client island for the consultation feature: it OWNS the open/close state
// locally (one `useState`, per the brief — no global store, no localStorage), renders a
// button, and renders the modal alongside it.
//
// Reusable across Home / Court Detail / Saved / Profile. The host page/component stays a
// server component; it just drops a <ConsultationTrigger> where the inert CTA was (this
// is exactly how PaywallTrigger is already used in those same server components).
//
// PRESENTATIONAL ONLY — clicking opens a modal whose submit is mock-only (no backend, no
// email, no CRM, no persistence). No analytics is sent (the `source` prop is reserved for
// future analytics only).

export interface ConsultationTriggerProps {
  /** Button content. Use this for custom markup (icon + label). */
  children?: ReactNode;
  /**
   * Convenience label, used as the button content when `children` is omitted, and as the
   * button's accessible name when `children` is non-text (e.g. icon-only).
   */
  label?: string;
  /** Class names applied to the trigger button (e.g. `btn btn-secondary`). */
  className?: string;
  /**
   * Source of the trigger for FUTURE analytics (e.g. "home", "court-detail", "saved",
   * "profile"). NOT sent anywhere in Phase 1 — passed through to the modal only so the
   * eventual analytics wiring has a single place to read it.
   */
  source?: string;
  /** Override the modal copy if a surface needs different wording. */
  copy?: ConsultationCopy;
}

export function ConsultationTrigger({
  children,
  label,
  className,
  source,
  copy,
}: ConsultationTriggerProps) {
  // The ONLY state in the consultation feature's trigger. Local on purpose (brief): the
  // modal owns its own form state; neither is global.
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

      <ConsultationModal
        open={open}
        onClose={() => setOpen(false)}
        copy={copy}
        source={source}
      />
    </>
  );
}
