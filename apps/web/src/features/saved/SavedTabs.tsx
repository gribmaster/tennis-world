'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CourtSummaryDTO, UserCollectionDTO } from '@tennis/contracts';
import { SavedCourtsGrid } from './SavedCourtsGrid';
import { SavedCollectionsGrid } from './SavedCollectionsGrid';
import { SavedWishlistMap } from './SavedWishlistMap';
import { SavedSortControl, sortSavedCourts, type SavedSortKey } from './SavedSortControl';

// SavedTabs — the ONLY 'use client' component on the Saved page, rebuilt to the v2
// prototype's `SavedScreen` (tennis_world_v2_standalone.html:1192–1290).
//
// It still owns exactly the state it owned before (the active tab, plus the folders
// created in-session) and gains ONE more: the Courts tab's sort key. It does NOT fetch
// (the server page does that and passes the data in as props), does NOT import
// @tennis/mock-data, and does NOT use localStorage.
//
// Prototype geometry, from the file:
//   • header block `padding:'52px 20px 0'` (line 1201) — the top inset is `pt-8` under
//     AppShell's standard 72px header offset, the 20px side gutter is `.container-page`.
//   • title `className="serif display-l"` (line 1202); subtitle `fontSize:13`,
//     `color:'var(--stone)'`, `marginTop:4` (line 1203).
//   • tab row `display:'flex', gap:10, marginTop:16` (line 1204); each tab is a
//     `label-chip chip-filter` with `flex:1`, centred `gap:8`, `fontSize:14`,
//     `fontWeight:600`, `padding:'12px 0'` (line 1206).
//   • count/sort row `justifyContent:'space-between'`, `marginTop:16`, `marginBottom:12`;
//     count `fontSize:13, fontWeight:500` (lines 1211–1216).
//
// ── THREE TABS, NOT TWO (intake §8 Q2, DECIDED) ─────────────────────────────────────────
// The prototype draws Courts and Collections only. "Wishlist Map" is a shipped feature and
// is NOT deleted as a redesign side effect — it stays as a third tab. The tab control is
// restyled to the prototype's chip language and holds three chips instead of two; the row
// below carries the note on how the third one is made to fit at 390px.
//
// ── TAB SWITCHING IS PURELY LOCAL UI (CLAUDE.md §4 rule 10) ─────────────────────────────
// Changing tabs performs no navigation and no repository call — the data for all three
// panels is already in hand. So the tab chips are plain <button role="tab">s with NO
// pending primitive and NO spinner, exactly as rule 10 requires. The same holds for the
// sort control (see SavedSortControl).

/** The prototype's `Ico.court(18)` — a tennis-court plan glyph (line 264). */
function CourtGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="6" y1="4" x2="6" y2="20" strokeDasharray="2 2" />
      <line x1="18" y1="4" x2="18" y2="20" strokeDasharray="2 2" />
    </svg>
  );
}

/** The prototype's `Ico.collect(18)` — a 2×2 grid glyph (line 243). */
function CollectGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

/** The prototype's `Ico.map(18)` — the third tab has no prototype icon; this is its own. */
function MapGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

type TabId = 'courts' | 'collections' | 'wishlist';

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: () => React.ReactElement }> = [
  { id: 'courts', label: 'Courts', icon: CourtGlyph },
  { id: 'collections', label: 'Collections', icon: CollectGlyph },
  { id: 'wishlist', label: 'Wishlist Map', icon: MapGlyph },
];

const SUBTITLE = 'All your favourite tennis destinations in one place.';

export interface SavedTabsProps {
  savedCourts: CourtSummaryDTO[];
  savedCollections: UserCollectionDTO[];
  /**
   * Whether this viewer carries an active (non-free) membership (Task 26). Resolved
   * server-side, once, in `app/saved/page.tsx` — unmasks locked-court names/locations on
   * the Courts tab grid and the Wishlist Map markers for an entitled viewer.
   */
  viewerIsEntitled?: boolean;
}

export function SavedTabs({
  savedCourts,
  savedCollections,
  viewerIsEntitled = false,
}: SavedTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('courts');
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

  // The count line reflects the ACTIVE tab (prototype line 1213). Wishlist Map plots the
  // same saved courts, so it shares the courts count.
  const count = activeTab === 'collections' ? collections.length : courts.length;

  return (
    <div className="bg-bone pb-section-lg">
      <header className="container-page pt-8">
        <h1 className="serif display-l text-ink">Saved</h1>
        <p className="mt-1 text-[13px] leading-snug text-stone">{SUBTITLE}</p>
      </header>

      {/* Tab chips — prototype `label-chip chip-filter`, which the shared `.filter-pill`
          primitive already expresses (bone/mist when idle, ink/bone when active). No new
          button system is introduced for this row.
          FITTING THREE AT 390px: the prototype sized two chips at `flex:1` against the
          primitive's 16px side padding. The third chip this screen keeps ("Wishlist Map",
          intake §8 Q2) overflows that row on a 390px viewport — 409px of chips in 346px of
          content width — so the row trims its own horizontal padding and lets the labels
          wrap rather than hiding a tab behind a scroll or dropping its icon. From `sm` up
          there is room, so the chips return to the primitive's natural sizing. */}
      <div className="container-page mt-4">
        <div role="tablist" aria-label="Saved" className="flex gap-2">
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
                  'filter-pill flex-1 justify-center gap-1.5 whitespace-normal px-1.5 py-3',
                  'text-[13px] font-semibold leading-tight sm:gap-2 sm:px-4 sm:text-[14px]',
                  isActive ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Count + sort row. */}
        <div className="mb-3 mt-4 flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-ink">{count} saved</span>
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
          <SavedCollectionsGrid
            collections={collections}
            onCollectionCreated={(collection) =>
              setCreatedCollections((prev) => [...prev, collection])
            }
          />
        ) : null}
        {activeTab === 'wishlist' ? (
          <SavedWishlistMap courts={courts} viewerIsEntitled={viewerIsEntitled} />
        ) : null}
      </div>
    </div>
  );
}
