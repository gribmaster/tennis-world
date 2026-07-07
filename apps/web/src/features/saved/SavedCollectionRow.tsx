import Image from 'next/image';
import Link from 'next/link';
import type { UserCollectionDTO } from '@tennis/contracts';

// SavedCollectionRow — one wishlist-folder row in the Saved → Collections tab
// (FEATURE_19 §3.2). Ported from saved.html's collection rows: a small stack of court
// thumbnails on the left, the folder name (serif) + "{n} courts" eyebrow, and a
// chevron on the right.
//
// This is a DIFFERENT pattern from the editorial CollectionCard (a full-bleed cover
// tile) — it is a list row, so it is its own small component rather than a variant of
// CollectionCard (FEATURE_19 §6).
//
// PRESENTATIONAL & data-driven: receives the folder via props; no repository, no
// @tennis/mock-data, no client state. READ-ONLY — no rename/delete behaviour. The
// whole row is a <Link> into the per-folder detail route (`/saved/collections/{slug}`,
// Feature 33); navigation is the only behaviour.

/** Minimal inline chevron — avoids pulling in an icon library (hard rule). */
function ChevronRightGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export interface SavedCollectionRowProps {
  collection: UserCollectionDTO;
}

export function SavedCollectionRow({ collection }: SavedCollectionRowProps) {
  const covers = collection.coverImageUrls ?? [];

  return (
    <Link
      href={`/saved/collections/${collection.slug}`}
      className="flex items-center gap-5 border-b border-hairline py-5 transition-colors hover:bg-ivory"
      aria-label={collection.name}
    >
      {/* Thumbnail stack (only when cover images are present). */}
      {covers.length > 0 ? (
        <div className="flex shrink-0 gap-[3px]">
          {covers.map((src, i) => (
            <div key={i} className="relative h-[72px] w-14 overflow-hidden">
              <Image src={src} alt="" fill sizes="56px" className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <h3 className="serif text-[22px] font-medium leading-tight text-ink">{collection.name}</h3>
        <p className="eyebrow mt-1.5 text-stone">
          {collection.count} {collection.count === 1 ? 'court' : 'courts'}
        </p>
      </div>

      <span className="shrink-0 text-stone" aria-hidden>
        <ChevronRightGlyph />
      </span>
    </Link>
  );
}
