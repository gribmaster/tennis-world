'use client';

import { useState } from 'react';

// CourtDetailDescription — the court blurb with the prototype's character clamp and its
// "Read more ↓ / Read less ↑" toggle (design_v2_stripped.html:1078–1088).
//
// PURELY LOCAL UI (CLAUDE.md §4 rule 10): expanding text is not navigation and not a
// mutation — no repository call, no route change. So NO pending primitive, no spinner, no
// `disabled` state, and no `aria-busy`. It is a plain `<button>` with `aria-expanded`,
// which is what this control actually is.
//
// LAYOUT STABILITY: the toggle sits BELOW the paragraph and keeps a fixed label width per
// state, so expanding grows the block downward without shifting anything above it.
//
// THE PULL-QUOTE IS GONE. The v1 page ran the blurb through a `splitBlurb` helper that
// promoted the first sentence to an italic serif pull-quote with the remainder as body
// copy. That treatment is incompatible with this block: the prototype clamps the
// description at a CHARACTER count and reveals the rest inline, so a first sentence
// hoisted into a different typeface would either sit outside the clamp (and never be
// truncated) or be cut mid-quote. The v2 description is one continuous body-copy
// paragraph, so `splitBlurb` was deleted rather than left orphaned in page.tsx.

/** Prototype clamp: `court.desc.slice(0,110)+'…'` (line 1082). */
const CLAMP_CHARS = 110;

function ChevronGlyph({ up }: { up: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={up ? 'rotate-180' : undefined}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export interface CourtDetailDescriptionProps {
  /** The court's blurb (CourtDTO.blurb). */
  blurb: string;
}

export function CourtDetailDescription({ blurb }: CourtDetailDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const text = blurb.trim();
  // Only offer the toggle when clamping would actually hide something — a short blurb
  // renders in full with no dangling "Read more".
  const clampable = text.length > CLAMP_CHARS;
  const shown = !clampable || expanded ? text : `${text.slice(0, CLAMP_CHARS).trimEnd()}…`;

  return (
    <div>
      <p className="body-m leading-[1.6] text-graphite">{shown}</p>
      {clampable ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-clay transition-opacity hover:opacity-80"
        >
          {expanded ? 'Read less' : 'Read more'}
          <ChevronGlyph up={expanded} />
        </button>
      ) : null}
    </div>
  );
}
