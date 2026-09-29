'use client';

import type { ReactNode } from 'react';
import { PendingCardLink } from '@/components/navigation';
import {
  EMPTY_COURT_FILTER_STATE,
  filterStateToMapHref,
  toggleFilterValue,
} from '@/components/filters';
import { HOME_SHORTCUTS } from './home-shortcuts';

// HomeShortcutsRow — the horizontally scrolling circular-icon filter row (Feature 74),
// from the prototype's HomeScreen (design_v2_stripped.html:469–481).
//
// Prototype geometry, from the file:
//   • `.icon-shortcut` (line 131): a vertical stack, `gap:8`, `min-width:64`.
//   • `.icon-shortcut-circle` (line 132): `52×52`, `border-radius:50%`, paper fill,
//     `1px solid rgba(15,15,15,0.1)`, `box-shadow:0 1px 4px rgba(15,15,15,0.08)`.
//     Active inverts to ink fill + ink border (line 133), glyph bone-on-ink.
//   • label: 11px, stone → ink and 400 → 500 weight when active (line 134/477).
//   • the row is `.h-scroll` at `gap:4` (line 471) — a plain overflow-x row, no carousel.
//   • 22px glyphs (line 474).
//
// NAVIGATION, NOT A LOCAL TOGGLE (Task 54): tapping a shortcut now navigates straight to
// `/map` with the equivalent filter pre-applied, instead of narrowing Home's own (much
// shorter) in-memory list in place. Because the tap leaves Home immediately, there is no
// meaningful "currently active" shortcut to show on Home itself — this is a static row of
// links, not a controlled toggle group, and it carries no `state`/`onToggle` props. Each
// shortcut's href is built with the shared `toggleFilterValue` (on a throwaway empty seed,
// carrying Home's current free-text query) + `filterStateToMapHref`, so the URL scheme is
// the exact same one `FilterSheet`'s "View on map" button produces (see
// `components/filters/court-filter-state.ts`).
//
// PENDING STATE: this is real navigation (CLAUDE.md §4 rule 1 — whole-tile navigation),
// so each shortcut uses `PendingCardLink` rather than a plain toggle button.
//
// PRESENTATIONAL & controlled: no state of its own, no fetching, no @tennis/mock-data.

/** 22px stroke glyphs, inline (hard rule: no icon dependency). Keyed by shortcut id. */
const GLYPHS: Record<string, ReactNode> = {
  // Resorts — the prototype's house/building outline (line 337).
  resort: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  // Sea View — horizon over waves.
  sea: (
    <>
      <path d="M2 12h20" />
      <path d="M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
      <circle cx="17" cy="7" r="3" />
    </>
  ),
  // Beach Clubs — palm.
  beach: (
    <>
      <path d="M12 22V11" />
      <path d="M12 11c-3-3-7-2-9 1 3-1 5 0 6 1" />
      <path d="M12 11c3-3 7-2 9 1-3-1-5 0-6 1" />
      <path d="M12 11c0-4 2-6 5-7-3-1-5 1-6 3" />
    </>
  ),
  // Mountains — twin peaks.
  mountains: (
    <>
      <path d="M2 20l6.5-11L13 16l2.5-4L22 20z" />
      <circle cx="7" cy="6" r="2" />
    </>
  ),
  // Clay courts — a court plan.
  clay: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="1" />
      <path d="M12 5v14M2.5 12h19" />
    </>
  ),
  // Historic — a classical facade.
  historic: (
    <>
      <path d="M3 20h18M4 20V10M9 20V10M15 20V10M20 20V10" />
      <path d="M2 10l10-6 10 6z" />
    </>
  ),
  // Private — a padlock.
  private: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
};

function ShortcutGlyph({ id, className }: { id: string, className: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {GLYPHS[id]}
    </svg>
  );
}

export interface HomeShortcutsRowProps {
  /**
   * Home's current free-text query (Task 54) — carried into each shortcut's
   * `/map?...` link so a visitor who already typed something and then taps a
   * shortcut lands on Map with BOTH narrowings applied, not just the shortcut's.
   */
  queryText?: string;
}

export function HomeShortcutsRow({ queryText = '' }: HomeShortcutsRowProps) {
  return (
    <section className="pt-5 home-categories" id="home-categories">
      <div className="container-page">
        <div
          className="no-scrollbar flex gap-1 md:gap-3 overflow-x-auto pb-0.5 md:justify-around"
          role="group"
          aria-label="Filter courts by experience"
        >
          {HOME_SHORTCUTS.map((shortcut) => {
            const href = filterStateToMapHref(
              toggleFilterValue(
                { ...EMPTY_COURT_FILTER_STATE, q: queryText },
                shortcut.option.key,
                shortcut.option.value,
              ),
            );
            return (
              <PendingCardLink
                key={shortcut.id}
                href={href}
                ariaLabel={`${shortcut.label} — view on the map`}
                className="flex min-w-[64px] shrink-0 flex-col items-center gap-2 py-1"
              >
                <span
                  className="flex h-[52px] md:h-[70px] w-[52px] md:w-[70px] items-center justify-center rounded-pill border border-ink/10 bg-paper text-stone transition-colors"
                  style={{ boxShadow: '0 1px 4px rgba(15,15,15,0.08)' }}
                >
                  <ShortcutGlyph id={shortcut.id} className="md:w-[30px] md:h-[30px]" />
                </span>
                <span className="text-center text-[11px] md:text-[14px] leading-tight text-stone">
                  {shortcut.label}
                </span>
              </PendingCardLink>
            );
          })}
        </div>
      </div>
    </section>
  );
}
