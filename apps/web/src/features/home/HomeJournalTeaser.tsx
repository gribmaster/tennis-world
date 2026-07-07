import Link from 'next/link';
import Image from 'next/image';
import type { ArticleDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';

// HomeJournalTeaser — the "Journal / Reading list" teaser, ported from the journal
// section in `files/home.html` (and matching the article card treatment in
// `files/journal.html`). A small grid of article cards that links onward to the
// full /journal page (which this feature does NOT build).
//
// Purely PRESENTATIONAL & data-driven (Phase 1 §4), like the other Home sections:
//   • Receives the articles to show via the `articles` prop — it does NOT call a
//     repository and does NOT import `@tennis/mock-data`. The page (a server
//     component) fetches via `@/lib/repositories` and passes the result in.
//   • Renders content from the DTOs only; the eyebrow/title/CTA are section chrome.
//
// Layout: a mobile-first responsive grid (1 col → 2 at sm → 3 at lg) of cards with a
// 16:9 cover image, a category (clay accent) · read-time meta line, a serif title,
// and the subtitle. CSS/grid only — no JS.

export interface HomeJournalTeaserProps {
  /** The articles to tease. Expected to be a small set (the teaser shows 2–3). */
  articles: ArticleDTO[];
  /** Eyebrow caption above the title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Label + href for the "view all" action beside the title. */
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

// Section chrome copy, ported from home.html's journal section. Kept as named
// defaults (not inline JSX) so strings live in one place and the caller can override.
const DEFAULT_EYEBROW = 'Journal';
const DEFAULT_TITLE = 'Reading list';
const DEFAULT_CTA = { label: 'All articles', href: '/journal' } as const;

export function HomeJournalTeaser({
  articles,
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
}: HomeJournalTeaserProps) {
  if (articles.length === 0) return null;

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
              <ArrowGlyph />
            </Link>
          }
        />

        <ul className="mt-section grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/journal/${article.slug}`}
                aria-label={article.title}
                className="court-card group block"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  <Image
                    src={article.heroImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                </div>
                <div className="pt-5">
                  <p className="flex items-center gap-2">
                    <span className="eyebrow text-clay">{article.category}</span>
                    <span className="eyebrow text-mist">·</span>
                    <span className="eyebrow text-stone">{article.readTimeMinutes} min read</span>
                  </p>
                  <h3 className="serif mt-2.5 text-[clamp(18px,1.5vw,24px)] font-medium leading-tight text-ink">
                    {article.title}
                  </h3>
                  {article.subtitle ? (
                    <p className="body-m mt-2.5 text-stone">{article.subtitle}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
