import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';
import { UserCollectionCourtSaveHeart } from './UserCollectionCourtSaveHeart';
import { UserCollectionEmptyState } from './UserCollectionEmptyState';

// UserCollectionCourtsGrid — the body of the user wishlist-folder detail page: a
// responsive grid of the member courts, or an empty state when the folder has none.
//
// Task 48 RESTYLE: mirrors `CollectionCourtsGrid.tsx`'s (Task 47) Featured-style card —
// the same 2:3 tile, bottom gradient, gold "Premium" ribbon and category tags as
// `HomeFeaturedCourts.tsx` — with a real, database-backed `UserCollectionCourtSaveHeart`
// (screen-local, per the established one-heart-per-feature-folder convention — see that
// component's own header comment). The one difference from the editorial grid: this page
// (`/saved/collections/[slug]`) already redirects a logged-out visitor via `loadOrSignIn`
// before it renders, so every render has a real signed-in viewer — no `signedIn` prop is
// threaded through here; the heart's own `signedIn = true` default is always correct.
//
// PRESENTATIONAL & data-driven: renders the `courts`/`savedCourtIds` it is handed; never
// fetches.
//
// NOT IMPLEMENTED (deferred): the prototype's per-card "Remove from collection" button
// is a membership mutation and is intentionally omitted here — this task only adds the
// SAVE/UNSAVE-COURT heart; removing a court from this folder is a different, still-unbuilt
// action.

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

export interface UserCollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each heart). */
  savedCourtIds: string[];
}

export function UserCollectionCourtsGrid({
  courts,
  viewerIsEntitled = false,
  savedCourtIds,
}: UserCollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

  return (
    <section className="bg-bone pb-section-lg pt-section md:pb-section-xl min-h-[70vh]">
      <PageContainer>
        {courts.length === 0 ? (
          <UserCollectionEmptyState />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  <UserCollectionCourtSaveHeart
                    courtId={court.id}
                    courtSlug={court.slug}
                    courtLabel={display.name}
                    initialSaved={savedSet.has(court.id)}
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
