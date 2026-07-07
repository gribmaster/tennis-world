import Image from 'next/image';
import Link from 'next/link';
import type { CollectionDTO } from '@tennis/contracts';

// CollectionDetailHero — the editorial hero for a single collection
// (/collections/[slug]). It follows the dark hero treatment established by
// CollectionsHero (files/collections.html), but here the backdrop is the
// collection's OWN cover image and the copy is the collection's real name + count +
// description.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the collection via the `collection` prop — it does NOT call a
//     repository and does NOT import @tennis/mock-data. The page (a server
//     component) fetches and passes the DTO in.
//   • Renders only from fields on the DTO. `description` is optional, so it renders
//     only when present (graceful fallback).

function ChevronLeftGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export interface CollectionDetailHeroProps {
  collection: CollectionDTO;
}

export function CollectionDetailHero({ collection }: CollectionDetailHeroProps) {
  return (
    <section className="relative overflow-hidden bg-ink">
      {/* The collection's own cover image, faded behind the title. */}
      <Image
        src={collection.coverImageUrl}
        alt=""
        fill
        sizes="100vw"
        priority
        className="object-cover opacity-35"
      />
      <div className="container-page relative py-[clamp(48px,8vw,96px)]">
        {/* Back to the collections index. */}
        <Link
          href="/collections"
          className="eyebrow inline-flex items-center gap-1.5 text-bone/70 transition-colors hover:text-bone"
        >
          <ChevronLeftGlyph />
          All collections
        </Link>

        <p className="eyebrow mt-6 text-bone/60">
          Collection
          <span className="ml-2 text-bone/80">
            {collection.count} {collection.count === 1 ? 'court' : 'courts'}
          </span>
        </p>
        <h1 className="display-l mt-3 max-w-[640px] text-bone">{collection.name}</h1>
        {collection.description ? (
          <p className="body-l mt-5 max-w-[560px] text-bone/75">{collection.description}</p>
        ) : null}
      </div>
    </section>
  );
}
