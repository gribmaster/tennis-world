import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { Badge } from '@/components/ui';
import { CourtImage } from './CourtImage';

// CourtCard — the reusable court tile used in every list/grid/carousel (Home's
// featured destinations, Map's list panel, Saved's grid, Court Detail's related
// strip). It is the single source of court-card layout; screens compose it, they
// never re-implement it.
//
// Strictly data-driven & presentational (Phase 1 §4):
//   • Receives a `CourtSummaryDTO` via the `court` prop — it does NOT import
//     @tennis/mock-data, does NOT import any repository, and does NOT fetch.
//   • Renders only from fields on that DTO (name, country/region, surface, access,
//     setting, isScenic, isFeatured, isLocked, heroImageUrl).
//   • No save interaction, no paywall, no navigation side effects of its own — the
//     optional `href` wraps the card in a <Link> for future /courts/[slug] routing,
//     and `saved` is a visual-only state (a future feature wires the real toggle).
//
// The visual is ported from the prototypes' `CourtCard`: full-bleed cover photo,
// bottom-up gradient, eyebrow (country · region) + serif name overlaid at the
// bottom, a top-left "Locked"/"Featured" badge, an optional top-right scenic badge,
// and an optional save heart shown purely as state.

/** Minimal inline lock glyph — avoids pulling in an icon library (hard rule). */
function LockGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Minimal inline heart glyph — `filled` toggles the saved visual. */
function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export interface CourtCardProps {
  /** The court to render. The single source of all displayed content. */
  court: CourtSummaryDTO;
  /**
   * `large` uses a wider 3:2 frame (hero/featured rows); `default` uses the 4:5
   * portrait tile used in grids and carousels.
   */
  variant?: 'default' | 'large';
  /**
   * When set, the whole card becomes a link to this href (intended for
   * `/courts/[slug]`). When omitted, the card renders as a plain article.
   */
  href?: string;
  /**
   * Visual-only saved state. Shows a filled heart when true. There is NO save
   * interaction in this feature — a later feature wires `userRepository.toggleSavedCourt`.
   */
  saved?: boolean;
  /**
   * Whether to render the (non-interactive) save heart at all. Off by default so
   * cards in non-savable contexts stay clean.
   */
  showSaved?: boolean;
  /** Prioritize image loading (use for above-the-fold cards only). */
  priority?: boolean;
  className?: string;
}

export function CourtCard({
  court,
  variant = 'default',
  href,
  saved = false,
  showSaved = false,
  priority = false,
  className,
}: CourtCardProps) {
  const aspect = variant === 'large' ? 'aspect-[3/2]' : 'aspect-[4/5]';

  const card = (
    <article
      className={['court-card group relative block', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <CourtImage
        src={court.heroImageUrl}
        alt={court.name}
        aspectClassName={aspect}
        priority={priority}
      >
        {/* Top-left status: locked takes precedence over featured. */}
        {court.isLocked ? (
          <Badge tone="locked" className="absolute left-3 top-3">
            <LockGlyph />
            Locked
          </Badge>
        ) : court.isFeatured ? (
          <Badge tone="gold" className="absolute left-3 top-3 bg-black/35 backdrop-blur-sm">
            Featured
          </Badge>
        ) : null}

        {/* Top-right scenic flag (visual only). */}
        {court.isScenic ? (
          <Badge
            tone="neutral"
            className="absolute right-3 top-3 border-paper/70 bg-black/25 text-paper backdrop-blur-sm"
          >
            Scenic
          </Badge>
        ) : null}

        {/* Saved heart — VISUAL STATE ONLY, no onClick. A later feature adds the
            real toggle via the user repository. Rendered only when showSaved. */}
        {showSaved ? (
          <span
            className={[
              'absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-pill backdrop-blur-sm',
              saved ? 'bg-black/35 text-clay' : 'bg-black/28 text-paper',
            ].join(' ')}
            aria-label={saved ? 'Saved' : 'Not saved'}
          >
            <HeartGlyph filled={saved} />
          </span>
        ) : null}

        {/* Title block, bottom-left over the gradient. */}
        <div className="absolute inset-x-4 bottom-4 text-paper">
          <p className="eyebrow text-paper/80">
            {[court.country, court.region].filter(Boolean).join(' · ')}
          </p>
          <h3 className="serif mt-1 text-[clamp(18px,1.6vw,24px)] font-medium leading-tight">
            {court.name}
          </h3>
        </div>
      </CourtImage>
    </article>
  );

  // `href` wraps the card for future /courts/[slug] linking. The block-level Link
  // keeps the whole tile clickable while staying a no-op when no href is provided.
  if (href) {
    return (
      <Link href={href} className="block" aria-label={court.name}>
        {card}
      </Link>
    );
  }

  return card as ReactNode;
}
