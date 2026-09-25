import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CuratedCollectionCard — the card used in "Curated for You" (`CuratedCollectionsList`),
// built to be visually indistinguishable from `SavedCollectionRow.tsx` (Saved → Collections
// tab): same fixed height, same count-pill position/styling, same serif name treatment,
// same image overlay, copied verbatim from that component's non-empty-state JSX.
//
// NOT a reuse of `SavedCollectionRow` itself — that's a type problem, not a style one.
// `SavedCollectionRow` takes `UserCollectionDTO` (`coverImageUrls?: string[]`, with a real
// "empty folder, no courts yet" state its file spends code drawing on purpose, see its own
// `EmptyFolderArt`). This section has `CollectionDTO[]` (`coverImageUrl: string` — singular,
// required, never empty: editorial collections always ship with a real cover photo). A
// `CollectionDTO` cannot be passed into a component typed for `UserCollectionDTO`, so this
// is a small sibling component that copies the treatment and simply has no empty-state
// branch to keep, because this data type never needs one.
//
// Two deliberate departures from `SavedCollectionRow`'s markup:
//   • Link target is `/collections/{slug}` (the editorial collection's own page), not
//     `/saved/collections/{slug}` (the visitor's folder detail page).
//   • No `description` line. `SavedCollectionRow` never renders one (personal folders don't
//     have a description field), so to match it exactly this card doesn't render
//     `CollectionDTO.description` either, even though the field is available. This is an
//     intentional content drop versus `CollectionCard` (used elsewhere on this page), not
//     an oversight.
//
// The save/heart control (Task 42) is NOT rendered inside this card — it is rendered by
// the parent list (`CuratedCollectionsList`) as a SIBLING overlay, positioned over this
// card's box, so a click on it can never be a click on this card's `PendingCardLink`. See
// `CollectionSaveHeart.tsx` for the control's behaviour.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole card navigates ⇒ `PendingCardLink`.

export interface CuratedCollectionCardProps {
  collection: CollectionDTO;
}

export function CuratedCollectionCard({ collection }: CuratedCollectionCardProps) {
  return (
    <PendingCardLink
      href={`/collections/${collection.slug}`}
      ariaLabel={collection.name}
      className="block h-[150px] overflow-hidden rounded-lg"
    >
      <Image
        src={collection.coverImageUrl}
        alt=""
        fill
        sizes="(max-width: 768px) 50vw, 320px"
        className="object-cover"
      />

      {/* `.img-overlay` — transparent to 40%, then to 72% black. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      <span className="absolute left-2 top-2 inline-flex rounded-pill bg-ink/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-caption text-paper backdrop-blur-[8px]">
        {collection.count} {collection.count === 1 ? 'court' : 'courts'}
      </span>

      <span className="absolute inset-x-0 bottom-0 block px-3 pb-2.5 pt-2.5">
        <span className="serif block text-[17px] font-normal leading-[1.2] text-paper">
          {collection.name}
        </span>
      </span>
    </PendingCardLink>
  );
}
