'use client';

import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink, PendingLink } from '@/components/navigation';
import { courtDisplay } from '@/components/court/court-display';
import { HomeCourtSaveHeart } from './HomeCourtSaveHeart';

// HomeFeaturedCourts — the v2 portrait courts strip (Feature 74), rebuilt from the
// prototype's HomeScreen (design_v2_stripped.html:519–575).
//
// Prototype geometry, from the file:
//   • section `padding:'28px 0 0'` (line 520); `.sec-hdr` at the 20px gutter with a serif
//     20px title and a 13px stone "View all" (lines 521–527, CSS line 96).
//   • strip: `.h-scroll` at `gap:14`, `padding:'0 0 4px 20px'`, closed by a 20px spacer so
//     the last card does not sit flush to the edge (lines 535, 570).
//   • card: `width:calc(75vw)`, `maxWidth:292`, `minWidth:240`, `aspectRatio:'2/3'`,
//     `borderRadius:14` (lines 537–538). Neither `CourtCard` variant is 2:3 (they are 4:5
//     and 3:2), which is why this strip renders its own card rather than reusing one.
//   • `.img-overlay` (line 87): `linear-gradient(180deg, rgba(0,0,0,0) 40%,
//     rgba(0,0,0,0.72) 100%)`.
//   • premium badge top-left at `12,12` (line 543, `.premium-badge` line 141: gold
//     gradient, 10px/600, 0.08em, uppercase, pill).
//   • save control top-right at `12,12`, 36×36 (line 545) — see HomeCourtSaveHeart.
//   • text block `padding:'20px 14px 16px'`: a translucent experience chip, then the
//     serif 20px name, then a 13px location at 72% white (lines 551–560).
//   • empty state when a filter clears the strip: centred 14px stone line with a clay
//     "Clear" control (lines 531–533).
//
// PRESENTATIONAL & controlled: the courts arrive already narrowed from HomeExplorer; this
// component never fetches, never filters and never imports @tennis/mock-data. It is a
// client component only because the save heart it hosts is interactive.
//
// PENDING STATES (CLAUDE.md §4):
//   • The whole card navigates ⇒ `PendingCardLink` (rule 1).
//   • "View all" is a navigational link ⇒ `PendingLink` (rule 1).
//   • The save heart is a database-backed action ⇒ the rule-2 triad, inside
//     `HomeCourtSaveHeart`. It is rendered as a SIBLING of the card link, not a child, so
//     saving can never trigger the card's navigation (the same structure SavedCourtsGrid
//     already uses for its unsave control) — a nested <button> inside an <a> would also be
//     invalid HTML.
//   • The empty state's "Clear" control is a LOCAL filter reset (rule 10) — no navigation,
//     no repository call, so no pending primitive.

/** Small lock glyph for the premium badge (prototype: `Ico.lock(10)`). */
function LockGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export interface HomeFeaturedCourtsProps {
  /** The courts to show — already narrowed by the active shortcut/filters. */
  courts: CourtSummaryDTO[];
  /**
   * Section heading. "Featured courts" by default; HomeExplorer swaps in the active
   * shortcut's label while one is selected (prototype line 523).
   */
  title: string;
  /** Ids of the courts the visitor has already saved (seeds each heart). */
  savedCourtIds: ReadonlySet<string>;
  /** False for a logged-out visitor in `api` mode → hearts route to /signin. */
  signedIn: boolean;
  /** Whether anything is currently narrowing the list (drives the empty state). */
  isFiltered: boolean;
  /** Clear every chip and the query — the empty state's escape hatch. */
  onClearFilters: () => void;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
}

export function HomeFeaturedCourts({
  courts,
  title,
  savedCourtIds,
  signedIn,
  isFiltered,
  onClearFilters,
  viewerIsEntitled = false,
}: HomeFeaturedCourtsProps) {
  return (
    <section className="pt-7 md:pt-12 featured-courts" id="featured-courts">
      <div className="container-page">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="serif text-[20px] md:text-[36px] font-normal leading-tight text-ink">{title}</h2>
          <PendingLink
            href="/map"
            className="body-s shrink-0 text-stone transition-colors hover:text-ink"
          >
            View all
          </PendingLink>
        </div>
      </div>

      {courts.length === 0 ? (
        <div className="container-page">
          <p className="py-5 text-center text-[14px] text-stone">
            {isFiltered ? 'No courts for this filter. ' : 'No courts to show yet.'}
            {isFiltered ? (
              // Local filter reset — not navigation, not a mutation (§4 rule 10).
              <button
                type="button"
                onClick={onClearFilters}
                className="text-clay underline-offset-2 transition-opacity hover:opacity-75"
              >
                Clear
              </button>
            ) : null}
          </p>
        </div>
      ) : (
        // Plain overflow-x row — no carousel/slider library (hard rule).
        //
        // GUTTER ALIGNMENT: the row lives INSIDE `.container-page` so its first card
        // lines up with the section header above it at every width (the container is
        // centered and capped at 1280px, so a viewport-relative padding would drift left
        // of the header on wide screens). `-mr-[...]` then cancels only the container's
        // RIGHT gutter, so the row still bleeds off the edge as it scrolls instead of
        // stopping short — the prototype's `padding:'0 0 4px 20px'` effect, kept correct
        // on desktop. A trailing spacer closes the row.
        <div className="container-page">
          <ul className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-3.5 overflow-x-auto pb-1">
            {courts.map((court, index) => {
              const display = courtDisplay(court, viewerIsEntitled);
              return (
                // `relative` so the save heart can position against this box while
                // remaining a SIBLING of the card link, never a descendant of the anchor.
                <li
                  key={court.id}
                  className="relative w-[75vw] min-w-[240px] max-w-[292px] shrink-0"
                >
                  <PendingCardLink
                    href={`/courts/${court.slug}`}
                    ariaLabel={display.name}
                    className="block aspect-[2/3] overflow-hidden rounded-[14px]"
                  >
                    <Image
                      src={court.heroImageUrl}
                      alt=""
                      fill
                      priority={index === 0}
                      sizes="(max-width: 480px) 75vw, 292px"
                      className="object-cover"
                    />
                    {/* `.img-overlay` — transparent to 40%, then to 72% black. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
                      }}
                    />

                    {display.locked ? (
                      <span
                        className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-caption text-paper"
                        style={{ background: 'linear-gradient(135deg,#C8A860,#B89968)' }}
                      >
                        <LockGlyph />
                        Premium
                      </span>
                    ) : null}

                    <span className="absolute inset-x-0 bottom-0 block px-3.5 pb-4 pt-5">
                      <span className="mb-2 inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-1 text-[11px] font-medium tracking-[0.03em] text-paper backdrop-blur-sm">
                        {display.chip}
                      </span>
                      <span className="serif mb-[5px] block text-[20px] font-normal leading-tight text-paper">
                        {display.name}
                      </span>
                      <span className="block text-[13px] text-paper/70">{display.location}</span>
                    </span>
                  </PendingCardLink>

                  {/* Sibling overlay — the save mutation, never the card's navigation. */}
                  <HomeCourtSaveHeart
                    courtId={court.id}
                    courtSlug={court.slug}
                    courtLabel={display.name}
                    initialSaved={savedCourtIds.has(court.id)}
                    signedIn={signedIn}
                  />
                </li>
              );
            })}
            <li aria-hidden className="w-5 shrink-0" />
          </ul>
        </div>
      )}
    </section>
  );
}
