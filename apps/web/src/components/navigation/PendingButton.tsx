'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { ButtonProps } from '@/components/ui';
import { InlineSpinner } from '@/components/ui';

// PendingButton — the shared control for ASYNC-ACTION buttons (save/unsave, add/remove
// from collection, create/update/delete collection, checkout, portal, logout, auth
// submits, "Check again"). Wraps the existing `Button` primitive (Decision: compose,
// don't replace) so it keeps every variant/style call sites already use.
//
// Fixed-size guarantee: callers pass `minWidth` (or rely on the button's natural width via
// `fullWidth`/explicit className) so the label↔spinner swap doesn't reflow the button — the
// spinner is rendered ALONGSIDE the label by default (`[spinner] Saving…`), not in place of
// it, so width only ever grows by the spinner's own inline width, never shrinks. Height is
// unaffected either way (the spinner is inline, sized in `em`s off the button's own
// font-size).
//
// While pending: `disabled`, `aria-busy="true"`, `aria-disabled="true"`. On any
// error/rejection from the caller's `onAction`, pending is reset to false (never left
// stuck) — the caller's own catch/toast logic still runs; this component does not swallow
// the error, it re-throws after resetting.
export interface PendingButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Whether an action for THIS button is currently in flight. */
  pending: boolean;
  /** Label shown while pending (defaults to children unchanged if omitted). */
  pendingLabel?: ReactNode;
  /** Accessible label to keep announcing while pending, if different from visible text. */
  pendingAriaLabel?: string;
  onClick?: () => void;
}

export const PendingButton = forwardRef<HTMLButtonElement, PendingButtonProps>(
  function PendingButton(
    { pending, pendingLabel, pendingAriaLabel, children, disabled, onClick, className, ...props },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type={props.type ?? 'button'}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-disabled={pending || undefined}
        aria-label={pending ? pendingAriaLabel : props['aria-label']}
        onClick={onClick}
        className={className}
        {...props}
      >
        {pending ? <InlineSpinner label="Working…" /> : null}
        {pending && pendingLabel !== undefined ? pendingLabel : children}
      </Button>
    );
  },
);
