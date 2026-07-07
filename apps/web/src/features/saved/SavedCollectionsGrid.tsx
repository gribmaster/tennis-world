import type { UserCollectionDTO } from '@tennis/contracts';
import { CreateCollectionTrigger } from '@/features/user-collections';
import { SavedCollectionRow } from './SavedCollectionRow';
import { SavedEmptyState } from './SavedEmptyState';

// SavedCollectionsGrid — the Collections tab of the Saved page (FEATURE_19 §3.2).
// Renders the user's wishlist folders as rows, plus a "New Collection" button.
//
// PRESENTATIONAL & data-driven: receives the folders via props; no repository, no
// @tennis/mock-data.
//
// CREATE (Feature 35): the "New Collection" button is now a <CreateCollectionTrigger>
// (a client island) that opens the Create-Collection modal and, on submit, creates a
// folder through the MOCK-ONLY SavedRepository seam (Feature 34 — in-memory, no
// backend/auth/persistence). The created folder is reported back up via
// `onCollectionCreated` so the parent (SavedTabs) can mirror it into the visible list for
// the session. Rename / remove / Add-to-Collection are still NOT wired here (rename stays
// disabled on the detail hero; the Court-Detail menu is Feature 36).

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
   * Called with the newly-created folder after a successful (mock-only) create, so the
   * parent can mirror it into the visible list. Optional.
   */
  onCollectionCreated?: (collection: UserCollectionDTO) => void;
}

/** The shared "New Collection" trigger (plus glyph + label), used in both states. */
function NewCollectionButton({
  onCollectionCreated,
}: Pick<SavedCollectionsGridProps, 'onCollectionCreated'>) {
  return (
    <CreateCollectionTrigger
      className="btn btn-primary"
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
      <ul className="border-t border-hairline">
        {collections.map((collection) => (
          <li key={collection.id}>
            <SavedCollectionRow collection={collection} />
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <NewCollectionButton onCollectionCreated={onCollectionCreated} />
      </div>
    </div>
  );
}
