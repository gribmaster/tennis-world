import type { AccessType, CourtTag } from '@tennis/contracts';

// CourtDetailTagStrip — the court's Experience tags, access classification, and Scenic
// flag as one horizontally scrolling chip row (prototype `CourtDetailScreen` lines
// 1062–1069, the `.h-scroll` of `<Label type="exp">`, which mixes tags/access/Scenic
// together in one flat `court.labels` array — Task 51 carries that fidelity over to the
// real schema's typed `tags` / `access` / `isScenic` fields).
//
// SCROLLS, NEVER WRAPS (brief §4): `.chip-exp` chips are `white-space:nowrap` and the row
// is `overflow-x-auto` with `no-scrollbar`, so a court carrying many tags scrolls sideways
// instead of growing a second line and pushing the title block, description and location
// down the page. That is the whole reason the prototype uses `.h-scroll` here.
//
// `access` is a required, always-populated enum on every court, so the combined row can
// never be empty — unlike the old tags-only version, which could legitimately render
// nothing for a no-tags court.
//
// The chip styling matches the prototype's `.chip-exp` (line 72): a 6%-ink wash, graphite
// text, pill radius, no border — reusing the existing tokens, not a new chip system. Tags,
// access, and Scenic all share this one treatment, matching the prototype's single flat
// `labels` list.
//
// PRESENTATIONAL: tags, access, and isScenic are all always-public descriptive metadata
// (contracts note on `CourtSummarySchema`) and have nothing to do with the exact-location
// gate. This component receives no coordinates and no lock state.

export interface CourtDetailTagStripProps {
  /** The court's Experience tags, in canonical vocabulary order. May be empty. */
  tags: CourtTag[];
  /** The court's access classification — always present, rendered as its own chip. */
  access: AccessType;
  /** Whether this court is flagged scenic — adds a "Scenic" chip when true. */
  isScenic: boolean;
}

export function CourtDetailTagStrip({ tags, access, isScenic }: CourtDetailTagStripProps) {
  const labels: string[] = [...tags, access, ...(isScenic ? ['Scenic'] : [])];

  if (labels.length === 0) return null;

  return (
    <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-[2px] md:px-0">
      {labels.map((label) => (
        <li key={label} className="shrink-0">
          {/* `.chip-exp` (prototype line 72), 12px / 5px 10px (line 67). */}
          <span className="inline-flex items-center whitespace-nowrap rounded-pill bg-ink/[0.06] px-2.5 py-[5px] text-[12px] font-medium text-graphite">
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
