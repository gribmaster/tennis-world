import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { courtCardLabels, courtDisplay } from './court-display';
import { CourtCardSaveButton } from './CourtCardSaveButton';
import { SurfaceChip } from './SurfaceChip';
import { PremiumBadge } from './PremiumBadge';

// CourtCard — the ONE shared court tile (v3 "Card reuse: one CourtCard, everywhere" rule
// — see docs/TASK_56_V3_SHARED_COURT_CARD.md and tennis_world_design_decisions.md). Every
// screen that lists courts (Collection Detail, a personal folder, Saved) composes THIS
// component with different props. There is deliberately no second near-duplicate card —
// the "one heart/card per screen" convention from Tasks 47/48 is superseded by v3.
//
// Ported from both v3 prototypes' `CourtCard` (identical apart from the sizes below):
//   • mobile:  tennis_world_v17_standalone.html ~line 916
//   • desktop: tennis_world_desktop_standalone4.html ~line 212
//
// Strictly data-driven & presentational apart from the save button:
//   • Receives a `CourtSummaryDTO` via the `court` prop — it does NOT import
//     @tennis/mock-data, does NOT import any repository, and does NOT fetch.
//   • The whole card is a `PendingCardLink` to `/courts/{slug}`; the save button is a
//     SIBLING of that link (never nested inside it — a <button> inside an <a> would also
//     be invalid HTML), positioned over its top-right corner.
//
// MASKING (Task 56): driven entirely off `courtDisplay(...).masked` — see that module's
// doc comment. A masked court shows the gold `PremiumBadge` (not the surface chip),
// "Premium Court" / "Unlock to reveal location", and renders no label chips.
//
// SIZE: fixed height (170px below md, 340px at md+), NOT an aspect ratio — this is what
// v3 does, so a narrow grid column doesn't stretch the photo tall.

export interface CourtCardProps {
  court: CourtSummaryDTO;
  /** Whether THIS viewer carries an active (non-free) membership (Task 26). */
  viewerIsEntitled?: boolean;
  /** Omit to render no save button at all. */
  save?: {
    initialSaved: boolean;
    signedIn: boolean;
    onSavedChange?: (saved: boolean) => void;
  };
  /** next/image `sizes`; default matches a 3-up/1-up responsive grid. */
  imageSizes?: string;
  /** next/image priority for the first card in a list. */
  priority?: boolean;
  className?: string;
}

/** The prototype's `Ico.pin(11)` beside the location line. */
function PinGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function CourtCard({
  court,
  viewerIsEntitled = false,
  save,
  imageSizes = '(max-width: 768px) 100vw, 33vw',
  priority = false,
  className,
}: CourtCardProps) {
  const display = courtDisplay(court, viewerIsEntitled);
  const labels = display.masked ? [] : courtCardLabels(court).slice(0, 3);

  return (
    <div className={['relative', className ?? ''].filter(Boolean).join(' ')}>
      <PendingCardLink
        href={`/courts/${court.slug}`}
        ariaLabel={display.name}
        className="relative block h-[170px] overflow-hidden rounded-[14px] md:h-[340px]"
      >
        <Image
          src={court.heroImageUrl}
          alt=""
          fill
          priority={priority}
          sizes={imageSizes}
          className="object-cover"
        />

        {/* `.img-overlay` — transparent to 40%, then to 72% black. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
          }}
        />

        {/* Top-left: Premium badge when masked, else the surface chip. */}
        <span className="absolute left-2.5 top-2.5 md:left-3 md:top-3">
          {display.masked ? <PremiumBadge /> : <SurfaceChip surface={court.surface} size="sm" />}
        </span>

        <span className="absolute inset-x-0 bottom-0 block px-3.5 pb-3.5 pt-4 md:px-4 md:pb-4 md:pt-[18px]">
          <span className="serif mb-1 block text-[19px] font-normal leading-[1.2] text-paper md:mb-[5px] md:text-[21px]">
            {display.name}
          </span>
          <span className="mb-2 flex items-center gap-[5px] text-paper/85 md:mb-[9px]">
            <PinGlyph />
            <span className="text-[12px]">{display.location}</span>
          </span>

          {labels.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-[3px] text-[11px] font-medium text-paper backdrop-blur-sm"
                >
                  {label}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </PendingCardLink>

      {save ? (
        <CourtCardSaveButton
          courtId={court.id}
          courtSlug={court.slug}
          courtLabel={display.name}
          initialSaved={save.initialSaved}
          signedIn={save.signedIn}
          onSavedChange={save.onSavedChange}
        />
      ) : null}
    </div>
  );
}
