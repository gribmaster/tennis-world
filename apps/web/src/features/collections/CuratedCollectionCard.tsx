import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CuratedCollectionCard — the row used in "Curated for You" (`CuratedCollectionsList`).
//
// TASK_60 (v3) SUPERSEDES Task 40's brief ("look exactly like `SavedCollectionRow`'s
// photo tile"): v3 draws "Curated for You" as a row — thumbnail + text + bookmark — not
// a photo card, so this component is rebuilt to that shape (desktop
// tennis_world_desktop_standalone4.html ~line 762, mobile tennis_world_v17_standalone.html
// ~line 1107). It is the whole `PendingCardLink` now (thumbnail + text together), not a
// photo tile with a bookmark laid over it — the bookmark still renders as a SIBLING, in
// the parent `<li>` (`CuratedCollectionsList`), positioned over this row's right edge via
// `pr-[56px]`/`pr-[64px]` reserving its slot. See `CollectionSaveHeart.tsx` for that
// control's behaviour.
//
// Unlike `CollectionCard` (Featured strip / Saved tab), this row DOES print
// `description` (TASK_60 decision 1 — it is the v3 `sub` line for every surface except
// the collection's own hero, which drops it in favour of the full `desc` paragraph).
//
// PRESENTATIONAL & data-driven: renders the `collection` it is handed and never fetches.

export interface CuratedCollectionCardProps {
  collection: CollectionDTO;
}

export function CuratedCollectionCard({ collection }: CuratedCollectionCardProps) {
  const countLabel = `${collection.count} ${collection.count === 1 ? 'court' : 'courts'}`;

  return (
    <PendingCardLink
      href={`/collections/${collection.slug}`}
      ariaLabel={collection.name}
      className="flex items-center gap-3.5 rounded-[12px] bg-paper p-3 pr-[56px] md:gap-4 md:rounded-[14px] md:p-3.5 md:pr-[64px]"
    >
      <span className="relative h-20 w-24 shrink-0 overflow-hidden rounded-[10px] md:h-[88px] md:w-[108px]">
        <Image src={collection.coverImageUrl} alt="" fill sizes="108px" className="object-cover" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-[1.2] text-ink md:text-[16px]">
          {collection.name}
        </span>
        {collection.description ? (
          <span className="mt-[3px] block line-clamp-2 text-[12px] leading-[1.35] text-stone md:mt-1 md:leading-[1.4]">
            {collection.description}
          </span>
        ) : null}
        <span className="mt-1.5 block text-[11px] leading-tight text-stone md:mt-[7px]">
          {countLabel}
        </span>
      </span>
    </PendingCardLink>
  );
}
