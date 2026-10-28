import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { CourtCard } from '@/components/court';
import { UserCollectionEmptyState } from './UserCollectionEmptyState';

// UserCollectionCourtsGrid — the body of the user wishlist-folder detail page: a
// responsive grid of the member courts, or an empty state when the folder has none.
//
// TASK_56 (v3): swaps the screen-local Featured-style card + `UserCollectionCourtSaveHeart`
// (Task 48) for the shared v3 `CourtCard` — see "Card reuse: one CourtCard, everywhere"
// in docs/TASK_56_V3_SHARED_COURT_CARD.md. This page (`/saved/collections/[slug]`) already
// redirects a logged-out visitor via `loadOrSignIn` before it renders, so every render has
// a real signed-in viewer — the card's `save.signedIn` is always `true` here.
//
// TASK_61: grid is 1-up on mobile, 2 at md+, 3 at lg (the shared `CourtCard` is sized for
// 1-up on mobile, TASK_56) — replaces the old 2/3/4-column grid.
//
// PRESENTATIONAL & data-driven: renders the `courts`/`savedCourtIds` it is handed; never
// fetches.
//
// NOT IMPLEMENTED (deferred): the prototype's per-card "Remove from collection" button
// is a membership mutation and is intentionally omitted here — this task only adds the
// SAVE/UNSAVE-COURT button; removing a court from this folder is a different, still-unbuilt
// action.

export interface UserCollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each card's save button). */
  savedCourtIds: string[];
}

export function UserCollectionCourtsGrid({
  courts,
  viewerIsEntitled = false,
  savedCourtIds,
}: UserCollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

  return (
    <section className="bg-bone pb-section-lg pt-6 md:pb-section-xl md:pt-8 min-h-[70vh]">
      <PageContainer>
        {courts.length === 0 ? (
          <UserCollectionEmptyState />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {courts.map((court, i) => (
              <li key={court.id}>
                <CourtCard
                  court={court}
                  viewerIsEntitled={viewerIsEntitled}
                  priority={i === 0}
                  imageSizes="(max-width: 768px) 100vw, 33vw"
                  save={{ initialSaved: savedSet.has(court.id), signedIn: true }}
                />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </section>
  );
}
