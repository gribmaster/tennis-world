// InlineSpinner — the ONE reusable pending-state spinner used across the app (buttons,
// cards, menu items, the Back button). Backed by the `.tw-spinner` CSS primitive in
// globals.css: a `currentColor` ring, CSS-animation only (no JS timers), sized in `em`s so
// it scales with the host's font-size. `prefers-reduced-motion` is handled entirely in CSS
// (the animation slows to a slow crawl instead of stopping dead, so it still reads as
// "busy" without being jarring).
//
// Carries `role="status"` + a visually-hidden label so screen readers announce the pending
// state even though the glyph itself is `aria-hidden`. The HOST control (button/card/link)
// is still responsible for `aria-busy`/`aria-disabled` — this component only renders the
// glyph + its accessible text.

export interface InlineSpinnerProps {
  /** Visually-hidden text announced to screen readers (defaults to "Loading…"). */
  label?: string;
  className?: string;
}

export function InlineSpinner({ label = 'Loading…', className }: InlineSpinnerProps) {
  return (
    <span role="status" className={['inline-flex items-center', className ?? ''].filter(Boolean).join(' ')}>
      <span aria-hidden className="tw-spinner" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
