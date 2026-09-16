import {
  isOptionSelected,
  optionId,
  type CourtFilterOption,
  type CourtFilterState,
} from '@/components/filters';

// MapFilterBar — the sticky search + quick-filter bar under the app header.
//
// PRESENTATIONAL & controlled: it owns no state and does NOT fetch. The current
// filter `state` comes in as a prop and every change is emitted up to MapExplorer
// (the single stateful boundary). It never imports @tennis/mock-data.
//
// FEATURE 73: the old single-select six-chip row (`MAP_FILTERS` / `MapFilter`) is
// gone. It is replaced by a QUICK-FILTER row — a small curated subset of the sheet's
// chips, as a one-tap fast path — plus a control that opens the shared `FilterSheet`
// for the full four-group, multi-select model. Both read and write the SAME
// `CourtFilterState`, so a chip toggled in the sheet lights up here and vice versa;
// there is no second filter vocabulary and no "All" pseudo-value (no chips selected
// IS "all").
//
// PENDING STATES (CLAUDE.md §4 rule 10): the search input, the quick chips and the
// "Filters" control are purely local UI — they mutate in-memory state, never navigate
// and never call a repository — so they carry no PendingButton/PendingLink/spinner.

/**
 * The quick-filter subset: six one-tap chips, one drawn from each of the sheet's four
 * groups, chosen for how often they are the FIRST thing someone narrows by:
 *   • Sea View, Mountains — the two most distinctive Experience tags, and the two the
 *     prototype itself surfaces in its own pill row.
 *   • Clay — the surface a tennis traveller filters on first (and the one the
 *     prototype's pill row shows).
 *   • Resort — the dominant access type in the dataset, and the prototype's pick.
 *   • Indoor — the prototype's pick, and the only weather-driven filter.
 *   • Scenic — the product's own editorial spine ("the world's most beautiful
 *     courts"); it is a real `isScenic` field and the one dimension a chip row can
 *     express in a single tap.
 * This is the prototype's own row (`['All','Resort','Clay','Sea View','Indoor',
 * 'Mountains']`) minus its "All" pseudo-chip, plus Scenic. Every value is typed
 * against `CourtFilterState`, so a rename in the contract vocabulary breaks the build
 * here rather than silently rendering a dead chip.
 */
export const MAP_QUICK_FILTERS: readonly CourtFilterOption[] = [
  { key: 'tags', value: 'Sea View', label: 'Sea View' },
  { key: 'tags', value: 'Mountains', label: 'Mountains' },
  { key: 'surface', value: 'Clay', label: 'Clay' },
  { key: 'access', value: 'Resort', label: 'Resort' },
  { key: 'indoorOutdoor', value: 'Indoor', label: 'Indoor' },
  { key: 'scenic', value: true, label: 'Scenic' },
];

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

/** Three-bar "sliders" glyph — the prototype's filter icon. */
function FilterGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

export interface MapFilterBarProps {
  /** The committed filter state (search text + every selected chip). */
  state: CourtFilterState;
  /** Emitted when the search field changes. */
  onQueryChange: (query: string) => void;
  /** Emitted when a quick chip is tapped — toggles that one value. */
  onToggleOption: (option: CourtFilterOption) => void;
  /** Number of selected chips across every dimension (badge on the Filters control). */
  activeCount: number;
  /** Opens the shared FilterSheet. */
  onOpenSheet: () => void;
}

export function MapFilterBar({
  state,
  onQueryChange,
  onToggleOption,
  activeCount,
  onOpenSheet,
}: MapFilterBarProps) {
  return (
    <div className="sticky top-[72px] z-30 border-b border-hairline bg-bone px-[clamp(16px,4vw,40px)] py-4">
      <div className="mx-auto block container-page items-center gap-3 md:flex">
        {/* Search pill */}
        <div className="pill mb-3 flex h-11 max-w-[480px] flex-1 items-center gap-2.5 border border-hairline bg-ivory px-4 md:mb-0">
          <span className="shrink-0 text-stone">
            <SearchGlyph />
          </span>
          <input
            type="search"
            value={state.q}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search courts, cities, countries…"
            aria-label="Search courts"
            className="body-m w-full min-w-0 border-none bg-transparent text-ink outline-none placeholder:text-stone"
          />
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {/* Quick-filter chips — the fast path. Horizontally scrollable on narrow
              screens; each is a toggle reflecting (and writing) the shared state. */}
          <div
            className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto"
            role="group"
            aria-label="Quick filters"
          >
            {MAP_QUICK_FILTERS.map((option) => {
              const selected = isOptionSelected(state, option);
              return (
                <button
                  key={optionId(option)}
                  type="button"
                  onClick={() => onToggleOption(option)}
                  aria-pressed={selected}
                  className={['filter-pill', selected ? 'is-active' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Opens the full filter sheet. Shows the active-chip count when non-zero —
              the count is in the accessible name too, not colour/shape alone. */}
          <button
            type="button"
            onClick={onOpenSheet}
            aria-haspopup="dialog"
            aria-label={
              activeCount > 0
                ? `Filters, ${activeCount} selected`
                : 'Filters'
            }
            className="filter-pill shrink-0 gap-2"
          >
            <FilterGlyph />
            <span>Filters</span>
            {activeCount > 0 ? (
              <span aria-hidden className="filter-pill-badge">
                {activeCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
