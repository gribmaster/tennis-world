import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CollectionCard — one card in the "Featured Collections" strip (Feature 76), rebuilt
// from the prototype's CollectionsScreen (tennis_world_v2_standalone.html:1309–1327).
//
// RESTYLED, not replaced. v1 was a 3:2 cover tile in a responsive grid; v2 is the
// prototype's fixed portrait strip card. The contract is unchanged — it still takes one
// `CollectionDTO` and links to `/collections/{slug}` — so every existing guarantee about
// this component (presentational, no repository, PendingCardLink navigation) still holds.
//
// Prototype geometry, from the file:
//   • card `width:200, height:240, flexShrink:0, borderRadius:12` (line 1310).
//   • `.img-overlay` (CSS line 87): `linear-gradient(180deg, rgba(0,0,0,0) 40%,
//     rgba(0,0,0,0.72) 100%)`.
//   • count pill top-left at `10,10`: `rgba(15,15,15,0.5)` + `backdrop-filter: blur(8px)`,
//     `padding:'3px 10px'`, `borderRadius:100`, `fontSize:9`, `fontWeight:600`,
//     `letterSpacing:'0.1em'`, uppercase, white (lines 1313–1315).
//   • bottom block `padding:'16px 14px'`, `justifyContent:'space-between'`,
//     `alignItems:'flex-end'` (line 1317): serif 22px/400 white name at `lineHeight:1.15`,
//     then an 11px subtitle at 70% white with `marginTop:4` (lines 1319–1321).
//   • arrow affordance: 32×32 circle, `rgba(255,255,255,0.2)` on a
//     `1px solid rgba(255,255,255,0.5)` border, holding `Ico.arrow(14)` (lines 1323–1325).
//
// THE ARROW IS DECORATION, NOT A CONTROL. In the prototype it carries its own
// `cursor:'pointer'` but no handler. Here it is a plain `aria-hidden` <span> INSIDE the
// card link — it is an affordance for the navigation the whole card already performs, so
// it needs no behaviour of its own and must not be a nested <button> (invalid HTML inside
// an anchor, and a second target for the same destination).
//
// PRESENTATIONAL & data-driven: it renders the `collection` it is handed and never
// fetches. `description` is optional on CollectionDTO, so the subtitle is rendered only
// when present.

/** The prototype's `Ico.arrow(14)` — a right-pointing arrow inside the circle. */
function ArrowGlyph() {
  return (
    <svg
      width="14"
      height="14"
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
}

export function CollectionCard({ collection, priority = false, className }: CollectionCardProps) {
  return (
    <PendingCardLink
      href={`/collections/${collection.slug}`}
      ariaLabel={collection.name}
      className={['block h-full w-full overflow-hidden rounded-lg', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <Image
        src={collection.coverImageUrl}
        alt=""
        fill
        sizes="200px"
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

      <span className="absolute left-2.5 top-2.5 inline-flex rounded-pill bg-ink/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-paper backdrop-blur-[8px]">
        {collection.count} courts
      </span>

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2.5 px-3.5 pb-4 pt-4">
        <span className="block min-w-0">
          <span className="serif block text-[22px] font-normal leading-[1.15] text-paper">
            {collection.name}
          </span>
          {collection.description ? (
            <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-paper/70">
              {collection.description}
            </span>
          ) : null}
        </span>

        {/* Decorative affordance for the card's own navigation — see the header note. */}
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-paper/50 bg-paper/20 text-paper"
        >
          <ArrowGlyph />
        </span>
      </span>
    </PendingCardLink>
  );
}
