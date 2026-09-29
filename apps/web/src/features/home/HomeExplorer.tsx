'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ArticleDTO, CollectionDTO, CourtSummaryDTO } from '@tennis/contracts';
import {
  FilterSheet,
  EMPTY_COURT_FILTER_STATE,
  countActiveFilters,
  filterStateToMapHref,
  hasAnyFilter,
  narrowCourts,
  type CourtFilterState,
} from '@/components/filters';
import { HomeSearchBar } from './HomeSearchBar';
import { HomeShortcutsRow } from './HomeShortcutsRow';
import { HomeFeaturedCourts } from './HomeFeaturedCourts';
import { HomeEditorsCut } from './HomeEditorsCut';
import { HomeCollectionsTeaser } from './HomeCollectionsTeaser';
import { HomeJournalTeaser } from './HomeJournalTeaser';
import { HomePaywallBand } from './HomePaywallBand';
import { HomeMapPreviewBand } from './HomeMapPreviewBand';

// HomeExplorer — the ONE `'use client'` boundary on the Home screen (Feature 74).
//
// It mirrors `features/map/MapExplorer` exactly, one screen over: it holds the single
// `CourtFilterState` (free text + every selected chip) plus the sheet's open flag, and
// derives everything visible IN MEMORY from the props it was handed. It does NOT call a
// repository and does NOT import @tennis/mock-data — `app/page.tsx` is the single data
// boundary and passes the full, unfiltered arrays in.
//
// ONE LOCAL STATE, ONE NAVIGATING SURFACE (Task 54): the search field still narrows
// Home's own in-memory strip through the SAME `CourtFilterState` object as before. The
// icon-shortcut row and the shared `FilterSheet`'s primary action no longer write into
// that state, though — both now hand off to `/map` (via `filterStateToMapHref`), already
// filtered, instead of narrowing Home's own (much shorter) list in place. The prototype's
// "Show results" was a literal no-op; this screen's version is a real navigation.
//
// SHARED MODULE CONSUMED UNMODIFIED: `FilterSheet`, `CourtFilterState`, `narrowCourts`
// and `countActiveFilters` are used exactly as Feature 73 shipped them. Nothing under
// `components/filters/` was edited for Home's own local-state handling.
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
  /** Ids of the editorial collections this visitor has already saved (Task 42). */
  savedCollectionIds: string[];
  /** False for a logged-out visitor in `api` mode → save hearts route to /signin. */
  signedIn: boolean;
  /**
   * Whether this viewer carries an active (non-free) membership (Task 26). Resolved
   * server-side, once, in `app/page.tsx` — unmasks locked-court names/locations across
   * the featured strip, inline search and Editor's Cut for an entitled viewer.
   */
  viewerIsEntitled?: boolean;
}

export function HomeExplorer({
  courts,
  collections,
  articles,
  savedCourtIds,
  savedCollectionIds,
  signedIn,
  viewerIsEntitled = false,
}: HomeExplorerProps) {
  const router = useRouter();

  // ONE state object for every dimension the visitor can narrow by (chips + free text).
  // The sheet's open flag is separate: it is view state, not filter state.
  const [filters, setFilters] = useState<CourtFilterState>(EMPTY_COURT_FILTER_STATE);
  const [sheetOpen, setSheetOpen] = useState(false);

  const savedSet = useMemo(() => new Set(savedCourtIds), [savedCourtIds]);
  const savedCollectionSet = useMemo(
    () => new Set(savedCollectionIds),
    [savedCollectionIds],
  );
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

  // No shortcut can ever be "active" in Home's own state anymore (Task 54 — shortcuts
  // navigate to /map instead of setting local state), so the heading only ever reflects
  // the free-text query.
  const stripTitle = isFiltered ? 'Courts' : 'Featured courts';

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

  // handleToggleShortcut is REMOVED — HomeShortcutsRow now builds its own /map hrefs
  // directly (Task 54) and needs no callback from here.

  const handleApplyFilters = useCallback(
    (next: CourtFilterState) => {
      setSheetOpen(false);
      router.push(filterStateToMapHref(next));
    },
    [router],
  );

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
        viewerIsEntitled={viewerIsEntitled}
      />

      <HomeShortcutsRow queryText={filters.q} />

      {/* The SHARED sheet (components/filters), mounted unmodified — the same component
          instance type MapExplorer mounts. Draft-then-apply lives inside it: nothing here
          changes until the primary button fires `onApply`, which now navigates to /map
          (Task 54) rather than committing locally, so the label says so. */}
      <FilterSheet
        open={sheetOpen}
        state={filters}
        onApply={handleApplyFilters}
        onClose={handleCloseSheet}
        primaryCtaLabel="View on map"
      />

      {/* Map preview band (Task 30) — both blockers behind Feature 74's deferral are now
          cleared: the map engine migrated to Google Maps (Tasks 16–24), and the user
          supplied a real asset for the background (see HomeMapPreviewBand's own header). */}
      <HomeMapPreviewBand />

      <HomeFeaturedCourts
        courts={stripCourts}
        title={stripTitle}
        savedCourtIds={savedSet}
        signedIn={signedIn}
        isFiltered={isFiltered}
        onClearFilters={handleClearFilters}
        viewerIsEntitled={viewerIsEntitled}
      />

      <HomeEditorsCut
        courts={editorsCutCourts}
        viewerIsEntitled={viewerIsEntitled}
        savedCourtIds={savedSet}
        signedIn={signedIn}
      />

      <HomeCollectionsTeaser
        collections={collections}
        savedCollectionIds={savedCollectionSet}
        signedIn={signedIn}
      />

      {!viewerIsEntitled ? <HomePaywallBand /> : null}

      <HomeJournalTeaser articles={articles} />
    </>
  );
}
