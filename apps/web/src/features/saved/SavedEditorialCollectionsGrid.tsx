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
// Home's teaser use — rather than inventing a third editorial-collection card look.
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
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {visible.map((collection, index) => (
        <li key={collection.id} className="relative h-[150px]">
          <CollectionCard collection={collection} priority={index === 0} className="collection-card" />
          <CollectionSaveHeart
            collectionId={collection.id}
            collectionSlug={collection.slug}
            collectionLabel={collection.name}
            initialSaved
            onSavedChange={(saved) => onUnsavedChange(collection.id, !saved)}
          />
        </li>
      ))}
    </ul>
  );
}
