import Link from 'next/link';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { CourtImage, CourtMeta } from '@/components/court';

// HomeEditorsCut — the "Editor's Cut" section, ported from `files/home.html`
// (the "Where they're playing this season" block). Stacked editorial rows that
// alternate image/text left-right on desktop and stack image-over-text on mobile.
//
// Purely PRESENTATIONAL & data-driven (Phase 1 §4), like the other Home sections:
//   • Receives the courts to feature via the `courts` prop — it does NOT call a
//     repository and does NOT import `@tennis/mock-data`. The page (a server
//     component) passes in a subset of the featured courts it already fetched, so
//     this section adds NO extra repository call.
//   • Renders content from the DTOs only; the eyebrow/title are section chrome.
//
// NOTE ON THE PULL-QUOTE: the prototype shows an italic pull-quote derived from
// `court.blurb`. `blurb` lives on the full CourtDTO, NOT on the CourtSummaryDTO that
// list()/the Home page provides — so this section intentionally omits the quote
// rather than fetch full detail per court (which Task 5 says to avoid) or invent a
// field the summary shape doesn't carry. Everything else from the prototype row is
// preserved.

// EditorsCutRow — feature-local presentational row. Kept here (not a global
// component) because it's only used by this section; promote it only if real reuse
// appears (Decision #6 / Task 2).
interface EditorsCutRowProps {
  court: CourtSummaryDTO;
  /** Even rows put the image on the left (desktop); odd rows flip to the right. */
  flip: boolean;
}

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function EditorsCutRow({ court, flip }: EditorsCutRowProps) {
  return (
    <Link
      href={`/courts/${court.slug}`}
      aria-label={court.name}
      className="court-card group grid grid-cols-1 border-t border-hairline md:grid-cols-2"
    >
      {/* Image. On desktop it sits left by default, right on flipped rows
          (md:order-last). On mobile it always stacks on top. */}
      <div className={`relative aspect-[4/3] overflow-hidden ${flip ? 'md:order-last' : ''}`}>
        <CourtImage
          src={court.heroImageUrl}
          alt={court.name}
          aspectClassName="aspect-[4/3]"
          withOverlay={false}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>

      {/* Text panel, vertically centered like the prototype. */}
      <div className="flex flex-col justify-center bg-ivory p-[clamp(24px,4vw,56px)]">
        <p className="eyebrow text-stone">
          {[court.country, court.region].filter(Boolean).join(' · ')}
        </p>
        <h3 className="display-l mt-3 text-ink">{court.name}</h3>

        <CourtMeta surface={court.surface} setting={court.setting} className="mt-7" />

        <span className="btn btn-ghost mt-8 inline-flex items-center gap-2 self-start !px-0 text-ink">
          View Court
          <ArrowGlyph />
        </span>
      </div>
    </Link>
  );
}

export interface HomeEditorsCutProps {
  /** The courts to feature as editorial rows. Expected to be a small set (2–3). */
  courts: CourtSummaryDTO[];
  /** Eyebrow caption above the title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
}

// Section chrome copy, ported verbatim from home.html's Editor's Cut block. Kept as
// named defaults (not inline JSX) so strings live in one place and can be overridden.
const DEFAULT_EYEBROW = "Editor's Cut";
const DEFAULT_TITLE = "Where they're playing this season";

export function HomeEditorsCut({
  courts,
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
}: HomeEditorsCutProps) {
  if (courts.length === 0) return null;

  return (
    <section className="bg-ivory py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader eyebrow={eyebrow} title={title} />

        <div className="mt-section flex flex-col">
          {courts.map((court, i) => (
            <EditorsCutRow key={court.id} court={court} flip={i % 2 !== 0} />
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
