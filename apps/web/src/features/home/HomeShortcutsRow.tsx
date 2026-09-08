'use client';

import type { ReactNode } from 'react';
import { isOptionSelected, type CourtFilterState } from '@/components/filters';
import { HOME_SHORTCUTS, type HomeShortcut } from './home-shortcuts';

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
// SHARED STATE, NOT A SECOND VOCABULARY: each shortcut is a `CourtFilterOption` (see
// home-shortcuts.ts) — the same type the FilterSheet's own chips are. Selection is read
// with the shared `isOptionSelected` and written by emitting the option upward, so a
// shortcut lit here is a chip lit in the sheet, and vice versa, with no mapping step. The
// prototype instead kept a separate `activeFilter` id that its filter sheet ignored
// entirely; that split is exactly what this does not reproduce.
//
// PENDING STATES (CLAUDE.md §4 rule 10): these are LOCAL UI TOGGLES. Tapping one narrows
// an already-fetched in-memory array — no navigation, no repository call, nothing that can
// be in flight or fail. So no PendingButton, no spinner: an indicator here would claim
// work that is not happening. Each is a plain toggle `<button>` with `aria-pressed`, which
// is what rule 9 permits (the rule bars a raw button where a primitive COVERS the case —
// no primitive covers, or should cover, a local toggle).
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

function ShortcutGlyph({ id }: { id: string }) {
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
    >
      {GLYPHS[id]}
    </svg>
  );
}

export interface HomeShortcutsRowProps {
  /** The committed filter state — the shortcuts read their lit/unlit look from it. */
  state: CourtFilterState;
  /** Toggle one shortcut's value in the shared state. */
  onToggle: (shortcut: HomeShortcut) => void;
}

export function HomeShortcutsRow({ state, onToggle }: HomeShortcutsRowProps) {
  return (
    <div className="pt-5">
      <div className="container-page">
        <div
          className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Filter courts by experience"
        >
          {HOME_SHORTCUTS.map((shortcut) => {
            const active = isOptionSelected(state, shortcut.option);
            return (
              <button
                key={shortcut.id}
                type="button"
                onClick={() => onToggle(shortcut)}
                aria-pressed={active}
                className="flex min-w-[64px] shrink-0 flex-col items-center gap-2 py-1"
              >
                <span
                  className={[
                    'flex h-[52px] w-[52px] items-center justify-center rounded-pill border transition-colors',
                    active
                      ? 'border-ink bg-ink text-bone'
                      : 'border-ink/10 bg-paper text-stone',
                  ].join(' ')}
                  style={active ? undefined : { boxShadow: '0 1px 4px rgba(15,15,15,0.08)' }}
                >
                  <ShortcutGlyph id={shortcut.id} />
                </span>
                <span
                  className={[
                    'text-center text-[11px] leading-tight',
                    active ? 'font-medium text-ink' : 'text-stone',
                  ].join(' ')}
                >
                  {shortcut.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
