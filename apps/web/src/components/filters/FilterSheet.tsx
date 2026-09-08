'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clearFilterChips,
  countActiveFilters,
  COURT_FILTER_GROUPS,
  isOptionSelected,
  optionId,
  toggleFilterValue,
  type CourtFilterState,
} from './court-filter-state';

// FilterSheet — the shared, feature-agnostic filter bottom-sheet (Feature 73).
//
// ONE component, built once. It imports NOTHING map-specific (no Leaflet, no marker
// model, no `features/map/*`) and takes no screen identity, so Home (Feature 74) can
// mount it unchanged: pass the committed state in, get a committed state back out.
// The prototype duplicates this sheet verbatim inside HomeScreen and MapScreen — this
// component is what collapses that duplication.
//
// DRAFT-THEN-APPLY (the prototype's `pendingFilters` behavior, made real):
//   • Opening seeds a DRAFT copy from the committed state.
//   • Toggling a chip edits the DRAFT ONLY — nothing behind the sheet changes while
//     it is open.
//   • "Show results" commits the draft via `onApply` and closes.
//   • Dismissing (backdrop, Escape, the close control) DISCARDS the draft. The
//     prototype does the same on backdrop click (`setPendingFilters(new Set())`).
//   • "Clear all" empties the DRAFT only — it is not an apply. (The free-text query
//     is not a chip and is owned by the host's search field, so `clearFilterChips`
//     deliberately preserves it.)
//
// PENDING-STATE CLASSIFICATION (CLAUDE.md §4 rule 10): every control in this file is
// PURELY LOCAL UI. The chips, "Clear all", "Show results", the close control and the
// backdrop all mutate in-memory React state — no navigation, no repository call, no
// mutation, nothing that can be in flight or fail. So none of them uses PendingButton
// / PendingLink / useElementPending / InlineSpinner: a spinner here would claim work
// that is not happening. The rule's other clauses still bind and are honored — the
// backdrop is a scoped modal, not a blocking loader for pending work, and it never
// covers the app while something loads.
//
// ACCESSIBILITY (the prototype models none of this; it is added here):
//   • role="dialog" + aria-modal="true", labelled by the "Filters" title.
//   • Focus moves into the sheet on open and is restored to the opener on close.
//   • Focus is TRAPPED while open (Tab/Shift+Tab cycle within the sheet).
//   • Escape closes (discarding the draft).
//   • Background scroll is locked while open.
//   • Every group is a labelled `role="group"`; every chip is a toggle button with
//     `aria-pressed`.
//
// STYLING: prototype geometry (20px top corner radius, the 36×4 mist handle, 20px
// gutters, the 11px/0.08em uppercase stone group labels, chip 8px×16px at pill
// radius, the active chip inverting to ink-on-bone, a 52px full-width primary CTA),
// realized with the EXISTING tokens and globals.css primitives — `.filter-pill` for
// the chips and `.btn .btn-primary` for the CTA. No new palette, no new type scale,
// no second button system.

/** Selector for everything focusable inside the sheet (used by the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseGlyph() {
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
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export interface FilterSheetProps {
  /** Whether the sheet is open. Fully controlled by the host screen. */
  open: boolean;
  /** The COMMITTED filter state. Seeds the draft each time the sheet opens. */
  state: CourtFilterState;
  /** Commit the draft ("Show results"). The host closes the sheet in response. */
  onApply: (next: CourtFilterState) => void;
  /** Dismiss without committing (backdrop, Escape, close control). */
  onClose: () => void;
}

export function FilterSheet({ open, state, onApply, onClose }: FilterSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Remember what had focus before opening so it can be restored on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // THE DRAFT. Seeded from the committed state on every open; discarded on close.
  const [draft, setDraft] = useState<CourtFilterState>(state);
  useEffect(() => {
    if (open) setDraft(state);
    // Intentionally keyed on `open` only: re-seeding whenever the committed `state`
    // object identity changes would wipe the user's in-progress draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftCount = useMemo(() => countActiveFilters(draft), [draft]);

  // Escape to close + focus trap + focus move-in/restore + background scroll lock.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Focus trap: keep Tab / Shift+Tab cycling inside the sheet. Recomputed on every
      // keypress because the chip list is static but the DOM order is what matters.
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus in. The close control is the first tab stop, so the whole sheet is
    // reachable from there by Tab alone.
    (closeButtonRef.current ?? sheetRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  const handleApply = useCallback(() => {
    onApply(draft);
  }, [draft, onApply]);

  // Render nothing when closed, and guard against SSR (the portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    // Backdrop. Bottom-anchored on mobile (the prototype's sheet), centred at md+ so
    // the same component reads as a normal dialog on a wide screen.
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-ink/40 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-[20px] bg-paper pb-10 pt-5 outline-none md:max-h-[85vh] md:max-w-[560px] md:rounded-[20px]"
      >
        {/* Grab handle — 36×4 mist, prototype geometry. Decorative. */}
        <div aria-hidden className="mx-auto mb-5 h-1 w-9 rounded-sm bg-mist" />

        {/* Title row: "Filters" + the underlined "Clear all" + the close control. */}
        <div className="mb-5 flex items-center gap-3 px-5">
          <h2 id={titleId} className="flex-1 text-[17px] font-semibold text-ink">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setDraft((prev) => clearFilterChips(prev))}
            disabled={draftCount === 0}
            className="cursor-pointer border-none bg-transparent text-[13px] text-stone underline transition-opacity hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-stone"
          >
            Clear all
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="-mr-1 flex items-center justify-center p-1.5 text-stone transition-colors hover:text-ink"
          >
            <CloseGlyph />
          </button>
        </div>

        {/* The groups. Rendered from COURT_FILTER_GROUPS, which derives its values from
            the contract vocabularies — a value added to an enum shows up with no edit
            here. */}
        {COURT_FILTER_GROUPS.map((group) => {
          const groupLabelId = `${titleId}-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} className="mb-6 px-5">
              <div
                id={groupLabelId}
                className="mb-3 text-[11px] font-semibold uppercase tracking-caption text-stone"
              >
                {group.label}
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby={groupLabelId}>
                {group.options.map((option) => {
                  const selected = isOptionSelected(draft, option);
                  return (
                    <button
                      key={optionId(option)}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setDraft((prev) => toggleFilterValue(prev, option.key, option.value))
                      }
                      className={['filter-pill', selected ? 'is-active' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Commit. Full-width 52px primary — the existing `.btn .btn-primary`. */}
        <div className="px-5">
          <button type="button" onClick={handleApply} className="btn btn-primary w-full">
            Show results
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
