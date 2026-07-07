import Link from 'next/link';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { CourtCard } from '@/components/court';

// HomeFeaturedCourts — the "Destinations" peek carousel, ported from the featured
// destinations section in `files/home.html` (the "This week, we're dreaming of…"
// strip). It's the first data-driven Home section, sitting directly under the
// full-bleed hero.
//
// Purely PRESENTATIONAL & data-driven (Phase 1 §4), exactly like CourtCard:
//   • Receives the courts to show via the `courts` prop — it does NOT call a
//     repository and does NOT import `@tennis/mock-data`. The page (a server
//     component) fetches via `@/lib/repositories` and passes the result in.
//   • Renders content from the DTOs only; the eyebrow/title are section chrome.
//
// Layout mirrors the prototype's `no-scroll-bar` strip: a horizontal, scroll-snap
// card row that lets the next card "peek" at the edge. This is CSS-only
// (overflow-x + snap-x + no-scrollbar) — no JS carousel, per the hard rules. The
// SectionHeader and CTA sit in the page gutter (PageContainer), while the strip is
// full-bleed with matching gutter spacers so the first card aligns to the gutter
// and the last doesn't snap flush to the edge — just like home.html.

export interface HomeFeaturedCourtsProps {
  /** The courts to feature. Expected to be a small set (the prototype shows 6). */
  courts: CourtSummaryDTO[];
  /** Eyebrow caption above the title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Label + href for the trailing "view all" link. */
  cta?: { label: string; href: string };
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

// Section chrome copy (the prototype's "Destinations" / "This week, we're dreaming
// of…" / "View all courts"). Kept as named defaults rather than inline JSX so the
// caller can override and the strings live in one place.
const DEFAULT_EYEBROW = 'Destinations';
const DEFAULT_TITLE = 'This week, we’re dreaming of…';
const DEFAULT_CTA = { label: 'View all courts', href: '/map' } as const;

export function HomeFeaturedCourts({
  courts,
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
}: HomeFeaturedCourtsProps) {
  if (courts.length === 0) return null;

  return (
    <section className="py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader eyebrow={eyebrow} title={title} />
      </PageContainer>

      {/* Full-bleed scroll-snap strip. The leading/trailing spacers reproduce the
          prototype's gutter so cards align to the page edge cleanly. */}
      <div className="no-scrollbar mt-section flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-1">
        <div aria-hidden className="w-[clamp(20px,4vw,64px)] shrink-0" />
        {courts.map((court, i) => (
          <div
            key={court.id}
            className="w-[clamp(240px,72vw,300px)] shrink-0 snap-start"
          >
            <CourtCard
              court={court}
              href={`/courts/${court.slug}`}
              priority={i === 0}
            />
          </div>
        ))}
        <div aria-hidden className="w-[clamp(20px,4vw,64px)] shrink-0" />
      </div>

      <PageContainer className="mt-5">
        <Link
          href={cta.href}
          className="btn btn-ghost inline-flex items-center gap-1.5 !px-0 text-stone"
        >
          {cta.label}
          <ArrowGlyph />
        </Link>
      </PageContainer>
    </section>
  );
}
