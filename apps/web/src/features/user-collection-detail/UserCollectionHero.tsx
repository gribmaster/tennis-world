import type { UserCollectionDTO } from '@tennis/contracts';
import { BackButton } from '@/components/navigation';
import { UserCollectionRename } from './UserCollectionRename';

// UserCollectionHero — the header for a USER wishlist folder
// (`/saved/collections/[slug]`), restyled to the v3 page rhythm (TASK_61 §3): the old
// full-width back-bar is gone, replaced by a plain-text `BackButton` inline above the
// title, matching the other v3 detail screens.
//
// This is the USER-collection detail (a person's own folder), NOT the editorial
// `/collections/[slug]` hero (FEATURE_32 guardrail): the back-link goes to /saved,
// it is light (not the editorial dark band), and it carries no editorial copy.
//
// PRESENTATIONAL & data-driven (Phase 1 §4): the hero itself is a SERVER component —
// it receives the folder via props and does NOT call a repository or import
// @tennis/mock-data. The only interactive piece is the small <UserCollectionRename>
// client island it mounts in the title slot (plus the <BackButton> client island below).
//
// RENAME (Feature 37 / 57): the inline "Rename" affordance is LIVE via the
// <UserCollectionRename> island — it swaps the title for an inline edit field and Saves
// through `repositories.saved.renameUserCollection` (mock in-memory seam in mock mode;
// protected PATCH /v1/me/collections/:id in `api` mode). The "{n} courts" count below is
// unaffected by a rename, so it stays server-rendered here.
//
// BACK NAVIGATION: the shared <BackButton> (history-aware, falls back to /saved on a
// direct load), visible at EVERY size here (unlike Court/Collection Detail, which split a
// mobile pill overlay from a desktop-only plain link — this page has no photo hero for a
// pill to sit over). `verify:ux-pending-states` reads this file and asserts
// `<BackButton` + `fallbackHref="/saved"`.

export interface UserCollectionHeroProps {
  collection: UserCollectionDTO;
  /** Number of member courts resolved for this folder (drives the eyebrow copy). */
  courtCount: number;
}

export function UserCollectionHero({ collection, courtCount }: UserCollectionHeroProps) {
  return (
    <div className="container-page pt-4 md:pt-6">
      <BackButton
        fallbackHref="/saved"
        label="Back to Saved"
        className="eyebrow mb-5 inline-flex items-center gap-1.5 text-[13px] normal-case tracking-normal text-stone transition-colors hover:text-ink"
      />

      <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
        {/* Inline title + "Rename" — a small client island that owns the edit state and
            calls the mock-only renameUserCollection seam (Feature 37). */}
        <UserCollectionRename collectionId={collection.id} name={collection.name} />
      </div>
      <p className="text-[13px] text-stone md:text-[14px]">
        {courtCount} {courtCount === 1 ? 'court' : 'courts'} in this collection
      </p>
    </div>
  );
}
