'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ArticleDTO, CollectionDTO, CourtSummaryDTO } from '@tennis/contracts';
import {
  FilterSheet,
  EMPTY_COURT_FILTER_STATE,
  countActiveFilters,
  hasAnyFilter,
  isOptionSelected,
  narrowCourts,
  toggleFilterValue,
  type CourtFilterState,
} from '@/components/filters';
import { HomeSearchBar } from './HomeSearchBar';
import { HomeShortcutsRow } from './HomeShortcutsRow';
import { HomeFeaturedCourts } from './HomeFeaturedCourts';
import { HomeEditorsCut } from './HomeEditorsCut';
import { HomeCollectionsTeaser } from './HomeCollectionsTeaser';
import { HomeJournalTeaser } from './HomeJournalTeaser';
import { HomePaywallBand } from './HomePaywallBand';
import { HOME_SHORTCUTS, type HomeShortcut } from './home-shortcuts';

// HomeExplorer — the ONE `'use client'` boundary on the Home screen (Feature 74).
//
// It mirrors `features/map/MapExplorer` exactly, one screen over: it holds the single
// `CourtFilterState` (free text + every selected chip) plus the sheet's open flag, and
// derives everything visible IN MEMORY from the props it was handed. It does NOT call a
// repository and does NOT import @tennis/mock-data — `app/page.tsx` is the single data
// boundary and passes the full, unfiltered arrays in.
//
// ONE STATE, THREE EDITORS (the brief's requirement that shortcuts and the sheet agree):
// the search field, the icon-shortcut row and the shared `FilterSheet` all read and write
// the SAME `CourtFilterState` object. A shortcut is not a parallel `activeFilter` id — it
// is a `CourtFilterOption`, the same value type a sheet chip is (see home-shortcuts.ts) —
// so a selection made in one surface is visibly lit in the other with no translation and
// no possibility of drift. The prototype kept them separate, and its sheet's "Show
// results" was a literal no-op comment; that split is precisely what is not reproduced.
//
// SHARED MODULE CONSUMED UNMODIFIED: `FilterSheet`, `CourtFilterState`, `narrowCourts`,
// `toggleFilterValue`, `countActiveFilters` and `isOptionSelected` are used exactly as
// Feature 73 shipped them. Nothing under `components/filters/` was edited for Home, and
// nothing needed to be.
//
// SCALING LIMIT (the same hedge Feature 73 and MapExplorer made, stated again because
// this screen now narrows the full catalogue rather than six rows): narrowing runs
// CLIENT-SIDE over an already-fetched array. That is right at today's ~12 published
// courts — refetching on every keystroke and every shortcut tap would make the screen feel
// laggy for no gain, and the whole set is a few kilobytes. It stops being right once the
// catalogue is large enough that shipping it all to the browser costs more than a query
// would. At that point the fix is already shaped: `toCourtQuery(state)` in
// `components/filters/court-filter-state.ts` produces the wire query for exactly this
// state, so the change is swapping the data source, not rewriting the UI.

/** How many result rows the inline search panel shows (prototype: `.slice(0,6)`). */
const SEARCH_RESULT_LIMIT = 6;
/** How many courts the featured strip shows when nothing is narrowing it. */
const FEATURED_STRIP_LIMIT = 6;
/** How many courts the Editor's Cut stack shows. */
const EDITORS_CUT_LIMIT = 2;

export interface HomeExplorerProps {
  /** The full published set — the source everything on this screen narrows over. */
  courts: CourtSummaryDTO[];
  collections: CollectionDTO[];
  articles: ArticleDTO[];
  /** Ids of the courts this visitor has already saved (seeds the card hearts). */
  savedCourtIds: string[];
  /** False for a logged-out visitor in `api` mode → save hearts route to /signin. */
  signedIn: boolean;
}

