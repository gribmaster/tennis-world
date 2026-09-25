import type { CollectionDTO } from '@tennis/contracts';
import { CollectionCard } from './CollectionCard';
import { CollectionSaveHeart } from './CollectionSaveHeart';

// FeaturedCollectionsStrip — the "Featured Collections" section of /collections
// (Feature 76), rebuilt from the prototype's CollectionsScreen
// (tennis_world_v2_standalone.html:1304–1330).
//
// Prototype geometry, from the file:
//   • section `padding:'24px 0 0'` (line 1305); heading `fontSize:16, fontWeight:600` at
//     the 20px gutter with `marginBottom:12` (lines 1306–1308).
//   • strip: `.h-scroll` at `gap:12`, `padding:'0 20px'` (line 1309).
//   • card: `width:200, height:240` (line 1310) — supplied here so CollectionCard can
//     fill its slot and stay reusable at other sizes.
//
// A PLAIN overflow-x row — no carousel or slider library (hard rule). The same gutter
// treatment the Home strips use (Feature 74): the row sits INSIDE `.container-page` so its
// first card lines up with the section heading at every width, `-mr-[...]` cancels only the
// RIGHT gutter so the row still bleeds off the edge as it scrolls, and a trailing spacer
// keeps the last card off the viewport edge.
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary.
//
// PENDING STATES (CLAUDE.md §4 rule 1): each card navigates as a whole ⇒ `PendingCardLink`,
// inside CollectionCard. The save heart is a database-backed action ⇒ the rule-2 triad,
// inside `CollectionSaveHeart` — a SIBLING of the card link, never a PendingButton.

export interface FeaturedCollectionsStripProps {
  /** The collections to feature — already sliced by the page. */
  collections: CollectionDTO[];
  title?: string;
  /** Ids of the editorial collections this visitor has already saved (Task 42). */
  savedCollectionIds: ReadonlySet<string>;
  /** False for a logged-out visitor in `api` mode → save hearts route to /signin. */
  signedIn?: boolean;
}

const DEFAULT_TITLE = 'Featured Collections';

export function FeaturedCollectionsStrip({
  collections,
  title = DEFAULT_TITLE,
  savedCollectionIds,
  signedIn = true,
}: FeaturedCollectionsStripProps) {
  // An empty featured set renders nothing at all — never a bare heading over a void.
  if (collections.length === 0) return null;

  return (
    <section className="pt-6">
      <div className="container-page mb-3">
        <h2 className="text-[16px] font-semibold leading-tight text-ink">{title}</h2>
      </div>

      <div className="container-page">
        <ul className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-3 overflow-x-auto pb-1">
          {collections.map((collection, index) => (
            <li key={collection.id} className="relative h-[240px] w-[200px] shrink-0">
              <CollectionCard collection={collection} priority={index === 0} className="collection-card" />
              <CollectionSaveHeart
                collectionId={collection.id}
                collectionSlug={collection.slug}
                collectionLabel={collection.name}
                initialSaved={savedCollectionIds.has(collection.id)}
                signedIn={signedIn}
              />
            </li>
          ))}
          <li aria-hidden className="w-5 shrink-0" />
        </ul>
      </div>
    </section>
  );
}
