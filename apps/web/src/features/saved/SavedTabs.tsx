'use client';

import { useState } from 'react';
import type { CourtSummaryDTO, UserCollectionDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SavedCourtsGrid } from './SavedCourtsGrid';
import { SavedCollectionsGrid } from './SavedCollectionsGrid';
import { SavedWishlistMap } from './SavedWishlistMap';

// SavedTabs — the ONLY 'use client' component on the Saved page (FEATURE_19 §2.2).
//
// It owns exactly ONE piece of state: the active tab. It does NOT fetch (the server
// page does that and passes the data in as props), does NOT import @tennis/mock-data,
// and does NOT use localStorage. It renders the "Saved" header + count, the tab bar,
// and switches between the three presentational panels.
//
// The tab labels are local presentational chrome (not domain data), so the small
// `TABS` const is allowed here — same latitude the Map feature's MapFilterBar takes.

type TabId = 'courts' | 'collections' | 'wishlist';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'courts', label: 'Courts' },
  { id: 'collections', label: 'Collections' },
  { id: 'wishlist', label: 'Wishlist Map' },
];

export interface SavedTabsProps {
  savedCourts: CourtSummaryDTO[];
  savedCollections: UserCollectionDTO[];
}

export function SavedTabs({ savedCourts, savedCollections }: SavedTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('courts');

  // Collections created during this session via the Create-Collection modal (Feature 35).
  // The server page supplies the seed `savedCollections`; folders created client-side are
  // held HERE (this is already the page's only client island) and appended to the visible
  // list so a new folder shows up immediately. This is intentionally NOT global state and
  // NOT localStorage — it lives only for as long as this Saved page is mounted, matching
  // the prototype's `useState`-backed behaviour (lost on reload). MOCK-ONLY.
  const [createdCollections, setCreatedCollections] = useState<UserCollectionDTO[]>([]);

  const collections = [...savedCollections, ...createdCollections];

  return (
    <PageContainer className="py-section-lg md:py-section-xl">
      {/* Header: "Saved" + saved-court count. */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <h1 className="display-l text-ink">Saved</h1>
        <span className="body-s text-stone">
          {savedCourts.length} {savedCourts.length === 1 ? 'court' : 'courts'}
        </span>
      </div>

      {/* Tab bar — underline indicator on the active tab. */}
      <div
        role="tablist"
        aria-label="Saved"
        className="mb-8 flex gap-7 border-b border-hairline"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'relative -mb-px pb-3.5 text-[15px] transition-colors',
                isActive ? 'text-ink' : 'text-stone hover:text-ink',
              ].join(' ')}
            >
              {tab.label}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Panels — only the active one renders. */}
      {activeTab === 'courts' ? <SavedCourtsGrid courts={savedCourts} /> : null}
      {activeTab === 'collections' ? (
        <SavedCollectionsGrid
          collections={collections}
          onCollectionCreated={(collection) =>
            setCreatedCollections((prev) => [...prev, collection])
          }
        />
      ) : null}
      {activeTab === 'wishlist' ? <SavedWishlistMap courts={savedCourts} /> : null}
    </PageContainer>
  );
}