export function HomeExplorer({
  courts,
  collections,
  articles,
  savedCourtIds,
  signedIn,
}: HomeExplorerProps) {
  // ONE state object for every dimension the visitor can narrow by (chips + free text).
  // The sheet's open flag is separate: it is view state, not filter state.
  const [filters, setFilters] = useState<CourtFilterState>(EMPTY_COURT_FILTER_STATE);
  const [sheetOpen, setSheetOpen] = useState(false);

  const savedSet = useMemo(() => new Set(savedCourtIds), [savedCourtIds]);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);
  const isFiltered = useMemo(() => hasAnyFilter(filters), [filters]);

  // The one narrowing pass. `narrowCourts` applies OR-within-dimension,
  // AND-across-dimensions, plus the case-insensitive free-text query — the SAME predicate
  // the Map screen uses, so the two screens can never disagree about what a chip means.
  const matchingCourts = useMemo(() => narrowCourts(courts, filters), [courts, filters]);

  // The inline search panel and the courts strip are two views of that ONE result set, so
  // they can never contradict each other.
  const searchResults = useMemo(
    () => matchingCourts.slice(0, SEARCH_RESULT_LIMIT),
    [matchingCourts],
  );

  // The strip: with nothing selected it is the FEATURED subset (the editorial pick this
  // screen has always led with); with anything selected it is the narrowed catalogue,
  // because that is what the visitor just asked to see.
  const stripCourts = useMemo(() => {
    if (isFiltered) return matchingCourts.slice(0, FEATURED_STRIP_LIMIT);
    const featured = courts.filter((court) => court.isFeatured);
    // Fall back to the head of the catalogue if nothing is flagged featured, so the
    // screen's main strip is never empty on a healthy dataset.
    return (featured.length > 0 ? featured : courts).slice(0, FEATURED_STRIP_LIMIT);
  }, [courts, isFiltered, matchingCourts]);

  // The heading becomes the active shortcut's label (prototype line 523). With two or
  // more shortcuts lit no single label is truthful, so it falls back to a neutral one.
  const stripTitle = useMemo(() => {
    const lit = HOME_SHORTCUTS.filter((shortcut) => isOptionSelected(filters, shortcut.option));
    if (lit.length === 1 && lit[0]) return lit[0].label;
    if (isFiltered) return 'Courts';
    return 'Featured courts';
  }, [filters, isFiltered]);

  // Editor's Cut keeps showing editorial picks from the full set — it is a curated stack,
  // not a view of the filter, so a shortcut does not empty it.
  const editorsCutCourts = useMemo(() => {
    const featured = courts.filter((court) => court.isFeatured);
    return (featured.length > 0 ? featured : courts).slice(0, EDITORS_CUT_LIMIT);
  }, [courts]);

  // ── Handlers. All purely local UI: no navigation, no repository call. ────────────────
  const handleQueryChange = useCallback((q: string) => {
    setFilters((prev) => ({ ...prev, q }));
  }, []);

  const handleToggleShortcut = useCallback((shortcut: HomeShortcut) => {
    setFilters((prev) => toggleFilterValue(prev, shortcut.option.key, shortcut.option.value));
  }, []);

  const handleApplyFilters = useCallback((next: CourtFilterState) => {
    setFilters(next);
    setSheetOpen(false);
  }, []);

  const handleCloseSheet = useCallback(() => setSheetOpen(false), []);
  const handleOpenSheet = useCallback(() => setSheetOpen(true), []);

  /** The empty state's escape hatch: clears every chip AND the search text. */
  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_COURT_FILTER_STATE);
  }, []);

  return (
    <>
      <HomeSearchBar
        query={filters.q}
        results={searchResults}
        activeCount={activeCount}
        onQueryChange={handleQueryChange}
        onOpenSheet={handleOpenSheet}
      />

      <HomeShortcutsRow state={filters} onToggle={handleToggleShortcut} />

      {/* The SHARED sheet (components/filters), mounted unmodified — the same component
          instance type MapExplorer mounts. Draft-then-apply lives inside it: nothing here
          changes until "Show results" fires `onApply`. */}
      <FilterSheet
        open={sheetOpen}
        state={filters}
        onApply={handleApplyFilters}
        onClose={handleCloseSheet}
      />

      {/* ── MAP PREVIEW BAND — DELIBERATELY OMITTED (Feature 74) ──────────────────────
          The v2 prototype places a clickable map-preview band here, between the shortcuts
          row and the featured courts strip (design_v2_stripped.html:483–516): a 190px
          image with four decorative gold pins, over an ivory info bar linking to /map.

          It is NOT built, and NOTHING stands in for it — no placeholder image, no second
          Leaflet instance, no coloured box, no "coming soon" panel. The sections above and
          below simply sit next to each other.

          WHY: the band's background is one of the prototype's two inline base64 PNGs, and
          choosing the real asset depends on a decision that has not been made yet — the
          map is migrating off Leaflet/OSM to Google Maps with Snazzy Maps styling, which is
          its own future feature (see docs/MAP_PROVIDER_DECISION.md). Shipping a stand-in
          now would mean drawing a world map in a style the app is about to stop using.
          This band is that migration's work, not this feature's.
          ─────────────────────────────────────────────────────────────────────────────── */}

      <HomeFeaturedCourts
        courts={stripCourts}
        title={stripTitle}
        savedCourtIds={savedSet}
        signedIn={signedIn}
        isFiltered={isFiltered}
        onClearFilters={handleClearFilters}
      />

      <HomeEditorsCut courts={editorsCutCourts} />

      <HomeCollectionsTeaser collections={collections} />

      <HomePaywallBand />

      <HomeJournalTeaser articles={articles} />
    </>
  );
}
