import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingLink, PendingCardLink } from '@/components/navigation';

// HomeCollectionsTeaser — the v2 collections strip (Feature 74), rebuilt from the
// prototype's HomeScreen (design_v2_stripped.html:577–600).
//
// Prototype geometry, from the file:
//   • section `padding:'28px 0 0'` (line 578); `.sec-hdr` at the 20px gutter, serif 20px
//     title, 13px stone "View all" (lines 579–582).
//   • strip: `.h-scroll` at `gap:12`, `padding:'0 0 4px 20px'`, closed by a 20px spacer
//     (lines 584, 596).
//   • card: `width:calc(45vw)`, `maxWidth:190`, `minWidth:150`, `aspectRatio:'3/4'`,
//     `borderRadius:12` (line 586).
//   • `.img-overlay` (line 87): `linear-gradient(180deg, rgba(0,0,0,0) 40%,
//     rgba(0,0,0,0.72) 100%)`.
//   • text block `padding:'10px 12px'`: a 9px/600 0.1em uppercase court-count eyebrow at
//     65% white, then the serif 16px name (lines 589–592).
//
// Restyled from the v1 responsive grid to the prototype's scrolling portrait strip. Still
// PRESENTATIONAL & data-driven: the collections arrive as a prop from `app/page.tsx`, the
// single repository boundary. No fetching, no @tennis/mock-data.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole card navigates ⇒ `PendingCardLink`; the
// "View all" link ⇒ `PendingLink`. Nothing here mutates.

export interface HomeCollectionsTeaserProps {
  collections: CollectionDTO[];
  title?: string;
  cta?: { label: string; href: string };
}

const DEFAULT_TITLE = 'Collections';
const DEFAULT_CTA = { label: 'View all', href: '/collections' } as const;

export function HomeCollectionsTeaser({
  collections,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
}: HomeCollectionsTeaserProps) {
  if (collections.length === 0) return null;

  return (
    <section className="pt-7 md:pt-12 collections-list" id="collections-list">
      <div className="container-page">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="serif text-[20px] md:text-[36px] font-normal leading-tight text-ink">{title}</h2>
          <PendingLink
            href={cta.href}
            className="body-s shrink-0 text-stone transition-colors hover:text-ink"
          >
            {cta.label}
          </PendingLink>
        </div>
      </div>

      {/* Plain overflow-x row — no carousel library (hard rule).

          GUTTER ALIGNMENT: inside `.container-page` so the first card lines up with the
          section header at every width; `-mr-[...]` cancels only the RIGHT gutter so the
          row still bleeds off the edge as it scrolls. Same treatment as the courts
          strip. */}
      <div className="container-page">
        <ul className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-3 overflow-x-auto pb-1">
          {collections.map((collection) => (
            <li key={collection.id} className="w-[45vw] min-w-[150px] max-w-[190px] shrink-0">
              <PendingCardLink
                href={`/collections/${collection.slug}`}
                ariaLabel={collection.name}
                className="block aspect-[3/4] overflow-hidden rounded-lg"
              >
                <Image
                  src={collection.coverImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 45vw, 190px"
                  className="object-cover"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
                  }}
                />
                <span className="absolute inset-x-0 bottom-0 block px-3 pb-2.5 pt-3">
                  <span className="mb-[3px] block text-[9px] font-semibold uppercase tracking-[0.1em] text-paper/65">
                    {collection.count} courts
                  </span>
                  <span className="serif block text-[16px] font-normal leading-tight text-paper">
                    {collection.name}
                  </span>
                </span>
              </PendingCardLink>
            </li>
          ))}
          <li aria-hidden className="w-5 shrink-0" />
        </ul>
      </div>
    </section>
  );
}
