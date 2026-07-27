import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { BackButton } from '@/components/navigation';

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
//
// BACK NAVIGATION: uses the shared <BackButton> (history-aware, falls back to
// `/collections` on a direct load) instead of a hardcoded "← All collections" link, so
// behavior is consistent with every other detail page's back control.

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
        <BackButton
          fallbackHref="/collections"
          label="All collections"
          className="eyebrow inline-flex items-center gap-1.5 text-bone/70 transition-colors hover:text-bone"
        />

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
