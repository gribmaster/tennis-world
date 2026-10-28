import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';
import { hasAnyFilter, type CourtFilterState } from '@/components/filters';

// MapCourtGrid — the Courts screen's main content (TASK_57; replaces `MapCourtList` /
// `MapCourtRow` / the mobile `LegacyCourtCard` strip). A straight grid of the shared v3
// `CourtCard` (TASK_56) — one column on mobile, two at md+ — built from the SAME
// filtered `courts` set the map preview/modal plots, so the grid and the markers can
// never drift apart.
//
// PRESENTATIONAL & data-driven: it renders the already-filtered `courts` and reports
// nothing upward except via `CourtCard`'s own `save` callback and the empty state's
// `onReset`. It does NOT fetch or hold filter state.
//
// EMPTY STATE (ported from `MapCourtList`, unchanged copy): the multi-dimensional
// filter model makes "no results" a genuinely reachable state, so the empty case is a
// calm, explanatory panel with a way out — never a blank grid. "Clear filters" is
// purely local UI (resets in-memory state only), so per CLAUDE.md §4 rule 10 it carries
// no pending primitive.

export interface MapCourtGridProps {
  /** The visible (filtered) courts — single source of truth shared with the map. */
  courts: CourtSummaryDTO[];
  /** The committed filter state — drives the empty-state copy. */
  filters: CourtFilterState;
  /** Number of selected chips (0 when only the free-text query is narrowing). */
  activeCount: number;
  /** Clears every chip AND the search text. */
  onReset: () => void;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** False for a logged-out visitor — each card's save button shows the guest tooltip. */
  signedIn: boolean;
  /** Ids of the courts this viewer has already saved — seeds each card's save button. */
  savedIds: ReadonlySet<string>;
  /** Told about every committed/rolled-back save-button flip, keyed by court id. */
  onSavedChange: (courtId: string, saved: boolean) => void;
}

export function MapCourtGrid({
  courts,
  filters,
  activeCount,
  onReset,
  viewerIsEntitled = false,
  signedIn,
  savedIds,
  onSavedChange,
}: MapCourtGridProps) {
  const isEmpty = courts.length === 0;
  const hasQuery = filters.q.trim().length > 0;
  const isFiltered = hasAnyFilter(filters);

  if (isEmpty) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="headline text-ink">No courts match</p>
        <p className="body-m mt-2 text-stone">
          {activeCount > 0 && hasQuery
            ? 'Nothing fits this combination of filters and your search. Try removing one.'
            : activeCount > 0
              ? 'Nothing fits this combination of filters. Try removing one.'
              : hasQuery
                ? `No courts found for “${filters.q.trim()}”.`
                : 'There are no courts to show right now.'}
        </p>
        {isFiltered ? (
          <button
            type="button"
            onClick={onReset}
            className="btn btn-secondary mt-5 !h-10 !px-4 !text-[11px]"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
      {courts.map((court, index) => (
        <li key={court.id}>
          <CourtCard
            court={court}
            viewerIsEntitled={viewerIsEntitled}
            priority={index < 2}
            imageSizes="(min-width: 768px) 40vw, 100vw"
            save={{
              initialSaved: savedIds.has(court.id),
              signedIn,
              onSavedChange: (saved) => onSavedChange(court.id, saved),
            }}
          />
        </li>
      ))}
    </ul>
  );
}
