import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';
import { MapCourtRow } from './MapCourtRow';
import type { MapFilter } from './MapFilterBar';

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
// Empty state shows the prototype's message + a "Reset filters" button.

export interface MapCourtListProps {
  /** The visible (filtered) courts — single source of truth shared with the canvas. */
  courts: CourtSummaryDTO[];
  /** The active chip, echoed in the header when not "All". */
  activeFilter: MapFilter;
  /** Whether a search query is currently narrowing the list (drives empty-state copy). */
  hasQuery: boolean;
  /** Clears the query and resets the chip to "All". */
  onReset: () => void;
}

export function MapCourtList({ courts, activeFilter, hasQuery, onReset }: MapCourtListProps) {
  const count = courts.length;
  const isEmpty = count === 0;

  return (
    <div className="map-list-panel">
      <div className="flex h-full flex-col">
        {/* Header: eyebrow (+ active-filter echo) and live count. */}
        <div className="shrink-0 border-b border-hairline px-5 pb-3 pt-4">
          <p className="eyebrow text-stone">
            Courts in view
            {activeFilter !== 'All' ? <span className="ml-2 text-clay">{activeFilter}</span> : null}
          </p>
          <p className="display-m mt-1">
            {count} {count === 1 ? 'place' : 'places'}
          </p>
        </div>

        {isEmpty ? (
          <div className="px-8 py-8 text-center">
            <p className="body-m text-stone">
              No courts match{' '}
              {hasQuery ? 'your search' : `“${activeFilter}”`}.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="btn btn-secondary mt-4 !h-10 !px-4 !text-[11px]"
            >
              Reset filters
            </button>
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
