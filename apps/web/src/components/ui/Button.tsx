import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

// Button — the design prompt's button variant table (§Buttons), realized against
// the `.btn-*` primitives in globals.css. Minimal on purpose: this is a shared
// shell primitive, not a design system. Variants:
//   primary    → ink bg / bone text — main CTAs
//   secondary  → outline ink — secondary actions
//   ghost      → transparent ink — tertiary links
//   over-image → outline paper — CTAs over photography
//   premium    → gold bg — RESERVED for the paywall only
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'over-image' | 'premium';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  'over-image': 'btn-over-image',
  premium: 'btn-premium',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Stretch to the container width (full-width mobile CTAs). */
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fullWidth = false, className, type, ...props },
  ref,
) {
  const classes = ['btn', VARIANT_CLASS[variant], fullWidth ? 'w-full' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return <button ref={ref} type={type ?? 'button'} className={classes} {...props} />;
});
