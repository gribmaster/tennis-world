import type { CollectionDTO } from '@tennis/contracts';
import { CuratedCollectionCard } from './CuratedCollectionCard';
import { CollectionSaveHeart } from './CollectionSaveHeart';

// CuratedCollectionsList — the "Curated for You" section of /collections (Feature 76).
//
// Renders as a responsive card grid, matching `SavedCollectionsGrid.tsx`'s own grid
// breakpoints (2 cols mobile → 3 → 4 desktop) — the "looks like Saved collections" result
// the user asked for. Each cell is a `CuratedCollectionCard`, a small sibling component
// that reproduces `SavedCollectionRow`'s (Saved → Collections tab) exact markup/classes for
// a `CollectionDTO` — NOT `SavedCollectionRow` itself, which is typed for
// `UserCollectionDTO` (the visitor's OWN wishlist folders) and documents in its own file
// header that it is not built for editorial collections. See `CuratedCollectionCard.tsx`
// for the full reasoning and the two deliberate departures from `SavedCollectionRow`
// (link target, no description line).
//
// ── SAVE / BOOKMARK CONTROL (Task 42) ───────────────────────────────────────────────────
// Bookmarking an editorial collection is now a real, database-backed feature (`SavedCollection`
// model, `POST/DELETE /v1/me/saved-collections`). The heart is rendered here, as a SIBLING of
// `CuratedCollectionCard`'s own `PendingCardLink`, not inside the card itself — see
// `CollectionSaveHeart.tsx` for the full behaviour and `CuratedCollectionCard.tsx`'s header
// for why the card itself stays unmodified.
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary.
//
// PENDING STATES (CLAUDE.md §4 rule 1): each card navigates as a whole ⇒ `PendingCardLink`,
// inside CuratedCollectionCard. The save heart is a database-backed action ⇒ the rule-2
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
  // An empty list renders nothing — a heading with no cards under it is worse than no
  // section at all. The page decides what (if anything) an entirely empty screen says.
  if (collections.length === 0) return null;

  return (
    <section className="container-page pt-7">
      <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink">{title}</h2>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {collections.map((collection) => (
          <li key={collection.id} className="relative">
            <CuratedCollectionCard collection={collection} />
            <CollectionSaveHeart
              collectionId={collection.id}
              collectionSlug={collection.slug}
              collectionLabel={collection.name}
              initialSaved={savedCollectionIds.has(collection.id)}
              signedIn={signedIn}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
