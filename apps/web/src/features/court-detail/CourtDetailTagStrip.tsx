import type { CourtTag } from '@tennis/contracts';

// CourtDetailTagStrip — the court's Experience tags as a horizontally scrolling chip row
// (prototype `CourtDetailScreen` lines 1062–1069, the `.h-scroll` of `<Label type="exp">`).
//
// SCROLLS, NEVER WRAPS (brief §4): `.chip-exp` chips are `white-space:nowrap` and the row
// is `overflow-x-auto` with `no-scrollbar`, so a court carrying many tags scrolls sideways
// instead of growing a second line and pushing the title block, description and location
// down the page. That is the whole reason the prototype uses `.h-scroll` here.
//
// A court with NO tags renders NOTHING — not an empty row, not a placeholder chip. The
// `tags` array is allowed to be empty (contracts `CourtSummarySchema`), so the caller gets
// `null` and the surrounding vertical rhythm closes up naturally.
//
// The chip styling matches the prototype's `.chip-exp` (line 72): a 6%-ink wash, graphite
// text, pill radius, no border — reusing the existing tokens, not a new chip system.
//
// PRESENTATIONAL: tags are always-public descriptive metadata (contracts note on
// `CourtSummarySchema.tags`) and have nothing to do with the exact-location gate. This
// component receives no coordinates and no lock state.

export interface CourtDetailTagStripProps {
  /** The court's Experience tags, in canonical vocabulary order. May be empty. */
  tags: CourtTag[];
}

export function CourtDetailTagStrip({ tags }: CourtDetailTagStripProps) {
  if (tags.length === 0) return null;

  return (
    <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-[2px] md:px-0">
      {tags.map((tag) => (
        <li key={tag} className="shrink-0">
          {/* `.chip-exp` (prototype line 72), 12px / 5px 10px (line 67). */}
          <span className="inline-flex items-center whitespace-nowrap rounded-pill bg-ink/[0.06] px-2.5 py-[5px] text-[12px] font-medium text-graphite">
            {tag}
          </span>
        </li>
      ))}
    </ul>
  );
}
