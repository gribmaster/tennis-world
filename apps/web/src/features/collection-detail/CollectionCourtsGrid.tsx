import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';
import { CollectionCourtSaveHeart } from './CollectionCourtSaveHeart';

// CollectionCourtsGrid — the body of the Collection Detail page: a section header over a
// responsive grid of the courts in this collection.
//
// Task 47 RESTYLE: this grid used to reuse the shared `CourtCard` with a visual-only
// heart. It now re-implements the Featured-style card locally instead — the same 2:3
// tile, bottom gradient, gold "Premium" ribbon and category tags as
// `HomeFeaturedCourts.tsx` — with a real, database-backed `CollectionCourtSaveHeart`
// (screen-local, per the established one-heart-per-feature-folder convention — see that
// component's own header comment). `CourtCard` stays as-is for `MapCourtList` and the
// personal-folder detail grid; this screen no longer imports it.
//
// PRESENTATIONAL & data-driven: it renders the `courts`/`savedCourtIds`/`signedIn` it is
// handed and never fetches. Includes an empty state for collections that resolve to no
// courts.

/** Small lock glyph for the premium ribbon (verbatim from HomeFeaturedCourts.tsx). */
function LockGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export interface CollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  /** Eyebrow above the grid. */
  eyebrow?: string;
  /** Title above the grid. */
  title?: string;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each heart). */
  savedCourtIds: string[];
  /** False for a logged-out visitor in `api` mode → hearts route to /signin. */
  signedIn: boolean;
}

export function CollectionCourtsGrid({
  courts,
  eyebrow = 'In this collection',
  title = 'The courts',
  viewerIsEntitled = false,
  savedCourtIds,
  signedIn,
}: CollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

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
            {courts.map((court, i) => {
              const display = courtDisplay(court, viewerIsEntitled);
              return (
                <li key={court.id} className="relative">
                  <PendingCardLink
                    href={`/courts/${court.slug}`}
                    ariaLabel={display.name}
                    className="block aspect-[2/3] overflow-hidden rounded-[14px]"
                  >
                    <Image
                      src={court.heroImageUrl}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                    {/* `.img-overlay` — the same gradient the v2 cards use. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
                      }}
                    />

                    {display.locked ? (
                      <span
                        className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-caption text-paper"
                        style={{ background: 'linear-gradient(135deg,#C8A860,#B89968)' }}
                      >
                        <LockGlyph />
                        Premium
                      </span>
                    ) : null}

                    <span className="absolute inset-x-0 bottom-0 block px-3.5 pb-4 pt-5">
                      <span className="mb-2 flex flex-wrap gap-1.5">
                        {courtCategoryTags(court).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-1 text-[11px] font-medium tracking-[0.03em] text-paper backdrop-blur-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                      <span className="serif mb-[5px] block text-[20px] font-normal leading-tight text-paper">
                        {display.name}
                      </span>
                      <span className="block text-[13px] text-paper/70">
                        {display.location}
                      </span>
                    </span>
                  </PendingCardLink>

                  {/* Sibling overlay — the save mutation, never the card's navigation. */}
                  <CollectionCourtSaveHeart
                    courtId={court.id}
                    courtSlug={court.slug}
                    courtLabel={display.name}
                    initialSaved={savedSet.has(court.id)}
                    signedIn={signedIn}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PageContainer>
    </section>
  );
}
