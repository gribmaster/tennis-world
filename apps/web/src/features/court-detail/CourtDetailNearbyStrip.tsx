import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { courtDisplay } from '@/components/court/court-display';
import { PremiumBadge } from '@/components/court/PremiumBadge';

// CourtDetailNearbyStrip — the "Nearby courts" horizontal card row
// (design_v2_stripped.html:1127–1152): 210px-wide cards, a 158px-tall image (4:3, TASK 37
// scaled 1.75× from the prototype's 120×90) with an 8px radius, the premium badge over a
// locked court's image, then the name and a secondary line beneath.
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
//
// TASK_59 (v3): resized from TASK 37's "match the Gallery thumbnail" rule (210×158) down
// to the prototypes' own card sizes — 120×90 mobile, 140×100 desktop — and swapped the
// inline gold badge for the shared `PremiumBadge` (TASK_56). The full-image dim overlay
// on a locked card stays at mobile (the prototype's own treatment there) but drops at
// md+, where the desktop prototype shows the badge alone with no dimming.

export interface CourtDetailNearbyStripProps {
  /** Related courts from `getRelated()`. Empty ⇒ the section is not rendered by the page. */
  courts: CourtSummaryDTO[];
  /**
   * Whether THIS viewer carries an active membership (Task 26). Court Detail already
   * computes real, per-viewer entitlement for the court being viewed (`locked`, derived
   * from the protected exact-location call) — the page passes that straight through
   * rather than resolving membership separately. See `app/courts/[slug]/page.tsx`.
   */
  viewerIsEntitled?: boolean;
}

export function CourtDetailNearbyStrip({
  courts,
  viewerIsEntitled = false,
}: CourtDetailNearbyStripProps) {
  if (courts.length === 0) return null;

  return (
    <ul className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-[2px] md:gap-3.5 md:px-0">
      {courts.map((court) => {
        const display = courtDisplay(court, viewerIsEntitled);
        return (
          <li key={court.id} className="w-[120px] shrink-0 md:w-[140px]">
            <PendingCardLink
              href={`/courts/${court.slug}`}
              ariaLabel={display.name}
              className="block"
            >
              <span className="relative block h-[90px] w-full overflow-hidden rounded-[8px] md:h-[100px] md:rounded-[10px]">
                <Image
                  src={court.heroImageUrl}
                  alt=""
                  fill
                  sizes="140px"
                  className="object-cover"
                />
                {display.locked ? (
                  // Dim overlay stays at mobile (the prototype's own locked-card
                  // treatment there); drops at md+, where the badge alone is the teaser.
                  <span className="absolute inset-0 flex items-start bg-ink/30 p-1.5 md:bg-transparent">
                    <PremiumBadge />
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block truncate text-[12px] font-medium leading-[1.2] text-ink md:text-[13px]">
                {display.name}
              </span>
              {/* Country · region — what stands in for the prototype's fake kilometres. */}
              <span className="mt-0.5 block truncate text-[13px] text-stone md:text-[11px]">
                {display.location}
              </span>
            </PendingCardLink>
          </li>
        );
      })}
    </ul>
  );
}
