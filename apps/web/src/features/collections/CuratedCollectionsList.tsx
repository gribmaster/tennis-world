import type { CollectionDTO } from '@tennis/contracts';
import { CuratedCollectionCard } from './CuratedCollectionCard';
import { CollectionSaveHeart } from './CollectionSaveHeart';

// CuratedCollectionsList — the "Curated for You" section of /collections.
//
// TASK_60 (v3) SUPERSEDES Task 40's "look exactly like `SavedCollectionRow`" brief: this
// is now a list of v3 ROWS (`CuratedCollectionCard`), not a photo-tile grid — a single
// column on mobile, 2-up at md+ (desktop ~line 760, mobile ~line 1105 of the respective
// prototype files). Still every collection, not a sliced subset.
//
// ── SAVE / BOOKMARK CONTROL (Task 42, restyled TASK_60) ─────────────────────────────────
// `CollectionSaveHeart` renders `glyph="bookmark"` here (v3's `Ico.save`) in a small bone
// circle over the row's right edge — a REAL, database-backed bookmark
// (`POST/DELETE /v1/me/saved-collections`), never the prototype's inert button. It is a
// SIBLING of `CuratedCollectionCard`'s own `PendingCardLink`, not inside the card itself.
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary.
//
// PENDING STATES (CLAUDE.md §4 rule 1): each card navigates as a whole ⇒ `PendingCardLink`,
// inside CuratedCollectionCard. The bookmark is a database-backed action ⇒ the rule-2
// triad, inside `CollectionSaveHeart`.

export interface CuratedCollectionsListProps {
  collections: CollectionDTO[];
  title?: string;
  /** Ids of the editorial collections this visitor has already saved (Task 42). */
  savedCollectionIds: ReadonlySet<string>;
  /** False for a logged-out visitor in `api` mode → save hearts route to /signin. */
  signedIn?: boolean;
}

const DEFAULT_TITLE = 'Curated for You';

export function CuratedCollectionsList({
  collections,
  title = DEFAULT_TITLE,
  savedCollectionIds,
  signedIn = true,
}: CuratedCollectionsListProps) {
  // An empty list renders nothing — a heading with no rows under it is worse than no
  // section at all. The page decides what (if anything) an entirely empty screen says.
  if (collections.length === 0) return null;

  return (
    <section className="container-page pt-7 md:pt-12">
      <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink md:mb-4 md:text-[17px]">
        {title}
      </h2>

      <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3.5">
        {collections.map((collection) => (
          <li key={collection.id} className="relative">
            <CuratedCollectionCard collection={collection} />
            <CollectionSaveHeart
              collectionId={collection.id}
              collectionSlug={collection.slug}
              collectionLabel={collection.name}
              initialSaved={savedCollectionIds.has(collection.id)}
              signedIn={signedIn}
              glyph="bookmark"
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-pill bg-bone transition-colors disabled:opacity-60 md:right-3.5 md:h-9 md:w-9"
              idleColorClassName="text-ink hover:text-saved"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
