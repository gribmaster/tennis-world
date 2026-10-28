// MapSearchBar — the v3 Courts-screen search pill (TASK_57; replaces `MapFilterBar`).
//
// PRESENTATIONAL & controlled: it owns no state and does NOT fetch. The query text and
// the sheet's open/closed flag both live in `MapExplorer` (the screen's single stateful
// boundary); every change is emitted upward. It never imports @tennis/mock-data.
//
// v3 drops the old quick-filter chip row entirely — the filter button here opens the
// SAME shared `FilterSheet` the sheet-dialog already is on both mobile (bottom sheet)
// and desktop (centered dialog), so there is no second filter vocabulary to maintain.
//
// NOT STICKY (v3 is not — the old `sticky top-[var(--nav-offset)]` bar is dropped).
//
// PENDING STATES (CLAUDE.md §4 rule 10): the search input, the clear control and the
// "Filters" control are purely local UI — they mutate in-memory state, never navigate
// and never call a repository — so none of them carries a pending primitive or spinner,
// the same classification MapFilterBar's identical three controls had before it.

function SearchGlyph() {
  return (
    <svg
      width="16"
      height="16"
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

function CloseGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Three-bar "sliders" glyph — the prototype's filter icon (same as HomeSearchBar's). */
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

export interface MapSearchBarProps {
  /** The current free-text query. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Opens the shared FilterSheet. */
  onOpenSheet: () => void;
  /** Number of selected chips across every dimension (the clay dot below). */
  activeCount: number;
  /** Whether the FilterSheet is currently open — inverts the filter button to ink/bone. */
  sheetOpen: boolean;
  className?: string;
}

export function MapSearchBar({
  query,
  onQueryChange,
  onOpenSheet,
  activeCount,
  sheetOpen,
  className,
}: MapSearchBarProps) {
  return (
    <div
      className={[
        'pill flex h-[50px] items-center gap-2.5 bg-paper px-[18px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ boxShadow: '0 2px 12px rgba(15,15,15,0.1)' }}
    >
      <span aria-hidden className="shrink-0 text-stone">
        <SearchGlyph />
      </span>

      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search courts, cities, countries"
        aria-label="Search courts"
        className="body-m w-full min-w-0 border-none bg-transparent text-ink outline-none placeholder:text-stone [&::-webkit-search-cancel-button]:hidden"
      />

      {query ? (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
          className="flex shrink-0 items-center text-stone transition-colors hover:text-ink"
        >
          <CloseGlyph />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onOpenSheet}
        aria-haspopup="dialog"
        aria-label={activeCount > 0 ? `Filters, ${activeCount} selected` : 'Filters'}
        className={[
          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-pill transition-colors md:h-[30px] md:w-[30px]',
          sheetOpen ? 'bg-ink text-bone' : 'text-stone hover:opacity-70',
        ].join(' ')}
      >
        <FilterGlyph />
        {activeCount > 0 ? (
          <span
            aria-hidden
            className="absolute right-[2px] top-[2px] h-[7px] w-[7px] rounded-pill border-[1.5px] border-paper bg-clay"
          />
        ) : null}
      </button>
    </div>
  );
}
