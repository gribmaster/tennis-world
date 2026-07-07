// MapFilterBar — the sticky search + filter-chip bar under the app header.
//
// PRESENTATIONAL & controlled: it owns no state and does NOT fetch. The current
// `query` / `activeFilter` come in as props and every change is emitted up to
// MapExplorer (the single stateful boundary). The chip labels are local UI copy,
// not court data — this component never imports @tennis/mock-data.

/** The filter-chip vocabulary (single-select, default "All"). */
export const MAP_FILTERS = ['All', 'Resorts', 'Clubs', 'Private', 'Indoor', 'Scenic'] as const;
export type MapFilter = (typeof MAP_FILTERS)[number];

function SearchGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export interface MapFilterBarProps {
  query: string;
  activeFilter: MapFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: MapFilter) => void;
}

export function MapFilterBar({
  query,
  activeFilter,
  onQueryChange,
  onFilterChange,
}: MapFilterBarProps) {
  return (
    <div className="sticky top-[72px] z-30 border-b border-hairline bg-bone px-[clamp(16px,4vw,40px)] py-4">
      <div className="mx-auto flex max-w-container items-center gap-3">
        {/* Search pill */}
        <div className="pill flex h-11 max-w-[480px] flex-1 items-center gap-2.5 border border-hairline bg-ivory px-4">
          <span className="shrink-0 text-stone">
            <SearchGlyph />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search courts, cities, countries…"
            aria-label="Search courts"
            className="body-m w-full min-w-0 border-none bg-transparent text-ink outline-none placeholder:text-stone"
          />
        </div>

        {/* Filter chips — horizontally scrollable on narrow screens. */}
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto" role="group" aria-label="Filter courts">
          {MAP_FILTERS.map((filter) => {
            const active = filter === activeFilter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => onFilterChange(filter)}
                aria-pressed={active}
                className={['filter-pill', active ? 'is-active' : ''].filter(Boolean).join(' ')}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
