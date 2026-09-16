'use client';

import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { courtDisplay } from '@/components/court/court-display';

// HomeSearchBar — the v2 pill search field plus its inline result panel (Feature 74),
// from the prototype's HomeScreen (design_v2_stripped.html:436–467).
//
// Prototype geometry, from the file:
//   • `.search-bar` (line 62): `height:48`, `border-radius:100`, paper background,
//     `padding:0 16px`, `gap:10`. Home overrides the shadow to
//     `0 4px 24px rgba(15,15,15,0.14)` (line 438) — a deeper lift than the CSS default,
//     because the field sits directly under the hero image.
//   • leading 16px search glyph, then the input, then (only when non-empty) a 14px clear
//     control, then a 1×20 divider at `rgba(184,184,182,0.5)`, then the 16px filter
//     control (lines 439–448).
//   • result panel: `borderRadius:12`, `marginTop:8`, `boxShadow:0 4px 24px
//     rgba(15,15,15,0.12)`; each row is `padding:12px 16px` with a 44×44 `radius:8`
//     thumb, a 14px/500 name, a 12px stone location, and one 11px chip on the right,
//     divided by a 1px `rgba(184,184,182,0.2)` hairline (lines 450–466).
//   • empty result: `No courts found for "{query}"` at 13px stone, 16px padding (line 453).
//
// CONTROLLED & PRESENTATIONAL: it owns no filter state. The query text and the result set
// both arrive as props from HomeExplorer (the screen's single stateful boundary) and every
// change is emitted upward. It never fetches and never narrows — `narrowCourts` runs once,
// upstream, so the strip and this panel can never disagree about what matches.
//
// PENDING STATES (CLAUDE.md §4):
//   • Each RESULT ROW navigates to a court ⇒ `PendingCardLink` (rule 1) — the whole row is
//     the tap target, exactly the "whole-card link" case.
//   • The input, the clear control and the filter control are PURELY LOCAL UI (rule 10):
//     they mutate in-memory state, never navigate and never call a repository, so none of
//     them carries a pending primitive or a spinner. This matches `MapFilterBar`, which
//     classifies the identical three controls the same way.
//
// LOCKED COURTS: masking comes from `courtDisplay` (see court-display.ts) — derived from
// the `isLocked` field the summary DTO already carries. No entitlement check, no
// exact-location call.

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

/** Three-bar "sliders" glyph — the prototype's filter icon (same as MapFilterBar's). */
function FilterGlyph() {
  return (
    <svg
      width="16"
      height="16"
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

export interface HomeSearchBarProps {
  /** The current free-text query (owned by HomeExplorer). */
  query: string;
  /**
   * The courts matching the CURRENT query AND chip selection, already narrowed upstream.
   * Rendered only while the query is non-empty. Capped by the caller.
   */
  results: CourtSummaryDTO[];
  /** Selected-chip count, shown on the filter control (0 ⇒ no badge). */
  activeCount: number;
  onQueryChange: (query: string) => void;
  onOpenSheet: () => void;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
}

export function HomeSearchBar({
  query,
  results,
  activeCount,
  onQueryChange,
  onOpenSheet,
  viewerIsEntitled = false,
}: HomeSearchBarProps) {
  const showResults = query.trim().length > 0;

  return (
    <section className="relative z-10 pt-4 md:pt-12 home-search" id="home-search">
      <div className="container-page">
        {/* The pill field. `.pill` + `bg-paper` are the existing primitives; the deeper
            shadow is the prototype's Home-specific override (line 438). */}
        <div
          className="pill flex h-12 md:h-16 items-center gap-2.5 bg-paper px-4"
          style={{ boxShadow: '0 4px 24px rgba(15,15,15,0.14)' }}
        >
          <span aria-hidden className="shrink-0 text-stone">
            <SearchGlyph />
          </span>

          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search courts, cities, countries…"
            aria-label="Search courts"
            className="md:text-[18px] body-m w-full min-w-0 border-none bg-transparent text-ink outline-none placeholder:text-stone [&::-webkit-search-cancel-button]:hidden"
          />

          {/* Clear — only while the field has content, per the prototype (line 441). */}
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="flex shrink-0 items-center p-1 text-stone transition-colors hover:text-ink"
            >
              <CloseGlyph />
            </button>
          ) : null}

          {/* 1×20 divider, then the sheet control (prototype lines 443–447). */}
          <span aria-hidden className="h-5 w-px shrink-0 bg-mist/50" />

          <button
            type="button"
            onClick={onOpenSheet}
            aria-haspopup="dialog"
            aria-label={activeCount > 0 ? `Filters, ${activeCount} selected` : 'Filters'}
            className="flex shrink-0 items-center gap-1.5 p-1.5 text-ink transition-opacity hover:opacity-70"
          >
            <FilterGlyph />
            {activeCount > 0 ? (
              <span aria-hidden className="filter-pill-badge">
                {activeCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Inline results — shown only for a non-empty query (prototype line 450). */}
        {showResults ? (
          <div
            className="mt-2 overflow-hidden rounded-lg bg-paper"
            style={{ boxShadow: '0 4px 24px rgba(15,15,15,0.12)' }}
          >
            {results.length === 0 ? (
              <p className="body-s p-4 text-stone">No courts found for “{query.trim()}”</p>
            ) : (
              <ul>
                {results.map((court) => {
                  const display = courtDisplay(court, viewerIsEntitled);
                  return (
                    <li key={court.id} className="border-b border-mist/20 last:border-b-0">
                      {/* Whole row navigates ⇒ PendingCardLink (§4 rule 1). */}
                      <PendingCardLink
                        href={`/courts/${court.slug}`}
                        ariaLabel={display.name}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md">
                          <Image
                            src={court.heroImageUrl}
                            alt=""
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium leading-tight text-ink">
                            {display.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-stone">
                            {display.location}
                          </span>
                        </span>
                        <span className="meta-chip shrink-0 !px-2.5 !py-1 !text-[11px]">
                          {display.chip}
                        </span>
                      </PendingCardLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
