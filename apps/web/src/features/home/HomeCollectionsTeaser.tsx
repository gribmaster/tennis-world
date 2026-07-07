import Link from 'next/link';
import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';

// HomeCollectionsTeaser — the "Collections / Curated journeys" teaser, ported from
// the collections section in `files/home.html` (and matching the card treatment in
// `files/collections.html`). A small grid of cover cards that links onward to the
// full /collections page (which this feature does NOT build).
//
// Purely PRESENTATIONAL & data-driven (Phase 1 §4), like CourtCard / the other Home
// sections:
//   • Receives the collections to show via the `collections` prop — it does NOT call
//     a repository and does NOT import `@tennis/mock-data`. The page (a server
//     component) fetches via `@/lib/repositories` and passes the result in.
//   • Renders content from the DTOs only; the eyebrow/title/CTA are section chrome.
//
// Layout: a mobile-first responsive grid (1 col → 2 at sm → 3 at lg) of 3:2 cover
// cards with the prototype's bottom-up gradient and the serif name + "{count}
// courts" eyebrow overlaid bottom-left. CSS/grid only — no JS.

export interface HomeCollectionsTeaserProps {
  /** The collections to tease. Expected to be a small set (the teaser shows ~4). */
  collections: CollectionDTO[];
  /** Eyebrow caption above the title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Label + href for the "view all" action beside the title. */
  cta?: { label: string; href: string };
}

function ChevronGlyph() {
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
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// Section chrome copy, ported from home.html's collections section. Kept as named
// defaults (not inline JSX) so strings live in one place and the caller can override.
const DEFAULT_EYEBROW = 'Collections';
const DEFAULT_TITLE = 'Curated journeys';
const DEFAULT_CTA = { label: 'All collections', href: '/collections' } as const;

export function HomeCollectionsTeaser({
  collections,
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
}: HomeCollectionsTeaserProps) {
  if (collections.length === 0) return null;

  return (
    <section className="bg-ivory py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          action={
            <Link
              href={cta.href}
              className="btn btn-ghost inline-flex items-center gap-1.5 !px-0 text-stone"
            >
              {cta.label}
              <ChevronGlyph />
            </Link>
          }
        />

        <ul className="mt-section grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/collections/${collection.slug}`}
                aria-label={collection.name}
                className="court-card group relative block aspect-[3/2] overflow-hidden"
              >
                <Image
                  src={collection.coverImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
                {/* `.img-overlay`: transparent → 72% black bottom-up, for legibility. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/70"
                />
                <div className="absolute inset-x-5 bottom-5 text-paper">
                  <h3 className="serif text-[clamp(18px,1.6vw,24px)] font-medium leading-tight">
                    {collection.name}
                  </h3>
                  <p className="eyebrow mt-1.5 text-paper/70">{collection.count} courts</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
