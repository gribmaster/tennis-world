import Link from 'next/link';
import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';

// MapCourtRow — the desktop list-panel row, ported from the `.map-rows` markup in
// files/map.html: a small left thumbnail + stacked eyebrow (country · region) /
// serif name / `surface · setting` sub-line, with a lock glyph on locked courts.
//
// CourtCard (the portrait tile) does not express this horizontal-thumbnail row, so
// this small feature-local row exists for the desktop layout (Feature 13 §4). It is
// PRESENTATIONAL & data-driven: it renders from a `CourtSummaryDTO` only and links
// the whole row to `/courts/{slug}`.

function LockGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export interface MapCourtRowProps {
  court: CourtSummaryDTO;
}

export function MapCourtRow({ court }: MapCourtRowProps) {
  return (
    <Link
      href={`/courts/${court.slug}`}
      className="flex items-start gap-3.5 border-b border-hairline px-5 py-4 transition-colors hover:bg-ivory"
    >
      <div className="relative h-[60px] w-20 shrink-0 overflow-hidden">
        <Image
          src={court.heroImageUrl}
          alt={court.name}
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-stone">
          {[court.country, court.region].filter(Boolean).join(' · ')}
        </p>
        <p className="serif mt-0.5 truncate text-[17px] font-medium leading-tight">{court.name}</p>
        <p className="body-s mt-1 text-stone">
          {[court.surface, court.setting].filter(Boolean).join(' · ')}
        </p>
      </div>
      {court.isLocked ? (
        <span className="mt-1 shrink-0 text-stone">
          <LockGlyph />
        </span>
      ) : null}
    </Link>
  );
}
