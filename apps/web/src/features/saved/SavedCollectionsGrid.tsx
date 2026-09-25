import type { UserCollectionDTO } from '@tennis/contracts';
import { CreateCollectionTrigger } from '@/features/user-collections';
import { SavedCollectionRow } from './SavedCollectionRow';
import { SavedEmptyState } from './SavedEmptyState';

// SavedCollectionsGrid — the Collections tab of the Saved page, rebuilt to the v2
// prototype's two-column card grid (tennis_world_v2_standalone.html:1263–1286).
//
// ── WHAT THIS GRID SHOWS: THE USER'S OWN FOLDERS ────────────────────────────────────────
// READ THIS BEFORE "FIXING" IT TOWARD THE PROTOTYPE.
// These are `UserCollectionDTO`s from `SavedRepository.getSavedCollections()` — the
// wishlist folders the visitor CREATES and fills with courts. They are NOT bookmarked
// editorial collections. The prototype draws saved editorial podborki in this slot, and
// this feature deliberately carries over its CARD TREATMENT but not its MEANING: the two
// are different objects that happen to look alike on screen.
//
// Bookmarking an editorial `CollectionDTO` IS now a real, database-backed feature (Task
// 42 — `SavedCollection` model, `POST/DELETE /v1/me/saved-collections`), but it lives in
// its OWN sibling section: `SavedEditorialCollectionsGrid.tsx`, rendered by `SavedTabs`
// above this grid on the same Collections tab. This grid is unchanged and still renders
// `UserCollectionDTO` only.
//
// RESTYLED, not replaced: the same folders, the same create flow, the same per-folder link
// target (`/saved/collections/{slug}`) — a 2-col grid of image cards instead of a row list.
//
// Prototype geometry: `display:'grid', gridTemplateColumns:'1fr 1fr', gap:12` (line 1265);
// the card itself is `SavedCollectionRow`.
//
// PRESENTATIONAL & data-driven: receives the folders via props; no repository, no
// @tennis/mock-data. The one interactive descendant is `CreateCollectionTrigger` (a client
// island that owns the Create-Collection modal and its own pending state); the created
// folder is reported back up via `onCollectionCreated` so the parent (SavedTabs) can mirror
// it into the visible list for the session.

/** Minimal inline plus glyph — avoids pulling in an icon library (hard rule). */
function PlusGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export interface SavedCollectionsGridProps {
  collections: UserCollectionDTO[];
  /**
   * Called with the newly-created folder after a successful create, so the parent can
   * mirror it into the visible list. Optional.
   */
  onCollectionCreated?: (collection: UserCollectionDTO) => void;
}

/** The shared "New Collection" trigger (plus glyph + label), used in both states. */
function NewCollectionButton({
  onCollectionCreated,
}: Pick<SavedCollectionsGridProps, 'onCollectionCreated'>) {
  return (
    <CreateCollectionTrigger
      className="btn btn-primary h-11 px-5 text-[11px]"
      source="saved"
      onCreated={onCollectionCreated}
    >
      <PlusGlyph />
      New Collection
    </CreateCollectionTrigger>
  );
}

export function SavedCollectionsGrid({
  collections,
  onCollectionCreated,
}: SavedCollectionsGridProps) {
  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center">
        <SavedEmptyState
          title="No collections yet."
          description="Group the courts you love into wishlist folders for the trips you're dreaming of."
        />
        <div className="-mt-2">
          <NewCollectionButton onCollectionCreated={onCollectionCreated} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {collections.map((collection) => (
          <li key={collection.id}>
            <SavedCollectionRow collection={collection} />
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <NewCollectionButton onCollectionCreated={onCollectionCreated} />
      </div>
    </div>
  );
}
