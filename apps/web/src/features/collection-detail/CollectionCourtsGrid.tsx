import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { CourtCard } from '@/components/court';

// CollectionCourtsGrid — the body of the Collection Detail page: a section header
// over a responsive grid of the courts in this collection. Mirrors the court-grid
// treatment in files/collections.html, but reuses the shared CourtCard (no
// re-implementation) exactly like the Court Detail "related courts" grid.
//
// PRESENTATIONAL & data-driven: it renders the `courts` it is handed and never
// fetches. Includes an empty state for collections that resolve to no courts.

export interface CollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  /** Eyebrow above the grid. */
  eyebrow?: string;
  /** Title above the grid. */
  title?: string;
}

export function CollectionCourtsGrid({
  courts,
  eyebrow = 'In this collection',
  title = 'The courts',
}: CollectionCourtsGridProps) {
  return (
    <section className="bg-bone py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader eyebrow={eyebrow} title={title} />

        {courts.length === 0 ? (
          <p className="body-m mt-section text-stone">
            No courts in this collection yet — check back soon.
          </p>
        ) : (
          <ul className="mt-section grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
