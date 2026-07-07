import type { ReactNode } from 'react';

// SectionHeader — the eyebrow + serif title pair used throughout the prototypes
// (design prompt §Section Header). The eyebrow and title are never separated. An
// optional `action` slot sits at the baseline on the right (e.g. a "View all" link).
//
// Content is passed in by the caller — this primitive owns layout/typography only,
// never literal copy (data-driven discipline, Phase 1 §4).
export interface SectionHeaderProps {
  /** Uppercase caption above the title, e.g. "DESTINATIONS". */
  eyebrow?: string;
  title: ReactNode;
  /** Optional right-aligned action, baseline-aligned with the title. */
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ eyebrow, title, action, className }: SectionHeaderProps) {
  return (
    <div
      className={['flex items-end justify-between gap-4', className ?? ''].filter(Boolean).join(' ')}
    >
      <div>
        {eyebrow ? <p className="eyebrow text-stone">{eyebrow}</p> : null}
        <h2 className="display-m mt-2 text-ink">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
