import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';
import { SavedEmptyState } from './SavedEmptyState';
import { SavedDreamListCta } from './SavedDreamListCta';

// SavedCourtsGrid — the Courts tab of the Saved page.
//
// TASK_56 (v3): swaps the screen-local full-bleed card + its own "X" unsave button for
// the shared v3 `CourtCard` with its bookmark save button — see "Card reuse: one
// CourtCard, everywhere" in docs/TASK_56_V3_SHARED_COURT_CARD.md. Un-bookmarking a saved
// court here REMOVES the card (v3's behaviour, matching the old "X" unsave): the card's
// `save.onSavedChange` callback drives the lifted `unsavedIds`/`onUnsavedChange` in
// SavedTabs — `onSavedChange(false)` is an optimistic remove, `onSavedChange(true)` is
// the rollback restore on a failed write. The MUTATION itself (repository call,
// optimistic flip, rollback, `.finally()` pending reset) now lives entirely inside
// `CourtCardSaveButton` — this grid no longer owns a pending set or its own write logic.
//
// `unsavedIds`/`onUnsavedChange` stay LIFTED in SavedTabs (not local here) because the
// header's "N saved" count and the Wishlist Map's markers are rendered from the same
// list — one source of truth for membership, three readers.
//
// DATA-DRIVEN: the list arrives via the `courts` prop (server-fetched in page.tsx →
// SavedTabs, then ordered by SavedTabs' sort control). This island imports no
// @tennis/mock-data and hardcodes no court data.

export interface SavedCourtsGridProps {
  courts: CourtSummaryDTO[];
  /**
   * Ids optimistically unsaved so far, owned by SavedTabs. The visible list is `courts`
   * MINUS these. It is LIFTED rather than held here because the header's "N saved" count
   * is rendered by SavedTabs: keeping membership local would let the count and the grid
   * disagree the moment a card is removed.
   */
  unsavedIds: ReadonlySet<string>;
  /** Apply an optimistic remove (true) or roll one back (false) in the parent's state. */
  onUnsavedChange: (courtId: string, unsaved: boolean) => void;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
}

export function SavedCourtsGrid({
  courts,
  unsavedIds,
  onUnsavedChange,
  viewerIsEntitled = false,
}: SavedCourtsGridProps) {
  const visible = courts.filter((court) => !unsavedIds.has(court.id));

  // Unsaving the LAST card lands on the real empty state, not an empty stack. The Dream
  // List CTA goes with it — it promotes building a list, which the empty state already
  // does with its own CTA, and two competing invitations on an empty screen is noise.
  if (visible.length === 0) {
    return (
      <SavedEmptyState
        title="No saved courts yet."
        description="Save your favourites — they'll wait here for you."
        cta={{ href: '/map', label: 'Explore the map' }}
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
      {visible.map((court, index) => (
        <li key={court.id}>
          <CourtCard
            court={court}
            viewerIsEntitled={viewerIsEntitled}
            priority={index === 0}
            save={{
              initialSaved: true,
              signedIn: true,
              onSavedChange: (saved) => onUnsavedChange(court.id, !saved),
            }}
          />
        </li>
      ))}

      {/* The Dream List promo card, now the LAST grid cell (TASK_61) rather than a
          standalone block below the grid — it follows the last court on mobile (one
          column) and occupies the next cell at lg, exactly like the courts around it. Its
          two tilted tiles are decoration drawn from courts already on screen — no extra
          read. */}
      <li>
        <SavedDreamListCta imageUrls={visible.slice(0, 2).map((court) => court.heroImageUrl)} />
      </li>
    </ul>
  );
}
