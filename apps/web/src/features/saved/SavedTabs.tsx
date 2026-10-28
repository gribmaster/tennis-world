'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CollectionDTO, CourtSummaryDTO, UserCollectionDTO } from '@tennis/contracts';
import { SavedCourtsGrid } from './SavedCourtsGrid';
import { SavedCollectionsGrid } from './SavedCollectionsGrid';
import { SavedEditorialCollectionsGrid } from './SavedEditorialCollectionsGrid';
import { SavedWishlistMap } from './SavedWishlistMap';
import { SavedSortControl, sortSavedCourts, type SavedSortKey } from './SavedSortControl';
import { CourtGlyph, CollectGlyph, MapGlyph } from './saved-glyphs';

// SavedTabs — the ONLY 'use client' component on the Saved page, rebuilt to the v3
// `SavedScreen` layout (TASK_61 — see docs/TASK_61_V3_PROFILE_SAVED_SETTINGS.md §2): a
// single header+tabs row that stacks on mobile and spreads out at md+ (title left, tab
// chips right), a count/sort row, and the three panels below.
//
// It still owns exactly the state it owned before (the active tab, plus the folders
// created in-session) and gains ONE more: the Courts tab's sort key. It does NOT fetch
// (the server page does that and passes the data in as props), does NOT import
// @tennis/mock-data, and does NOT use localStorage.
//
// ── THREE TABS, NOT TWO (intake §8 Q2, DECIDED) ─────────────────────────────────────────
// v3 draws Courts and Collections only. "Wishlist Map" is a shipped feature and is NOT
// deleted as a redesign side effect — it stays as a third tab (TASK_61 decision 5). The
// tab control is the shared `.filter-pill` chip, and the row below carries the note on
// how the third one is made to fit at 390px.
//
// ── TAB SWITCHING IS PURELY LOCAL UI (CLAUDE.md §4 rule 10) ─────────────────────────────
// Changing tabs performs no navigation and no repository call — the data for all three
// panels is already in hand. So the tab chips are plain <button role="tab">s with NO
// pending primitive and NO spinner, exactly as rule 10 requires. The same holds for the
// sort control (see SavedSortControl), which stays visible at every size (decision 6).

export type TabId = 'courts' | 'collections' | 'wishlist';

const TABS: ReadonlyArray<{
  id: TabId;
  label: string;
  icon: (props: { size?: number }) => React.ReactElement;
}> = [
  { id: 'courts', label: 'Courts', icon: CourtGlyph },
  { id: 'collections', label: 'Collections', icon: CollectGlyph },
  { id: 'wishlist', label: 'My Map', icon: MapGlyph },
];

const SUBTITLE = 'All your favourite tennis destinations in one place.';

export interface SavedTabsProps {
  savedCourts: CourtSummaryDTO[];
  savedCollections: UserCollectionDTO[];
  /**
   * The editorial collections this visitor has bookmarked via the save heart (Task 42) —
   * DISTINCT from `savedCollections` above, which is the visitor's OWN wishlist folders.
   * Rendered as its own "Saved Collections" section on the Collections tab, alongside (not
   * replacing) the folders section.
   */
  savedEditorialCollections: CollectionDTO[];
  /**
   * Whether this viewer carries an active (non-free) membership (Task 26). Resolved
   * server-side, once, in `app/saved/page.tsx` — unmasks locked-court names/locations on
   * the Courts tab grid and the Wishlist Map markers for an entitled viewer.
   */
  viewerIsEntitled?: boolean;
  /**
   * Which tab opens initially, driven by the page's `?tab=` search param (Task 44) so
   * `/profile`'s Collections/Countries stat links can deep-link straight into the
   * matching tab. Defaults to `'courts'`, today's behaviour.
   */
  initialTab?: TabId;
}

