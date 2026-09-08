import { PendingLink } from '@/components/navigation';

// SavedEmptyState — the shared "beautiful, not a dead-end" empty state for each Saved tab
// (Phase 1 §3.9 / FEATURE_19 §3.4), RESTYLED for v2 (Feature 77), not duplicated: all three
// tabs still reach this one component, and unsaving the last court still lands here rather
// than on an empty stack.
//
// v2 changes are visual only: the vertical rhythm comes down from `py-section-xl` (80px) to
// the tighter spacing the prototype's cards sit in, the headline drops from `display-m` to
// the serif 22px the v2 cards use, and the CTA adopts the compact `btn` sizing the rest of
// the redesign uses (height/padding utilities on the existing `.btn` variants — no new
// button system, CLAUDE.md §9). Copy, props and the CTA target are unchanged.
//
// PRESENTATIONAL only: all copy and the CTA target arrive via props — no repository, no
// @tennis/mock-data. The headline/subline/CTA strings are page chrome supplied by the
// caller (the tab components), not domain data, so this primitive owns layout/typography.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the CTA navigates ⇒ `PendingLink`.

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
    <div className="flex flex-col items-center rounded-lg border border-mist/30 bg-ivory px-5 py-12 text-center">
      <h2 className="serif text-[22px] font-normal leading-[1.15] text-ink">{title}</h2>
      <p className="mt-2 max-w-[380px] text-[13px] leading-[1.5] text-stone">{description}</p>
      {cta ? (
        <PendingLink href={cta.href} className="btn btn-primary mt-6 h-10 px-5 text-[11px]">
          {cta.label}
        </PendingLink>
      ) : null}
    </div>
  );
}
