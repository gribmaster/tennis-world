import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { CourtCard } from '@/components/court';
import { UserCollectionEmptyState } from './UserCollectionEmptyState';

// UserCollectionCourtsGrid — the body of the user wishlist-folder detail page: a
// responsive grid of the member courts, or an empty state when the folder has none.
// Reuses the shared CourtCard (no re-implementation) exactly like the editorial
// CollectionCourtsGrid and the Court Detail "related" strip.
//
// PRESENTATIONAL & data-driven: renders the `courts` it is handed; never fetches.
//
// NOT IMPLEMENTED (deferred): the prototype's per-card "Remove from collection" button
// is a membership mutation and is intentionally omitted here — this is the read path
// only (no remove handler, no client state).

export interface UserCollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
}

export function UserCollectionCourtsGrid({ courts }: UserCollectionCourtsGridProps) {
  return (
    <section className="bg-bone pb-section-lg pt-section md:pb-section-xl">
      <PageContainer>
        {courts.length === 0 ? (
          <UserCollectionEmptyState />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courts.map((court, i) => (
              <li key={court.id}>
                <CourtCard court={court} href={`/courts/${court.slug}`} priority={i === 0} />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </section>
  );
}
