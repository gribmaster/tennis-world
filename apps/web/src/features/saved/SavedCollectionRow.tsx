import Image from 'next/image';
import type { UserCollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// SavedCollectionRow — ONE of the visitor's own wishlist folders, used in two places:
// the Saved → Collections tab grid (`variant="tile"`, default — `h-[150px] md:h-[200px]`,
// matching `CollectionCard`'s `compact` tile so both Saved grids share one type scale,
// TASK_61) and the Profile "My collections" strip (`variant="tall"` — fills its slot via
// `h-full`, larger serif name). Its contract is otherwise unchanged — one
// `UserCollectionDTO` in, a whole-card link to `/saved/collections/{slug}` out —
// presentational, no repository, no @tennis/mock-data, no client state, navigation is its
// only behaviour.
//
// ── THIS IS THE USER'S OWN FOLDER, NOT AN EDITORIAL COLLECTION ──────────────────────────
// v3's reference prototype draws saved *podborki* (editorial collections the visitor
// bookmarked) in this slot. This card carries the prototype's TREATMENT but not that
// MEANING: `getSavedCollections()` returns `UserCollectionDTO[]` — the folders a user
// creates and fills with courts. Bookmarking an editorial `CollectionDTO` IS a real
// feature (Task 42), but it lives in its own sibling section
// (`SavedEditorialCollectionsGrid.tsx`, which reuses `CollectionCard` + `CollectionSaveHeart`
// — not this component). See the grid's own note.
//
// ── THE CORNER CONTROL IS DELIBERATELY ABSENT ───────────────────────────────────────────
// The prototype puts an unsave heart at the card's top-right (lines 1274–1276). It is not
// built, for two independent reasons:
//   • It is the WRONG ACTION for this object. "Unsave" undoes a bookmark. These are the
//     visitor's own folders; the destructive action on one is DELETE — a heavier,
//     confirmable action that discards a thing they made, not a one-tap toggle.
//   • The capability does not exist. `SavedRepository` exposes create, rename and
//     toggle-court-membership; there is no `deleteUserCollection`, no `DELETE
//     /v1/me/collections/:id`, and this presentation-only feature must not add one. There
//     is literally nothing to call.
// So it is OMITTED rather than rendered inert — an inert control is exactly what
// `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` exists to prevent. Each card is therefore a
// single navigation target with no interactive descendants (which also keeps it valid HTML
// — no <button> inside an <a>).
//
// ── A FOLDER WITH NO COURTS ─────────────────────────────────────────────────────────────
// `coverImageUrls` is OPTIONAL and may be empty: a folder created seconds ago has no
// courts, so it has no image. That case is DESIGNED, not defaulted into — see
// `EmptyFolderArt` below. It never renders a broken <Image>, a stretched placeholder, or a
// blank box.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole card navigates ⇒ `PendingCardLink`.

/**
 * The zero-court treatment: a warm ivory field carrying a hairline "empty frame" mark, so
 * a new folder reads as *deliberately awaiting courts* rather than as a failed image. It is
 * drawn, not fetched — an empty folder has nothing to show a photo of. The card keeps its
 * exact dimensions and its count pill ("0 COURTS"), so the grid stays even and the state is
 * legible rather than merely blank.
 */
function EmptyFolderArt() {
  return (
    <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-ivory">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-mist"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <line x1="12" y1="10" x2="12" y2="16" />
        <line x1="9" y1="13" x2="15" y2="13" />
      </svg>
    </span>
  );
}

export interface SavedCollectionRowProps {
  collection: UserCollectionDTO;
  /**
   * `'tile'` (default) — the Saved → Collections tab grid cell, `h-[150px] md:h-[200px]`.
   * `'tall'` — the Profile "My collections" strip (TASK_61 §1): fills its slot (`h-full`)
   * instead, with a larger serif name. Everything else (empty-folder art, count pill,
   * PendingCardLink, singular "1 court") is shared between the two.
   */
  variant?: 'tile' | 'tall';
}

export function SavedCollectionRow({ collection, variant = 'tile' }: SavedCollectionRowProps) {
  // `coverImageUrls` is a handful of MEMBER-COURT hero images, not a single cover field —
  // the card uses the first as its image. Absent/empty ⇒ the designed empty-folder state.
  const cover = collection.coverImageUrls?.[0];
  const isEmpty = collection.count === 0 || !cover;
  const isTall = variant === 'tall';

  return (
    <PendingCardLink
      href={`/saved/collections/${collection.slug}`}
      ariaLabel={collection.name}
      className={[
        'block overflow-hidden rounded-lg md:rounded-[14px]',
        isTall ? 'h-full' : 'h-[150px] md:h-[200px]',
      ].join(' ')}
    >
      {isEmpty ? (
        <EmptyFolderArt />
      ) : (
        <Image src={cover} alt="" fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
      )}

      {/* `.img-overlay` — transparent to 40%, then to 72% black. Over the empty-folder art
          it is skipped: there is no photograph to darken, and dimming the ivory field would
          make the state read as a failure rather than a choice. */}
      {isEmpty ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
          }}
        />
      )}

      <span
        className={[
          'absolute left-2 top-2 inline-flex rounded-pill px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-caption backdrop-blur-[8px] md:left-2.5 md:top-2.5 md:text-[10px]',
          isEmpty ? 'bg-ink/10 text-graphite' : 'bg-ink/50 text-paper',
        ].join(' ')}
      >
        {collection.count} {collection.count === 1 ? 'court' : 'courts'}
      </span>

      <span className="absolute inset-x-0 bottom-0 block px-3 pb-2.5 pt-2.5 md:px-4 md:pb-3.5">
        <span
          className={[
            'serif block font-normal leading-[1.2]',
            isTall ? 'text-[22px] md:text-[19px]' : 'text-[17px] md:text-[20px]',
            isEmpty ? 'text-ink' : 'text-paper',
          ].join(' ')}
        >
          {collection.name}
        </span>
      </span>
    </PendingCardLink>
  );
}
