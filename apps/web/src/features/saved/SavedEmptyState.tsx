import Link from 'next/link';

// SavedEmptyState — the shared "beautiful, not a dead-end" empty state for each
// Saved tab (Phase 1 §3.9 / FEATURE_19 §3.4). PRESENTATIONAL only: all copy and the
// CTA target arrive via props — no repository, no @tennis/mock-data.
//
// The headline/subline/CTA strings are page chrome supplied by the caller (the tab
// components), not domain data, so this primitive owns layout/typography only.

export interface SavedEmptyStateProps {
  /** Serif headline, e.g. "No saved courts yet." */
  title: string;
  /** Supporting line beneath the headline. */
  description: string;
  /** Optional CTA back into discovery. */
  cta?: { href: string; label: string };
}

export function SavedEmptyState({ title, description, cta }: SavedEmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-5 py-section-xl text-center">
      <h2 className="display-m text-ink">{title}</h2>
      <p className="body-l mt-3 max-w-[420px] text-stone">{description}</p>
      {cta ? (
        <Link href={cta.href} className="btn btn-secondary mt-8">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