export function SavedTabs({
  savedCourts,
  savedCollections,
  savedEditorialCollections,
  viewerIsEntitled = false,
  initialTab,
}: SavedTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'courts');
  const [sortKey, setSortKey] = useState<SavedSortKey>('recent');

  // Courts optimistically unsaved on the Courts tab. This lives HERE, not inside
  // SavedCourtsGrid, because the header's "N saved" count and the Wishlist Map's markers
  // are rendered from the same list: keeping it in the grid let the count say "5 saved"
  // with four cards on screen. One source of truth for membership, three readers.
  const [unsavedIds, setUnsavedIds] = useState<ReadonlySet<string>>(new Set());

  const handleUnsavedChange = useCallback((courtId: string, unsaved: boolean) => {
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      if (unsaved) next.add(courtId);
      else next.delete(courtId);
      return next;
    });
  }, []);

  // Editorial collections optimistically unsaved on the Collections tab's "Saved
  // Collections" section (Task 42). A SEPARATE set from `unsavedIds` above — that one is
  // scoped to courts (read by the Wishlist Map too); conflating the two would let unsaving
  // a collection accidentally affect the courts count/map.
  const [unsavedEditorialCollectionIds, setUnsavedEditorialCollectionIds] = useState<
    ReadonlySet<string>
  >(new Set());

  const handleEditorialUnsavedChange = useCallback(
    (collectionId: string, unsaved: boolean) => {
      setUnsavedEditorialCollectionIds((prev) => {
        const next = new Set(prev);
        if (unsaved) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });
    },
    [],
  );

  // Collections created during this session via the Create-Collection modal (Feature 35).
  // The server page supplies the seed `savedCollections`; folders created client-side are
  // held HERE (this is already the page's only client island) and appended to the visible
  // list so a new folder shows up immediately. This is intentionally NOT global state and
  // NOT localStorage — it lives only for as long as this Saved page is mounted.
  const [createdCollections, setCreatedCollections] = useState<UserCollectionDTO[]>([]);

  const collections = useMemo(
    () => [...savedCollections, ...createdCollections],
    [savedCollections, createdCollections],
  );

  // The live saved list: the server's, minus anything unsaved in this session.
  const courts = useMemo(
    () => savedCourts.filter((court) => !unsavedIds.has(court.id)),
    [savedCourts, unsavedIds],
  );

  // Client-side ordering over the ALREADY-FETCHED array — no refetch, no query param.
  const orderedCourts = useMemo(() => sortSavedCourts(courts, sortKey), [courts, sortKey]);

  // Editorial collections currently visible in the "Saved Collections" section — the
  // server's list minus anything unsaved in this session.
  const visibleEditorialCollections = useMemo(
    () =>
      savedEditorialCollections.filter(
        (collection) => !unsavedEditorialCollectionIds.has(collection.id),
      ),
    [savedEditorialCollections, unsavedEditorialCollectionIds],
  );

  // The count line reflects the ACTIVE tab (prototype line 1213). Wishlist Map plots the
  // same saved courts, so it shares the courts count. The Collections tab's count COMBINES
  // the visitor's own folders and their saved editorial collections (Task 42, decided) —
  // the tab's job is "everything under Collections," not folders alone.
  const count =
    activeTab === 'collections'
      ? collections.length + visibleEditorialCollections.length
      : courts.length;

  return (
    <div className="bg-bone pb-section-lg min-h-[70vh]">
      {/* Header + tabs — ONE flex container (TASK_61 §2): stacked on mobile (title,
          subtitle, tabs below), spread into a single row at md+ (title left, tab chips
          right). */}
      <div className="container-page pt-8 md:pt-11 flex flex-col md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-5">
        <div>
          <h1 className="serif display-l text-ink md:text-[40px] md:font-normal md:leading-[1.1]">
            Saved
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-stone md:text-[14px] md:mt-1.5">
            {SUBTITLE}
          </p>
        </div>

        {/* Tab chips — prototype `label-chip chip-filter`, which the shared `.filter-pill`
            primitive already expresses (bone/mist when idle, ink/bone when active). No new
            button system is introduced for this row.
            FITTING THREE AT 390px: two chips at `flex:1` against the primitive's 16px side
            padding overflows at 390px with a third chip ("Wishlist Map", intake §8 Q2) —
            409px of chips in 346px of content width — so on mobile the row trims its own
            horizontal padding and lets the labels wrap rather than hiding a tab behind a
            scroll or dropping its icon. From `sm` up there is room, so the chips return to
            the primitive's natural sizing; at md+ they sit at the header's right edge with
            their own (larger) natural-width sizing. */}
        <div
          role="tablist"
          aria-label="Saved"
          className="flex gap-2 mt-4 md:mt-0 md:gap-2.5"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'filter-pill justify-center gap-1.5 whitespace-normal px-2.5 py-3 md:flex-none',
                  'text-[13px] font-semibold leading-tight sm:gap-2 sm:px-4 sm:text-[14px]',
                  'md:px-5 md:py-2.5 md:text-[13px] md:gap-2',
                  isActive ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="md:hidden">
                  <Icon />
                </span>
                <span className="hidden md:inline-flex">
                  <Icon size={16} />
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="container-page">
        {/* Count + sort row. */}
        <div className="mb-3 mt-4 flex items-center justify-between gap-3 md:mt-7 md:mb-4">
          <span className="text-[13px] font-medium text-ink md:text-stone">{count} saved</span>
          {activeTab === 'courts' && courts.length > 1 ? (
            <SavedSortControl value={sortKey} onChange={setSortKey} />
          ) : null}
        </div>
      </div>

      {/* Panels — only the active one renders. */}
      <div className="container-page">
        {activeTab === 'courts' ? (
          <SavedCourtsGrid
            courts={orderedCourts}
            unsavedIds={unsavedIds}
            onUnsavedChange={handleUnsavedChange}
            viewerIsEntitled={viewerIsEntitled}
          />
        ) : null}
        {activeTab === 'collections' ? (
          <div className="flex flex-col">
            {/* Saved Collections — editorial collections this visitor has bookmarked via
                the heart (Task 42). Only rendered alongside a non-empty grid (the grid
                itself returns null when empty), so there is never a bare heading. */}
            {visibleEditorialCollections.length > 0 ? (
              <div>
                <h3 className="mb-3 text-[16px] font-semibold text-ink md:mb-4 md:text-[17px]">
                  Saved Collections
                </h3>
                <SavedEditorialCollectionsGrid
                  collections={visibleEditorialCollections}
                  unsavedIds={unsavedEditorialCollectionIds}
                  onUnsavedChange={handleEditorialUnsavedChange}
                />
              </div>
            ) : null}

            {/* Your Folders — the visitor's own wishlist folders, unchanged. */}
            <div className="mt-6 md:mt-8">
              <h3 className="mb-3 text-[16px] font-semibold text-ink md:mb-4 md:text-[17px]">
                Your Folders
              </h3>
              <SavedCollectionsGrid
                collections={collections}
                onCollectionCreated={(collection) =>
                  setCreatedCollections((prev) => [...prev, collection])
                }
              />
            </div>
          </div>
        ) : null}
        {activeTab === 'wishlist' ? (
          <SavedWishlistMap courts={courts} viewerIsEntitled={viewerIsEntitled} />
        ) : null}
      </div>
    </div>
  );
}
