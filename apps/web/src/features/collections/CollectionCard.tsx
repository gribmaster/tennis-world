import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CollectionCard — the Featured strip / Saved-tab editorial-collections tile. Restyled
// for TASK_60 (v3): desktop grows to a 3-column 260px-tall card, the arrow affordance can
// now show on mobile too, and the count pill handles the singular. TASK_61 adds the
// `compact` prop for the Saved tab's "Saved Collections" tile (no description, no arrow
// circle, smaller name/pill scale, its own 150/200px tile radius/padding). The CONTRACT
// is unchanged — one `CollectionDTO`, links to `/collections/{slug}` — so every existing
// guarantee about this component (presentational, no repository, PendingCardLink
// navigation) still holds, and `/collections`' Featured strip renders exactly as before
// (every new prop defaults off).
//
// THE ARROW IS DECORATION, NOT A CONTROL — see `ArrowGlyph`'s own note. `arrowOnMobile`
// only changes whether it is VISIBLE on small screens; it never gets a handler.
//
// PRESENTATIONAL & data-driven: renders the `collection` it is handed and never fetches.
// `description` is optional, so the subtitle renders only when present.

/** v3's `Ico.arrow` — a right-pointing arrow inside the circle. `size` added (TASK_60) for the md+ 15px glyph; the pre-existing 14px look is the default. */
function ArrowGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export interface CollectionCardProps {
  collection: CollectionDTO;
  /** Prioritize image loading (above-the-fold cards only). */
  priority?: boolean;
  className?: string;
  /**
   * Show the decorative arrow affordance below md too (TASK_60's Featured strip).
   * Defaults to `false` — the Saved tab's 150px tiles keep their desktop-only arrow.
   */
  arrowOnMobile?: boolean;
  /** next/image `sizes`. Defaults to the pre-existing fixed 200px look. */
  sizes?: string;
  /**
   * TASK_61: the Saved tab's "Saved Collections" tile — no description line, no arrow
   * circle (only the count pill and the name), smaller name/pill scale, and the 150/200px
   * tile's own radius/padding. Defaults to `false` so `/collections` is untouched.
   */
  compact?: boolean;
}

export function CollectionCard({
  collection,
  priority = false,
  className,
  arrowOnMobile = false,
  sizes = '200px',
  compact = false,
}: CollectionCardProps) {
  const countLabel = `${collection.count} ${collection.count === 1 ? 'court' : 'courts'}`;

  return (
    <PendingCardLink
      href={`/collections/${collection.slug}`}
      ariaLabel={collection.name}
      className={[
        'block h-full w-full overflow-hidden rounded-lg md:rounded-[14px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Image
        src={collection.coverImageUrl}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />

      {/* `.img-overlay` — transparent to 40%, then to 72% black. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      <span
        className={
          compact
            ? 'absolute left-2 top-2 inline-flex rounded-pill bg-ink/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.08em] text-paper backdrop-blur-[8px] md:left-2.5 md:top-2.5 md:text-[10px]'
            : 'absolute left-2.5 top-2.5 inline-flex rounded-pill bg-ink/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-paper backdrop-blur-[8px] md:left-3 md:top-3 md:px-[11px] md:py-1 md:text-[10px] md:tracking-[0.08em]'
        }
      >
        {countLabel}
      </span>

      <span
        className={
          compact
            ? 'absolute inset-x-0 bottom-0 block px-3 pb-2.5 pt-2.5 md:px-4 md:pb-3.5'
            : 'absolute inset-x-0 bottom-0 flex items-end justify-between gap-2.5 px-3.5 pb-4 pt-4 md:px-4 md:py-[18px]'
        }
      >
        <span className="block min-w-0">
          <span
            className={
              compact
                ? 'serif block text-[17px] font-normal leading-[1.2] text-paper md:text-[20px]'
                : 'serif block text-[22px] font-normal leading-[1.15] text-paper md:text-[24px]'
            }
          >
            {collection.name}
          </span>
          {!compact && collection.description ? (
            <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-paper/70 md:mt-[5px] md:text-[12px]">
              {collection.description}
            </span>
          ) : null}
        </span>

        {/* Decorative affordance for the card's own navigation — see the header note.
            Omitted entirely for the compact tile (TASK_61). */}
        {compact ? null : (
          <span
            aria-hidden
            className={[
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-paper/50 bg-paper/20 text-paper md:h-9 md:w-9',
              arrowOnMobile ? '' : 'hidden md:flex',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="md:hidden">
              <ArrowGlyph size={14} />
            </span>
            <span className="hidden md:inline-flex">
              <ArrowGlyph size={15} />
            </span>
          </span>
        )}
      </span>
    </PendingCardLink>
  );
}
