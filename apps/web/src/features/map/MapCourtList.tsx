import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';
import { hasAnyFilter, type CourtFilterState } from '@/components/filters';
import { MapCourtRow } from './MapCourtRow';

// MapCourtList — the list panel beside/under the canvas, ported from the courts
// panel in files/map.html.
//
// PRESENTATIONAL & data-driven: it renders the already-filtered `courts` (the same
// set the canvas plots, so pins and rows never disagree) and reports state changes
// up via `onReset`. It does NOT fetch or hold filter state.
//
// Layout switches by breakpoint (pure CSS):
//   • Mobile: a horizontal CourtCard strip (no-scrollbar).
//   • Desktop (md+): a vertical MapCourtRow list with its own scroll.
//
// EMPTY STATE (Feature 73): the multi-dimensional filter model makes "no results" a
// genuinely reachable state (Clay + Indoor + Island is an empty set on this dataset),
// which the old six single-select chips essentially never produced. So the empty case
// is a calm, explanatory panel with a way out — never a blank list. The "Clear
// filters" control is purely local UI (it resets in-memory state; no navigation, no
// repository call), so per CLAUDE.md §4 rule 10 it carries no pending primitive.

export interface MapCourtListProps {
  /** The visible (filtered) courts — single source of truth shared with the canvas. */
  courts: CourtSummaryDTO[];
  /** The committed filter state — drives the header echo and the empty-state copy. */
  filters: CourtFilterState;
  /** Number of selected chips (0 when only the free-text query is narrowing). */
  activeCount: number;
  /** Clears every chip AND the search text. */
  onReset: () => void;
}

export function MapCourtList({ courts, filters, activeCount, onReset }: MapCourtListProps) {
  const count = courts.length;
  const isEmpty = count === 0;
  const hasQuery = filters.q.trim().length > 0;
  const isFiltered = hasAnyFilter(filters);

  return (
    <div className="map-list-panel">
      <div className="flex h-full flex-col">
        {/* Header: eyebrow (+ active-filter echo) and live count. */}
        <div className="shrink-0 border-b border-hairline px-5 pb-3 pt-4">
          <p className="eyebrow text-stone">
            Courts in view
            {activeCount > 0 ? (
              <span className="ml-2 text-clay">
                {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
              </span>
            ) : null}
          </p>
          <p className="display-m mt-1">
            {count} {count === 1 ? 'place' : 'places'}
          </p>
        </div>

        {isEmpty ? (
          <div className="px-8 py-10 text-center">
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
        ) : (
          <>
            {/* Mobile: horizontal CourtCard strip. Hidden at md+. */}
            <div className="no-scrollbar flex flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden px-5 py-4 md:hidden">
              {courts.map((court) => (
                <div key={court.id} className="w-[180px] shrink-0">
                  <CourtCard court={court} href={`/courts/${court.slug}`} />
                </div>
              ))}
            </div>

            {/* Desktop: vertical rows with their own scroll. Shown only at md+. */}
            <div className="hidden flex-1 overflow-y-auto md:block">
              {courts.map((court) => (
                <MapCourtRow key={court.id} court={court} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
