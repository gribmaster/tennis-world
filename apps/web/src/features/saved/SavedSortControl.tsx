'use client';

import type { CourtSummaryDTO } from '@tennis/contracts';

// SavedSortControl — the Courts tab's ordering control (Feature 77), from the prototype's
// "Recently added ↓" row (tennis_world_v2_standalone.html:1214).
//
// ── WHY THIS IS REAL AND NOT DECORATION ─────────────────────────────────────────────────
// In the prototype the control is inert: a <button> with a caret and no `onClick`. Shipping
// that is precisely the failure `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` exists to prevent,
// so it is either real or absent. It is real — but only over the ordering keys that
// actually exist, which is narrower than the prototype implies:
//
//   • There is NO `savedAt` (or any timestamp) on `CourtSummaryDTO`. The saved-courts read
//     is a `CourtSummaryDTO[]`, and Feature 54 deliberately masks the row down to the
//     shared court-summary select — the join's `savedAt` is used for ORDERING on the
//     server and is never put on the wire. Exposing it would mean a contracts + API
//     change, which this presentation-only feature must not make.
//   • What DOES exist is the order the array arrives in.
//     `apps/api/src/me/saved-courts.service.ts:57` orders `savedAt: 'desc'`, so in `api`
//     mode position 0 is genuinely the most recently saved court. "Recently added" is
//     therefore honoured by PRESERVING the server's order, not by re-sorting on a key we
//     do not have. (In `mock` mode the in-memory seam has no timestamps either and returns
//     a fixed seed order; the label there means "the order your saved list is kept in",
//     which is the same promise, just not time-derived. Nothing is claimed that the data
//     cannot back.)
//   • The alternative offered is `name` — a field every summary carries — as a plain
//     locale-aware A→Z. That is an ordering we can honour exactly.
//
// So the control is a two-option toggle over `SavedSortKey`, applied by `sortSavedCourts`
// to the ALREADY-FETCHED array in memory. No refetch, no query param, no repository call.
//
// ── PENDING PRIMITIVES (CLAUDE.md §4 rule 10) ───────────────────────────────────────────
// Re-ordering an in-memory array is purely local UI: it navigates nowhere and calls no
// API. It therefore gets NO pending primitive and NO spinner — the same judgement the tab
// chips get. It is rendered as a `<select>` so the two options are discoverable and
// keyboard/screen-reader operable without building a bespoke menu; the caret is the
// native one, styled down to the prototype's quiet 12px stone treatment.

export type SavedSortKey = 'recent' | 'name';

const OPTIONS: ReadonlyArray<{ value: SavedSortKey; label: string }> = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name A–Z' },
];

/**
 * Order the saved courts for display.
 *
 * `recent` returns the array AS DELIVERED — that is the server's `savedAt desc` order (see
 * the header note); re-sorting it on a key the DTO does not carry would be a lie.
 * `name` sorts a copy with `localeCompare`, so the input array is never mutated.
 */
export function sortSavedCourts(
  courts: CourtSummaryDTO[],
  key: SavedSortKey,
): CourtSummaryDTO[] {
  if (key === 'name') {
    return [...courts].sort((a, b) => a.name.localeCompare(b.name));
  }
  return courts;
}

export interface SavedSortControlProps {
  value: SavedSortKey;
  onChange: (value: SavedSortKey) => void;
}

export function SavedSortControl({ value, onChange }: SavedSortControlProps) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-stone">
      <span className="sr-only">Sort saved courts</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SavedSortKey)}
        className="cursor-pointer border-none bg-transparent text-[12px] text-stone outline-none focus-visible:underline"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
