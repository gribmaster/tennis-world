import Link from 'next/link';
import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';

// CollectionCard — one cover tile in the Collections grid, ported from the
// collection card in files/collections.html (the 3:2 cover with a bottom-up
// gradient and the serif name + "{count} courts" eyebrow overlaid bottom-left).
//
// PRESENTATIONAL & data-driven (Phase 1 §4), like CourtCard / HomeCollectionsTeaser:
//   • Receives the collection via the `collection` prop — it does NOT call a
//     repository and does NOT import @tennis/mock-data. The page (a server
//     component) fetches and passes the DTO in.
//   • Renders only from fields on the DTO. `description` is optional on
//     CollectionDTO, so it is rendered only when present (graceful fallback).
//   • The whole card links to `/collections/{slug}` — that detail route is NOT
//     built in this feature, but the link is wired now per the prompt.

export interface CollectionCardProps {
  collection: CollectionDTO;
  /** Prioritize image loading (above-the-fold cards only). */
  priority?: boolean;
  className?: string;
}

export function CollectionCard({ collection, priority = false, className }: CollectionCardProps) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      aria-label={collection.name}
      className={['court-card group relative block aspect-[3/2] overflow-hidden', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <Image
        src={collection.coverImageUrl}
        alt=""
        fill
        sizes="(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 33vw"
        priority={priority}
        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />

      {/* `.img-overlay`: transparent → 72% black bottom-up, for overlay legibility. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/70"
      />

      <div className="absolute inset-x-5 bottom-5 text-paper">
        <h3 className="serif text-[clamp(18px,1.6vw,24px)] font-medium leading-tight">
          {collection.name}
        </h3>
        <p className="eyebrow mt-1.5 text-paper/70">{collection.count} courts</p>
        {collection.description ? (
          <p className="body-s mt-2 line-clamp-2 text-paper/80">{collection.description}</p>
        ) : null}
      </div>
    </Link>
  );
}
