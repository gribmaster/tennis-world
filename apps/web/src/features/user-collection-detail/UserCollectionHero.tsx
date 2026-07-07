import Link from 'next/link';
import type { UserCollectionDTO } from '@tennis/contracts';
import { UserCollectionRename } from './UserCollectionRename';

// UserCollectionHero — the header for a USER wishlist folder
// (`/saved/collections/[slug]`), ported from files/collection.html's
// `CollectionDetailPage`: a slim "← Saved" back-bar, then the folder name and a
// "{n} courts in this collection" eyebrow.
//
// This is the USER-collection detail (a person's own folder), NOT the editorial
// `/collections/[slug]` hero (FEATURE_32 guardrail): the back-link goes to /saved,
// it is light (not the editorial dark band), and it carries no editorial copy.
//
// PRESENTATIONAL & data-driven (Phase 1 §4): the hero itself is a SERVER component —
// it receives the folder via props and does NOT call a repository or import
// @tennis/mock-data. The only interactive piece is the small <UserCollectionRename>
// client island it mounts in the title slot.
//
// RENAME (Feature 37 / 57): the prototype's inline "Rename" affordance is LIVE via the
// <UserCollectionRename> island — it swaps the title for an inline edit field and Saves
// through `repositories.saved.renameUserCollection` (mock in-memory seam in mock mode;
// protected PATCH /v1/me/collections/:id in `api` mode). The "{n} courts" count below is
// unaffected by a rename, so it stays server-rendered here.

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

export interface UserCollectionHeroProps {
  collection: UserCollectionDTO;
  /** Number of member courts resolved for this folder (drives the eyebrow copy). */
  courtCount: number;
}

export function UserCollectionHero({ collection, courtCount }: UserCollectionHeroProps) {
  return (
    <>
      {/* Slim back-bar to the Saved page (the prototype's "← Saved"). */}
      <div className="flex h-14 items-center border-b border-hairline bg-bone px-[clamp(16px,4vw,64px)]">
        <Link
          href="/saved"
          className="eyebrow inline-flex items-center gap-2 text-stone transition-colors hover:text-ink"
        >
          <ChevronLeftGlyph />
          Saved
        </Link>
      </div>

      <div className="container-page pt-[clamp(32px,5vw,48px)]">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
          {/* Inline title + "Rename" — a small client island that owns the edit state and
              calls the mock-only renameUserCollection seam (Feature 37). */}
          <UserCollectionRename collectionId={collection.id} name={collection.name} />
        </div>
        <p className="eyebrow text-stone">
          {courtCount} {courtCount === 1 ? 'court' : 'courts'} in this collection
        </p>
      </div>
    </>
  );
}
