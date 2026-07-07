import type { CollectionDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { CollectionCard } from './CollectionCard';

// CollectionsGrid — the body of the Collections page: an optional section header
// over a responsive grid of CollectionCards, ported from the collections grid in
// files/collections.html (`repeat(auto-fill, minmax(260px, 1fr))`, gap 20, 3:2
// cover cards).
//
// PRESENTATIONAL & data-driven: it renders the `collections` it is handed and never
// fetches. The grid is mobile-first (1 col) and fills to as many ~260px columns as
// fit on larger screens.

export interface CollectionsGridProps {
  collections: CollectionDTO[];
  /** Optional eyebrow above the grid. */
  eyebrow?: string;
  /** Optional title above the grid. */
  title?: string;
}

export function CollectionsGrid({
  collections,
  eyebrow = 'The atlas',
  title = 'Every collection',
}: CollectionsGridProps) {
  return (
    <section className="bg-bone py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader eyebrow={eyebrow} title={title} />

        {collections.length === 0 ? (
          <p className="body-m mt-section text-stone">No collections to show yet.</p>
        ) : (
          <ul className="mt-section grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection, i) => (
              <li key={collection.id}>
                <CollectionCard collection={collection} priority={i === 0} />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </section>
  );
}
