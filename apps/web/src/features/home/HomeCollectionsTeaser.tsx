import type { CollectionDTO } from '@tennis/contracts';
import { PendingLink } from '@/components/navigation';
import { HScrollArrows } from '@/components/ui';
import { CollectionCard, CollectionSaveHeart } from '@/features/collections';

// HomeCollectionsTeaser — the v2 collections strip (Feature 74), rebuilt from the
// prototype's HomeScreen (design_v2_stripped.html:577–600).
//
// Prototype geometry, from the file:
//   • section `padding:'28px 0 0'` (line 578); `.sec-hdr` at the 20px gutter, serif 20px
//     title, 13px stone "View all" (lines 579–582).
//   • strip: `.h-scroll` at `gap:12`, `padding:'0 0 4px 20px'`, closed by a 20px spacer
//     (lines 584, 596).
//   • card slot: `width:calc(45vw)`, `maxWidth:190`, `minWidth:150`, `aspectRatio:'3/4'`
//     (line 586) — Home's own responsive strip sizing, kept on the `<li>`.
//
// The card itself is the shared `CollectionCard` (`@/features/collections`) — the same
// component `/collections`' `FeaturedCollectionsStrip` uses — rather than a bespoke inline
// card. `CollectionCard` is size-agnostic (`h-full w-full`, no aspect ratio of its own), so
// it fills whatever box the `<li>` establishes; its own header comment carries its
// prototype geometry (count pill, 22px serif name, optional description, arrow affordance).
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from `app/page.tsx`, the
// single repository boundary. No fetching, no @tennis/mock-data.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole card navigates ⇒ `CollectionCard`'s own
// `PendingCardLink`; the "View all" link ⇒ `PendingLink`. The save heart (Task 42) is a
// database-backed action ⇒ the rule-2 triad, inside `CollectionSaveHeart`, rendered as a
// SIBLING of the card link.

export interface HomeCollectionsTeaserProps {
  collections: CollectionDTO[];
  title?: string;
  cta?: { label: string; href: string };
  /** Ids of the editorial collections this visitor has already saved (Task 42). */
  savedCollectionIds: ReadonlySet<string>;
  /** False for a logged-out visitor in `api` mode → save hearts route to /signin. */
  signedIn?: boolean;
}

const DEFAULT_TITLE = 'Collections';
const DEFAULT_CTA = { label: 'View all', href: '/collections' } as const;

export function HomeCollectionsTeaser({
  collections,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
  savedCollectionIds,
  signedIn = true,
}: HomeCollectionsTeaserProps) {
  if (collections.length === 0) return null;

  return (
    <section className="pt-7 md:pt-12 collections-list" id="collections-list">
      <div className="container-page">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="serif text-[20px] md:text-[36px] font-normal leading-tight text-ink">{title}</h2>
          <PendingLink
            href={cta.href}
            className="body-s shrink-0 text-stone transition-colors hover:text-ink"
          >
            {cta.label}
          </PendingLink>
        </div>
      </div>

      {/* Plain overflow-x row — no carousel library (hard rule).

          GUTTER ALIGNMENT: inside `.container-page` so the first card lines up with the
          section header at every width; `-mr-[...]` cancels only the RIGHT gutter so the
          row still bleeds off the edge as it scrolls. Same treatment as the courts
          strip. */}
      <div className="container-page">
        <HScrollArrows>
          {(scrollRef) => (
            <ul
              ref={scrollRef}
              className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-3 overflow-x-auto pb-1"
            >
              {collections.map((collection, index) => (
                <li
                  key={collection.id}
                  className="relative w-[45vw] min-w-[150px] max-w-[190px] aspect-[3/4] shrink-0"
                >
                  <CollectionCard
                    collection={collection}
                    priority={index === 0}
                    className="collection-card"
                  />
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
          )}
        </HScrollArrows>
      </div>
    </section>
  );
}
