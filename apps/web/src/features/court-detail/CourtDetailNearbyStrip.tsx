import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { courtDisplay } from '@/components/court/court-display';

// CourtDetailNearbyStrip — the "Nearby courts" horizontal card row
// (design_v2_stripped.html:1127–1152): 120px-wide cards, a 90px-tall image with an 8px
// radius, the premium badge over a locked court's image, then the name and a secondary
// line beneath.
//
// NO DISTANCE IS RENDERED — this is the one deliberate divergence from the prototype, and
// it is a correctness decision, not a styling one. The prototype's "3 km / 12 km / 28 km /
// 45 km" are hardcoded literals (`{[3,12,28,45][i]}`, line 1147). In the real data the only
// coordinates a public page may read are `approxLat`/`approxLng`, which are DELIBERATELY
// jittered by roughly 10 km — that jitter is the mechanism protecting the paid product. A
// "3 km" computed from a ±10 km value would be wrong by more than the number itself, and,
// printed inches from the paywall, would misrepresent what a membership actually buys. The
// exact coordinates that could answer the question are entitlement-gated server-side and
// are never fetched for a LIST of courts.
//
// WHAT REPLACED IT: the court's own country · region, the same "location line" every other
// card surface in the app uses. It is honest, always present, and it is the field the
// related-courts scoring already keys off.
//
// SOURCE: `getRelated()` (`GET /v1/courts/:slug/related`), already fetched by page.tsx and
// scored by shared country and surface — an editorial adjacency, not a geographic one. The
// section heading says "Nearby courts" per the prototype; the cards make no distance claim.
//
// LOCKED CARDS reuse `courtDisplay` — the same "Premium Court" / "Unlock to reveal
// location" PRESENTATION rule the Home cards apply, derived from the public `isLocked`
// field. No entitlement check happens here and no coordinate reaches this component.
//
// The whole card navigates ⇒ `PendingCardLink` (CLAUDE.md §4 rule 1).

function LockGlyph() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export interface CourtDetailNearbyStripProps {
  /** Related courts from `getRelated()`. Empty ⇒ the section is not rendered by the page. */
  courts: CourtSummaryDTO[];
}

export function CourtDetailNearbyStrip({ courts }: CourtDetailNearbyStripProps) {
  if (courts.length === 0) return null;

  return (
    <ul className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-[2px] md:px-0">
      {courts.map((court) => {
        const display = courtDisplay(court);
        return (
          <li key={court.id} className="w-[120px] shrink-0">
            <PendingCardLink
              href={`/courts/${court.slug}`}
              ariaLabel={display.name}
              className="block"
            >
              <span className="relative block h-[90px] w-full overflow-hidden rounded-md">
                <Image
                  src={court.heroImageUrl}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                {display.locked ? (
                  <span className="absolute inset-0 flex items-start bg-ink/30 p-1.5">
                    {/* `.premium-badge` (prototype line 138) — the existing gold token. */}
                    <span className="inline-flex items-center gap-1 rounded-pill bg-gold px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.08em] text-paper">
                      <LockGlyph />
                      Premium
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block truncate text-[12px] font-medium leading-[1.2] text-ink">
                {display.name}
              </span>
              {/* Country · region — what stands in for the prototype's fake kilometres. */}
              <span className="mt-0.5 block truncate text-[11px] text-stone">
                {display.location}
              </span>
            </PendingCardLink>
          </li>
        );
      })}
    </ul>
  );
}
