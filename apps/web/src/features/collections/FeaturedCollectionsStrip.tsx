import type { CollectionDTO } from '@tennis/contracts';
import { CollectionCard } from './CollectionCard';

// FeaturedCollectionsStrip — the "Featured Collections" section of /collections.
//
// TASK_60 (v3): mobile strip scrolls at 200×240 as before (now with the arrow shown —
// `arrowOnMobile`); md+ becomes a 3-column, non-scrolling grid at 260px tall, matching
// the desktop prototype (`CollectionsScreen`, tennis_world_desktop_standalone4.html
// ~line 727). The featured count now follows the page (`collections.slice(0, 6)`):
// desktop shows all 6, mobile shows only the first 3 (items index ≥ 3 are `hidden
// md:block`), matching the mobile prototype's `COLLECTIONS.slice(0,3)`.
//
// THE SAVE HEART IS GONE (TASK_60 decision 4) — v3's Featured cards have no save
// control, only the decorative arrow. Every collection also appears in "Curated for
// You" below, which keeps a real, database-backed bookmark, so nothing here becomes
// unreachable.
//
// A PLAIN overflow-x row on mobile — no carousel/slider library. Same gutter treatment
// the Home strips use: the row sits INSIDE `.container-page` so its first card lines up
// with the section heading, `-mr-[...]` cancels only the RIGHT gutter so it still bleeds
// off the edge while scrolling, and a trailing (mobile-only) spacer keeps the last card
// off the viewport edge.
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary.
//
// PENDING STATES (CLAUDE.md §4 rule 1): each card navigates as a whole ⇒ `PendingCardLink`,
// inside `CollectionCard`.

export interface FeaturedCollectionsStripProps {
  /** The collections to feature — already sliced by the page (up to `FEATURED_MAX`). */
  collections: CollectionDTO[];
  title?: string;
}

const DEFAULT_TITLE = 'Featured Collections';

export function FeaturedCollectionsStrip({
  collections,
  title = DEFAULT_TITLE,
}: FeaturedCollectionsStripProps) {
  // An empty featured set renders nothing at all — never a bare heading over a void.
  if (collections.length === 0) return null;

  return (
    <section className="pt-6 md:pt-9">
      <div className="container-page mb-3">
        <h2 className="text-[16px] font-semibold leading-tight text-ink md:text-[17px]">{title}</h2>
      </div>

      <div className="container-page">
        <ul className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-3 overflow-x-auto pb-1 md:mr-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {collections.map((collection, index) => (
            <li
              key={collection.id}
              className={[
                'h-[240px] w-[200px] shrink-0 md:h-[260px] md:w-auto',
                index >= 3 ? 'hidden md:block' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <CollectionCard
                collection={collection}
                priority={index === 0}
                arrowOnMobile
                sizes="(max-width: 768px) 200px, 33vw"
                className="collection-card"
              />
            </li>
          ))}
          <li aria-hidden className="w-5 shrink-0 md:hidden" />
        </ul>
      </div>
    </section>
  );
}
