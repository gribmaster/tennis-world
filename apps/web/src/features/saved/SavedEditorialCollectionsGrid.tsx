import type { CollectionDTO } from '@tennis/contracts';
import { CollectionCard, CollectionSaveHeart } from '@/features/collections';

// SavedEditorialCollectionsGrid — the "Saved Collections" section of the Saved page's
// Collections tab (Task 42): the editorial `CollectionDTO`s this visitor has bookmarked
// via the heart control, as distinct from `SavedCollectionsGrid` below it on the same tab
// (the visitor's OWN wishlist folders, `UserCollectionDTO[]`).
//
// Mirrors `SavedCourtsGrid.tsx`'s STRUCTURE — lifted optimistic-unsave state via
// `unsavedIds`/`onUnsavedChange` props (owned by `SavedTabs`, so the tab's "N saved" count
// and this grid can never disagree the moment a card is unsaved) — but NOT its unsave
// CONTROL: there is no separate "X" button here. The `CollectionSaveHeart` sibling IS the
// unsave control (clicking a filled heart unsaves, exactly like every other heart in the
// product); its own internal pending/rollback/finally triad (CLAUDE.md §4 rule 2/7) drives
// the write, and its `onSavedChange` callback reports the toggle up to `onUnsavedChange` so
// the card disappears from this list the moment it's unsaved (optimistically), rolling back
// on failure — the same guarantee `SavedCourtsGrid` gives with its own local pending state.
//
// CARD REUSE: renders `CollectionCard` — the SAME card `/collections`' Featured strip and
// Home's teaser use — rather than inventing a third editorial-collection card look, with
// its `compact` prop (TASK_61) so the tile matches `SavedCollectionRow`'s 150/200px height
// and type scale. The save control is the v3 bookmark (`glyph="bookmark"`), coral once
// saved, bone while idle (TASK_61 decision 7).
//
// EMPTY STATE: renders nothing when the visible list is empty (no bare heading over a
// void), matching `FeaturedCollectionsStrip`/`CuratedCollectionsList`'s own rule. The
// section heading lives in the parent (`SavedTabs`), which only renders it alongside a
// non-empty grid.

export interface SavedEditorialCollectionsGridProps {
  collections: CollectionDTO[];
  /**
   * Ids optimistically unsaved so far, owned by `SavedTabs`. The visible list is
   * `collections` MINUS these — lifted for the same reason `SavedCourtsGrid.unsavedIds` is:
   * the tab's "N saved" count is rendered by the parent.
   */
  unsavedIds: ReadonlySet<string>;
  /** Apply an optimistic unsave (true) or roll one back (false) in the parent's state. */
  onUnsavedChange: (collectionId: string, unsaved: boolean) => void;
}

export function SavedEditorialCollectionsGrid({
  collections,
  unsavedIds,
  onUnsavedChange,
}: SavedEditorialCollectionsGridProps) {
  const visible = collections.filter((collection) => !unsavedIds.has(collection.id));

  if (visible.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
      {visible.map((collection, index) => (
        <li key={collection.id} className="relative h-[150px] md:h-[200px]">
          <CollectionCard
            collection={collection}
            priority={index === 0}
            className="collection-card"
            compact
            sizes="(max-width: 768px) 50vw, 33vw"
          />
          <CollectionSaveHeart
            collectionId={collection.id}
            collectionSlug={collection.slug}
            collectionLabel={collection.name}
            initialSaved
            onSavedChange={(saved) => onUnsavedChange(collection.id, !saved)}
            glyph="bookmark"
            size={14}
            className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-pill bg-ink/45 backdrop-blur-[8px] md:right-2.5 md:top-2.5 md:h-8 md:w-8"
            idleColorClassName="text-bone"
          />
        </li>
      ))}
    </ul>
  );
}
