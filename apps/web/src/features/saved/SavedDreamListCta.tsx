import Image from 'next/image';
import { PendingLink } from '@/components/navigation';

// SavedDreamListCta — the promo card that closes the Saved → Courts tab grid, now its
// LAST GRID CELL rather than a block below the grid (TASK_61). It promotes the
// Collections surface from inside Saved, which is why it lives on the Courts tab rather
// than the Collections tab — it is an invitation to go somewhere the visitor is not
// already.
//
// Two layouts (TASK_61): mobile keeps the original ivory/bordered row with the tilted
// image pair; md+ switches to a taller paper card (`md:min-h-[230px]`, stacked content),
// with the tilted tiles hidden — v3's desktop card has no pictures. The CTA stays the
// existing `.btn .btn-primary` at `h-9 px-4 text-[11px]` — there is no `.btn-sm` in
// `globals.css` and this feature does not add one (CLAUDE.md §9 — no new button system);
// the size is expressed as height/padding/text utilities, exactly as `HomeHero` does for
// its own small CTA.
//
// ── WHERE THE TILTED IMAGES COME FROM ───────────────────────────────────────────────────
// The prototype fills the pair from two arbitrary `IMG` constants. Here they are the hero
// images of two courts the caller ALREADY has in hand (the saved list the tab is rendering)
// — so the card costs no extra fetch, no new prop on the page's repository reads, and no
// new static asset. They are pure decoration: `alt=""` inside an `aria-hidden` box, no
// names, no links. When fewer than two are available the box simply renders what it has,
// and with none it is omitted, so a one-court or empty-ish list never shows a gap where a
// tile should be.
//
// PRESENTATIONAL: no repository, no @tennis/mock-data, no state.
//
// PENDING STATES (CLAUDE.md §4 rule 1): "Explore collections" navigates ⇒ `PendingLink`.
// It is a CTA link, not a whole-card link — the card itself is not clickable, exactly as in
// the prototype, where only the button carries the handler.

/** Prototype tile geometry (lines 1256–1257), in render order: back tile, then front. */
const TILE_CLASSES = [
  'right-0 top-0 h-[70px] w-[60px] rotate-[5deg]',
  'bottom-0 left-0 h-[65px] w-[55px] -rotate-[4deg]',
] as const;

export interface SavedDreamListCtaProps {
  /**
   * Hero image urls for the decorative tilted pair. At most the first two are used; an
   * empty array drops the decoration entirely. Decoration only — never a court identity.
   */
  imageUrls?: string[];
}

export function SavedDreamListCta({ imageUrls = [] }: SavedDreamListCtaProps) {
  const tiles = imageUrls.slice(0, TILE_CLASSES.length);

  return (
    <div className="flex h-full items-center gap-3 rounded-lg border border-mist/30 bg-ivory p-4 md:min-h-[230px] md:flex-col md:items-start md:justify-center md:rounded-[14px] md:bg-paper md:p-[22px]">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gold">Create your</p>
        <p className="serif mt-1 text-[22px] font-normal leading-[1.1] text-ink md:text-[24px]">
          Dream List
        </p>
        <p className="mt-1 text-[12px] leading-[1.4] text-stone">
          Save more courts and start planning your next trip.
        </p>
        <PendingLink href="/collections" className="btn btn-primary mt-2.5 h-9 px-4 text-[11px]">
          Explore collections
        </PendingLink>
      </div>

      {/* Decorative tilted image pair — hidden at md+, where the v3 desktop card has no
          pictures. */}
      {tiles.length > 0 ? (
        <div aria-hidden className="relative h-20 w-[70px] shrink-0 md:hidden">
          {tiles.map((src, index) => (
            <div
              key={src}
              className={`absolute overflow-hidden rounded-md ${TILE_CLASSES[index]}`}
            >
              <Image src={src} alt="" fill sizes="60px" className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
