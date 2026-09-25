import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';

// HomeEditorsCut — the editorial "Editor's Cut" section, RESTYLED to the v2 language
// (Feature 74).
//
// KEPT DELIBERATELY (intake §8 Q1, decided): the prototype's Home has no equivalent
// section. It stays because it is the one place on Home that gives a court more than a
// card-sized glance, and a shipped section is not deleted as a redesign side effect.
//
// V2 RESTYLE: the v1 version was a full-width alternating image/text slab pair sized for
// a desktop editorial page — visually the heaviest thing on Home and completely unlike
// anything else in the v2 stack. It is now a WIDE 16:10 editorial card in the same visual
// family as the rest of the screen: the prototype's `.img-overlay` bottom gradient, the
// 14px radius, the serif 20px name and the 13px stone/paper meta line, at the same 20px
// gutter. It reads as a larger sibling of the featured card rather than a different
// design system.
//
// Its ROLE is what keeps it distinct from the featured strip above: the strip is a
// scannable row the visitor filters, this is a small stack of full-width picks. Both point
// at courts; only this one gives each pick the width to be looked at.
//
// LOCKED COURTS: masking comes from the same shared `courtDisplay` helper the strip and
// the search panel use, so a locked court reads "Premium Court" / "Unlock to reveal
// location" identically wherever it appears. The top-left gold "Premium" ribbon (Task 33)
// is copied verbatim from `HomeFeaturedCourts.tsx` — it's the only lock signal left once
// the bottom tag row stops carrying a masked 'Premium' string (category tags are never
// masked; see `courtCategoryTags`).
//
// PRESENTATIONAL & data-driven: courts arrive as a prop from `app/page.tsx` — a subset of
// the set already fetched there, so this section adds NO repository call. No fetching, no
// @tennis/mock-data.
//
// PENDING STATES (CLAUDE.md §4 rule 1): each row is a whole-card navigation ⇒
// `PendingCardLink`. Nothing here mutates, so no save control and no pending triad.

/** Small lock glyph for the premium ribbon (verbatim from HomeFeaturedCourts.tsx). */
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

export interface HomeEditorsCutProps {
  /** The courts to feature. Expected to be a small set (2–3). */
  courts: CourtSummaryDTO[];
  title?: string;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
}

const DEFAULT_TITLE = "Editor's cut";

export function HomeEditorsCut({
  courts,
  title = DEFAULT_TITLE,
  viewerIsEntitled = false,
}: HomeEditorsCutProps) {
  if (courts.length === 0) return null;

  return (
    <section className="pt-7 md:pt-12 editors-list" id="editors-list">
      <div className="container-page">
        <h2 className="serif mb-4 text-[20px] md:text-[36px] font-normal leading-tight text-ink">{title}</h2>

        <ul className="flex flex-col md:flex-row gap-3">
          {courts.map((court) => {
            const display = courtDisplay(court, viewerIsEntitled);
            return (
              <li key={court.id} className="md:w-[75vw] min-w-[240px] md:max-w-[292px] shrink-0">
                <PendingCardLink
                  href={`/courts/${court.slug}`}
                  ariaLabel={display.name}
                  className="block aspect-[2/3] overflow-hidden rounded-[14px]"
                >
                  <Image
                    src={court.heroImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 1280px"
                    className="object-cover"
                  />
                  {/* `.img-overlay` — the same gradient the v2 cards use. */}
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

                  <span className="absolute inset-x-0 bottom-0 block px-4 pb-4 pt-6">
                    <span className="mb-2 flex flex-wrap gap-1.5">
                      {courtCategoryTags(court).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-1 text-[11px] font-medium tracking-[0.03em] text-paper backdrop-blur-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                    <span className="serif mb-[5px] block text-[24px] font-normal leading-[30px] text-paper">
                      {display.name}
                    </span>
                    <span className="block text-[13px] text-paper/70">{display.location}</span>
                  </span>
                </PendingCardLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
