import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';

// CollectionCourtsGrid — the "Courts in this collection" section of Collection Detail.
//
// TASK_60 (v3): drops `PageContainer`/`SectionHeader` (only this page used the
// eyebrow/title pair) for a plain `<h2>`, matching the v3 heading treatment every other
// section on this screen uses. Grid is 1-up mobile / 2-up desktop — the same columns as
// the Courts screen's `MapCourtGrid`. Still the shared v3 `CourtCard` (TASK_56), unchanged
// props.
//
// PRESENTATIONAL & data-driven: it renders the `courts`/`savedCourtIds`/`signedIn` it is
// handed and never fetches. Includes an empty state for collections that resolve to no
// courts.

export interface CollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each card's save button). */
  savedCourtIds: string[];
  /** False for a logged-out visitor in `api` mode → the save button shows the guest tooltip. */
  signedIn: boolean;
}

export function CollectionCourtsGrid({
  courts,
  viewerIsEntitled = false,
  savedCourtIds,
  signedIn,
}: CollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

  return (
    <section className="px-5 md:px-0 md:mt-9">
      <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink md:mb-4 md:text-[17px]">
        Courts in this collection
      </h2>

      {courts.length === 0 ? (
        <p className="body-m text-stone">No courts in this collection yet — check back soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-[18px]">
          {courts.map((court, i) => (
            <li key={court.id}>
              <CourtCard
                court={court}
                viewerIsEntitled={viewerIsEntitled}
                priority={i === 0}
                imageSizes="(max-width: 768px) 100vw, 430px"
                save={{ initialSaved: savedSet.has(court.id), signedIn }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
